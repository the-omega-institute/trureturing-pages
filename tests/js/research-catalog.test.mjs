import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateVerifiedCatalog} from '../../site/assets/research-workbench-core.mjs';

const catalog = JSON.parse(await readFile(new URL('../../site/assets/research-catalog.json', import.meta.url)));

test('generated catalog presents only attested resolution rows', () => {
  assert.equal(validateVerifiedCatalog(catalog).length, 164);
  const unverified = structuredClone(catalog);
  delete unverified.families[0].kernel_verified;
  assert.throws(() => validateVerifiedCatalog(unverified), /Invalid verified resolution/);
});
