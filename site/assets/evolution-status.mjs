import {loadStatus, STAGES} from './version-status-core.mjs';
import {statusCaption} from './evolution-labels.mjs';
const box = document.getElementById('publication-status');
let value, pending;
async function refresh() {
  const label = document.getElementById('publication-summary');
  const list = document.getElementById('publication-stages');
  document.getElementById('publication-date').textContent = '';
  list.replaceChildren();
  label.textContent = 'Checking publication status';
  value = await loadStatus({fallback:value});
  let release;
  try {
    const r = await fetch('data/pages-atlas-manifest.v1.json', {cache:'no-store'});
    if (!r.ok) throw Error('Unavailable manifest');
    const m = await r.json();
    if (m.schema_version !== 'pages-atlas-manifest.v1') throw Error('Invalid manifest');
    release = m.truth_release_digest;
  } catch { label.textContent = 'Publication binding unavailable'; list.replaceChildren(); return; }
  label.textContent = statusCaption(value, release);
  list.replaceChildren();
  if (value.head.current_truth_release_digest !== release) return;
  // The same validated counters as the diagnostic view, never an invented progress percentage.
  for (const stage of STAGES) {
    const li = document.createElement('li');
    const number = document.createElement('strong');
    number.textContent = value.counts[stage] ?? 'Unknown';
    li.append(number, document.createTextNode(stage)); list.append(li);
  }
  document.getElementById('publication-date').textContent = value.observed_at ? `Recorded ${value.observed_at}` : 'No recorded status';
}
box?.addEventListener('toggle', () => {
  if (box.open && !pending) pending = refresh().finally(() => {pending = null;});
});
