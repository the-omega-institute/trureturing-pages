import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeArchitecture} from '../../site/assets/architecture-core.mjs';
import {projectSpace, validateCatalog, loadCatalog, readRoute, routeSearch, safeLink} from '../../site/assets/knowledge-spaces-core.mjs';

const R='sha256:'+'1'.repeat(64), G='sha256:'+'2'.repeat(64), C='a'.repeat(40);
const A='a'.repeat(64), B='b'.repeat(64), E='e'.repeat(64);
function fixture() {
 const graph={source_snapshot:{source_commit:C,truth_release_digest:R},nodes:['root','b','c','d','e'].map(id=>({id,kind:'truth',domain:'Example'})),
  edges:[['root','b'],['root','c'],['b','d'],['c','d'],['b','e']].map(([source,target])=>({source,target,layer:'module-import'}))};
 const spaces=[{id:A,kind:'domain',title:'A',key:'A',member_ids:['d'],problem_slugs:[],references:[]},
   {id:B,kind:'source',title:'B',key:'B',member_ids:['e'],problem_slugs:[],references:[]},
   {id:E,kind:'target',title:'Empty',key:'empty',member_ids:[],problem_slugs:[],references:[]}];
 const catalog={schema_version:'pages-knowledge-spaces.v1',profile:'knowledge-spaces-v1',truth_release_digest:R,atlas_graph_digest:G,source_commit:C,
   records:graph.nodes.map(n=>({...n,title:n.id})),targets:[],spaces};
 const manifest={schema_version:'pages-knowledge-spaces-manifest.v1',profile:catalog.profile,truth_release_digest:R,atlas_graph_digest:G,source_commit:C};
 return {graph,catalog,manifest,architecture:analyzeArchitecture(graph)};
}

test('valid complete catalog joins the exact graph',()=>{const f=fixture();assert.equal(validateCatalog(f.catalog,f.manifest,f.manifest,f.graph),f.catalog);});
test('diamond dependencies do not double-count a selected consumer',()=>{const f=fixture();const p=projectSpace(f.catalog,f.architecture,A);assert.equal(p.ranking.find(r=>r.id==='root').support,1);});
test('shared foundations exclude target membership',()=>{const f=fixture();const p=projectSpace(f.catalog,f.architecture,A,B);assert.deepEqual([...p.shared].sort(),['b','root']);assert.equal(p.forward.length,0);});
test('member overlap is separate from directional reuse',()=>{const f=fixture();f.catalog.spaces[0].member_ids=['b','d'];f.catalog.spaces[1].member_ids=['d','e'];const p=projectSpace(f.catalog,f.architecture,A,B);assert.deepEqual([...p.overlap],['d']);assert.deepEqual(p.forward,[['b','e']]);});
test('all and empty scopes remain meaningful',()=>{const f=fixture();assert.equal(projectSpace(f.catalog,f.architecture).visible.size,5);assert.equal(projectSpace(f.catalog,f.architecture,E).visible.size,0);});
test('context toggle affects display, not memberships or support',()=>{const f=fixture();const a=projectSpace(f.catalog,f.architecture,A,B,true),b=projectSpace(f.catalog,f.architecture,A,B,false);assert.equal(b.visible.size,2);assert.deepEqual(a.ranking,b.ranking);});
test('unknown space fails without falling back to another scope',()=>{const f=fixture();assert.throws(()=>projectSpace(f.catalog,f.architecture,'f'.repeat(64)),/absent/);});
test('proposed and affinity edges never enter dependencies',()=>{const f=fixture();f.graph.edges.push({source:'d',target:'e',layer:'affinity'},{source:'e',target:'d',layer:'module-import',status:'proposed'});const p=projectSpace(f.catalog,analyzeArchitecture(f.graph),A,B);assert.equal(p.forward.length+p.reverse.length,0);});
test('existing architecture rejects a cycle',()=>{const f=fixture();f.graph.edges.push({source:'d',target:'root',layer:'module-import'});assert.throws(()=>analyzeArchitecture(f.graph),/acyclic/);});
test('same-release wrong-Atlas binding fails',()=>{const f=fixture();f.catalog.atlas_graph_digest='sha256:'+'3'.repeat(64);assert.throws(()=>validateCatalog(f.catalog,f.manifest,f.manifest,f.graph));});
test('same-Atlas wrong-source binding fails',()=>{const f=fixture();f.catalog.source_commit='b'.repeat(40);assert.throws(()=>validateCatalog(f.catalog,f.manifest,f.manifest,f.graph));});
test('dangling and duplicated members fail',()=>{for(const ids of [['absent'],['d','d']]) {const f=fixture();f.catalog.spaces[0].member_ids=ids;assert.throws(()=>validateCatalog(f.catalog,f.manifest,f.manifest,f.graph));}});
test('ungated result cannot be rendered as proved',()=>{const f=fixture();f.catalog.targets=[{slug:'question',result:'proved'}];assert.throws(()=>validateCatalog(f.catalog,f.manifest,f.manifest,f.graph),/gate/);});
test('missing records fail the complete join',()=>{const f=fixture();f.catalog.records.pop();assert.throws(()=>validateCatalog(f.catalog,f.manifest,f.manifest,f.graph),/Incomplete/);});
test('route state round-trips and rejects hostile space ids',()=>{const r={left:A,right:B,node:'D5/A.foo',context:false};assert.deepEqual(readRoute(routeSearch(r)),r);assert.throws(()=>readRoute('?space=../../x'));});
test('source links reject script schemes and credentials',()=>{for(const u of ['javascript:alert(1)','data:text/html,x','https://x:y@example.org','https://example.org/\nx'])assert.equal(safeLink(u),null);assert.equal(safeLink('https://example.org/p'),'https://example.org/p');});
test('catalog bytes are verified before joining',async()=>{const f=fixture();const bytes=new TextEncoder().encode(JSON.stringify(f.catalog));const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');const m={...f.manifest,catalog_sha256:'sha256:'+hash,catalog_path:`data/spaces/${hash}.json`};const fetcher=async url=>String(url).includes('knowledge-spaces.v1.json')?new Response(JSON.stringify(m)):new Response(bytes);assert.equal((await loadCatalog('https://example.org/',{manifest:f.manifest,graph:f.graph},fetcher)).spaces.length,3);});
test('tampered bytes and untrusted catalog path fail',async()=>{const f=fixture();let m={...f.manifest,catalog_sha256:G,catalog_path:`data/spaces/${G.slice(7)}.json`};let fetcher=async url=>String(url).includes('knowledge-spaces.v1.json')?new Response(JSON.stringify(m)):new Response('{}');await assert.rejects(loadCatalog('https://example.org/',{manifest:f.manifest,graph:f.graph},fetcher),/digest/);m.catalog_path='https://elsewhere.example/payload';await assert.rejects(loadCatalog('https://example.org/',{manifest:f.manifest,graph:f.graph},fetcher),/address/);});
test('no catalog is reported as unavailable',async()=>{await assert.rejects(loadCatalog('https://example.org/',{},async()=>new Response('',{status:404})),/unavailable/);});
