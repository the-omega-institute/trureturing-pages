"use strict";

const assert = require("node:assert/strict");
const History = require("../../site/assets/topology-history-core.js");

const digest = (value) => "sha256:" + value.repeat(64);
const cluster = (value) => "cluster:sha256:" + value.repeat(64);

function delta(from, to, fromAtlas, toAtlas) {
  return {
    schema_version: "topology-atlas-delta.v1",
    from_truth_release_digest: from,
    to_truth_release_digest: to,
    from_topology_atlas_digest: fromAtlas,
    to_topology_atlas_digest: toAtlas,
    from_evidence_digest: digest("7"),
    to_evidence_digest: digest("8"),
    algorithm_profile_digest: digest("9"),
    producer_commit: "a".repeat(40),
    node_transitions: [
      {
        stable_node_id: "gid:A",
        relation: "retained",
        from_node_id: "OldA.lean",
        to_node_id: "NewA.lean",
        source_path_changed: true,
        from_primary_role: "internal",
        to_primary_role: "bridge",
        added_traits: ["bridge"],
        removed_traits: ["internal"]
      },
      {
        stable_node_id: "gid:B",
        relation: "added",
        from_node_id: null,
        to_node_id: "B.lean",
        source_path_changed: false,
        from_primary_role: null,
        to_primary_role: "frontier-adjacent",
        added_traits: ["frontier-adjacent"],
        removed_traits: []
      }
    ],
    edge_transitions: [
      {
        stable_dependency_id: "gid:A",
        stable_dependent_id: "gid:B",
        relation: "added",
        from_dependency_id: null,
        from_dependent_id: null,
        to_dependency_id: "NewA.lean",
        to_dependent_id: "B.lean"
      }
    ],
    cluster_lineage: [
      {
        level: 2,
        relation: "split",
        source_cluster_id: cluster("1"),
        target_cluster_id: cluster("2"),
        source_member_count: 3,
        target_member_count: 2,
        overlap_count: 2,
        member_jaccard: { numerator: 2, denominator: 3 },
        shared_stable_node_ids: ["gid:A", "gid:B"]
      }
    ],
    frontier_delta: {
      entered_frontier: ["gid:B"],
      left_frontier: []
    },
    summary: {
      nodes_added: 1,
      nodes_retired: 0,
      nodes_retained: 1,
      edges_added: 1,
      edges_removed: 0,
      edges_retained: 0,
      cluster_continuations: 0,
      cluster_splits: 1,
      cluster_merges: 0,
      cluster_reorganizations: 0,
      clusters_new: 0,
      clusters_retired: 0
    }
  };
}

const firstRaw = delta(digest("1"), digest("2"), digest("3"), digest("4"));
const secondRaw = delta(digest("2"), digest("5"), digest("4"), digest("6"));
const first = History.validateDelta(firstRaw);
const second = History.validateDelta(secondRaw);
assert.equal(first.node_transitions[0].source_path_changed, true);
assert.equal(first.node_transitions[1].relation, "added");
assert.equal(first.edge_transitions[0].relation, "added");
assert.equal(first.cluster_lineage[0].relation, "split");
assert.deepEqual(History.rows({ delta: first }, "frontier"), [
  { stable_node_id: "gid:B", relation: "entered-frontier" }
]);

const manifest = History.validateManifest({
  schema: "pages-topology-history.v1",
  current_truth_release_digest: digest("5"),
  entries: [
    {
      delta_path: "data/history/first.json",
      delta_digest: digest("b"),
      from_truth_release_digest: digest("1"),
      to_truth_release_digest: digest("2"),
      from_topology_atlas_digest: digest("3"),
      to_topology_atlas_digest: digest("4")
    },
    {
      delta_path: "data/history/second.json",
      delta_digest: digest("c"),
      from_truth_release_digest: digest("2"),
      to_truth_release_digest: digest("5"),
      from_topology_atlas_digest: digest("4"),
      to_topology_atlas_digest: digest("6")
    }
  ]
});
assert.equal(manifest.entries.length, 2);
const records = [
  History.bindDelta(manifest.entries[0], first, digest("b")),
  History.bindDelta(manifest.entries[1], second, digest("c"))
];
assert.deepEqual(History.aggregate(records), {
  releaseTransitions: 2,
  fromRelease: digest("1"),
  toRelease: digest("5"),
  nodesAdded: 2,
  nodesRetired: 0,
  edgesAdded: 2,
  edgesRemoved: 0,
  clusterSplits: 2,
  clusterMerges: 0,
  clusterReorganizations: 0,
  frontierEntered: 2,
  frontierLeft: 0
});

assert.throws(() => History.validateManifest({
  ...manifest,
  entries: manifest.entries.map((entry, index) => index === 1
    ? { ...entry, from_truth_release_digest: digest("f") }
    : entry)
}), /discontinuous/);
assert.throws(() => History.validateManifest({
  ...manifest,
  entries: [{ ...manifest.entries[0], delta_path: "../secret.json" }]
}), /unsafe/);
assert.throws(() => History.validateDelta({
  ...firstRaw,
  summary: { ...firstRaw.summary, edges_added: 2 }
}), /disagrees/);
assert.throws(() => History.validateDelta({
  ...firstRaw,
  camera: { x: 1 }
}), /members must be exactly|presentation state/);
const coordinateAttack = structuredClone(firstRaw);
coordinateAttack.node_transitions[0].x = 4;
assert.throws(() => History.validateDelta(coordinateAttack), /presentation state/);

console.log("topology history tests passed");
