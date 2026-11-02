import test from "node:test";
import assert from "node:assert/strict";
import { reconcileRenderGraph } from "../../site/assets/atlas-render-state.mjs";
import { partitionImportEdges } from "../../site/assets/atlas-import-batches.mjs";

const nodes = ["A", "B", "C"].map(id => Object.freeze({ id }));
const edges = [
  Object.freeze({ relationId: "A:B", source: "A", target: "B" }),
  Object.freeze({ relationId: "B:C", source: "B", target: "C" }),
];
const positions = Object.freeze(Object.fromEntries(nodes.map((node, i) =>
  [node.id, Object.freeze({ x: i * 10, y: i * 20, z: -i })])));

test("mode changes retain renderer objects and mesh bindings without mutating source records", () => {
  const initial = reconcileRenderGraph(null, { nodes, edges }, positions);
  assert.equal(initial.topologyChanged, true);
  const data = initial.data;
  data.nodes[0].__threeObj = { mesh: true };
  // 3d-force-graph resolves string endpoints to renderer-owned node objects.
  data.links[0].source = data.nodes[0];
  data.links[0].target = data.nodes[1];
  const moved = { ...positions, A: { x: 50, y: 60, z: 70 } };
  const next = reconcileRenderGraph(data, { nodes, edges }, moved);
  assert.equal(next.data, data);
  assert.equal(next.topologyChanged, false);
  assert.equal(next.positionsChanged, true);
  assert.equal(next.data.links[0].source, data.nodes[0]);
  assert.deepEqual(next.data.nodes[0].__threeObj, { mesh: true });
  assert.equal(next.data.nodes[0].fx, 50);
  assert.equal(next.data.nodes[0].fy, 60);
  assert.equal(next.data.nodes[0].fz, 70);
  assert.deepEqual(nodes[0], { id: "A" });
  assert.equal(edges[0].source, "A");
  assert.equal(reconcileRenderGraph(data, { nodes, edges }, moved).positionsChanged, false);
});

test("local focus and return restore exact topology, retaining surviving mesh identities", () => {
  const whole = reconcileRenderGraph(null, { nodes, edges }, positions).data;
  const local = reconcileRenderGraph(whole, { nodes: nodes.slice(1), edges: edges.slice(1) }, positions);
  assert.equal(local.topologyChanged, true);
  assert.equal(local.data.nodes[0], whole.nodes[1]);
  assert.equal(local.data.links[0], whole.links[1]);
  const returned = reconcileRenderGraph(local.data, { nodes, edges }, positions);
  assert.equal(returned.topologyChanged, true);
  assert.deepEqual(returned.data.nodes.map(n => n.id), ["A", "B", "C"]);
  assert.deepEqual(returned.data.links.map(e => e.relationId), ["A:B", "B:C"]);
  assert.equal(returned.data.nodes[1], whole.nodes[1]);
  const reordered = reconcileRenderGraph(returned.data, { nodes: [...nodes].reverse(), edges }, positions);
  assert.equal(reordered.topologyChanged, true);
  assert.deepEqual(reordered.data.nodes.map(n => n.id), ["C", "B", "A"]);
});

test("batched imports preserve exact directed edge membership and contextual alpha", () => {
  const imports = [
    ...edges,
    { relationId: "A:C", source: { id: "A" }, target: { id: "C" } },
    { relationId: "C:A", source: "C", target: "A" },
  ];
  const before = JSON.stringify(imports);
  const styles = ["#72d8d5", "rgba(68, 113, 144, 0.38)", "rgba(49, 75, 93, 0.045)", "#72d8d5"];
  const batches = partitionImportEdges(imports, e => styles[imports.indexOf(e)], () => 1.35);
  const members = batches.flatMap(b => b.members.map(m => m.edge));
  assert.equal(members.length, imports.length);
  assert.deepEqual(new Set(members), new Set(imports));
  assert.equal(JSON.stringify(imports), before);
  const context = batches.find(b => b.members.some(m => m.edge.relationId === "A:C"));
  assert.ok(context.opacity < 0.025, "Remote lines must remain quiet after batching");
  assert.equal(context.members[0].color, "rgb(49,75,93)");
  const full = batches.find(b => b.members.some(m => m.edge === imports[0]));
  assert.ok(full.opacity > context.opacity * 10);
  assert.deepEqual(full.members.map(m => m.edge.relationId), ["A:B", "C:A"]);
});
