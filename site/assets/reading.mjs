import {questionDestination, matchesQuery, hashTarget} from './reading-core.mjs';
import {t, ready as languageReady} from './i18n.mjs';

export function revealHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const target = document.getElementById(['node','q'].some(k=>params.has(k)) ? 'open-problems' : hashTarget(location.hash));
  if (!target) return;
  for (let p = target; p; p = p.parentElement) { p.hidden = false; if (p.tagName === 'DETAILS') p.open = true; }
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
  // The existing source-browser owns question/triage/node filtering. Observe its
  // rows rather than introducing a second interpretation of those filters.
  const legacy = input.id === 'research-search';
  const triage = catalog.querySelector('[data-reading-triage]');
  const status = catalog.querySelector('[data-reading-status]');
  let prior = null, lastKey = '';
  const limits = new Map(groups.map(g => [g, 12]));
  const buttons = new Map(groups.map(group => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'reading-more';
    group.querySelector('.reading-group-body').append(button);
    button.addEventListener('click', () => {limits.set(group, limits.get(group) + 12); filter();});
    return [group, button];
  }));
  function filter() {
    const query = input.value.trim(), key = query + '\0' + (triage?.value || '') + '\0' + (status?.value || '');
    const active = !!query || !!triage?.value || !!status?.value || (legacy && !!new URLSearchParams(location.hash.slice(1)).get('node'));
    if (key !== lastKey) {for (const g of groups) limits.set(g, 12); lastKey = key;}
    if (active && !prior) prior = new Map(groups.map(g => [g, g.open]));
    let total = 0;
    for (const group of groups) {
      let count = 0;
      for (const item of group.querySelectorAll('.reading-item[data-search]')) {
        const match = legacy ? !item.querySelector('.problem-row').hidden : matchesQuery(item.dataset.search, query);
        if (match) count++;
        item.hidden = !match || count > limits.get(group);
      }
      const more = buttons.get(group);
      more.hidden = count <= limits.get(group);
      more.textContent = t('Show 12 more ({0} remaining)', Math.max(0, count - limits.get(group)));
      group.hidden = active && count === 0;
      if (active) group.open = count > 0;
      else if (prior) group.open = prior.get(group);
      const label = group.querySelector('[data-group-count]');
      if (label) label.textContent = t(catalog.id === 'open-problems' ? '{0} questions' : '{0} results', count);
      total += count;
    }
    const count = catalog.querySelector('[data-search-count]');
    if (count && !legacy) count.textContent = query ? `${total} matching records` : '';
    if (!active) prior = null;
  }
  filter();
  languageReady.then(filter);
  const schedule = () => queueMicrotask(filter);
  input.addEventListener('input', schedule);
  triage?.addEventListener('change', schedule);
  status?.addEventListener('change', schedule);
  if (legacy) {
    const observer = new MutationObserver(changes => {
      if (changes.some(c => c.target.matches?.('.problem-row'))) filter();
    });
    observer.observe(catalog, {subtree:true, attributes:true, attributeFilter:['hidden']});
    addEventListener('pagehide', () => observer.disconnect(), {once:true});
  }
  catalog.querySelector('[data-clear-search]')?.addEventListener('click', () => {input.value='';filter();input.focus();});
}
normalizeLinks(document);
for (const event of ['click','auxclick']) document.addEventListener(event, e => {
  const anchor = e.target.closest?.('a[href]');
  if (anchor) normalizeLinks(anchor);
}, true);
addEventListener('hashchange', revealHash);
addEventListener('reading-notebook-ready', () => {normalizeLinks(document);revealHash();});
revealHash();
