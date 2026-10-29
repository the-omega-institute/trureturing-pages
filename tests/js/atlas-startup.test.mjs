import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
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
  assert.ok(layout.dependency_positions.A.y > layout.dependency_positions.B.y);
  for (const dependency_positions of [
    undefined,
    { A: layout.dependency_positions.A },
    { ...layout.dependency_positions, extra: { x: 0, y: 0, z: 0 } },
    { ...layout.dependency_positions, A: { x: NaN, y: 0, z: 0 } },
  ]) {
    assert.throws(() => validateLayout({ ...layout, dependency_positions }, graph, manifest), /Dependency layout does not cover/);
  }
  assert.throws(() => validateLayout({ ...layout, dependency_positions: {
    ...layout.dependency_positions, B: { x: 0, y: layout.dependency_positions.A.y, z: 0 },
  } }, graph, manifest), /reverses a published import/);
  const legacyLayout = { ...layout, layout_profile: "atlas-dependency-scaffold-v2", dependency_positions: undefined };
  assert.deepEqual(validateLayout(legacyLayout, graph, manifest), layout.positions);
  const legacyBytes = gzipSync(JSON.stringify(legacyLayout));
  const legacyDigest = hash(legacyBytes);
  const legacyPath = `data/atlas-startup/${legacyDigest.slice(7)}.json.gz`;
  await writeFile(join(root, legacyPath), legacyBytes);
  const legacyIndex = { ...index, layout_profile: legacyLayout.layout_profile,
    layout: { path: legacyPath, digest: legacyDigest, bytes: legacyBytes.length } };
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
        : Response.json(mode === "v2" ? legacyIndex : mode === "profile-mismatch" ? { ...index, layout_profile: legacyLayout.layout_profile } : index);
    if (path === "data/pages-atlas-view.v1.json") return new Response(text);
    if (mode === "corrupt") return new Response("corrupt");
    return new Response(await readFile(join(root, path)));
  });
  const result = await loadStartup("https://example.test/");
  assert.deepEqual(result.graph, graph);
  assert.deepEqual(result.positions, layout.positions);
  assert.equal(result.timing.source, "precomputed");
  assert.deepEqual(result.dependencyPositions, layout.dependency_positions);
  mode = "profile-mismatch";
  await assert.rejects(loadStartup("https://example.test/"), /profile disagrees/);
  mode = "v2";
  const v2 = await loadStartup("https://example.test/");
  assert.deepEqual(v2.positions, layout.positions);
  assert.equal(v2.dependencyPositions, null, "Legacy startup requires the complete DAG worker");
  mode = "corrupt";
  await assert.rejects(loadStartup("https://example.test/"), /digest mismatch/);
  mode = "legacy";
  const legacy = await loadStartup("https://example.test/");
  assert.equal(legacy.positions, null);
  assert.deepEqual(legacy.graph, graph);
});
