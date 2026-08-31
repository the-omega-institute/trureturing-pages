"use strict";

const assert = require("node:assert/strict");
const Atlas = require("../../site/assets/atlas-structure-core.js");
const Semantic = require("../../site/assets/atlas-semantic-zoom-core.js");

const c1 = "cluster:sha256:" + "1".repeat(64);
const c2 = "cluster:sha256:" + "2".repeat(64);
const graph = {
  topology_atlas: { schema_version: "topology-atlas.v1" },
  nodes: [
    { id: "A", kind: "truth", state: "closed", status: "Closed", atlas_cluster_id: c1, structural_role: "foundation" },
    { id: "B", kind: "truth", state: "closed", status: "Closed", atlas_cluster_id: c1, structural_role: "bridge" },
    { id: "X", kind: "truth", state: "closed", status: "Closed", atlas_cluster_id: c1, structural_role: "internal" },
    { id: "C", kind: "truth", state: "closed", status: "Closed", atlas_cluster_id: c2, structural_role: "interface" },
    { id: "D", kind: "truth", state: "open", status: "Open", atlas_cluster_id: c2, structural_role: "frontier-adjacent" },
    { id: "doc", kind: "blueprint", state: "semantic", status: "Semantic" }
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "B", target: "X", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "B", target: "C", layer: "truth-dependency", cluster_relation: "inter-cluster", is_cut_bridge: true },
    { source: "C", target: "D", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "A", target: "D", layer: "structural-affinity", status: "derived" },
    { source: "doc", target: "A", layer: "blueprint-truth-anchor" }
  ],
  clusters: [
    {
      cluster_id: c1,
      level: 2,
      display_label: "Alpha",
      member_node_ids: ["A", "B", "X"],
      representative_node_ids: ["A"]
    },
    {
      cluster_id: c2,
      level: 2,
      display_label: "Gamma",
      member_node_ids: ["C", "D"],
      representative_node_ids: ["D"]
    }
  ]
};
const conformation = {
  nodes: [
    { node_id: "A", aligned: { x: 0, y: 0, z: 0 } },
    { node_id: "B", aligned: { x: 100, y: 100, z: 0 } },
    { node_id: "X", aligned: { x: 160, y: 160, z: 20 } },
    { node_id: "C", aligned: { x: 500, y: 200, z: 0 } },
    { node_id: "D", aligned: { x: 600, y: 300, z: 0 } },
    { node_id: "doc", aligned: { x: -200, y: 0, z: 0 } }
  ],
  regions: [
    { region_id: c1, label: "Alpha", member_node_ids: ["A", "B", "X"] },
    { region_id: c2, label: "Gamma", member_node_ids: ["C", "D"] },
    { region_id: "docs", label: "Documents", member_node_ids: ["doc"] }
  ]
};

const model = Atlas.createModel(graph, conformation);
const options = {
  mode: "structure",
  state: "All",
  clusterId: "All",
  selectedId: null
};

assert.deepEqual(Semantic.LEVELS, ["far", "medium", "near", "focus"]);
assert.equal(Semantic.levelFromCamera(400, 100, "far"), "far");
assert.equal(Semantic.levelFromCamera(240, 100, "far"), "medium");
assert.equal(Semantic.levelFromCamera(120, 100, "medium"), "near");
assert.equal(Semantic.levelFromCamera(150, 100, "near"), "near");
assert.equal(Semantic.levelFromCamera(180, 100, "near"), "medium");
assert.equal(Semantic.effectiveLevel("far", "A", "All"), "focus");
assert.equal(Semantic.effectiveLevel("far", null, c1), "near");
assert.ok(Semantic.canonicalRadius(new Map(conformation.nodes.map((node) => [node.node_id, node.aligned]))) > 0);

const far = Semantic.graphView(model, options, "far");
assert.deepEqual([...far.nodeIds].sort(), ["A", "B", "C", "D"]);
assert.deepEqual(far.edges.map((edge) => `${edge.source}->${edge.target}`), ["B->C"]);
assert.equal(far.nodeIds.has("X"), false);
assert.equal(far.nodeIds.has("doc"), false);

const medium = Semantic.graphView(model, options, "medium");
assert.deepEqual([...medium.nodeIds].sort(), ["A", "B", "C", "D"]);
assert.deepEqual(
  medium.edges.map((edge) => `${edge.source}->${edge.target}`).sort(),
  ["A->B", "B->C", "C->D"].sort()
);

const near = Semantic.graphView(model, options, "near");
assert.deepEqual([...near.nodeIds].sort(), ["A", "B", "C", "D", "X", "doc"]);
assert.equal(near.edges.some((edge) => edge.authority === "derived"), false);
assert.equal(near.edges.some((edge) => edge.source === "doc"), false);
assert.equal(near.edges.filter((edge) => edge.authority === "certified").length, 4);

const focus = Semantic.graphView(model, { ...options, selectedId: "A" }, "focus");
assert.deepEqual([...focus.nodeIds].sort(), ["A", "B", "C", "D", "X", "doc"]);
assert.equal(
  focus.edges.some((edge) => edge.source === "A" && edge.target === "D" && edge.authority === "derived"),
  true
);
assert.equal(
  focus.edges.some((edge) => edge.source === "doc" && edge.target === "A" && edge.authority === "authored"),
  true
);

const cluster = Semantic.graphView(
  model,
  { ...options, clusterId: c1 },
  Semantic.effectiveLevel("far", null, c1)
);
assert.equal(cluster.level, "near");
assert.deepEqual([...cluster.nodeIds].sort(), ["A", "B", "X"]);

const frontier = Semantic.graphView(
  model,
  { ...options, mode: "frontier" },
  "near"
);
assert.deepEqual([...frontier.nodeIds].sort(), ["C", "D"]);
assert.deepEqual(frontier.edges.map((edge) => `${edge.source}->${edge.target}`), ["C->D"]);

console.log("atlas semantic zoom tests passed");
