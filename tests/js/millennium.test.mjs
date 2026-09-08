import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflate, validate, topological, closure, commonInputs, reuse, layout, expandFamily,
  readRoute, routeURL, counts, sourceURL, safeURL, validateNotebook } from '../../site/assets/millennium-core.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../site/assets/millennium-data.json',import.meta.url),'utf8'));
const seed = () => inflate(structuredClone(raw));
const broken = mutate => { const d=structuredClone(raw); mutate(d); return () => inflate(d); };

test('seven independently routed problems, exact 93-ID / 21-family RH catalogue',()=>{
 const d=seed(),rh=d.problems[0];
 assert.equal(d.problems.length,7);assert.equal(new Set(d.problems.map(p=>p.id)).size,7);
 assert.deepEqual(rh.formulations.map(f=>f.id),Array.from({length:93},(_,i)=>`A${String(i+1).padStart(3,'0')}`));
 assert.equal(rh.families.length,21);assert.equal(rh.gaps.length,10);
 assert.equal(rh.formulations.find(f=>f.id==='A080').state,'preprint');
 assert.equal(rh.formulations.find(f=>f.id==='A010').forward,'candidate');
 assert.equal(rh.formulations.find(f=>f.id==='A045').reverse,'unassessed');
});
test('Poincare scientific solution never certifies this repository',()=>{
 const p=seed().problems.find(p=>p.id==='poincare');assert.equal(p.scientific_state,'solved');
 assert.equal(p.coverage,'starter');assert(p.nodes.every(n=>n.state==='unassessed'));assert.equal(p.formulations.length,0);
});
test('all data graphs and every expanded family are DAGs',()=>{
 const d=seed();for(const p of d.problems)assert.equal(topological(p).length,p.nodes.length);
 for(const f of d.problems[0].families){const g=expandFamily(d.problems[0],f.id);assert.equal(topological(g).length,g.nodes.length);}
});
test('93 catalogue locations point to the same exact theory commit',()=>{
 const d=seed();assert.equal(d.sources.atlas.commit,'915a86bf19ec91fdbd690a70e75c84014d237b7d');
 assert(d.problems[0].formulations.every(f=>f.line>7296&&f.line<=8296&&f.source==='atlas'));
});
test('source references are immutable and no completion is propagated',()=>{
 const d=seed(),p=d.problems[0],before=JSON.stringify(p);
 closure(p,['rh']); reuse(p); layout(p); commonInputs(p,'F02','F04');
 assert.equal(JSON.stringify(p),before);assert.equal(p.nodes.find(n=>n.id==='rh').state,'open');
 for(const s of Object.values(d.sources).filter(s=>s.kind==='repo'))assert.match(sourceURL(s),/\/blob\/[a-f0-9]{40}\//);
});
test('finite closure is extensive, monotone, idempotent and reaches a structural fixed point',()=>{
 const p=seed().problems[0],a=closure(p,['F02']),b=closure(p,['F02','F04']);
 assert(a.ids.has('F02'));assert([...a.ids].every(id=>b.ids.has(id)));
 assert.deepEqual([...closure(p,[...a.ids]).ids].sort(),[...a.ids].sort());assert(a.fixed);
 assert(a.rounds.length<=p.nodes.length);assert(!a.ids.has('rh'));
});
test('common prerequisites are symmetric and retain actual shared source IDs',()=>{
 const p=seed().problems[0];assert.deepEqual([...commonInputs(p,'F02','F04')].sort(),[...commonInputs(p,'F04','F02')].sort());
 assert(commonInputs(p,'F02','F04').has('zeros'));
 assert(!commonInputs(p,'F02','F04').has('5040'));
});
test('reuse counts distinct curated families and explicitly includes planned edges',()=>{
 const p=seed().problems[0],r=reuse(p);
 assert.equal(r.find(x=>x.node.id==='xi').families.length,12);
 assert.equal(r.find(x=>x.node.id==='5040').families.length,1);
 assert(r.every(x=>new Set(x.families).size===x.families.length));
});
test('finite Robin checker cannot skip the universal gap',()=>{
 const p=seed().problems[0],r=closure(p,['5040'],'children');assert(r.ids.has('robin-universal'));
 assert(!p.edges.some(e=>e.from==='5040'&&e.to==='rh'));
 assert.equal(p.nodes.find(n=>n.id==='robin-universal').state,'open');
});
test('family expansion adds separate specification nodes without proof edges or cycles',()=>{
 const p=seed().problems[0],g=expandFamily(p,'F08');
 assert(g.nodes.some(n=>n.id==='A045'));assert(g.edges.some(e=>e.from==='F08'&&e.to==='A045'&&e.kind==='structure'));
 assert(!g.edges.some(e=>e.from==='F08'&&e.to==='rh'));assert.equal(counts(p).specifications,93);
 assert(!p.nodes.some(n=>n.id==='A045'));
});
test('layout is deterministic and edges always point forward',()=>{
 const p=seed().problems[0],a=layout(p),b=layout(p);
 assert.deepEqual([...a.positions],[...b.positions]);for(const e of p.edges)assert(a.positions.get(e.from).x<a.positions.get(e.to).x);
});
test('all seven routes round-trip; bad route values fail closed',()=>{
 const d=seed();for(const p of d.problems)assert.equal(readRoute(`https://example.com/millennium.html?problem=${p.id}`,d).problem,p.id);
 const bad=readRoute('https://example.com/millennium.html?problem=unknown&view=eval&node=__proto__',d);
 assert.equal(bad.problem,'rh');assert.equal(bad.view,'map');assert.equal(bad.node,'rh');
});
test('individual specification permalinks restore its correct graph family',()=>{
 const r=readRoute('https://example.com/millennium.html?node=A045&family=F02',seed());assert.equal(r.family,'F08');assert.equal(r.specs,true);
 assert.equal(routeURL('https://example.com/sub/millennium.html?problem=rh&q=old',{q:'',node:'5040'}),'https://example.com/sub/millennium.html?problem=rh&node=5040');
});
test('reject duplicate IDs, dangling references and cycles',()=>{
 assert.throws(broken(d=>d.problems[0].nodes.push(d.problems[0].nodes[0])),/Duplicate/);
 assert.throws(broken(d=>d.problems[0].edges[0].to='missing'),/Dangling/);
 assert.throws(broken(d=>d.problems[0].edges.push({from:'rh',to:'xi',kind:'support',reason:'cycle',sources:['atlas']})),/Cycle/);
});
test('reject missing sources, floating source refs, malformed family and catalogue',()=>{
 assert.throws(broken(d=>d.sources.xi.commit='dev'),/Unpinned/);
 assert.throws(broken(d=>d.problems[0].nodes[0].sources=[]),/Missing source/);
 assert.throws(broken(d=>d.problems[0].catalogue[0][2]='F99'),/Invalid formulation/);
 assert.throws(broken(d=>d.problems[0].catalogue.push(d.problems[0].catalogue[0])),/Duplicate/);
 assert.throws(broken(d=>d.problems[0].directions.A999=['candidate','candidate']),/Unknown progress/);
});
test('manual status flags cannot manufacture a kernel-verified record',()=>{
 assert.throws(broken(d=>d.problems[0].nodes[0].state='verified'),/Bad node/);
 assert.throws(broken(d=>d.problems[0].directions.A045=['verified','verified']),/Missing direction/);
 assert.throws(broken(d=>d.problems[0].directions.A045=['identity','identity']),/Only the RH root/);
});
test('unsafe source URLs and path traversal are rejected',()=>{
 for(const s of ['javascript:alert(1)','http://example.com','data:text/html,x','https://user:pass@example.com'])assert.equal(safeURL(s),null);
 assert.throws(broken(d=>d.sources.xi.path='../escape'),/Bad path/);
 assert.throws(broken(d=>d.sources['clay-rh'].url='javascript:alert(1)'),/Unsafe/);
});
test('notebook validation is separate from graph truth, supports specification notes',()=>{
 const d=seed(),n={schema:'pages-millennium-notebook.v1',revision:d.revision,entries:{'rh:A045':{starred:true,note:'T and stability need a definition'}}};
 assert.equal(validateNotebook(n,d),n);assert.equal(d.problems[0].nodes[0].state,'open');
 assert.throws(()=>validateNotebook({...n,entries:{'rh:missing':{starred:true,note:'x'}}},d),/Invalid/);
 assert.throws(()=>validateNotebook({...n,entries:{'rh:rh':{starred:true,note:'x'.repeat(5001)}}},d),/Invalid/);
});
test('one disconnected node cannot silently enter the map',()=>{
 assert.throws(broken(d=>d.problems[0].nodes.push({id:'orphan',title:'orphan',kind:'object',state:'open',summary:'none',sources:['atlas']})),/Disconnected/);
});
