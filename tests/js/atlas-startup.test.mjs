import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { buildStartup, buildFoundationData } from "../../tools/build_atlas_startup.mjs";
import {foundationModel, coreModules, coreOverview, focusGraph, shortestPaths, dependencyPath, loadFoundations} from '../../site/assets/foundations-core.mjs';
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
  requests.length = 0;
  const foundations = await loadFoundations("https://example.test/");
  assert.equal(foundations.model.data.nodes.length, 2);
  assert.deepEqual(foundations.model.data.edges, [["A", "B"]]);
  assert.equal(requests.length, 3, "Homepage needs two small pointers and one compact immutable artifact");
  assert.ok(requests.some(r => r.path === index.foundations.path));
  assert.ok(!requests.some(r => r.path === index.graph.path || r.path === index.layout.path || r.path.includes('history')));
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
  await assert.rejects(loadFoundations("https://example.test/"), /digest mismatch/);
  mode = "new-release";
  await assert.rejects(
    loadStartup("https://example.test/"),
    /bind the current/,
  );
  await assert.rejects(loadFoundations("https://example.test/"), /release changed/i);
  let pointerReads = 0;
  const recovered = await loadFoundations("https://example.test/", async (url) => {
    const path = new URL(url).pathname.slice(1);
    if (path === "data/pages-atlas-manifest.v1.json") {
      pointerReads++;
      return Response.json(pointerReads === 1 ? {...manifest, truth_release_digest: hash("new")} : manifest);
    }
    if (path === "data/atlas-startup.v1.json") return Response.json(index);
    return new Response(await readFile(join(root, path)));
  });
  assert.equal(pointerReads, 2, "A publication racing the mutable pointers retries the pair once");
  assert.equal(recovered.model.data.truth_release_digest, manifest.truth_release_digest);
  mode = "legacy";
  const legacy = await loadStartup("https://example.test/");
  assert.equal(legacy.positions, null);
  assert.deepEqual(legacy.graph, graph);
});

test('foundations retain exact dependencies across fields, unique downstream counts, roots and navigable paths', () => {
  const source = {truth_release_digest:hash('diamond'),source_commit:'a'.repeat(40)};
  const g = {source_snapshot:source, nodes:[
    ...['A','B','C','D','Isolated'].map((id,i)=>({id,kind:'truth',domain:i%2?'Quantum':'Algebra',human_title:id,repo_path:`D5/${id}.lean`})),
    {id:'document',kind:'blueprint'},
  ],edges:[...[['A','B'],['A','C'],['B','D'],['C','D']].map(([source,target])=>({source,target,layer:'truth-dependency'})),
    {source:'Isolated',target:'D',layer:'structural-affinity'},
    {source:'document',target:'A',layer:'blueprint-truth-anchor'}]};
  const m={atlas_graph_digest:hash(JSON.stringify(g)),truth_release_digest:source.truth_release_digest};
  const data=buildFoundationData(g,m),model=foundationModel(data,m);
  assert.equal(model.byId.get('A').reach,3,'The diamond descendant is counted once');
  assert.equal(model.byId.get('A').coverage,2);
  assert.deepEqual(coreModules(model,'roots').map(n=>n.id),['A']);
  assert.deepEqual(dependencyPath(shortestPaths(model,'A'),'D'),['A','B','D']);
  assert.deepEqual(dependencyPath(shortestPaths(model,'D','upstream'),'A','upstream'),['A','B','D']);
  assert.deepEqual(dependencyPath(shortestPaths(model,'A'),'Isolated'),[]);
  for(const view of [coreOverview(model),coreOverview(model,'roots'),focusGraph(model,'A','D')]) {
    assert.ok(view.edges.every(edge=>model.pairs.has(JSON.stringify(edge))));
    assert.ok(view.nodes.every(n=>n.id!=='document'));
  }
  const changed=structuredClone(data);changed.nodes[0].depth=9;
  assert.throws(()=>foundationModel(changed,m),/metrics disagree/);
  assert.throws(()=>foundationModel(data,{...m,atlas_graph_digest:hash('other')}),/bind/);
  changed.nodes[0].depth=0;changed.edges.push(['D','A']);
  assert.throws(()=>foundationModel(changed,m),/metrics disagree/);
});
