"use strict";

const assert = require("node:assert/strict");
const Context = require("../../site/assets/research-context-v2-core.js");

const digest = (value) => "sha256:" + value.repeat(64);
const cluster = (value) => "cluster:sha256:" + value.repeat(64);
const c1 = cluster("1");
const c2 = cluster("2");
const graph = {
  nodes: [
    { id: "A", atlas_cluster_id: c1 },
    { id: "B", atlas_cluster_id: c1 },
    { id: "C", atlas_cluster_id: c2 },
    { id: "D", atlas_cluster_id: c2 }
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency" },
    { source: "A", target: "C", layer: "truth-dependency", is_cut_bridge: true, cluster_relation: "inter-cluster" },
    { source: "B", target: "D", layer: "truth-dependency", is_cut_bridge: true, cluster_relation: "inter-cluster" },
    { source: "C", target: "D", layer: "truth-dependency" },
    { source: "B", target: "C", layer: "structural-affinity", status: "derived" }
  ]
};
const evidence = {
  node_identities: [
    { node_id: "A", stable_node_id: "gid:A" },
    { node_id: "B", stable_node_id: "gid:B" },
    { node_id: "C", stable_node_id: "gid:C" },
    { node_id: "D", stable_node_id: "gid:D" }
  ],
  affinity_witnesses: [
    {
      source_node_id: "B",
      neighbor_node_id: "C",
      shared_prerequisite_node_ids: ["A"],
      shared_dependent_node_ids: ["D"],
      deepest_common_prerequisite_node_ids: ["A"]
    }
  ]
};
const model = Context.createModel(graph, evidence);
const content = Context.buildContent(
  model,
  {
    truth_release_digest: digest("3"),
    certified_topology_digest: digest("4"),
    topology_atlas_digest: digest("5"),
    pages_conformation_digest: digest("6"),
    topology_atlas_evidence_digest: digest("7")
  },
  {
    selected_node_ids: ["C", "B"],
    selected_cluster_ids: [c2, c1],
    selected_path_ref: digest("8"),
    counterfactual_preview: {
      candidate_ref: digest("9"),
      valuation_ref: digest("a"),
      counterfactual_ref: digest("b"),
      classification: "structural-upside",
      accepted: true,
      cycle_risk: false
    }
  }
);

assert.deepEqual(content.selection.selected_node_ids, ["B", "C"]);
assert.deepEqual(content.selection.selected_stable_node_ids, ["gid:B", "gid:C"]);
assert.deepEqual(content.selection.selected_cluster_ids, [c1, c2]);
assert.deepEqual(content.certified_neighborhood.shared_prerequisite_node_ids, ["A"]);
assert.deepEqual(content.certified_neighborhood.shared_consequence_node_ids, ["D"]);
assert.equal(content.cluster_interfaces.length, 2);
assert.equal(content.cluster_interfaces.every((edge) => edge.is_cut_bridge), true);
assert.equal(content.affinity_witnesses.length, 1);
assert.deepEqual(
  content.affinity_witnesses[0].shared_prerequisite_node_ids,
  ["A"]
);
assert.equal(content.counterfactual_preview.authority, "advisory");
assert.equal(content.evidence_status, "topology-atlas-evidence-bound");
assert.equal(content.authority.pages_coordinates_included, false);
assert.equal(content.authority.local_exploration_offsets_included, false);
assert.equal("coordinates" in content, false);
assert.equal("camera" in content, false);
assert.equal("human_note" in content, false);
assert.equal("prompt" in content, false);

const canonicalA = Context.canonical({ z: 1, a: [2, { y: true, x: null }] });
const canonicalB = Context.canonical({ a: [2, { x: null, y: true }], z: 1 });
assert.equal(canonicalA, canonicalB);
assert.equal(Context.authority(graph.edges[0]), "certified");
assert.equal(Context.authority(graph.edges[4]), "derived");

const noEvidence = Context.buildContent(
  Context.createModel(graph, null),
  {
    truth_release_digest: digest("3"),
    certified_topology_digest: digest("4"),
    topology_atlas_digest: digest("5"),
    pages_conformation_digest: digest("6"),
    topology_atlas_evidence_digest: null
  },
  {
    selected_node_ids: ["B"],
    selected_cluster_ids: [c1],
    selected_path_ref: null,
    counterfactual_preview: null
  }
);
assert.equal(noEvidence.evidence_status, "topology-atlas-evidence-unavailable");
assert.deepEqual(noEvidence.affinity_witnesses, []);

assert.throws(() => Context.buildContent(
  model,
  {
    truth_release_digest: digest("3"),
    certified_topology_digest: digest("4"),
    topology_atlas_digest: digest("5"),
    pages_conformation_digest: digest("6"),
    topology_atlas_evidence_digest: digest("7")
  },
  {
    selected_node_ids: Array.from({ length: 17 }, (_, index) => `N${index}`),
    selected_cluster_ids: [],
    selected_path_ref: null,
    counterfactual_preview: null
  }
), /exceeds 16/);

console.log("research context v2 tests passed");
