import {ready} from './i18n.mjs';
await ready;
const details = document.querySelector('.more-milestones');
if (details) {
  const cards = [...details.querySelectorAll('template[data-research-highlight]')];
  const list = details.querySelector('[data-highlight-list]');
  const more = details.querySelector('[data-highlight-more]');
  let offset = 0;
  function next() {
    const batch = cards.slice(offset, offset + 8);
    list.append(...batch.map(template => template.content));
    batch.forEach(template => template.remove());
    offset += batch.length;
    more.hidden = offset >= cards.length;
    dispatchEvent(new Event('research-results-rendered'));
  }
  details.addEventListener('toggle', () => { if (details.open && !offset) next(); });
  more.addEventListener('click', next);
}
