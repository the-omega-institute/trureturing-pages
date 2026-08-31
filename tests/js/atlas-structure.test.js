"use strict";

const assert = require("node:assert/strict");
const Atlas = require("../../site/assets/atlas-structure-core.js");

const c1 = "cluster:sha256:" + "1".repeat(64);
const c2 = "cluster:sha256:" + "2".repeat(64);
const graph = {
  topology_atlas: { schema_version: "topology-atlas.v1" },
  nodes: [
    { id: "A", kind: "truth", state: "closed", status: "Closed", atlas_cluster_id: c1, structural_role: "foundation", descendant_cost: 9 },
    { id: "B", kind: "truth", state: "closed", status: "Closed", atlas_cluster_id: c1, structural_role: "bridge", descendant_cost: 4 },
    { id: "C", kind: "truth", state: "open", status: "Open", atlas_cluster_id: c2, structural_role: "frontier-adjacent", descendant_cost: 1 },
    { id: "doc", kind: "blueprint", state: "semantic", status: "Semantic" }
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency", cluster_relation: "intra-cluster", is_cut_bridge: false },
    { source: "B", target: "C", layer: "truth-dependency", cluster_relation: "inter-cluster", is_cut_bridge: true },
    { source: "A", target: "C", layer: "structural-affinity", status: "derived" },
    { source: "doc", target: "A", layer: "blueprint-truth-anchor" }
  ],
  clusters: [
    { cluster_id: c1, level: 2, display_label: "Alpha community", member_node_ids: ["A", "B"] },
    { cluster_id: c2, level: 2, display_label: "Gamma community", member_node_ids: ["C"] }
  ]
};
const conformation = {
  nodes: [
    { node_id: "A", aligned: { x: 0, y: 0, z: 0 } },
    { node_id: "B", aligned: { x: 100, y: 100, z: 0 } },
    { node_id: "C", aligned: { x: 500, y: 200, z: 0 } },
    { node_id: "doc", aligned: { x: -200, y: 0, z: 0 } }
  ],
  regions: [
    { region_id: c1, label: "Alpha community", authority: "topology-atlas-derived", member_node_ids: ["A", "B"], aligned_centroid: { x: 50, y: 50, z: 0 } },
    { region_id: c2, label: "Gamma community", authority: "topology-atlas-derived", member_node_ids: ["C"], aligned_centroid: { x: 500, y: 200, z: 0 } },
    { region_id: "docs", label: "Documents", authority: "pages-derived-fallback", member_node_ids: ["doc"], aligned_centroid: { x: -200, y: 0, z: 0 } }
  ]
};

const model = Atlas.createModel(graph, conformation);
assert.equal(model.hasTopologyAtlas, true);
assert.equal(Atlas.edgeAuthority(graph.edges[0]), "certified");
assert.equal(Atlas.edgeAuthority(graph.edges[2]), "derived");
assert.equal(Atlas.edgeAuthority(graph.edges[3]), "authored");

const structure = Atlas.graphView(model, {
  mode: "structure",
  state: "All",
  clusterId: "All",
  selectedId: null
});
assert.deepEqual(structure.edges.map((edge) => `${edge.source}->${edge.target}`), ["B->C"]);
assert.equal(
  structure.edges.some((edge) => edge.authority === "derived"),
  false,
  "derived affinities stay hidden until an endpoint is selected"
);

const selectedStructure = Atlas.graphView(model, {
  mode: "structure",
  state: "All",
  clusterId: "All",
  selectedId: "A"
});
assert.deepEqual(
  selectedStructure.edges.map((edge) => `${edge.source}->${edge.target}`).sort(),
  ["A->B", "A->C", "B->C", "doc->A"].sort()
);
assert.equal(
  selectedStructure.edges.some((edge) =>
    edge.source === "A" && edge.target === "C" && edge.authority === "derived"),
  true,
  "the selected structural affinity becomes visible without becoming certified"
);

const dependency = Atlas.graphView(model, {
  mode: "dependency",
  state: "All",
  clusterId: "All",
  selectedId: null
});
assert.deepEqual(
  dependency.edges.map((edge) => `${edge.source}->${edge.target}`),
  ["A->B", "B->C"]
);

const frontier = Atlas.graphView(model, {
  mode: "frontier",
  state: "All",
  clusterId: "All",
  selectedId: null
});
assert.deepEqual(frontier.nodes.map((node) => node.id).sort(), ["B", "C"]);
assert.deepEqual(frontier.edges.map((edge) => `${edge.source}->${edge.target}`), ["B->C"]);

assert.equal(Atlas.clusterColor(c1, "closed", false), Atlas.clusterColor(c1, "closed", false));
assert.notEqual(Atlas.clusterColor(c1, "closed", false), Atlas.clusterColor(c2, "closed", false));
assert.ok(Atlas.nodeValue(graph.nodes[1]) > Atlas.nodeValue({ ...graph.nodes[1], structural_role: "internal" }));
assert.equal(Atlas.clusterDescriptors(model, structure.nodeIds).length, 2);

const summary = Atlas.structuralSummary(model);
assert.equal(summary.source, "topology-atlas.v1");
assert.equal(summary.clusters, 2);
assert.equal(summary.cutBridges, 1);
assert.equal(summary.affinityEdges, 1);

console.log("atlas-structure tests passed");
require("./atlas-semantic-zoom.test.js");
