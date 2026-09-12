import {questionDestination, matchesQuery, hashTarget} from './reading-core.mjs';

export function revealHash() {
  const id = hashTarget(location.hash);
  const target = document.getElementById(id);
  if (!target) return;
  for (let p = target; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
  requestAnimationFrame(() => target.scrollIntoView({block:'start', behavior:'instant'}));
}
function normalizeLinks(root) {
  const links = root.matches?.('a[href]') ? [root] : root.querySelectorAll?.('a[href]') || [];
  for (const a of links) {
    const destination = questionDestination(a.href, location.href);
    if (destination !== a.href) a.href = destination;
  }
}
for (const catalog of document.querySelectorAll('[data-reading-catalog]')) {
  const input = catalog.querySelector('[data-reading-search]');
  if (!input) continue;
  const groups = [...catalog.querySelectorAll('[data-reading-group]')];
  let prior = null;
  function filter() {
    const query = input.value.trim();
    if (query && !prior) prior = new Map(groups.map(g => [g, g.open]));
    let total = 0;
    for (const group of groups) {
      const items = [...group.querySelectorAll('.reading-item[data-search]')];
      let count = 0;
      for (const item of items) {item.hidden = !matchesQuery(item.dataset.search, query); if (!item.hidden) count++;}
      group.hidden = !!query && count === 0;
      if (query) group.open = count > 0;
      else if (prior) group.open = prior.get(group);
      const label = group.querySelector('[data-group-count]');
      if (label) label.textContent = `${count} ${catalog.id === 'results' ? 'results' : 'questions'}`;
      total += count;
    }
    catalog.querySelector('[data-search-count]').textContent = query ? `${total} matching records` : '';
    if (!query) prior = null;
  }
  input.addEventListener('input', filter);
  catalog.querySelector('[data-clear-search]')?.addEventListener('click', () => {input.value='';filter();input.focus();});
}
normalizeLinks(document);
// Legacy question permalinks are corrected before normal navigation, including new notebook links.
for (const event of ['click','auxclick']) document.addEventListener(event, e => {
  const anchor = e.target.closest?.('a[href]');
  if (anchor) normalizeLinks(anchor);
}, true);
addEventListener('hashchange', revealHash);
addEventListener('reading-notebook-ready', () => {normalizeLinks(document);revealHash();});
revealHash();
