import test from "node:test";
import assert from "node:assert/strict";
import {
  snapshotFromGraph,
  validateSnapshot,
} from "../../site/assets/architecture-core.mjs";
import {
  dependencyScene,
  timeScene,
  releaseDelta,
  lineageIds,
} from "../../site/assets/evolution-core.mjs";

function fixture(letter = "a") {
  return {
    source_snapshot: { truth_release_digest: `sha256:${letter.repeat(64)}` },
    nodes: [
      { id: "A", kind: "truth", domain: "Digit" },
      { id: "B", kind: "truth", domain: "Fourier" },
      { id: "C", kind: "truth", domain: "Quantum" },
      { id: "D", kind: "truth", domain: "Quantum" },
    ],
    edges: [
      { source: "A", target: "B" },
      { source: "A", target: "C" },
      { source: "B", target: "D" },
      { source: "C", target: "D" },
    ],
  };
}
const snapshot = (g) => snapshotFromGraph(g, `sha256:${"1".repeat(64)}`);

test("dependency aggregation preserves every edge and multiple-parent convergence", () => {
  const value = snapshot(fixture()),
    scene = dependencyScene(value),
    positions = new Map(scene.nodes.map((n) => [n.id, n]));
  assert.equal(
    scene.edges.reduce((sum, e) => sum + e.count, 0),
    4,
  );
  for (const edge of scene.edges)
    assert.ok(positions.get(edge.source).x < positions.get(edge.target).x);
  assert.deepEqual([...lineageIds(value, "D")].sort(), ["A", "B", "C", "D"]);
});
test("time flows use exact identity, preserve domain branching and merging, and never bridge analysis changes", () => {
  const a = fixture(),
    b = fixture("b");
  b.nodes[1].domain = "Digit";
  b.nodes[2].domain = "Digit";
  const first = snapshot(a),
    second = snapshot(b),
    scene = timeScene([first, second]);
  assert.equal(
    scene.edges.reduce((n, e) => n + e.count, 0),
    4,
  );
  const target = JSON.stringify([1, "Digit"]);
  assert.equal(scene.edges.filter((e) => e.target === target).length, 3);
  second.topology_algorithm = "changed";
  assert.equal(timeScene([first, second]).edges.length, 0);
  assert.equal(releaseDelta(first, second).kind, "analysis-changed");
});
test("release deltas distinguish absent edges from unarchived edges and one baseline from invented history", () => {
  const first = snapshot(fixture()),
    g = fixture("b");
  g.nodes.push({ id: "E", kind: "truth", domain: "Digit" });
  g.edges.push({ source: "D", target: "E" });
  const second = snapshot(g);
  assert.deepEqual(releaseDelta(first, second).added, ["E"]);
  assert.deepEqual(releaseDelta(first, second).edgesAdded, [["D", "E"]]);
  const introduced = timeScene([first, second]).edges.filter(
    (e) => e.kind === "new-dependency",
  );
  assert.equal(introduced.length, 1);
  assert.deepEqual(introduced[0].pairs, [["D", "E"]]);
  delete first.dependency_edges;
  assert.equal(releaseDelta(first, second).edgesAdded, null);
  assert.equal(releaseDelta(null, second).kind, "baseline");
  assert.equal(timeScene([second]).edges.length, 0);
});
test("archived dependencies reject missing endpoints, duplicate edges, cycles and false metrics", () => {
  for (const change of [
    (s) => s.dependency_edges.push(["missing", "A"]),
    (s) => s.dependency_edges.push(["A", "B"]),
    (s) => s.dependency_edges.push(["D", "A"]),
    (s) => s.dependency_edges.pop(),
  ]) {
    const value = snapshot(fixture());
    change(value);
    assert.throws(() => validateSnapshot(value));
  }
});

test('large source families do not overlap and positions remain stable between releases',()=>{
 const nodes=Array.from({length:40},(_,i)=>({id:`A${i}`,title:`A${i}`,domain:`Other${String(i).padStart(2,'0')}`,depth:0}));
 nodes.push({id:'digit',title:'Digit',domain:'Digit',depth:0});
 const scene=dependencyScene({nodes,dependency_edges:[]},null,nodes);
 for (let i=1;i<scene.lanes.length;i++)assert.ok(scene.lanes[i].y>scene.lanes[i-1].bottom);
 const before=dependencyScene({nodes:nodes.slice(5),dependency_edges:[]},null,nodes);
 for(const group of before.nodes){const after=scene.nodes.find(n=>n.id===group.id);assert.equal(group.x,after.x);assert.equal(group.y,after.y);}
});
