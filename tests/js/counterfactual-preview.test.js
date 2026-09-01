"use strict";

const assert = require("node:assert/strict");
const Preview = require("../../site/assets/counterfactual-preview-core.js");

const digest = (value) => "sha256:" + value.repeat(64);
const cluster = (value) => "cluster:sha256:" + value.repeat(64);
const payload = {
  schema: "pages-counterfactual-preview.v1",
  candidate_ref: digest("1"),
  valuation_ref: digest("2"),
  truth_release_digest: digest("3"),
  topology_atlas_digest: digest("4"),
  counterfactual_ref: digest("5"),
  accepted: true,
  cycle_risk: false,
  classification: "structural-upside",
  authority: "advisory",
  operations: [
    {
      operation: "add-edge",
      node_id: null,
      stable_node_id: null,
      dependency_id: "X",
      dependent_id: "B",
      stable_dependency_id: "candidate:X",
      stable_dependent_id: "gid:B"
    },
    {
      operation: "add-edge",
      node_id: null,
      stable_node_id: null,
      dependency_id: "A",
      dependent_id: "X",
      stable_dependency_id: "gid:A",
      stable_dependent_id: "candidate:X"
    },
    {
      operation: "add-node",
      node_id: "X",
      stable_node_id: "candidate:X",
      dependency_id: null,
      dependent_id: null,
      stable_dependency_id: null,
      stable_dependent_id: null
    }
  ],
  metrics: {
    reachability_gain: "9007199254740993",
    reachability_loss: 0,
    path_compression: 1,
    shortest_path_change_count: 1,
    new_cut_bridge_count: 0,
    removed_cut_bridge_count: 1,
    new_interface_count: 1,
    removed_interface_count: 0,
    cycle_witness_count: 0,
    affected_stable_node_count: 3,
    touched_cluster_count: 2,
    edit_operation_count: 3
  },
  affected_node_ids: ["A", "B"],
  affected_stable_node_ids: ["candidate:X", "gid:A", "gid:B"],
  touched_cluster_ids: [cluster("6"), cluster("7")],
  path_changes: [
    {
      source_node_id: "A",
      target_node_id: "B",
      before_distance: 3,
      after_distance: 2
    }
  ],
  interface_changes: [
    {
      source_cluster_id: cluster("6"),
      target_cluster_id: cluster("7"),
      relation: "added"
    }
  ]
};
const manifest = {
  truth_release_digest: digest("3"),
  topology_atlas_digest: digest("4")
};

const preview = Preview.validate(payload, manifest);
assert.equal(preview.authority, "advisory");
assert.equal(preview.metrics.reachability_gain, "9007199254740993");
assert.equal(preview.operations.length, 3);
assert.equal("x" in preview.operations[2], false);

const positions = new Map([
  ["A", { x: 0, y: 0, z: 0 }],
  ["B", { x: 100, y: 0, z: 0 }]
]);
const centroids = new Map([
  [cluster("6"), { x: 0, y: 0, z: 0 }],
  [cluster("7"), { x: 100, y: 0, z: 0 }]
]);
const first = Preview.project(preview, positions, centroids);
const second = Preview.project(preview, positions, centroids);
assert.equal(first.nodes.length, 1);
assert.equal(first.edges.length, 2);
assert.equal(first.paths.length, 1);
assert.equal(first.interfaces.length, 1);
assert.deepEqual(first.nodes[0].position, second.nodes[0].position);
assert.ok(Number.isFinite(first.nodes[0].position.x));
assert.ok(Number.isFinite(first.nodes[0].position.z));
assert.equal(first.edges.every((edge) => edge.authority === "advisory"), true);

const summary = Preview.summary(preview);
assert.deepEqual(summary, {
  classification: "structural-upside",
  accepted: true,
  cycleRisk: false,
  addedNodes: 1,
  addedEdges: 2,
  removedEdges: 0,
  pathChanges: 1,
  interfaceChanges: 1
});

assert.throws(() => Preview.validate({
  ...payload,
  truth_release_digest: digest("8")
}, manifest), /different release coordinates/);
assert.throws(() => Preview.validate({
  ...payload,
  authority: "certified"
}, manifest), /must remain advisory/);
assert.throws(() => Preview.validate({
  ...payload,
  operations: payload.operations.map((operation, index) =>
    index === 2 ? { ...operation, x: 12 } : operation)
}, manifest), /cannot carry x/);
assert.throws(() => Preview.validate({
  ...payload,
  accepted: true,
  cycle_risk: true,
  classification: "rejected-cycle"
}, manifest), /cannot carry cycle risk/);

console.log("counterfactual preview tests passed");
