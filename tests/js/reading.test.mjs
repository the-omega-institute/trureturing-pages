import test from 'node:test';
import assert from 'node:assert/strict';
import {questionDestination,matchesQuery,hashTarget} from '../../site/assets/reading-core.mjs';
import {compareContent,moduleTitle} from '../../site/assets/evolution-reader-core.mjs';
const base='https://example.org/trureturing-pages/conjectures.html?lang=en';
test('legacy question routes go directly to Conjectures and retain language',()=>{
 assert.equal(questionDestination('research.html?lang=en#rp=alpha',base),'https://example.org/trureturing-pages/conjectures.html?lang=en#rp=alpha');
});
test('result and external links are left alone',()=>{
 assert.equal(questionDestination('research.html#resolved-alpha',base),'https://example.org/trureturing-pages/research.html#resolved-alpha');
 assert.equal(questionDestination('https://external.org/research.html#rp=x',base),'https://external.org/research.html#rp=x');
});
test('search is token-based and case-insensitive',()=>{assert.ok(matchesQuery('OEIS Sequence recurrence','oeis recurrence'));assert.ok(!matchesQuery('Erdos','oeis'));});
test('question hash resolves to the actual notebook card',()=>{assert.equal(hashTarget('#rp=alpha'),'question-alpha');assert.equal(hashTarget('#results-oeis'),'results-oeis');assert.equal(hashTarget('#%ZZ'),'');});
const verification={frozen_node_id:'sha256:verified',freeze_status:'frozen'};
const snap=(release,nodes,problems=[])=>({truth_release_digest:release,graph:{source_snapshot:{source_commit:'a'.repeat(40)},nodes:nodes.map(n=>({kind:'truth',...n}))},problems});
test('the first snapshot is a baseline, not invented growth',()=>{const c=compareContent(null,snap('r1',[{id:'a'}]));assert.equal(c.added.length,0);assert.equal(c.existing.length,1);assert.ok(c.baseline);});
test('added, changed and removed records have distinct meanings',()=>{
 const a=snap('r1',[{id:'a',human_title:'First'},{id:'b'}]);const b=snap('r2',[{id:'a',human_title:'Better description'},{id:'c'}]);
 const c=compareContent(a,b);assert.equal(c.added[0].id,'c');assert.equal(c.removed[0].id,'b');assert.equal(c.changed[0].id,'a');assert.match(c.changed[0].event,/Explanation/);
});
test('layout-only data does not count as progress',()=>{assert.equal(compareContent(snap('r1',[{id:'a',x:1}]),snap('r2',[{id:'a',x:999}])).changed.length,0);});
test('an arbitrary folder label is not used as a concept title',()=>{assert.equal(moduleTitle({id:'D5/S3/Tower/CompletionLaw',repo_path:'D5/S3/Tower/CompletionLaw.lean',domain:'Tower'}),'Completion Law');});
test('removed records link to the earlier release',()=>{assert.equal(compareContent(snap('r1',[{id:'a'}]),snap('r2',[])).removed[0].release,'r1');});
test('duplicate identities and contradictory immutable releases fail',()=>{
 assert.throws(()=>compareContent(null,snap('r1',[{id:'a'},{id:'a'}])));
 assert.throws(()=>compareContent(snap('r1',[{id:'a'}]),snap('r1',[{id:'b'}])),/conflicting/);
});
test('question resolution changes are separate from module changes',()=>{
 const c=compareContent(snap('r1',[],[{slug:'q'}]),snap('r2',[],[{slug:'q',title:'Question',resolution:{kind:'refuted',kernel_verified:verification}}]));
 assert.equal(c.outcomes.length,1);assert.equal(c.added.length,0);assert.equal(c.outcomes[0].title,'Question');
});

test('saved question entrypoints reveal their new sections',()=>{
 assert.equal(hashTarget('#next-questions'),'next-questions');
 assert.equal(hashTarget('#research-release-dossiers'),'open-problems');
});
test('historical outcomes stay pinned to the source commit',async()=>{
 const {outcomeSourceURL}=await import('../../site/assets/evolution-reader-core.mjs');
 const record=compareContent(snap('r1',[]),snap('r2',[],[{slug:'alpha',title:'Question',resolution:{kind:'proved',kernel_verified:verification}}])).outcomes[0];
 assert.equal(outcomeSourceURL(record),`https://github.com/the-omega-institute/trureturing/blob/${'a'.repeat(40)}/Problems/alpha.md`);
 assert.throws(()=>outcomeSourceURL({...record,source_commit:'dev'}));
 assert.throws(()=>outcomeSourceURL({...record,id:'../bad'}));
});

test('renewed verification receipts are not new mathematical results',()=>{
 const problem={slug:'q',title:'A question',sections:{Problem:'For every positive n.'},resolution:{kind:'proved',declaration_gid:'Module.result',kernel_verified:verification}};
 const renewed={...problem,resolution:{...problem.resolution,source_commit:'b'.repeat(40),kernel_verified:{...verification,frozen_node_id:'sha256:renewed'}}};
 assert.equal(compareContent(snap('r1',[],[problem]),snap('r2',[],[renewed])).outcomes.length,0);
});
test('unverified source assertions are not counted as new results',()=>{
 const problem={slug:'q',title:'Question',resolution:{kind:'proved'}};
 assert.equal(compareContent(snap('r1',[]),snap('r2',[],[problem])).outcomes.length,0);
});
test('changed scope, changed conclusion and lost verification retain their meaning',()=>{
 const problem={slug:'q',title:'Question',sections:{Problem:'All positive n.'},resolution:{kind:'proved',kernel_verified:verification}};
 const scope={...problem,sections:{Problem:'Only even n.'}};
 let event=compareContent(snap('r1',[],[problem]),snap('r2',[],[scope])).outcomes[0];
 assert.equal(event.change,'updated');assert.equal(event.previous_scope,'All positive n.');assert.equal(event.scope,'Only even n.');
 const refuted={...problem,resolution:{kind:'refuted',kernel_verified:verification}};
 event=compareContent(snap('r1',[],[problem]),snap('r2',[],[refuted])).outcomes[0];
 assert.equal(event.previous_kind,'proved');assert.equal(event.kind,'refuted');
 event=compareContent(snap('r1',[],[problem]),snap('r2',[])).outcomes[0];
 assert.equal(event.change,'removed');assert.equal(event.release,'r1');assert.equal(event.kind,null);
});
test('module edits retain the before record for a readable comparison',()=>{
 const c=compareContent(snap('r1',[{id:'a',human_abstract:'Previous explanation.',source_blob:'old'}]),
   snap('r2',[{id:'a',human_abstract:'New explanation.',source_blob:'new'}]));
 assert.equal(c.changed[0].previous.human_abstract,'Previous explanation.');
 assert.equal(c.changed[0].previous.release,'r1');
 assert.deepEqual(c.changed[0].fields,['human_abstract','source_blob']);
});
test('counters distinguish newly recorded results from corrections',async()=>{
 const {contentCounts}=await import('../../site/assets/evolution-reader-core.mjs');
 const p={slug:'old',title:'Existing result',resolution:{kind:'proved',kernel_verified:verification}};
 const changed={...p,resolution:{kind:'refuted',kernel_verified:verification}};
 const fresh={...p,slug:'new'};
 const c=compareContent(snap('r1',[],[p]),snap('r2',[],[changed,fresh]));
 assert.deepEqual(contentCounts(c),{outcomes:1,added:0,changed:0,removed:0,outcomeUpdates:1});
});
