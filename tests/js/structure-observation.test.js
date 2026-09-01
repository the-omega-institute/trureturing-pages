"use strict";

const assert = require("node:assert/strict");
const Observation = require("../../site/assets/structure-observation-core.js");

const digest = (value) => "sha256:" + value.repeat(64);
const cluster = (value) => "cluster:sha256:" + value.repeat(64);
const base = {
  topology_atlas_input_receipt_ref: digest("1"),
  truth_release_digest: digest("2"),
  certified_topology_digest: digest("3"),
  topology_atlas_digest: digest("4"),
  pages_conformation_digest: digest("5"),
  research_context_digest: null,
  source_commit: "6".repeat(40),
  source_tree: "7".repeat(40),
  human_actor: "human:lexa",
  privacy_class: "private-research",
  human_note: "These communities appear to require one missing bridge.",
  selection: {
    selected_node_ids: ["B", "A"],
    selected_cluster_ids: [cluster("9"), cluster("8")],
    selected_edges: [
      { dependency_id: "A", dependent_id: "B" }
    ],
    selected_path_ref: null
  },
  gesture: {
    kind: "bring-together",
    source_node_ids: ["A"],
    target_node_ids: ["B"],
    source_cluster_ids: [cluster("8")],
    target_cluster_ids: [cluster("9")]
  },
  created_at: "2026-09-01T00:00:00Z"
};

const request = Observation.buildRequest(base);
assert.equal(request.schema, "pages-human-structure-observation-request.v1");
assert.equal(request.observation_schema, "human-structure-observation.v1");
assert.equal(request.observation_content.explicitly_saved, true);
assert.equal(request.observation_content.source_surface, "trureturing-pages");
assert.deepEqual(request.observation_content.selection.selected_node_ids, ["A", "B"]);
assert.deepEqual(request.observation_content.selection.selected_cluster_ids, [
  cluster("8"),
  cluster("9")
]);
assert.equal("camera" in request.observation_content, false);
assert.equal("drag_offsets" in request.observation_content, false);
assert.equal("observation_id" in request, false, "the trusted intake assigns canonical identity");

assert.throws(() => Observation.buildRequest({
  ...base,
  selection: {
    selected_node_ids: [],
    selected_cluster_ids: [],
    selected_edges: [],
    selected_path_ref: null
  }
}), /needs a selection/);
assert.throws(() => Observation.buildRequest({
  ...base,
  gesture: {
    kind: "compare",
    source_node_ids: ["A"],
    target_node_ids: [],
    source_cluster_ids: [],
    target_cluster_ids: []
  }
}), /requires explicit source and target/);
assert.throws(() => Observation.buildRequest({
  ...base,
  gesture: {
    kind: "path-inspection",
    source_node_ids: [],
    target_node_ids: [],
    source_cluster_ids: [],
    target_cluster_ids: []
  }
}), /requires selected_path_ref/);
assert.throws(() => Observation.buildRequest({
  ...base,
  privacy_class: "implicit-telemetry"
}), /Unsupported privacy class/);

const graph = {
  edges: [
    { source: "A", target: "B", layer: "truth-dependency" },
    { source: "A", target: "C", layer: "structural-affinity", status: "derived" },
    { source: "B", target: "C", layer: "truth-dependency" }
  ]
};
assert.deepEqual(
  Observation.selectedCertifiedEdges(graph, ["A", "B", "C"]),
  [
    { dependency_id: "A", dependent_id: "B" },
    { dependency_id: "B", dependent_id: "C" }
  ]
);

console.log("structure observation tests passed");
