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

import {growthHistory, growthFrame} from '../../site/assets/evolution-growth.mjs';
const growNode=(id,domain)=>({id,title:id,domain,reach:0});
const growSnapshot=(nodes,dependency_edges=[])=>({nodes,dependency_edges});

test('growth fixes birth coordinates, retains parallel branches, and hides future additions',()=>{
  const a=growNode('a','Digit'),b=growNode('b','Fourier'),c=growNode('c','Quantum');
  const history=growthHistory([growSnapshot([a]),growSnapshot([a,b]),growSnapshot([a,b,c])]);
  assert.equal(history.cohorts.length,3);
  assert.deepEqual(growthFrame(history,0).nodes.map(n=>n.nodes[0].id),['a']);
  const later=growthFrame(history,2);
  assert.equal(later.nodes.find(n=>n.nodes[0].id==='b').born,1);
  assert.deepEqual([...later.nodes.find(n=>n.nodes[0].id==='a').presence.keys()],[0,1,2]);
  assert.equal(later.nodes[0].baseline,true);
  assert.equal(later.nodes[1].baseline,false);
});

test('growth includes simultaneous cross-branch births and later dependencies into existing branches',()=>{
  const a=growNode('a','Digit'),b=growNode('b','Fourier'),c=growNode('c','Quantum');
  const history=growthHistory([growSnapshot([a]),growSnapshot([a,b,c],[['b','c']]),growSnapshot([a,b,c],[['b','c'],['a','b']])]);
  assert.deepEqual(growthFrame(history,1).edges.map(e=>e.pairs),[[['b','c']]]);
  const frame=growthFrame(history,2),edge=frame.edges.find(e=>e.pairs[0][0]==='a');
  assert.equal(edge.first,2);
  assert.equal(frame.nodes.find(n=>n.id===edge.target).born,1);
  assert.equal(frame.nodes.find(n=>n.id===edge.source).born,0);
});

test('growth preserves gaps without duplicating identities or claiming new imports after missing archives',()=>{
  const a=growNode('a','Digit'),b=growNode('b','Fourier');
  const history=growthHistory([growSnapshot([a,b],[['a','b']]),growSnapshot([a]),{nodes:[a,b]},growSnapshot([a,b],[['a','b']])]);
  assert.equal(history.cohorts.length,2);
  const absent=growthFrame(history,1).nodes.find(n=>n.nodes[0].id==='b');
  assert.equal(absent.active,0);assert.equal(absent.last,0);
  const returned=growthFrame(history,3).nodes.find(n=>n.nodes[0].id==='b');
  assert.equal(returned.born,0);assert.equal(returned.active,1);
  assert.deepEqual([...returned.presence.keys()],[0,2,3]);
  assert.equal(history.edges.length,1);
  assert.deepEqual(history.edges[0].observations,[0,3]);
  const unknown=growthHistory([{nodes:[a,b]},growSnapshot([a,b],[['a','b']])]);
  assert.equal(unknown.edges[0].baseline,true);
});

test('growth starts a fresh baseline at analysis boundaries, without invented continuity',()=>{
  const a=growNode('a','Digit'),b=growNode('b','Fourier');
  const first=growSnapshot([a,b],[['a','b']]);
  const second={...first,topology_algorithm:'changed'};
  const history=growthHistory([first,second]);
  assert.deepEqual(history.boundaries,[1]);
  assert.equal(history.cohorts.length,4);
  assert.ok(history.cohorts.every(n=>n.baseline));
  for(const edge of history.edges) {
    const source=history.cohorts.find(n=>n.id===edge.source),target=history.cohorts.find(n=>n.id===edge.target);
    assert.equal(source.segment,target.segment);
    assert.equal(source.segment,edge.segment);
  }
});

test('bundles preserve original module pairs and distinguish inactive connections',()=>{
  const a=growNode('a','Digit'),b=growNode('b','Digit'),c=growNode('c','Fourier');
  const history=growthHistory([growSnapshot([a,b]),growSnapshot([a,b,c],[['a','c'],['b','c']]),growSnapshot([a,b,c],[['a','c']])]);
  const [edge]=growthFrame(history,2).edges;
  assert.deepEqual(edge.pairs,[['a','c'],['b','c']]);assert.equal(edge.active,1);
  assert.equal(growthFrame(history,0).edges.length,0);
});

import {subjectFor} from '../../site/assets/mathematical-subjects.mjs';
import {subjectFrame} from '../../site/assets/evolution-growth.mjs';

test('mathematical subjects distinguish actual content from source-folder names and tooling',()=>{
  assert.equal(subjectFor({domain:'Naming',id:'Naming/CompletionEmbeddingDense',title:'Density of the Canonical Completion Map'}).id,'geometry');
  assert.equal(subjectFor({domain:'Naming',title:'Independent Kill Rate'}).id,'probability');
  assert.equal(subjectFor({domain:'Rewriting',title:'Church-Rosser Equivalence'}).id,'logic');
  assert.equal(subjectFor({domain:'Rewriting',title:'Subobject Classifier Coordinates'}).id,'algebra');
  assert.equal(subjectFor({domain:'ToolchainUpgrade',title:'Toolchain Upgrade'}).id,'infrastructure');
  assert.equal(subjectFor({domain:'FutureUnknownMath',title:'Something New'}).id,'unclassified');
});

test('subject overview combines related sources, retains cross-field evidence and expands on demand',()=>{
  const a=growNode('a','Arith'),b=growNode('b','Digit'),c=growNode('c','Fourier'),tool=growNode('tool','RequiredChecks');
  const history=growthHistory([growSnapshot([a]),growSnapshot([a,b,c,tool],[['a','b'],['b','c']])]);
  const frame=subjectFrame(history,1);
  assert.deepEqual(frame.lanes.map(l=>l.domain),['number-theory','analysis']);
  assert.equal(frame.nodes.flatMap(n=>n.nodes).length,3);
  assert.deepEqual(frame.edges.flatMap(e=>e.pairs),[['a','b'],['b','c']]);
  const expanded=subjectFrame(history,1,{expanded:'number-theory'});
  assert.deepEqual(expanded.lanes.map(l=>l.domain),['number-theory/Arith','number-theory/Digit','analysis']);
  assert.deepEqual(expanded.edges.flatMap(e=>e.pairs),frame.edges.flatMap(e=>e.pairs));
  const all=subjectFrame(history,1,{auxiliary:true});
  assert.equal(all.nodes.flatMap(n=>n.nodes).length,4);
  assert.ok(all.lanes.some(l=>l.subject.id==='infrastructure'));
  assert.equal(subjectFrame(history,0).nodes.flatMap(n=>n.nodes).length,1);
});

test('subject grouping retains first-appearance timing, presence gaps, and distinct mathematical content in one folder',()=>{
  const geometry={...growNode('Naming/CompletionEmbeddingDense','Naming'),title:'Density of the Canonical Completion Map'};
  const probability={...growNode('Naming/KillRate','Naming'),title:'Independent Kill Rate'};
  const history=growthHistory([growSnapshot([geometry,probability]),growSnapshot([geometry]),growSnapshot([geometry,probability])]);
  assert.equal(history.cohorts.length,2);
  const frame=subjectFrame(history,2),node=frame.nodes.find(n=>n.subject.id==='probability');
  assert.equal(node.born,0);assert.deepEqual([...node.presence.keys()],[0,2]);
  assert.equal(subjectFrame(history,1).nodes.find(n=>n.subject.id==='probability').active,0);
});
