import {loadLibrary} from './library-core.mjs';
import {t, ready} from './i18n.mjs';

const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const requested = location.hash === '#evolution';

// Read only the published observation index. Opening this small timeline must
// never download the entire archive of graph/Library snapshots.
export async function showGrowth(details, base = new URL('./', location.href)) {
  if (details.dataset.loaded) return;
  details.dataset.loaded = 'loading';
  const root = details.querySelector('[data-library-growth]');
  root.replaceChildren(el('p', t('Loading release observations…')));
  try {
    const {index} = await loadLibrary(base);
    const entries = index.entries;
    if (entries.some(entry => !Number.isSafeInteger(entry.node_count) || entry.node_count < 0 ||
      !Number.isSafeInteger(entry.problem_count) || entry.problem_count < 0)) throw new Error('Invalid observation counts');
    const intro = el('p', t('Browse the published observations of our shared library.'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 320 94');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('Library records across published observations'));
    const max = Math.max(1, ...entries.map(entry => entry.node_count));
    const points = entries.map((entry, i) => `${8 + i / Math.max(1, entries.length-1) * 304},${84 - entry.node_count / max * 74}`);
    const line = document.createElementNS(svg.namespaceURI, 'polyline');
    line.setAttribute('points', points.join(' ')); svg.append(line);
    const marker = document.createElementNS(svg.namespaceURI, 'circle');
    marker.setAttribute('r', '4'); svg.append(marker);
    const label = el('label', t('Published observation'));
    const range = el('input'); range.type = 'range'; range.min = '0'; range.max = String(entries.length-1);
    range.value = range.max; range.setAttribute('aria-label', t('Published observation')); label.append(range);
    const status = el('p'); status.setAttribute('aria-live', 'polite');
    const source = el('a', t('Read this release ↗'));
    function select() {
      const i = Number(range.value), entry = entries[i];
      const [cx, cy] = points[i].split(','); marker.setAttribute('cx', cx); marker.setAttribute('cy', cy);
      range.setAttribute('aria-valuetext', t('Observation {0} of {1}', i+1, entries.length));
      status.textContent = t('Observation {0} of {1} · {2} library records · {3} question records',
        i+1, entries.length, entry.node_count.toLocaleString(), entry.problem_count.toLocaleString());
      source.href = `library-history.html#release=${encodeURIComponent(entry.truth_release_digest)}`;
    }
    range.addEventListener('input', select); select();
    root.replaceChildren(intro, svg, label, status, source,
      el('p', t('Record counts describe the published library, including documents. They are not a measure of mathematical significance.')));
    details.dataset.loaded = 'true';
  } catch {
    delete details.dataset.loaded;
    root.replaceChildren(el('p', t('Release history is temporarily unavailable. Open this section again to retry.')));
  }
}

export function installGrowth(root = document) {
  const details = root.querySelector('#evolution');
  if (!details || details.dataset.installed) return;
  details.dataset.installed = 'true';
  details.addEventListener('toggle', () => { if (details.open) showGrowth(details); });
  if (requested || location.hash === '#evolution') {
    details.open = true; details.scrollIntoView({block: 'nearest'});
  }
}
addEventListener('hashchange', () => {
  const details = document.querySelector('#evolution');
  if (location.hash === '#evolution' && details) {
    details.open = true; details.scrollIntoView({block: 'nearest'});
  }
});
await ready;
