import { t } from './i18n.mjs';

export const STAGES = ['published', 'received', 'verified', 'generated', 'deployed'];
const LABELS = { published: 'Upstream', received: 'Received', verified: 'Verified', generated: 'Generated', deployed: 'Deployed' };
const REASONS = {
  'bundle-missing': 'Bundle asset missing; suspected upstream assembly failure',
  'bundle-download-failed': 'Bundle download failed; upstream asset or network may be unavailable',
  'bundle-invalid': 'Bundle validation failed; suspected upstream assembly failure',
  'acquisition-failed': 'Bundle acquisition or validation failed; the exact step is not independently recorded',
  'verification-failed': 'Verification failed; no complete ingestion record',
  'generation-failed': 'Snapshot generation did not complete; no complete ingestion record',
  'atomic-ingestion-failed': 'Atomic ingestion failed during verification or generation; no complete ingestion record',
  'deployment-failed': 'Deployment did not complete',
  'awaiting-ingestion': 'Awaiting atomic reception, verification and generation; no failure recorded',
  'generated-not-deployed': 'Downstream succeeded but was not deployed',
  'pre-tip-replay-required': 'Pre-tip blocked; historical replay required',
  'status-refresh-failed': 'Status refresh failed',
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const count = value => Number.isInteger(value) && value >= 0;
const coordinate = value => value === null || /^sha256:[0-9a-f]{64}$/.test(value);
const date = value => typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
const reasonText = reason => REASONS[reason] || reason;

export function validateStatus(value) {
  const fail = () => { throw Error('Invalid version status'); };
  if (!value || value.schema_version !== 'pages-version-status.v1' || !value.counts || !value.head || !value.upstream ||
      !value.observation || !['fresh', 'last-good', 'unavailable'].includes(value.observation.state) ||
      !['observed', 'on-deploy'].includes(value.publication) || !Array.isArray(value.releases) ||
      !date(value.observation.checked_at) || !coordinate(value.head.current_truth_release_digest) ||
      !coordinate(value.head.upstream_latest_digest) || !(value.head.behind === null || count(value.head.behind))) fail();
  const validHalt = halt => halt === null || (halt && STAGES.includes(halt.stage) && typeof halt.reason === 'string' && typeof halt.suspected_upstream_failure === 'boolean');
  if (!validHalt(value.halt) || !(value.observation.halt_stage === null || STAGES.includes(value.observation.halt_stage)) ||
      !(value.upstream.latest_published_at === null || date(value.upstream.latest_published_at)) ||
      !count(value.upstream.stale_after_seconds) || value.upstream.stale_after_seconds === 0 ||
      !(value.upstream.stale === null || typeof value.upstream.stale === 'boolean')) fail();
  const keys = [...STAGES, 'pending', 'blocked', 'quarantined'];
  if (value.observation.state === 'unavailable') {
    if (keys.some(k => value.counts[k] !== null) || value.releases.length || value.observed_at !== null ||
        Object.values(value.head).some(v => v !== null)) fail();
    return value;
  }
  if (!date(value.observed_at) || keys.some(k => !count(value.counts[k]))) fail();
  const seen = new Set();
  for (const row of value.releases) {
    const s = row.stages;
    if (!coordinate(row.digest) || row.digest === null || seen.has(row.digest) || !/^[0-9a-f]{40}$/.test(row.source_commit) ||
        !(row.published_at === null || date(row.published_at)) || !s || STAGES.some(k => typeof s[k] !== 'boolean') ||
        !s.published || s.received !== s.verified || s.received !== s.generated || (s.deployed && !s.generated) ||
        row.furthest_stage !== STAGES.filter(k => s[k]).at(-1) || !count(row.quarantined_count) || !validHalt(row.halt) ||
        !['present', 'missing', 'unknown'].includes(row.bundle_asset)) fail();
    seen.add(row.digest);
  }
  for (const stage of STAGES) if (value.counts[stage] !== value.releases.filter(r => r.stages[stage]).length) fail();
  if (value.counts.quarantined !== value.releases.reduce((sum, r) => sum + r.quarantined_count, 0) ||
      value.counts.blocked > value.counts.pending || value.counts.pending > value.counts.published) fail();
  const live = value.releases.find(r => r.digest === value.head.current_truth_release_digest);
  if (live && !live.stages.deployed) fail();
  return value;
}

export function unavailable(now = Date.now()) {
  return {
    schema_version: 'pages-version-status.v1', observed_at: null, publication: 'observed',
    observation: { state: 'unavailable', checked_at: new Date(now).toISOString(), halt_stage: 'published', reason: 'status-refresh-failed' },
    counts: Object.fromEntries([...STAGES, 'pending', 'blocked', 'quarantined'].map(k => [k, null])),
    head: { current_truth_release_digest: null, upstream_latest_digest: null, behind: null },
    upstream: { latest_published_at: null, stale_after_seconds: 604800, stale: null }, halt: null, releases: [],
  };
}

export async function loadStatus({ fetcher = fetch, fallback = null, now = Date.now() } = {}) {
  try {
    const response = await fetcher(`data/version-status.v1.json?status=${now}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const fresh = validateStatus(await response.json());
    // A delayed CDN response must not silently roll back a newer served HTML.
    let previous;
    try { previous = validateStatus(fallback); } catch { /* no valid embedded snapshot */ }
    if (previous?.observed_at && (!fresh.observed_at || Date.parse(fresh.observed_at) < Date.parse(previous.observed_at))) throw Error('Older observation');
    return fresh;
  } catch {
    try {
      const previous = structuredClone(validateStatus(fallback));
      if (previous.observation.state === 'unavailable') return unavailable(now);
      previous.observation = { state: 'last-good', checked_at: new Date(now).toISOString(), halt_stage: 'published', reason: 'status-refresh-failed' };
      return previous;
    } catch {
      return unavailable(now);
    }
  }
}

export function renderStatus(value, { now = Date.now(), translate = t } = {}) {
  validateStatus(value);
  const text = (key, ...args) => escape(translate(key, ...args));
  const unavailable = value.observation.state === 'unavailable';
  const old = value.observed_at && now - Date.parse(value.observed_at) > 2 * 3600000;
  const fallback = value.observation.state === 'last-good' || old;
  const stop = value.halt?.stage || value.observation.halt_stage || (old ? 'published' : null);
  const notice = unavailable ? translate('No valid version status is available yet; stopped at Upstream status reading. Site content remains available.') :
    fallback ? [translate('Showing the last valid version.'), translate('Stopped at {0} (last observation).', LABELS[stop]),
      value.observation.state === 'last-good' ? translate('Status refresh failed.') : '',
      old ? translate('Observation is stale; refresh to check. Current progress is unknown.') : ''].filter(Boolean).join(' ') :
    value.halt ? translate('Stopped at {0}: {1}. Serving live / last-good.', LABELS[stop], translate(reasonText(value.halt.reason))) :
    value.head.current_truth_release_digest ? translate('All five stages are aligned. The live version is serving normally.') : translate('No live deployment is confirmed by this observation.');
  const number = n => n === null ? '—' : escape(String(n));
  const digest = (d, empty) => d ? `<code title="${escape(d)}">${escape(d)}</code>` : `<span>${empty}</span>`;
  const upstreamStale = value.upstream.stale || (value.upstream.latest_published_at && now - Date.parse(value.upstream.latest_published_at) > value.upstream.stale_after_seconds * 1000);
  return `<section class="version-notice ${unavailable || fallback || value.halt ? 'needs-attention' : 'is-current'}" role="status"><p>${escape(notice)}</p></section>
    <ol class="version-stages" aria-label="${text('Five release stages')}">${STAGES.map(stage => `<li data-stage="${stage}"${stop === stage ? ' aria-current="step"' : ''}><span>${escape(LABELS[stage])}${stage === 'deployed' ? ' <small>(live)</small>' : ''}</span><strong>${number(value.counts[stage])}</strong></li>`).join('')}</ol>
    <p class="version-evidence">${text('Received, Verified and Generated share one complete ingestion record. These stages finish atomically; no separate intermediate progress is recorded.')}</p>
    <section class="version-head" aria-label="${text('Release coordinates')}"><div><span>LIVE / LAST-GOOD</span>${digest(value.head.current_truth_release_digest, text('No confirmed live coordinate'))}</div><div><span>UPSTREAM LATEST</span>${digest(value.head.upstream_latest_digest, text('Latest upstream coordinate unknown'))}</div><strong class="version-lag">${value.head.behind === null ? text('Lag unknown') : text('Behind by {0}', value.head.behind)}</strong></section>
    <div class="version-summary"><span>${text('Pending')} <strong>${number(value.counts.pending)}</strong></span><span>${text('Blocked')} <strong>${number(value.counts.blocked)}</strong></span><span>${text('Quarantined problems')} <strong>${number(value.counts.quarantined)}</strong></span></div>
    <p class="version-times">${text('Last valid observation: {0} · Latest upstream publication: {1}', value.observed_at || translate('Unknown'), value.upstream.latest_published_at || translate('Unknown'))}</p>
    ${upstreamStale ? `<p class="version-stale">${text('No upstream publication for over {0} days. This may indicate a stall, but alone does not prove assembly failure.', Math.round(value.upstream.stale_after_seconds / 86400))}</p>` : ''}
    <details class="version-releases"><summary>${text('Release details · {0} published', number(value.counts.published))}</summary><div class="version-table-wrap"><table><thead><tr><th>Release</th><th>${text('Furthest stage')}</th><th>${text('Halt reason')}</th><th>${text('Quarantined problems')}</th></tr></thead><tbody>${[...value.releases].reverse().map(row => `<tr><td><code title="${escape(row.digest)}">${escape(row.digest.slice(7, 19))}</code>${row.digest === value.head.current_truth_release_digest ? ' <small>live</small>' : ''}</td><td>${escape(LABELS[row.furthest_stage])}</td><td>${row.halt ? text(reasonText(row.halt.reason)) : text('Deployed')}</td><td>${escape(row.quarantined_count)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
