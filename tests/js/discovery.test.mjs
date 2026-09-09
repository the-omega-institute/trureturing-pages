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
