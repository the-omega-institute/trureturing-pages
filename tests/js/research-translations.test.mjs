import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {canonical,FIELDS,validateEntry} from '../../site/assets/research-translations.mjs';

function entry() {
  const key='sha256:'+'a'.repeat(64);
  const fields=Object.fromEntries(FIELDS.map(k=>[k,'']));fields.finding='对每个 n > 5040，该界成立。';
  const segments=Object.fromEntries(FIELDS.map(k=>[k,[]]));
  segments.finding=[{kind:'text',text:'对每个 '},{kind:'math',text:'n>5040'},{kind:'text',text:'，该界成立。'}];
  const content_digest='sha256:'+createHash('sha256').update(canonical({fields,segments})).digest('hex');
  return [key,{source_digest:key,fields,segments,content_digest,review:{source_digest:key,content_digest,
    passed:true,issues:[],model:'test-reviewer',response_digest:'sha256:'+'b'.repeat(64)}}];
}
test('a reviewed translation must match the displayed source and exact rendered content',async()=>{
  const [key,value]=entry();assert.equal(await validateEntry(key,value,webcrypto),true);
  assert.equal(await validateEntry('sha256:'+'c'.repeat(64),value,webcrypto),false);
  value.segments.finding[1].text='n>1';assert.equal(await validateEntry(key,value,webcrypto),false);
});
test('unreviewed text and HTML payloads are rejected',async()=>{
  const [key,value]=entry();value.review.passed=false;
  assert.equal(await validateEntry(key,value,webcrypto),false);
  value.review.passed=true;value.segments.finding.push({kind:'html',text:'<script>bad()</script>'});
  assert.equal(await validateEntry(key,value,webcrypto),false);
  assert.equal(await validateEntry(key,undefined,webcrypto),false);
});
