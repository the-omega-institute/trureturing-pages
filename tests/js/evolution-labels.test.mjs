import test from 'node:test';
import assert from 'node:assert/strict';
import {annotateScene,groupHint,readableName,statusCaption} from '../../site/assets/evolution-labels.mjs';
const group={id:'g',title:'Tower',domain:'Tower',depth:3,x:12,y:24,color:'#abc',nodes:[{id:'a',title:'Observer transition',reach:4},{id:'b',title:'An iterated construction',reach:2}]};
test('annotation preserves coordinates, source identities, colors and edges',()=>{
 const scene={kind:'dependency',nodes:[group],edges:[{source:'g',target:'h'}]};const before=structuredClone(scene);
 const result=annotateScene(scene,{kind:'comparable',added:['a']},1);
 assert.deepEqual(scene,before);assert.equal(result.edges,scene.edges);
 assert.equal(result.nodes[0].x,12);assert.equal(result.nodes[0].y,24);assert.equal(result.nodes[0].color,'#abc');
 assert.equal(result.nodes[0].nodes,group.nodes);assert.equal(result.nodes[0].addedCount,1);
});
test('no growth is fabricated for a baseline or changed analysis',()=>{
 for(const kind of ['baseline','analysis-changed'])assert.equal(annotateScene({kind:'dependency',nodes:[group]},{kind,added:['a']},0).nodes[0].addedCount,0);
});
test('time highlights only the selected observation',()=>{
 const scene={kind:'time',nodes:[{...group,observation:0},{...group,observation:1}]};
 assert.deepEqual(annotateScene(scene,{kind:'comparable',added:['a']},1).nodes.map(n=>n.addedCount),[0,1]);
});
test('tooltip gives grouping meaning and actual example titles',()=>{
 const hint=groupHint(group);assert.match(hint,/2 modules/);assert.match(hint,/Dependency depth 3/);assert.match(hint,/Observer transition/);
 assert.equal(readableName('ObserverMemory'),'Observer Memory');
});
test('single-module points display the module title',()=>{
 const r=annotateScene({kind:'dependency',nodes:[{...group,nodes:[group.nodes[0]]}]},null,0);
 assert.equal(r.nodes[0].title,'Observer transition');
});
test('status cannot claim synchronization for an unavailable, stale or different release',()=>{
 const now=Date.parse('2026-09-13T04:00:00Z');const value={observation:{state:'fresh'},observed_at:'2026-09-13T03:30:00Z',head:{current_truth_release_digest:'a',upstream_latest_digest:'a',behind:0},halt:null};
 assert.equal(statusCaption(value,'a',now),'Publication synchronized');
 assert.equal(statusCaption(value,'b',now),'Status refers to another release');
 assert.equal(statusCaption({...value,observed_at:'2026-09-12T03:30:00Z'},'a',now),'Last recorded publication status');
 assert.equal(statusCaption({...value,observation:{state:'unavailable'}},'a',now),'Publication status unavailable');
 assert.equal(statusCaption({...value,halt:{reason:'blocked'}},'a',now),'Publication needs attention');
});

test('unknown upstream and pending work cannot claim synchronization',()=>{
 const now=Date.parse('2026-09-13T04:00:00Z');
 const v={observation:{state:'fresh'},observed_at:'2026-09-13T03:30:00Z',head:{current_truth_release_digest:'a',upstream_latest_digest:null,behind:null},halt:null};
 assert.equal(statusCaption(v,'a',now),'Publication progress unknown');
 assert.equal(statusCaption({...v,head:{...v.head,behind:0}},'a',now),'Publication progress unknown');
 assert.equal(statusCaption({...v,head:{...v.head,upstream_latest_digest:'b',behind:0}},'a',now),'Publication needs attention');
 assert.equal(statusCaption({...v,head:{...v.head,upstream_latest_digest:'a',behind:0},counts:{pending:1}},'a',now),'Publication needs attention');
});
test('group context separates prerequisites and consumers, deduplicating boundary modules',async()=>{
 const {groupContext,addedEdgeKeys}=await import('../../site/assets/evolution-labels.mjs');
 const snapshot={nodes:[...group.nodes.map(n=>({...n,domain:'Tower'})),{id:'p',domain:'Arithmetic'},{id:'q',domain:'Logic'}],dependency_edges:[['p','a'],['p','b'],['a','q'],['a','q'],['a','b']]};
 const context=groupContext(group,snapshot);
 assert.deepEqual(context.incoming,[{domain:'Arithmetic',ids:['p']}]);
 assert.deepEqual(context.outgoing,[{domain:'Logic',ids:['q']}]);
 assert.equal(context.examples[0].title,'Observer transition');
 assert.equal(addedEdgeKeys({kind:'baseline',edgesAdded:[['p','a']]}).size,0);
 assert.equal(addedEdgeKeys({kind:'analysis-changed',edgesAdded:[['p','a']]}).size,0);
 assert.ok(addedEdgeKeys({kind:'comparable',edgesAdded:[['p','a']]}).has('["p","a"]'));
});

import {releaseInsights} from '../../site/assets/evolution-labels.mjs';
test('growth separates additions, net reuse and newly connected domain pairs',()=>{
 const a={id:'a',title:'Foundation',domain:'Logic'},b={id:'b',title:'Old consumer',domain:'Logic'},c={id:'c',title:'New consumer',domain:'Arithmetic'},d={id:'d',title:'Another',domain:'Arithmetic'};
 const before={nodes:[a,b],dependency_edges:[['a','b']]};
 const after={nodes:[a,b,c,d],dependency_edges:[['a','b'],['a','c'],['a','c'],['c','d']]};
 const r=releaseInsights(before,after);
 assert.equal(r.areas[0].nodes.length,2);
 assert.deepEqual(r.reuse.map(n=>[n.id,n.before,n.after]),[['a',1,2]]);
 assert.deepEqual(r.bridges.map(n=>[n.from,n.to,n.pairs.length]),[['Logic','Arithmetic',1]]);
 assert.ok(r.changedIds.includes('a'));
 const next={...after,dependency_edges:[...after.dependency_edges,['a','d']]};
 assert.equal(releaseInsights(after,next).bridges.length,0);
});
test('missing edge archives, baseline and analysis changes never invent growing foundations',()=>{
 const node={id:'a',title:'A',domain:'Logic'};
 const before={nodes:[node]},after={nodes:[node,{id:'b',domain:'Logic'}],dependency_edges:[['a','b']]};
 assert.equal(releaseInsights(undefined,after).kind,'baseline');
 assert.equal(releaseInsights(before,after).edgesKnown,false);
 assert.equal(releaseInsights(before,after).reuse.length,0);
 assert.equal(releaseInsights(before,{...after,profile:'different'}).kind,'analysis-changed');
});
test('a replaced consumer without net growth is not called increased reuse',()=>{
 const nodes=['a','b','c'].map(id=>({id,domain:'Logic'}));
 assert.equal(releaseInsights({nodes,dependency_edges:[['a','b']]},{nodes,dependency_edges:[['a','c']]}).reuse.length,0);
});

test('content edits highlight only their observation and preserve the graph identities',()=>{
 const scene={kind:'time',nodes:[{...group,observation:0},{...group,observation:1}]};
 const r=annotateScene(scene,{kind:'comparable',added:['b']},1,new Set(['a']));
 assert.deepEqual(r.nodes.map(n=>n.updatedCount),[0,1]);
 assert.deepEqual(r.nodes[1].changedNodes.map(n=>n.id),['a','b']);
 assert.deepEqual(r.nodes.map(n=>[n.x,n.y]),[[12,24],[12,24]]);
});
