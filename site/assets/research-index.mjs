import {matchesQuery, hashTarget} from './reading-core.mjs';
import {ready, t} from './i18n.mjs';

await ready;
const index = document.querySelector('[data-research-index]');
if (index) {
  // The build owns the complete order/search catalogue. Only visible cards and
  // their evidence enter the DOM. Every fetched card binds its exact HTML bytes.
  const archive = index.querySelector('#result-archive');
  const cached = new Map([...archive.querySelectorAll('[data-result-row]')].map(row => [row.id, row]));
  const catalog = document.getElementById('result-catalog');
  // Translations may finish before this module arrives over the network. Reuse
  // their enriched catalogue so the ready event's timing cannot lose search text.
  const records = index.resultRecords || (catalog ? JSON.parse(catalog.textContent) : [...cached.values()].map(row => ({
    id: row.id, search: row.dataset.search,
    translation_source: row.querySelector('[data-translation-source]')?.dataset.translationSource,
  })));
  index.resultRecords = records;
  const search = index.querySelector('#results-query');
  const more = index.querySelector('[data-result-more]');
  const clear = index.querySelector('[data-clear-search]');
  const count = index.querySelector('[data-result-count]');
  const pageSize = 8;
  let limit = pageSize, generation = 0, anchor = null, retry = false;
  const matches = record => matchesQuery(record.search, search.value.trim());
  async function card(record) {
    if (cached.has(record.id)) return cached.get(record.id);
    if (!/^sha256:[a-f0-9]{64}$/.test(record.digest) || record.path !== `assets/result-cards/${record.digest.slice(7)}.html`) throw new Error('Invalid result card coordinate');
    const response = await fetch(new URL(record.path, location.href));
    if (!response.ok) throw new Error(`Result card HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const hash = 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== record.digest) throw new Error('Result card digest mismatch');
    const template = document.createElement('template');
    template.innerHTML = new TextDecoder().decode(bytes);
    const row = template.content.firstElementChild;
    if (!row?.matches('[data-result-row]') || row.id !== record.id) throw new Error('Result card identity mismatch');
    cached.set(record.id, row);
    return row;
  }
  async function render() {
    const token = ++generation;
    retry = false;
    const matched = records.filter(matches);
    const visible = matched.filter((record, i) => i < limit || record.id === anchor);
    more.disabled = true;
    try {
      const rows = await Promise.all(visible.map(card));
      if (token !== generation) return;
      for (const row of rows) row.hidden = false;
      archive.replaceChildren(...rows);
      count.textContent = t('Showing {0} of {1} results', visible.length, matched.length);
      more.hidden = matched.length <= limit;
      more.textContent = t('Show {0} more results', Math.min(pageSize, Math.max(0, matched.length - limit)));
      clear.hidden = !search.value;
      index.querySelector('[data-result-empty]').hidden = matched.length !== 0;
      dispatchEvent(new Event('research-results-rendered'));
      return true;
    } catch {
      if (token === generation) {
        retry = true;
        count.textContent = t('Some results could not load. Please retry.');
        more.hidden = false;
        more.textContent = t('Retry loading results');
        clear.hidden = !search.value;
      }
      return false;
    } finally { if (token === generation) more.disabled = false; }
  }
  search.addEventListener('input', () => { limit = pageSize; anchor = null; render(); });
  clear.addEventListener('click', () => {
    search.value = ''; limit = pageSize; anchor = null; render(); search.focus();
  });
  more.addEventListener('click', async () => {
    if (retry) { await render(); return; }
    const next = records.filter(matches)[limit]; limit += pageSize;
    await render(); cached.get(next?.id)?.querySelector('summary').focus({preventScroll: true});
  });
  async function followLink() {
    const id = hashTarget(location.hash);
    const record = records.find(row => row.id === id || row.id === 'resolved-' + id);
    const target = document.getElementById(id);
    if (!record && (!target || !index.contains(target)) && !['results-oeis','results-erdos','results-other','resolved-questions'].includes(id)) return;
    search.value = ''; limit = pageSize; anchor = record?.id || null;
    if (!await render()) return;
    const row = record && cached.get(record.id);
    if (row) {
      row.open = true;
      if (id !== record.id) {
        const evidence = row.querySelector('.verification-details');
        if (evidence) evidence.open = true;
      }
    }
    requestAnimationFrame(() => (row || target || index).scrollIntoView({block: 'start', behavior: 'instant'}));
  }
  index.querySelector('[data-index-controls]').hidden = false;
  await render(); followLink();
  addEventListener('hashchange', followLink);
  addEventListener('research-translations-ready', render);
}
