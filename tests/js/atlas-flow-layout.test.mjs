import test from "node:test";
import assert from "node:assert/strict";
import { flowLayout, flowParents, flowLineages, readFlowLayout } from "../../site/assets/atlas-flow-layout.mjs";
import { reuseBands } from "../../site/assets/atlas-reuse.mjs";
import { analyzeArchitecture } from "../../site/assets/architecture-core.mjs";
import { importGeometry } from "../../site/assets/atlas-import-geometry.mjs";

test("reuse ranges adapt to the release, keep ties together and distinguish zero", () => {
  for (const values of [[], [0,0], [1], [5,5,5,5], [0,1,1,2,3,6,10,40,200,865]]) {
    const bands = reuseBands(new Map(values.map((reach, i) => [String(i),{reach}])));
    for (const value of values) assert.equal(bands.filter(b => value >= b.min && value <= b.max).length, 1);
    assert.equal(bands.at(-1).min, 0); assert.equal(bands.at(-1).max, 0);
    assert.ok(bands.every(b => b.max >= b.min));
    assert.ok(bands.filter(b => b.min > 0).every(b => values.some(v => v >= b.min && v <= b.max)));
    assert.ok(bands.every(b => b.max <= Math.max(0,...values)));
  }
});

test("import curves keep exact endpoints and directed progression, with distinct bounded geometry for cross connections", () => {
  for(const b of [{x:60,y:-40,z:15},{x:-400,y:-20,z:200},{x:0,y:-5,z:500}]) {
    const positions={a:{x:0,y:0,z:0},b},edge={source:'a',target:'b'};
    const primary=importGeometry(edge,positions,true),cross=importGeometry(edge,positions,false);
    for(const route of [primary,cross]) {
      assert.deepEqual(route.point(0),positions.a);assert.deepEqual(route.point(1),positions.b);
      let y=Infinity;
      for(let i=0;i<=100;i++){const p=route.point(i/100);assert.ok(p.y<=y);y=p.y;assert.ok(Object.values(p).every(Number.isFinite));}
      const mid=route.point(.5),chord={x:b.x/2,y:b.y/2,z:b.z/2};
      assert.ok(Math.hypot(mid.x-chord.x,mid.y-chord.y,mid.z-chord.z)>0);
    }
    assert.notDeepEqual(primary.point(.5),cross.point(.5));
  }
});

test("flow keeps joins, strict directed ranks and independent components without modifying source records", () => {
  const nodes = ['a','b','c','d','e','f','g','isolated'].map(id=>({id,kind:'truth'}));
  const edges = [['a','b'],['b','c'],['a','c'],['d','c'],['c','e'],['f','g']].map(([source,target])=>({source,target}));
  const before = JSON.stringify({nodes,edges});
  const architecture = analyzeArchitecture({nodes,edges});
  const theory = {nodes,edges,components:[
    {id:'a',ids:['a','b','c','d','e'],members:new Set(['a','b','c','d','e']),edgeCount:5},
    {id:'f',ids:['f','g'],members:new Set(['f','g']),edgeCount:1},
    {id:'isolated',ids:['isolated'],members:new Set(['isolated']),edgeCount:0},
  ]};
  const parents = flowParents(architecture);
  for(const group of flowLineages(theory,architecture).groups)
    assert.deepEqual(group.members,new Set([group.anchor,...architecture.descendants.get(group.anchor)]));
  assert.equal(parents.get('c'),'b','The nearest prerequisite forms the readable chain; the root shortcut is retained separately');
  const points = flowLayout(theory,architecture);
  assert.deepEqual(Object.keys(points).sort(),nodes.map(n=>n.id).sort());
  for(const edge of edges) assert.ok(points[edge.source].y > points[edge.target].y);
  assert.ok(Object.values(points).every(p=>Object.values(p).every(Number.isFinite)));
  assert.equal(new Set(Object.values(points).map(JSON.stringify)).size,nodes.length);
  assert.deepEqual(flowLayout(theory,architecture),points);
  assert.equal(JSON.stringify({nodes,edges}),before);
  const relabeled={...theory,nodes:nodes.map(n=>({...n,domain:'An unrelated editorial subject'}))};
  assert.deepEqual(flowLayout(relabeled,architecture),points);
  for(const [target,source] of parents) assert.ok(edges.some(e=>e.source===source&&e.target===target));
  const cached={schema_version:'pages-atlas-flow-preview.v1',atlas_graph_digest:'graph-a',nodes:Object.entries(points).map(([id,p])=>[id,p.x,p.y,p.z])};
  assert.deepEqual(readFlowLayout(cached,theory,'graph-a'),points);
  assert.throws(()=>readFlowLayout(cached,theory,'graph-b'),/publication/);
  assert.throws(()=>readFlowLayout({...cached,nodes:cached.nodes.slice(1)},theory,'graph-a'),/publication/);
  assert.throws(()=>readFlowLayout({...cached,nodes:cached.nodes.map(row=>row[0]==='e'?[row[0],row[1],100,row[3]]:row)},theory,'graph-a'),/directed depth/);
});
