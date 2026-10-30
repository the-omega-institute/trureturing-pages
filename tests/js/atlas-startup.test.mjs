import { fixtureEvidence, withEvidence, fixtureDigest } from "./atlas-evidence-fixture.mjs";
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
  createPublicModel, searchNodes, title,
} from "../../site/assets/atlas-public-core.mjs";

import { startupView, validateView, validateDetails, DETAIL_SCHEMA, detailShard } from "../../site/assets/atlas-startup-view.mjs";
import { analyzeArchitecture } from "../../site/assets/architecture-core.mjs";
import { theoryModel } from "../../site/assets/atlas-theory-core.mjs";

const hash = (text) =>
  "sha256:" + createHash("sha256").update(text).digest("hex");
const graph = {
  source_snapshot: { truth_release_digest: hash("release"), truth_graph_sha256: fixtureDigest },
  nodes: [
    { id: "A", repo_path: "A.lean", kind: "truth", domain: "Quantum" },
    { id: "B", repo_path: "B.lean", kind: "truth", domain: "Quantum" },
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
  await writeFile(join(root, "atlas-lean-evidence.v1.json"), JSON.stringify(fixtureEvidence(graph)));
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
  const admittedGraph = validateView(JSON.parse(gunzipSync(await readFile(join(root, index.fast.graph.path)))), manifest);
  const fastLayout = JSON.parse(gunzipSync(await readFile(join(root, index.fast.layout.path))));
  assert.deepEqual(layout.positions, computeLayout(createPublicModel(admittedGraph)));
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
  } }, admittedGraph, manifest), /reverses a published import/);
  const legacyLayout = { ...layout, layout_profile: "atlas-dependency-scaffold-v2", dependency_positions: undefined };
  assert.deepEqual(validateLayout(legacyLayout, graph, manifest), layout.positions);
  const legacyBytes = gzipSync(JSON.stringify(legacyLayout));
  const legacyDigest = hash(legacyBytes);
  const legacyPath = `data/atlas-startup/${legacyDigest.slice(7)}.json.gz`;
  await writeFile(join(root, legacyPath), legacyBytes);
  const legacyIndex = { ...index, fast: undefined, layout_profile: legacyLayout.layout_profile,
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
    if (path === "data/atlas-admission.v1.json") return new Response(await readFile(join(root, path)));
    if (mode === "corrupt") return new Response("corrupt");
    return new Response(await readFile(join(root, path)));
  });
  const result = await loadStartup("https://example.test/");
  assert.deepEqual(result.graph, admittedGraph);
  assert.deepEqual(result.positions, fastLayout.positions);
  assert.equal(result.timing.source, "precomputed");
  assert.deepEqual(result.dependencyPositions, fastLayout.dependency_positions);
  assert.equal(result.timing.compact, true);
  assert.deepEqual(await result.loadDetails("A"), admittedGraph.nodes[0]);
  assert.ok(!requests.some(r => r.path === index.graph.path), "The canonical archive stays off the first-paint path");
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
  assert.deepEqual(legacy.graph, admittedGraph);
});


const viewManifest = { atlas_graph_digest: "sha256:" + "a".repeat(64), truth_release_digest: "sha256:" + "b".repeat(64),
  source_commit: "c".repeat(40), counts: { nodes: 3, edges: 3 } };
const viewGraph = withEvidence({ source_snapshot: { source_commit: viewManifest.source_commit, truth_release_digest: viewManifest.truth_release_digest },
  nodes: [
    { id: "A", kind: "truth", domain: "Quantum", human_title: "Shared foundation", human_abstract: "A searchable description", human_theorem: "An authored theorem", knowledge_page: "knowledge/node/abc/", out_degree: 1, true_depth: 0, descendant_count: 1 },
    { id: "B", kind: "truth", domain: "Observer", human_title: "Consequence", out_degree: 0, true_depth: 1, descendant_count: 0 },
    { id: "doc", kind: "blueprint", human_title: "Authored explanation", blueprint_path: "Blueprint/A.md" },
  ], edges: [
    { source: "A", target: "B", layer: "truth-dependency", authority: "certified", extra_archive_metadata: "large" },
    { source: "doc", target: "A", layer: "blueprint-truth-anchor" },
    { source: "A", target: "doc", layer: "intuition-candidate", status: "advisory" },
  ], clusters: ["archive-only metadata"] });
viewGraph.math_admission.atlas_graph_digest = viewManifest.atlas_graph_digest;

test("compact first paint retains every node, relation, category, search result and DAG metric", () => {
  const view = startupView(viewGraph, viewManifest), compact = validateView(view, viewManifest);
  assert.deepEqual(compact.nodes.map(n => n.id), viewGraph.nodes.map(n => n.id));
  assert.deepEqual(compact.edges.map(e => [e.source, e.target, e.layer, e.status]), viewGraph.edges.map(e => [e.source, e.target, e.layer, e.status]));
  const fullModel = createPublicModel(viewGraph), compactModel = createPublicModel(compact);
  assert.deepEqual(compactModel.relationships.edges.map(e => e.category), ["proof"]);
  for (const query of ["foundation", "searchable", "B"]) {
    assert.deepEqual(searchNodes(compactModel, query).map(n => [n.id, title(n)]), searchNodes(fullModel, query).map(n => [n.id, title(n)]));
  }
  const full = analyzeArchitecture(viewGraph), fast = analyzeArchitecture(compact);
  assert.deepEqual(fast, full);
  const topology = theory => ({
    ids: theory.nodes.map(n => n.id), pairs: theory.edges.map(e => [e.source, e.target]),
    components: theory.components, isolated: theory.isolated, roots: theory.roots, maxDepth: theory.maxDepth,
  });
  assert.deepEqual(topology(theoryModel(compactModel, fast)), topology(theoryModel(fullModel, full)));
  assert.equal(compact.nodes[0].human_theorem, undefined);
  assert.equal(compact.clusters, undefined);
});

test("lazy details restore the exact source record and reject mixed releases, altered summaries and missing nodes", () => {
  const compact = validateView(startupView(viewGraph, viewManifest), viewManifest), shard = detailShard("A");
  const nodes = viewGraph.nodes.filter(n => detailShard(n.id) === shard);
  const details = { schema_version: DETAIL_SCHEMA, atlas_graph_digest: viewManifest.atlas_graph_digest,
    truth_release_digest: viewManifest.truth_release_digest, nodes };
  assert.deepEqual(validateDetails(details, viewManifest, compact, shard).get("A"), viewGraph.nodes[0]);
  assert.throws(() => validateDetails({ ...details, truth_release_digest: "other" }, viewManifest, compact, shard), /bind/);
  assert.throws(() => validateDetails({ ...details, nodes: [] }, viewManifest, compact, shard), /Incomplete/);
  assert.throws(() => validateDetails({ ...details, nodes: nodes.map(n => ({ ...n, human_title: "changed" })) }, viewManifest, compact, shard), /disagree/);
  for (const view of [
    { ...startupView(viewGraph, viewManifest), atlas_graph_digest: "other" },
    { ...startupView(viewGraph, viewManifest), nodes: [viewGraph.nodes[0]] },
    { ...startupView(viewGraph, viewManifest), edges: [[99, 1, "dependency", null], ...startupView(viewGraph, viewManifest).edges.slice(1)] },
  ]) assert.throws(() => validateView(view, viewManifest), /bind|identity/);
});
