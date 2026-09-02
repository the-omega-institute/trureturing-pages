"use strict";

const assert = require("node:assert/strict");
const Atlas = require("../../site/assets/atlas-structure-core.js");
const Semantic = require("../../site/assets/atlas-semantic-zoom-core.js");
const Exploration = require("../../site/assets/atlas-exploration-core.js");

const c1 = "cluster:sha256:" + "1".repeat(64);
const c2 = "cluster:sha256:" + "2".repeat(64);
const graph = {
  topology_atlas: { schema_version: "topology-atlas.v1" },
  nodes: [
    { id: "A", kind: "truth", status: "Closed", state: "closed", atlas_cluster_id: c1, structural_role: "foundation" },
    { id: "B", kind: "truth", status: "Closed", state: "closed", atlas_cluster_id: c1, structural_role: "bridge" },
    { id: "C", kind: "truth", status: "Closed", state: "closed", atlas_cluster_id: c2, structural_role: "interface" },
    { id: "D", kind: "truth", status: "Open", state: "open", atlas_cluster_id: c2, structural_role: "frontier-adjacent" },
    { id: "E", kind: "truth", status: "Closed", state: "closed", atlas_cluster_id: c2, structural_role: "internal" }
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "B", target: "C", layer: "truth-dependency", cluster_relation: "inter-cluster", is_cut_bridge: true },
    { source: "C", target: "D", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "D", target: "E", layer: "truth-dependency", cluster_relation: "intra-cluster" },
    { source: "A", target: "D", layer: "structural-affinity", status: "derived" }
  ],
  clusters: [
    { cluster_id: c1, level: 2, member_node_ids: ["A", "B"], representative_node_ids: ["A"] },
    { cluster_id: c2, level: 2, member_node_ids: ["C", "D", "E"], representative_node_ids: ["D"] }
  ]
};
const conformation = {
  nodes: [
    { node_id: "A", aligned: { x: 0, y: 0, z: 0 } },
    { node_id: "B", aligned: { x: 100, y: 100, z: 0 } },
    { node_id: "C", aligned: { x: 500, y: 200, z: 0 } },
    { node_id: "D", aligned: { x: 600, y: 300, z: 0 } },
    { node_id: "E", aligned: { x: 700, y: 400, z: 0 } }
  ],
  regions: []
};

const model = Atlas.createModel(graph, conformation);
const canonical = new Map(conformation.nodes.map((node) => [node.node_id, node.aligned]));
const nodeOffsets = new Map([["B", { x: 10, y: 20, z: 30 }]]);
const clusterOffsets = new Map([[c1, { x: 100, y: 0, z: -50 }]]);
const positions = Exploration.composePositions(
  canonical,
  nodeOffsets,
  clusterOffsets,
  model.nodeById
);
assert.deepEqual(positions.get("A"), { x: 100, y: 0, z: -50 });
assert.deepEqual(positions.get("B"), { x: 210, y: 120, z: -20 });
assert.deepEqual(positions.get("C"), { x: 500, y: 200, z: 0 });

const draggedOffset = Exploration.nodeOffsetFromDrag(
  "B",
  { x: 260, y: 140, z: -10 },
  canonical,
  clusterOffsets,
  model.nodeById
);
assert.deepEqual(draggedOffset, { x: 60, y: 40, z: 40 });

const peelA = Exploration.peelOffset(
  c1,
  ["A", "B"],
  [...canonical.keys()],
  positions,
  280
);
const peelB = Exploration.peelOffset(
  c1,
  ["A", "B"],
  [...canonical.keys()],
  positions,
  280
);
assert.deepEqual(peelA, peelB);
assert.equal(Math.round(Math.hypot(peelA.x, peelA.z)), 280);
assert.equal(peelA.y, 0);

const oneHop = Exploration.focusNodeIds(model, {
  selectedId: "C",
  upstreamHops: 1,
  downstreamHops: 1,
  includeRelated: false,
  allowedNodeIds: new Set(model.nodeById.keys())
});
assert.deepEqual([...oneHop].sort(), ["B", "C", "D"]);

const expanded = Exploration.focusNodeIds(model, {
  selectedId: "C",
  upstreamHops: 2,
  downstreamHops: 2,
  includeRelated: false,
  allowedNodeIds: new Set(model.nodeById.keys())
});
assert.deepEqual([...expanded].sort(), ["A", "B", "C", "D", "E"]);

const related = Exploration.focusNodeIds(model, {
  selectedId: "A",
  upstreamHops: 0,
  downstreamHops: 0,
  includeRelated: true,
  allowedNodeIds: new Set(model.nodeById.keys())
});
assert.deepEqual([...related].sort(), ["A", "D"]);

const near = Semantic.graphView(model, {
  mode: "structure",
  state: "All",
  clusterId: "All",
  selectedId: "C"
}, "near");
const focus = Exploration.focusGraphView(model, {
  selectedId: "C",
  upstreamHops: 1,
  downstreamHops: 1,
  includeRelated: false,
  allowedNodeIds: near.nodeIds
}, { ...near, level: "focus" });
assert.deepEqual([...focus.nodeIds].sort(), ["B", "C", "D"]);
assert.deepEqual(
  focus.edges.map((edge) => `${edge.source}->${edge.target}`).sort(),
  ["B->C", "C->D"]
);

const releaseKey = "sha256:" + "a".repeat(64);
const encoded = Exploration.encodeSession(
  releaseKey,
  nodeOffsets,
  clusterOffsets,
  { upstreamHops: 4, downstreamHops: 3, includeRelated: true }
);
assert.equal(encoded.includes("human_prompt"), false);
assert.equal(encoded.includes("candidate"), false);
assert.equal(encoded.includes("camera"), false);
const decoded = Exploration.decodeSession(
  encoded,
  releaseKey,
  new Set(model.nodeById.keys()),
  new Set([c1, c2])
);
assert.ok(decoded);
assert.deepEqual(decoded.nodeOffsets.get("B"), { x: 10, y: 20, z: 30 });
assert.deepEqual(decoded.clusterOffsets.get(c1), { x: 100, y: 0, z: -50 });
assert.deepEqual(decoded.expansion, {
  upstreamHops: 4,
  downstreamHops: 3,
  includeRelated: true
});
assert.equal(
  Exploration.decodeSession(
    encoded,
    "sha256:" + "b".repeat(64),
    new Set(model.nodeById.keys()),
    new Set([c1, c2])
  ),
  null,
  "local exploration cannot cross release coordinates"
);

console.log("atlas exploration tests passed");
