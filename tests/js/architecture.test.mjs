import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzeArchitecture,
  rankedNodes,
  snapshotFromGraph,
  validateSnapshot,
  validateHistory,
  trajectory,
  sha256,
} from "../../site/assets/architecture-core.mjs";
import { buildHistory } from "../../tools/build_architecture_history.mjs";
import {
  createPublicModel,
  architectureLayout,
  computeLayout,
} from "../../site/assets/atlas-public-core.mjs";

const digest = (char) => "sha256:" + char.repeat(64);
function graph(release = "a") {
  return {
    source_snapshot: {
      truth_release_digest: digest(release),
      source_commit: "1".repeat(40),
      topology_algorithm: "Topology/1",
      algorithm_profile_digest: digest("f"),
    },
    nodes: [
      { id: "A", kind: "truth", domain: "Digit", human_title: "Foundation" },
      { id: "B", kind: "truth", domain: "Fourier" },
      { id: "C", kind: "truth", domain: "Quantum" },
      { id: "D", kind: "truth", domain: "Quantum" },
      { id: "doc", kind: "blueprint", domain: "Words" },
    ],
    edges: [
      { source: "A", target: "B", layer: "truth-dependency" },
      { source: "A", target: "C", layer: "truth-dependency" },
      { source: "B", target: "D", layer: "truth-dependency" },
      { source: "C", target: "D", layer: "truth-dependency" },
      { source: "A", target: "C", layer: "truth-dependency" },
      { source: "D", target: "A", layer: "structural-affinity" },
      { source: "doc", target: "A", layer: "blueprint-truth-anchor" },
    ],
  };
}
test("architecture counts unique downstream modules through a diamond and excludes affinity/documents", () => {
  const g = graph(),
    before = JSON.stringify(g),
    a = analyzeArchitecture(g);
  assert.deepEqual(a.metrics.get("A"), {
    direct: 2,
    reach: 3,
    coverage: 2,
    depth: 0,
    share: 1,
    domains: [
      ["Quantum", 2],
      ["Fourier", 1],
    ],
  });
  assert.equal(a.metrics.get("D").depth, 2);
  assert.equal(a.metrics.has("doc"), false);
  assert.equal(rankedNodes(g.nodes, a)[0].id, "A");
  assert.equal(JSON.stringify(g), before);
});
test("cycle and inconsistent published Topology counters fail closed", () => {
  const cycle = graph();
  cycle.edges.push({ source: "D", target: "A", layer: "truth-dependency" });
  assert.throws(() => analyzeArchitecture(cycle), /acyclic/);
  const bad = graph();
  bad.nodes[0].descendant_count = 4;
  assert.throws(() => analyzeArchitecture(bad), /disagrees/);
});
test("architecture layout retains family identity and has a strict dependency depth axis", () => {
  const g = graph(),
    model = createPublicModel(g),
    structure = computeLayout(model),
    layout = architectureLayout(model, structure);
  assert.equal(layout.A.x, structure.A.x);
  for (const edge of model.edges)
    assert.ok(layout[edge.source].y > layout[edge.target].y);
  assert.ok(
    Object.values(layout).every((p) => Object.values(p).every(Number.isFinite)),
  );
  assert.deepEqual(layout, architectureLayout(model, structure));
});
test("snapshots are deterministic, validate domain totals and do not include camera state", () => {
  const g = graph(),
    snapshot = snapshotFromGraph(g, digest("b"));
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.deepEqual(
    snapshotFromGraph(
      {
        ...g,
        nodes: g.nodes.slice().reverse(),
        edges: g.edges.slice().reverse(),
      },
      digest("b"),
    ),
    snapshot,
  );
  const bad = structuredClone(snapshot);
  bad.nodes[0].domains[0][1] = 100;
  assert.throws(() => validateSnapshot(bad), /distribution/);
  assert.equal(JSON.stringify(snapshot).includes('"x"'), false);
});
test("trajectory separates absolute growth from normalized support, absence and analysis changes", () => {
  const first = snapshotFromGraph(graph(), digest("b"));
  const secondGraph = graph("c");
  secondGraph.nodes.push({ id: "E", kind: "truth", domain: "Fourier" });
  const second = snapshotFromGraph(secondGraph, digest("c"));
  const retiredGraph = graph("d");
  retiredGraph.nodes = retiredGraph.nodes.filter((n) => n.id !== "A");
  retiredGraph.edges = retiredGraph.edges.filter(
    (e) => e.source !== "A" && e.target !== "A",
  );
  const retired = snapshotFromGraph(retiredGraph, digest("d"));
  const changed = { ...second, topology_algorithm: "Topology/2" };
  const points = trajectory([first, second, retired, changed], "A");
  assert.equal(points[0].reachDelta, null);
  assert.equal(points[1].reachDelta, 0);
  assert.equal(points[1].shareDelta, -0.25);
  assert.equal(points[2].event, "Retired");
  assert.equal(points[2].node, null);
  assert.equal(points[3].event, "Analysis changed");
  assert.equal(points[3].reachDelta, null);
  assert.equal(trajectory([retired, first], "A")[1].event, "Appeared");
});
test("archive persists observations, is idempotent and rejects corruption or rollback", async () => {
  const root = await mkdtemp(join(tmpdir(), "architecture-history-"));
  const graphPath = join(root, "graph.json"),
    manifestPath = join(root, "manifest.json"),
    output = join(root, "site");
  async function input(g) {
    const text = JSON.stringify(g);
    await writeFile(graphPath, text);
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema_version: "pages-atlas-manifest.v1",
        atlas_graph_digest: await sha256(text),
        truth_release_digest: g.source_snapshot.truth_release_digest,
      }),
    );
  }
  try {
    await input(graph());
    const first = await buildHistory({ graphPath, manifestPath, output });
    assert.equal(first.entries.length, 1);
    assert.deepEqual(
      await buildHistory({ graphPath, manifestPath, output }),
      first,
    );
    await input(graph("b"));
    const second = await buildHistory({ graphPath, manifestPath, output });
    assert.equal(second.entries.length, 2);
    assert.deepEqual(second.entries[0], first.entries[0]);
    await input(graph());
    await assert.rejects(
      buildHistory({ graphPath, manifestPath, output }),
      /older/,
    );
    const unsafe = structuredClone(second);
    unsafe.entries[0].path = "../outside.json";
    assert.throws(() => validateHistory(unsafe), /entry/);
    await writeFile(join(output, first.entries[0].path), "{}");
    await assert.rejects(
      buildHistory({ graphPath, manifestPath, output }),
      /hash mismatch/,
    );
    assert.equal(
      JSON.parse(
        await readFile(join(output, "data/architecture-history.v1.json")),
      ).entries.length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("a clean deployment preserves exact remote snapshots before appending its release", async () => {
  const root = await mkdtemp(join(tmpdir(), "architecture-preserve-"));
  const originalFetch = globalThis.fetch;
  try {
    const oldGraph = graph(),
      oldGraphText = JSON.stringify(oldGraph);
    const oldSnapshot = snapshotFromGraph(oldGraph, await sha256(oldGraphText));
    const oldText = JSON.stringify(oldSnapshot) + "\n",
      oldDigest = await sha256(oldText);
    const entry = {
      path: `data/architecture/${oldDigest.slice(7)}.json`,
      digest: oldDigest,
      truth_release_digest: oldSnapshot.truth_release_digest,
      atlas_graph_digest: oldSnapshot.atlas_graph_digest,
    };
    const index = {
      schema_version: "pages-architecture-history.v1",
      current_truth_release_digest: oldSnapshot.truth_release_digest,
      entries: [entry],
    };
    const current = graph("b"),
      text = JSON.stringify(current);
    const graphPath = join(root, "graph.json"),
      manifestPath = join(root, "manifest.json"),
      output = join(root, "fresh-site");
    await writeFile(graphPath, text);
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema_version: "pages-atlas-manifest.v1",
        atlas_graph_digest: await sha256(text),
        truth_release_digest: current.source_snapshot.truth_release_digest,
      }),
    );
    globalThis.fetch = async (url) => {
      if (url.pathname === "/pages/data/architecture-history.v1.json")
        return new Response(JSON.stringify(index));
      assert.equal(url.pathname, `/pages/${entry.path}`);
      return new Response(oldText);
    };
    const next = await buildHistory({
      graphPath,
      manifestPath,
      output,
      previousUrl: "https://example.test/pages/",
    });
    assert.equal(next.entries.length, 2);
    assert.deepEqual(next.entries[0], entry);
    assert.equal(await readFile(join(output, entry.path), "utf8"), oldText);
    assert.equal(
      next.current_truth_release_digest,
      current.source_snapshot.truth_release_digest,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("remote archive errors cannot silently reset evolution history", async () => {
  const root = await mkdtemp(join(tmpdir(), "architecture-network-"));
  const originalFetch = globalThis.fetch;
  try {
    const text = JSON.stringify(graph());
    const graphPath = join(root, "graph.json"),
      manifestPath = join(root, "manifest.json");
    await writeFile(graphPath, text);
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema_version: "pages-atlas-manifest.v1",
        atlas_graph_digest: await sha256(text),
        truth_release_digest: digest("a"),
      }),
    );
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(
      buildHistory({
        graphPath,
        manifestPath,
        output: root,
        previousUrl: "https://example.test/",
      }),
      /refusing to erase/,
    );
    globalThis.fetch = async () => new Response("Missing", { status: 404 });
    assert.equal(
      (
        await buildHistory({
          graphPath,
          manifestPath,
          output: root,
          previousUrl: "https://example.test/",
        })
      ).entries.length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
