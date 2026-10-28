import {matchesQuery, hashTarget} from './reading-core.mjs';
import {ready, t} from './i18n.mjs';
import {assessmentScore, compareAssessments} from './contribution-ranking.mjs';

await ready;
const index = document.querySelector('[data-research-index]');
if (index) {
  const rows = [...index.querySelectorAll('[data-result-row]')];
  const search = index.querySelector('#results-query');
  const outcome = index.querySelector('#results-outcome');
  const collections = [...index.querySelectorAll('[data-result-collection]')];
  const more = index.querySelector('[data-result-more]');
  const count = index.querySelector('[data-result-count]');
  const dimensions = [...index.querySelectorAll('[data-rank-dimension]')];
  const assessment = new Map(rows.map(row => [row, JSON.parse(row.dataset.assessment || '{}')]));
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
  function rank() {
    const weights = Object.fromEntries(dimensions.filter(input => input.checked)
      .map(input => [input.dataset.rankDimension, Number(input.dataset.weight)]));
    const scores = new Map(rows.map(row => [row, {...assessmentScore(assessment.get(row), weights),
      title: row.dataset.title, id: row.id}]));
    rows.sort((a, b) => compareAssessments(scores.get(a), scores.get(b)));
    const archive = index.querySelector('#result-archive');
    for (const row of rows) {
      const value = scores.get(row);
      row.querySelector('[data-result-score]').textContent = value.status === 'complete'
        ? `${value.score} / 100` : t(value.status === 'partial' ? 'Partial assessment' : 'Assessment pending');
      archive.append(row);
    }
    // Retain one dimension so the ranking always has a defined denominator.
    for (const input of dimensions) input.disabled = Object.keys(weights).length === 1 && input.checked;
    const hasEvidence = [...scores.values()].some(value => value.status !== 'pending');
    index.querySelector('[data-ranking-order]').textContent = t(hasEvidence
      ? 'Ranked by contribution · unassessed results follow' : 'Awaiting assessments · ordered by title');
    filter();
  }
  for (const input of dimensions) input.addEventListener('change', rank);
  search.addEventListener('input', filter);
  outcome.addEventListener('change', filter);
  for (const button of collections) button.addEventListener('click', () => {
    collection = button.dataset.resultCollection; filter();
  });
  index.querySelector('[data-clear-search]').addEventListener('click', () => {
    search.value = ''; outcome.value = 'all'; collection = 'all';
    dimensions.forEach(input => { input.checked = true; }); rank(); search.focus();
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
  index.querySelector('[data-rank-picker]').hidden = false;
  rank(); followLink();
  addEventListener('hashchange', followLink);
}
