import {test} from 'node:test';
import assert from 'node:assert/strict';
import {search,connections} from '../../site/assets/discovery-core.mjs';
const index={records:[{id:'oeis:A010060',title:'Thue-Morse',identifiers:{oeis:'A010060'}},{id:'topic:logic',title:'Logic and algebra',aliases:['逻辑代数','equational logic']},{id:'result:r',title:'Odd recurrence'}],relations:[{source:'oeis:A010060',target:'result:r',kind:'studied_object'}]};
test('exact OEIS and URL lookups cannot match unrelated records',()=>{
  for(const q of ['A010060','a010060','OEIS:A010060','https://oeis.org/A010060'])assert.equal(search(index,q)[0].id,'oeis:A010060');
  assert.deepEqual(search(index,'A999999'),[]);
});
test('aliases find topics and typed relations retain direction',()=>{
  assert.equal(search(index,'逻辑代数')[0].id,'topic:logic');
  assert.equal(search(index,'equational logic')[0].id,'topic:logic');
  assert.equal(connections(index,'result:r')[0].neighbor.id,'oeis:A010060');
  assert.equal(connections(index,'result:r')[0].outgoing,false);
  assert.equal(connections(index,'result:r')[0].kind,'studied_object');
});

test('DOI and arXiv identities resolve exactly with source versions normalized',()=>{
 const papers={records:[{id:'p',identifiers:{doi:'10.1000/example'}},{id:'a',identifiers:{arxiv:'2509.16034'}}]};
 for(const q of ['10.1000/EXAMPLE','https://doi.org/10.1000/example','doi:10.1000/example'])assert.equal(search(papers,q)[0].id,'p');
 assert.equal(search(papers,'https://arxiv.org/html/2509.16034v1')[0].id,'a');
 assert.deepEqual(search(papers,'10.1000/absent'),[]);
});
import {neighborhood} from '../../site/assets/discovery-core.mjs';
test('bounded graph keeps seed, direction, complete list and shared-paper bridges',()=>{
 const data={records:Array.from({length:60},(_,n)=>({id:String(n)})),relations:Array.from({length:59},(_,n)=>({source:'0',target:String(n+1),kind:'cites'}))};
 const view=neighborhood(data,'0',12);
 assert.equal(view.records.length,12);assert.equal(view.omitted,48);
 assert.equal(connections(data,'0').length,59);
 assert.ok(view.relations.every(e=>e.source==='0'));
 const chain={records:[{id:'a'},{id:'paper'},{id:'b'}],relations:[{source:'a',target:'paper',kind:'question_source'},{source:'b',target:'paper',kind:'question_source'}]};
 assert.equal(neighborhood(chain,'a').records.length,3);
});
