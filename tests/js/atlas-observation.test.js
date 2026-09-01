"use strict";

const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const Observation = require("../../site/assets/atlas-observation-core.js");

const c1 = "cluster:sha256:" + "1".repeat(64);
const c2 = "cluster:sha256:" + "2".repeat(64);
const graph = {
  source_snapshot: {
    truth_release_digest: "sha256:" + "a".repeat(64),
    source_commit: "b".repeat(40),
    source_tree: "c".repeat(40)
  },
  nodes: [
    { id: "A", atlas_cluster_id: c1, state: "closed" },
    { id: "B", atlas_cluster_id: c1, state: "closed" },
    { id: "C", atlas_cluster_id: c2, state: "open" }
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency" },
    { source: "B", target: "C", layer: "truth-dependency" },
    { source: "A", target: "C", layer: "structural-affinity", status: "derived" }
  ],
  clusters: [
    { cluster_id: c1, member_node_ids: ["A", "B"] },
    { cluster_id: c2, member_node_ids: ["C"] }
  ]
};
const manifest = {
  schema_version: "pages-atlas-manifest.v1",
  truth_release_digest: "sha256:" + "a".repeat(64),
  source_commit: "b".repeat(40),
  source_tree: "c".repeat(40),
  certified_topology_digest: "sha256:" + "d".repeat(64),
  topology_atlas_digest: "sha256:" + "e".repeat(64),
  conformation_digest: "sha256:" + "f".repeat(64)
};
const receiptRef = "sha256:" + "9".repeat(64);

const nodeCapture = Observation.deriveCapture(graph, {
  comparison: {
    kind: "node-pair",
    left: { id: "A" },
    right: { id: "C" },
    certifiedPath: { nodeIds: ["A", "B", "C"] }
  }
});
assert.equal(nodeCapture.default_gesture_kind, "compare");
assert.deepEqual(
  nodeCapture.selection.selected_node_ids,
  ["A", "B", "C"]
);
assert.deepEqual(nodeCapture.selection.selected_edges, [
  { dependency_id: "A", dependent_id: "B" },
  { dependency_id: "B", dependent_id: "C" }
]);
assert.deepEqual(nodeCapture.gesture.source_node_ids, ["A"]);
assert.deepEqual(nodeCapture.gesture.target_node_ids, ["C"]);
assert.equal(
  nodeCapture.selection.selected_edges.some((edge) =>
    edge.dependency_id === "A" && edge.dependent_id === "C"),
  false,
  "derived affinity cannot enter selected certified edges"
);

const bringTogether = Observation.deriveCapture(graph, {
  comparison: {
    kind: "node-pair",
    left: { id: "A" },
    right: { id: "C" },
    certifiedPath: { nodeIds: ["A", "B", "C"] }
  },
  gesture_kind: "bring-together"
});
assert.equal(bringTogether.gesture.kind, "bring-together");

const clusterCapture = Observation.deriveCapture(graph, {
  comparison: {
    kind: "cluster-pair",
    left: { id: c1 },
    right: { id: c2 },
    crossEdges: [{ source: "B", target: "C" }]
  }
});
assert.deepEqual(clusterCapture.selection.selected_cluster_ids, [c1, c2]);
assert.deepEqual(clusterCapture.selection.selected_node_ids, ["B", "C"]);
assert.deepEqual(clusterCapture.selection.selected_edges, [
  { dependency_id: "B", dependent_id: "C" }
]);
assert.deepEqual(clusterCapture.gesture.source_cluster_ids, [c1]);
assert.deepEqual(clusterCapture.gesture.target_cluster_ids, [c2]);

const peelCapture = Observation.deriveCapture(graph, {
  peeled_cluster_id: c1
});
assert.equal(peelCapture.gesture.kind, "cluster-peel");
assert.deepEqual(peelCapture.gesture.source_cluster_ids, [c1]);

const frontierCapture = Observation.deriveCapture(graph, {
  selected_node_id: "C",
  active_mode: "frontier"
});
assert.equal(frontierCapture.gesture.kind, "frontier-mark");
assert.deepEqual(frontierCapture.gesture.source_node_ids, ["C"]);

assert.throws(() => Observation.deriveCapture(graph, {
  selected_node_id: "A",
  gesture_kind: "path-inspection"
}), /selected_path_ref/);
assert.throws(() => Observation.deriveCapture(graph, {
  comparison: {
    kind: "cluster-pair",
    left: { id: c1 },
    right: { id: c2 },
    crossEdges: [{ source: "A", target: "C" }]
  }
}), /not certified/);

async function run() {
  const input = {
    graph,
    manifest,
    topology_atlas_input_receipt_ref: receiptRef,
    pages_research_context_digest: null,
    human_actor: "human:测试者",
    selection: nodeCapture.selection,
    gesture: nodeCapture.gesture,
    human_note: "观察 \"bridge\" + path / boundary <test>",
    privacy_class: "private-research",
    explicitly_saved: true,
    created_at: "2026-09-01T01:02:03.000Z"
  };
  const first = await Observation.buildObservation(input, webcrypto);
  const second = await Observation.buildObservation(input, webcrypto);
  assert.deepEqual(first, second);
  assert.equal(first.schema, "human-structure-observation.v1");
  assert.match(first.observation_id, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.observation_content.explicitly_saved, true);
  assert.equal(
    first.observation_content.pages_conformation_digest,
    manifest.conformation_digest
  );
  const canonical = new TextDecoder().decode(
    Observation.canonicalBytes(first.observation_content)
  );
  assert.match(canonical, /\\u6D4B\\u8BD5\\u8005/);
  assert.match(canonical, /\\u89C2\\u5BDF/);
  assert.match(canonical, /\\u0022bridge\\u0022/);
  assert.match(canonical, /\\u002B/);
  assert.match(canonical, /\\u002F/);
  assert.match(canonical, /\\u003Ctest\\u003E/);

  const changed = await Observation.buildObservation({
    ...input,
    human_note: "A different observation"
  }, webcrypto);
  assert.notEqual(first.observation_id, changed.observation_id);

  await assert.rejects(() => Observation.buildObservation({
    ...input,
    explicitly_saved: false
  }, webcrypto), /explicitly saved/);
  await assert.rejects(() => Observation.buildObservation({
    ...input,
    topology_atlas_input_receipt_ref: "missing"
  }, webcrypto), /sha256/);
  await assert.rejects(() => Observation.buildObservation({
    ...input,
    privacy_class: "implicit"
  }, webcrypto), /privacy class/);

  console.log("atlas observation tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
