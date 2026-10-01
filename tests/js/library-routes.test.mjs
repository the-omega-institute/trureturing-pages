import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { archivedNodeURL, resolveArchivedNode } from '../../site/assets/library-routes.mjs';
import { nodeSlug } from '../../site/assets/library-core.mjs';

const release = 'sha256:' + 'a'.repeat(64), nextRelease = 'sha256:' + 'b'.repeat(64);
const digest = 'sha256:' + 'c'.repeat(64), nextDigest = 'sha256:' + 'd'.repeat(64);
const node = { id: 'A & B/核心', human_abstract: 'Original theorem' };
const library = {
  index: { entries: [{ digest, truth_release_digest: release }, { digest: nextDigest, truth_release_digest: nextRelease }] },
  async snapshot(index) { return { truth_release_digest: index ? nextRelease : release,
    graph: { nodes: [index ? { ...node, human_abstract: 'Revised theorem' } : node] } }; }
};

test('direct history links select the exact original release and preserve node identifiers', async () => {
  const url = new URL(archivedNodeURL(release, node.id), 'https://example.test/project/');
  assert.equal(url.pathname, '/project/library-version.html');
  const selected = await resolveArchivedNode(library, new URLSearchParams(url.hash.slice(1)));
  assert.equal(selected.node.human_abstract, 'Original theorem');
  assert.equal(selected.digest, digest);
});

test('existing snapshot links and legacy hashed bookmarks resolve the same verified record', async () => {
  for (const params of [{ snapshot: digest, node: node.id }, { release, slug: await nodeSlug(node.id) }]) {
    const selected = await resolveArchivedNode(library, new URLSearchParams(params));
    assert.equal(selected.node.id, node.id);
    assert.equal(selected.digest, digest);
  }
});

test('unknown or conflicting coordinates cannot silently select the current release', async () => {
  for (const params of [{}, { release: 'latest', node: node.id }, { release, snapshot: nextDigest, node: node.id },
    { release, node: 'absent' }, { release, slug: 'e'.repeat(64) }]) {
    await assert.rejects(resolveArchivedNode(library, new URLSearchParams(params)));
  }
  const corrupt = { ...library, async snapshot() { throw new Error('Library artifact digest mismatch.'); } };
  await assert.rejects(resolveArchivedNode(corrupt, new URLSearchParams({ release, node: node.id })), /digest mismatch/);
});

test('one fallback preserves legacy bookmarks without redirecting unrelated missing pages', async () => {
  const script = readFileSync(new URL('../../site/404.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const slug = await nodeSlug(node.id);
  for (const suffix of ['', '/', '/index.html']) {
    let target;
    runInNewContext(script, { URL, URLSearchParams, location: {
      origin: 'https://example.test', search: '?lang=zh-CN',
      pathname: `/project/release/${release.slice(7)}/node/${slug}${suffix}`,
      replace(value) { target = value; }
    } });
    assert.equal(target.pathname, '/project/library-version.html');
    assert.equal(target.search, '?lang=zh-CN');
    assert.equal((await resolveArchivedNode(library, new URLSearchParams(target.hash.slice(1)))).node.id, node.id);
  }
  runInNewContext(script, { URL, URLSearchParams, location: {
    pathname: '/project/missing.html', replace() { assert.fail('Unrelated 404 redirected'); }
  } });
  runInNewContext(script, { URL, URLSearchParams, location: {
    origin: 'https://example.test', search: '',
    pathname: `//other.test/release/${release.slice(7)}/node/${slug}/`,
    replace(target) { assert.equal(target.origin, 'https://example.test'); }
  } });
});
