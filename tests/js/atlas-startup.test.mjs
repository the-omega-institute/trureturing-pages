import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { buildStartup } from "../../tools/build_atlas_startup.mjs";
import {
  loadStartup,
  validateLayout,
} from "../../site/assets/atlas-startup.mjs";
import {
  computeLayout,
  createPublicModel,
} from "../../site/assets/atlas-public-core.mjs";

const hash = (text) =>
  "sha256:" + createHash("sha256").update(text).digest("hex");
const graph = {
  source_snapshot: { truth_release_digest: hash("release") },
  nodes: [
    { id: "A", kind: "truth", domain: "Quantum" },
    { id: "B", kind: "truth", domain: "Quantum" },
    { id: "doc", kind: "blueprint" },
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency" },
    { source: "doc", target: "A", layer: "blueprint-truth-anchor" },
  ],
};

test("published startup preserves exact graph bytes and layout, validates all nodes and caches only immutable artifacts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "atlas-startup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const text = JSON.stringify(graph);
  const manifest = {
    schema_version: "pages-atlas-manifest.v1",
    truth_release_digest: graph.source_snapshot.truth_release_digest,
    atlas_graph_digest: hash(text),
  };
  await writeFile(join(root, "graph.json"), text);
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  const build = () =>
    buildStartup(join(root, "graph.json"), join(root, "manifest.json"), root);
  const index = await build();
  assert.deepEqual(
    await build(),
    index,
    "Rebuilding the same release has stable content addresses",
  );
  assert.equal(
    gunzipSync(await readFile(join(root, index.graph.path))).toString(),
    text,
  );
  const layout = JSON.parse(
    gunzipSync(await readFile(join(root, index.layout.path))),
  );
  assert.deepEqual(layout.positions, computeLayout(createPublicModel(graph)));
  for (const positions of [
    { A: layout.positions.A },
    { ...layout.positions, extra: { x: 0, y: 0, z: 0 } },
    { ...layout.positions, A: { x: Infinity, y: 0, z: 0 } },
  ]) {
    assert.throws(
      () => validateLayout({ ...layout, positions }, graph, manifest),
      /cover/,
    );
  }
  const requests = [];
  let mode = "valid";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const path = new URL(url).pathname.slice(1);
    requests.push({ path, cache: options.cache });
    if (path === "data/pages-atlas-manifest.v1.json")
      return Response.json(
        mode === "new-release"
          ? { ...manifest, truth_release_digest: hash("new") }
          : manifest,
      );
    if (path === "data/atlas-startup.v1.json")
      return mode === "legacy"
        ? new Response("", { status: 404 })
        : Response.json(index);
    if (path === "data/pages-atlas-view.v1.json") return new Response(text);
    if (mode === "corrupt") return new Response("corrupt");
    return new Response(await readFile(join(root, path)));
  });
  const result = await loadStartup("https://example.test/");
  assert.deepEqual(result.graph, graph);
  assert.deepEqual(result.positions, layout.positions);
  assert.equal(result.timing.source, "precomputed");
  assert.ok(
    requests
      .filter((r) => r.path.endsWith(".json.gz"))
      .every((r) => r.cache === "force-cache"),
  );
  assert.ok(
    requests
      .filter((r) => !r.path.endsWith(".json.gz"))
      .every((r) => r.cache === "no-cache"),
  );
  mode = "corrupt";
  await assert.rejects(loadStartup("https://example.test/"), /digest mismatch/);
  mode = "new-release";
  await assert.rejects(
    loadStartup("https://example.test/"),
    /bind the current/,
  );
  mode = "legacy";
  const legacy = await loadStartup("https://example.test/");
  assert.equal(legacy.positions, null);
  assert.deepEqual(legacy.graph, graph);
});
