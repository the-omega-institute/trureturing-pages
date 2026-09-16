import {matchesQuery, hashTarget} from './reading-core.mjs';
import {ready, t} from './i18n.mjs';

await ready;
const index = document.querySelector('[data-research-index]');
if (index) {
  const rows = [...index.querySelectorAll('[data-result-row]')];
  const search = index.querySelector('#results-query');
  const outcome = index.querySelector('#results-outcome');
  const collections = [...index.querySelectorAll('[data-result-collection]')];
  const more = index.querySelector('[data-result-more]');
  const count = index.querySelector('[data-result-count]');
  const pageSize = 8;
  let collection = 'all', limit = pageSize;
  const matches = row => (collection === 'all' || row.dataset.collection === collection)
    && (outcome.value === 'all' || row.dataset.kind === outcome.value)
    && matchesQuery(row.dataset.search, search.value.trim());
  function render() {
    let total = 0;
    for (const row of rows) {
      const match = matches(row);
      row.hidden = !match || ++total > limit;
      if (row.hidden) row.open = false;
    }
    for (const button of collections) button.setAttribute('aria-pressed', String(button.dataset.resultCollection === collection));
    count.textContent = t('Showing {0} of {1} results', Math.min(limit, total), total);
    more.hidden = total <= limit;
    more.textContent = t('Show {0} more results', Math.min(pageSize, Math.max(0, total - limit)));
    index.querySelector('[data-result-empty]').hidden = total !== 0;
  }
  function filter() { limit = pageSize; render(); }
  search.addEventListener('input', filter);
  outcome.addEventListener('change', filter);
  for (const button of collections) button.addEventListener('click', () => {
    collection = button.dataset.resultCollection; filter();
  });
  index.querySelector('[data-clear-search]').addEventListener('click', () => {
    search.value = ''; outcome.value = 'all'; collection = 'all'; filter(); search.focus();
  });
  more.addEventListener('click', () => {
    const next = rows.filter(matches)[limit]; limit += pageSize; render();
    // Keep keyboard navigation at the new results, even when this was the last page.
    next?.querySelector('summary').focus({preventScroll: true});
  });
  function followLink() {
    const target = document.getElementById(hashTarget(location.hash));
    if (!target || !index.contains(target)) return;
    const row = target.closest('[data-result-row]');
    const button = target.closest('[data-result-collection]');
    if (row || button) {
      search.value = ''; outcome.value = 'all'; collection = button?.dataset.resultCollection || 'all';
      limit = row ? Math.max(pageSize, rows.indexOf(row) + 1) : pageSize;
      render();
      if (row) row.open = true;
      requestAnimationFrame(() => target.scrollIntoView({block: 'start', behavior: 'instant'}));
    }
  }
  index.querySelector('[data-index-controls]').hidden = false;
  render(); followLink();
  addEventListener('hashchange', followLink);
}
