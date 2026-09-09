import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseLocale, languageURL, localizeData, t } from '../../site/assets/i18n.mjs';
const root = 'https://the-omega-institute.github.io/trureturing-pages/';
test('English is the default; explicit supported locale overrides storage', () => {
  assert.equal(chooseLocale(root), 'en');
  assert.equal(chooseLocale(root, 'zh-CN'), 'zh-CN');
  assert.equal(chooseLocale(root + '?lang=en', 'zh-CN'), 'en');
  assert.equal(chooseLocale(root + '?lang=unknown', 'unknown'), 'en');
});
test('language navigation retains graph, release, search and hash coordinates', () => {
  const u = new URL(languageURL(root + 'millennium.html?problem=rh&node=A045&family=F08&view=map&specs=1&q=5040#details', 'zh-CN', root));
  assert.equal(u.searchParams.get('node'), 'A045');
  assert.equal(u.searchParams.get('q'), '5040');
  assert.equal(u.searchParams.get('lang'), 'zh-CN');
  assert.equal(u.hash, '#details');
  assert.equal(new URL(languageURL(root + 'knowledge/node/abc/?snapshot=sha256:123#proof', 'zh-CN', root)).searchParams.get('snapshot'), 'sha256:123');
});
test('external sources, neighbouring projects, APIs and evidence downloads are untouched', () => {
  for (const href of ['https://github.com/the-omega-institute/trureturing', 'https://the-omega-institute.github.io/trureturing-mdbook/open-problems.html', root+'api/v1/', root+'assets/millennium-data.json', root+'proofs/result.lean', root+'assets/example.html']) assert.equal(languageURL(href, 'zh-CN', root), href);
});
test('English fallback and substitutions are literal text, including user-controlled values', () => {
  assert.equal(t('Unknown authored text'), 'Unknown authored text');
  assert.equal(t('Count {0}; query {1}', 0, '$& <script>'), 'Count 0; query $& <script>');
  const value = {id:'rh', state:'open', title:'Riemann Hypothesis', sources:['atlas'], source:{commit:'a'.repeat(40)}};
  assert.deepEqual(localizeData(value), value);
});
test('all canonical Millennium data is English, with Chinese localized display data', () => {
  const data = JSON.parse(readFileSync(new URL('../../site/assets/millennium-data.json', import.meta.url)));
  const zh = JSON.parse(readFileSync(new URL('../../site/assets/locales/zh-CN.json', import.meta.url)));
  assert.doesNotMatch(JSON.stringify(data), /\p{Script=Han}/u);
  for (const p of data.problems) {
    for (const row of p.catalogue) assert.ok(zh[row[1]], `Missing formulation translation ${row[0]}: ${row[1]}`);
    for (const n of p.nodes) assert.ok(zh[n.summary], `Missing node translation ${p.id}:${n.id}`);
  }
  assert.equal(zh['All zeros of Ξ are real'], 'Ξ 的全部零点为实数');
  assert.equal(zh['ξ has no zeros in the right half-plane'], 'ξ 在右半平面无零点');
});
