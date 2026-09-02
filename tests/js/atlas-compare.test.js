"use strict";

const assert = require("node:assert/strict");
const Atlas = require("../../site/assets/atlas-structure-core.js");
const Compare = require("../../site/assets/atlas-compare-core.js");

const c1 = "cluster:sha256:" + "1".repeat(64);
const c2 = "cluster:sha256:" + "2".repeat(64);
const graph = {
  topology_atlas: { schema_version: "topology-atlas.v1" },
  nodes: [
    { id: "P", kind: "truth", human_title: "Prime foundation", true_depth: 0, atlas_cluster_id: c1 },
    { id: "A", kind: "truth", human_title: "Analytic branch", true_depth: 1, atlas_cluster_id: c1 },
    { id: "B", kind: "truth", human_title: "Observer branch", true_depth: 1, atlas_cluster_id: c2 },
    { id: "M", kind: "truth", human_title: "Middle bridge", true_depth: 2, atlas_cluster_id: c1 },
    { id: "T", kind: "truth", human_title: "Target theorem", true_depth: 3, atlas_cluster_id: c2 },
    { id: "U", kind: "truth", human_title: "Unrelated leaf", true_depth: 2, atlas_cluster_id: c2 }
  ],
  edges: [
    { source: "P", target: "A", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "P", target: "B", layer: "truth-dependency", cluster_relation: "inter-cluster", is_cut_bridge: true },
    { source: "A", target: "M", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "M", target: "T", layer: "truth-dependency", cluster_relation: "inter-cluster" },
    { source: "B", target: "T", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "B", target: "U", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    {
      source: "A",
      target: "B",
      layer: "structural-affinity",
      status: "derived",
      affinity_rank: 2,
      mutual_top_k: true,
      direct_dependency: false,
      shared_ancestor_jaccard: "1/1",
      shared_descendant_jaccard: "1/3",
      undirected_path_distance: 2,
      deepest_common_prerequisite_depth: 0
    }
  ],
  clusters: [
    {
      cluster_id: c1,
      level: 2,
      display_label: "Analytic core",
      member_node_ids: ["P", "A", "M"],
      representative_node_ids: ["A"]
    },
    {
      cluster_id: c2,
      level: 2,
      display_label: "Observer memory",
      member_node_ids: ["B", "T", "U"],
      representative_node_ids: ["B"]
    }
  ]
};
const conformation = {
  nodes: graph.nodes.map((node, index) => ({
    node_id: node.id,
    aligned: { x: index * 100, y: node.true_depth * 100, z: 0 }
  })),
  regions: []
};
const model = Atlas.createModel(graph, conformation);

const path = Compare.shortestCertifiedPath(model, "P", "T");
assert.ok(path);
assert.deepEqual(path.nodeIds, ["P", "B", "T"]);
assert.deepEqual(path.edgeKeys, [
  Compare.edgeKey("P", "B"),
  Compare.edgeKey("B", "T")
]);
assert.equal(path.length, 2);
assert.equal(Compare.shortestCertifiedPath(model, "T", "P"), null);

const reverse = Compare.pathBetween(model, "T", "P");
assert.ok(reverse);
assert.equal(reverse.direction, "right-to-left");
assert.deepEqual(reverse.nodeIds, ["P", "B", "T"]);

const branches = Compare.nodeComparison(model, "A", "B");
assert.equal(branches.kind, "node-pair");
assert.equal(branches.sameCluster, false);
assert.deepEqual(branches.sharedPrerequisites, ["P"]);
assert.deepEqual(branches.leftOnlyPrerequisites, []);
assert.deepEqual(branches.rightOnlyPrerequisites, []);
assert.deepEqual(branches.sharedDependents, ["T"]);
assert.deepEqual(branches.leftOnlyDependents, ["M"]);
assert.deepEqual(branches.rightOnlyDependents, ["U"]);
assert.equal(branches.certifiedPath, null);
assert.equal(branches.authority.path, "absent");
assert.equal(branches.authority.proximity, "derived");
assert.equal(branches.derivedRelation.rank, 2);
assert.equal(branches.derivedRelation.mutualTopK, true);

const dependency = Compare.nodeComparison(model, "A", "T");
assert.ok(dependency.certifiedPath);
assert.equal(dependency.certifiedPath.direction, "left-to-right");
assert.deepEqual(dependency.certifiedPath.nodeIds, ["A", "M", "T"]);
const steps = Compare.pathSteps(model, dependency.certifiedPath);
assert.deepEqual(steps.map((step) => step.title), [
  "Analytic branch",
  "Middle bridge",
  "Target theorem"
]);
assert.deepEqual(steps.map((step) => step.depth), [1, 2, 3]);

const clusters = Compare.clusterComparison(model, c1, c2);
assert.equal(clusters.kind, "cluster-pair");
assert.equal(clusters.certifiedInterfacePresent, true);
assert.deepEqual(
  clusters.crossEdges.map((edge) => `${edge.source}->${edge.target}`).sort(),
  ["M->T", "P->B"]
);
assert.deepEqual(clusters.leftBoundaryNodeIds, ["P", "M"]);
assert.deepEqual(clusters.rightBoundaryNodeIds, ["B", "T"]);
assert.equal(clusters.crossEdges.filter((edge) => edge.isCutBridge).length, 1);
assert.equal(clusters.authority, "deterministic-derived-summary-of-certified-edges");

const highlighted = Compare.highlight(model, dependency, true);
assert.deepEqual([...highlighted.nodeIds].sort(), ["A", "M", "T"]);
assert.deepEqual([...highlighted.edgeKeys].sort(), [
  Compare.edgeKey("A", "M"),
  Compare.edgeKey("M", "T")
].sort());

assert.throws(() => Compare.nodeComparison(model, "A", "A"));
assert.throws(() => Compare.clusterComparison(model, c1, c1));
assert.throws(() => Compare.shortestCertifiedPath(model, "missing", "A"));

console.log("atlas compare tests passed");
