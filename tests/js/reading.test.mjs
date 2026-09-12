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
 const c=compareContent(snap('r1',[],[{slug:'q'}]),snap('r2',[],[{slug:'q',title:'Question',resolution:{kind:'refuted'}}]));
 assert.equal(c.outcomes.length,1);assert.equal(c.added.length,0);assert.equal(c.outcomes[0].title,'Question');
});
