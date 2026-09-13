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
 const now=Date.parse('2026-09-13T04:00:00Z');const value={observation:{state:'fresh'},observed_at:'2026-09-13T03:30:00Z',head:{current_truth_release_digest:'a',behind:0},halt:null};
 assert.equal(statusCaption(value,'a',now),'Publication synchronized');
 assert.equal(statusCaption(value,'b',now),'Status refers to another release');
 assert.equal(statusCaption({...value,observed_at:'2026-09-12T03:30:00Z'},'a',now),'Last recorded publication status');
 assert.equal(statusCaption({...value,observation:{state:'unavailable'}},'a',now),'Publication status unavailable');
 assert.equal(statusCaption({...value,halt:{reason:'blocked'}},'a',now),'Publication needs attention');
});
