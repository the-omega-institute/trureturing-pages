import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStatus, renderStatus as render, validateStatus } from '../../site/assets/version-status-core.mjs';
const dictionary = JSON.parse(readFileSync(new URL('../../site/assets/locales/zh-CN.json', import.meta.url)));
const zh = (key, ...args) => (dictionary[key] || key).replace(/\{(\d+)\}/g, (match, index) => args[index] ?? match);
const renderStatus = (value, options) => render(value, { ...options, translate: zh });

const digest = c => `sha256:${c.repeat(64)}`;
function fixture() {
  return {
    schema_version: 'pages-version-status.v1', observed_at: '2026-09-13T03:00:00Z',
    publication: 'observed',
    observation: { state: 'fresh', checked_at: '2026-09-13T03:00:00Z', halt_stage: null, reason: null },
    counts: { published: 3, received: 2, verified: 2, generated: 2, deployed: 1, pending: 1, blocked: 0, quarantined: 2 },
    head: { current_truth_release_digest: digest('a'), upstream_latest_digest: digest('c'), behind: 2 },
    upstream: { latest_published_at: '2026-09-13T01:00:00Z', stale: false, stale_after_seconds: 604800 },
    halt: { stage: 'deployed', reason: 'generated-not-deployed', suspected_upstream_failure: false },
    releases: ['a', 'b', 'c'].map((c, i) => ({
      digest: digest(c), source_commit: c.repeat(40), published_at: '2026-09-13T01:00:00Z',
      stages: { published: true, received: i < 2, verified: i < 2, generated: i < 2, deployed: i === 0 },
      furthest_stage: ['deployed', 'generated', 'published'][i], bundle_asset: 'present',
      quarantined_count: i === 1 ? 2 : 0,
      halt: i === 0 ? null : { stage: i === 1 ? 'deployed' : 'received', reason: i === 1 ? 'generated-not-deployed' : 'awaiting-ingestion', suspected_upstream_failure: false }
    }))
  };
}
const now = Date.parse('2026-09-13T03:30:00Z');

test('renders five counts, live digest, lag, quarantine and generated halt', () => {
  const html = renderStatus(fixture(), { now });
  for (const stage of ['published', 'received', 'verified', 'generated', 'deployed']) assert.match(html, new RegExp(`data-stage="${stage}"`));
  assert.match(html, /Upstream/);
  assert.match(html, /隔离问题.*2/s);
  assert.match(html, /落后 2/);
  assert.ok(html.includes(digest('a')));
  assert.match(html, /下游成功未部署/);
  assert.match(html, /data-stage="deployed"[^>]*aria-current="step"/);
});

test('first visit with missing data renders the deployed embedded snapshot and stopped stage', async () => {
  const result = await loadStatus({ fetcher: async () => ({ ok: false, status: 404 }), fallback: fixture(), now });
  assert.equal(result.observation.state, 'last-good');
  assert.deepEqual(result.counts, fixture().counts);
  const html = renderStatus(result, { now });
  assert.match(html, /显示的是最后有效版本/);
  assert.match(html, /停在 Deployed/);
  assert.match(html, /状态数据刷新失败/);
});

test('invalid response and rejected fetch preserve last valid observation', async () => {
  for (const fetcher of [async () => { throw Error('offline'); }, async () => ({ ok: true, json: async () => ({}) })]) {
    const result = await loadStatus({ fetcher, fallback: fixture(), now });
    assert.equal(result.head.current_truth_release_digest, digest('a'));
    assert.equal(result.observed_at, fixture().observed_at);
  }
});

test('fresh valid response replaces embedded snapshot', async () => {
  const next = fixture(); next.observed_at = '2026-09-13T03:20:00Z';
  const result = await loadStatus({ fetcher: async () => ({ ok: true, json: async () => next }), fallback: fixture(), now });
  assert.equal(result.observed_at, next.observed_at);
  assert.equal(result.observation.state, 'fresh');
});

test('no valid data renders unknown counts rather than a healthy empty pipeline', async () => {
  const result = await loadStatus({ fetcher: async () => { throw Error('offline'); }, fallback: null, now });
  const html = renderStatus(result, { now });
  assert.match(html, /尚无可用的有效版本状态/);
  assert.doesNotMatch(html, /落后 0/);
});

test('blocked pre-tip release calls for historical replay', () => {
  const value = fixture();
  value.releases[2].halt.reason = 'pre-tip-replay-required'; value.counts.blocked = 1;
  assert.match(renderStatus(value, { now }), /需历史重放/);
});

test('stale observations identify last good data even when the fetch succeeds', () => {
  assert.match(renderStatus(fixture(), { now: now + 86400000 }), /显示的是最后有效版本/);
  assert.match(renderStatus(fixture(), { now: now + 86400000 }), /观测已过期/);
});

test('rejects forged stage counts and partial atomic ingest', () => {
  for (const mutate of [v => v.counts.deployed = 8, v => v.releases[2].stages.verified = true, v => v.head.behind = -1]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateStatus(value));
  }
});

test('release metadata is escaped before rendering', () => {
  const value = fixture();
  value.releases[1].halt.reason = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(renderStatus(value, { now }), /<img/);
});

test('English default and existing Chinese dictionary cover the status interface', () => {
  const html = render(fixture(), { now });
  assert.doesNotMatch(html, /\p{Script=Han}/u);
  assert.match(html, /Downstream succeeded but was not deployed/);
  assert.equal(zh('Version status'), '版本状态');
});

test('an older CDN JSON cannot replace a newer embedded deployed observation', async () => {
  const old = fixture(); old.observed_at = '2026-09-12T03:00:00Z';
  const result = await loadStatus({ fetcher: async () => ({ ok: true, json: async () => old }), fallback: fixture(), now });
  assert.equal(result.observed_at, fixture().observed_at);
  assert.equal(result.observation.state, 'last-good');
});
