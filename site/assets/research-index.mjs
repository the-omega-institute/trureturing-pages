import {matchesQuery, hashTarget} from './reading-core.mjs';
import {ready, t} from './i18n.mjs';

await ready;
const index = document.querySelector('[data-research-index]');
if (index) {
  // The build owns the ranking. Search and pagination preserve that order.
  const rows = [...index.querySelectorAll('[data-result-row]')];
  const search = index.querySelector('#results-query');
  const more = index.querySelector('[data-result-more]');
  const clear = index.querySelector('[data-clear-search]');
  const count = index.querySelector('[data-result-count]');
  const pageSize = 8;
  let limit = pageSize;
  const matches = row => matchesQuery(row.dataset.search, search.value.trim());
  function render() {
    let total = 0;
    for (const row of rows) {
      const match = matches(row);
      row.hidden = !match || ++total > limit;
      if (row.hidden) row.open = false;
    }
    count.textContent = t('Showing {0} of {1} results', Math.min(limit, total), total);
    more.hidden = total <= limit;
    more.textContent = t('Show {0} more results', Math.min(pageSize, Math.max(0, total - limit)));
    clear.hidden = !search.value;
    index.querySelector('[data-result-empty]').hidden = total !== 0;
  }
  search.addEventListener('input', () => { limit = pageSize; render(); });
  clear.addEventListener('click', () => {
    search.value = ''; limit = pageSize; render(); search.focus();
  });
  more.addEventListener('click', () => {
    const next = rows.filter(matches)[limit]; limit += pageSize; render();
    next?.querySelector('summary').focus({preventScroll: true});
  });
  function followLink() {
    const id = hashTarget(location.hash);
    // Historical source-category bookmarks now lead to the unified results.
    const target = ['results-oeis','results-erdos','results-other','resolved-questions'].includes(id)
      ? index : document.getElementById(id);
    if (!target || !index.contains(target)) return;
    const row = target.closest('[data-result-row]');
    search.value = ''; limit = row ? Math.max(pageSize, rows.indexOf(row) + 1) : pageSize;
    render();
    if (row) row.open = true;
    requestAnimationFrame(() => target.scrollIntoView({block: 'start', behavior: 'instant'}));
  }
  index.querySelector('[data-index-controls]').hidden = false;
  render(); followLink();
  addEventListener('hashchange', followLink);
}
