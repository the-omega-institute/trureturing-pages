import {compareContent, outcomeSourceURL} from './evolution-reader-core.mjs';
import {nodeSlug} from './library-core.mjs';
import {ready, t} from './i18n.mjs';

const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const sourceText = (tag, text, cls) => {
  const node = el(tag, text, cls); node.setAttribute('translate', 'no'); return node;
};
const link = (label, href) => { const node=el('a',t(label)); node.href=href; return node; };
const short = value => (value || '').replace('sha256:', '').slice(0, 8);
const kinds = [['all','All'], ['outcomes','Results'], ['added','Added'],
  ['changed','Updated'], ['removed','Removed']];
const fieldLabels = {human_title:'Title',human_abstract:'Explanation',human_theorem:'Theorem description',
  state:'Recorded state',status:'Recorded status',repo_path:'Source path'};

// The existing release scrubber owns selection. This panel loads precisely the
// two Library snapshots matching its architecture observations, never "latest".
export function mountReleaseChanges(root, {loadSnapshot, onSelect, onChange}) {
  let generation=0, renderGeneration=0, selection='', change=null, query='', category='all', limit=6;
  const status=root.querySelector('[data-change-status]'),
    records=root.querySelector('[data-change-records]'), filters=root.querySelector('[data-change-filters]'),
    search=root.querySelector('[data-change-search]'), more=root.querySelector('[data-change-more]'),
    receipt=root.querySelector('[data-change-receipt]'), count=root.querySelector('[data-change-count]');
  const buttons = kinds.map(([key,label]) => {
    const button=el('button',t(label)); button.type='button'; button.dataset.changeKind=key;
    button.onclick=()=>{category=key;limit=6;renderRows();}; filters.append(button); return button;
  });
  search.oninput=()=>{query=search.value;limit=6;renderRows();};
  more.onclick=()=>{limit+=6;renderRows(true);};
  const entries = () => change.baseline ? change.existing.map(row=>({...row,category:'existing'})) :
    ['outcomes','added','changed','removed'].flatMap(key=>change[key].map(row=>({...row,category:key})));
  async function renderRows(focusMore=false) {
    if (!change) return;
    const token=++renderGeneration, version=generation;
    const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const all=entries().filter(r=>(category==='all'||r.category===category) &&
      words.every(word=>`${r.title} ${r.id} ${r.human_abstract || ''} ${r.scope || ''}`.toLowerCase().includes(word)));
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(category===button.dataset.changeKind)));
    const cards=await Promise.all(all.slice(0,limit).map(async row=>{
      const card=el('article',undefined,'release-change-row');card.dataset.changeRecord=row.id;
      const body=el('div',undefined,'release-change-body'), title=sourceText('h3',row.title);
      body.append(title);
      if (!row.target) body.append(el('span',t({added:'Added',changed:'Updated',removed:'Removed',existing:'Baseline'}[row.category]),'release-change-type'));
      if (row.human_abstract) body.append(sourceText('p',row.human_abstract,'release-change-description'));
      else if (row.human_theorem) body.append(sourceText('p',row.human_theorem,'release-change-description'));
      if (row.target) {
        const outcome=row.change==='updated' ? (row.previous_kind===row.kind ? t('Updated') : t('{0} → {1}',t(row.previous_kind==='proved'?'Proved':'Refuted'),t(row.kind==='proved'?'Proved':'Refuted')))
          : t(row.change==='removed'?'Verification absent':row.kind==='proved'?'Proved':'Refuted');
        body.append(el('span',outcome,'release-outcome'));
        if (row.scope) {
          const detail=el('details');detail.append(el('summary',t('Statement')));
          if (row.change==='updated' && row.previous_scope!==row.scope) detail.append(el('strong',t('Before')),sourceText('p',row.previous_scope,'release-change-scope'),el('strong',t('After')));
          detail.append(sourceText('p',row.scope,'release-change-scope'));body.append(detail);
        }
      }
      if (row.previous) {
        const detail=el('details');detail.append(el('summary',t('Diff')));
        if (!row.fields.length) detail.append(el('p',t('Record updated')));
        for (const key of row.fields) {
          if (key==='source_blob') { detail.append(el('p',t('Source code updated')));continue; }
          if (key==='literature') {detail.append(el('p',t('References updated')));continue;}
          if (!fieldLabels[key]) continue;
          const pair=el('div',undefined,'release-change-pair');pair.append(el('h4',t(fieldLabels[key])));
          for (const [label,record] of [['Before',row.previous],['After',row]]) {
            const value=el('div');value.append(el('strong',t(label)),sourceText('p',String(record[key] ?? t('Not recorded'))));pair.append(value);
          }
          detail.append(pair);
        }
        body.append(detail);
      }
      const actions=el('div',undefined,'release-change-links');
      if (row.target) actions.append(link('Source',outcomeSourceURL(row)));
      else {
        actions.append(link('Read',`release/${row.release.slice(7)}/node/${await nodeSlug(row.id)}/`));
        if (row.previous) actions.append(link('Previous version',`release/${row.previous.release.slice(7)}/node/${await nodeSlug(row.id)}/`));
        const locate=el('button',t('Locate on graph'));locate.type='button';locate.onclick=()=>onSelect(row.id);actions.append(locate);
      }
      body.append(actions);card.append(body);return card;
    }));
    if (token!==renderGeneration || version!==generation) return;
    records.replaceChildren(...cards);
    count.textContent=`${Math.min(limit,all.length)} / ${all.length}`;
    more.hidden=all.length<=limit;more.textContent=t(change.baseline?'Show {0} more modules':'Show {0} more changes',Math.min(6,Math.max(0,all.length-limit)));
    if (!all.length) records.append(el('p',t(query || category!=='all'?'No matches':'No content changes'),'release-change-empty'));
    if (focusMore && cards.length>limit-6) {const target=cards[limit-6].querySelector('a');target?.focus({preventScroll:true});}
  }
  async function update(previous,current,index,total) {
    const key=[previous?.atlas_graph_digest,current.atlas_graph_digest].join(':');
    if (key===selection) return;
    selection=key;const token=++generation;++renderGeneration;change=null;limit=6;query='';category='all';search.value='';
    root.dataset.state='loading';root.dataset.observation=String(index);root.setAttribute('aria-busy','true');
    status.hidden=false;status.textContent=t('Loading…');records.replaceChildren();receipt.replaceChildren();
    count.textContent='';filters.hidden=true;search.disabled=true;more.hidden=true;
    try {
      await ready;
      const [after,before]=await Promise.all([loadSnapshot(current),previous?loadSnapshot(previous):null]);
      if (token!==generation)return;
      change=compareContent(before,after);
      status.textContent=change.baseline?t('Baseline'):'';status.hidden=!change.baseline;
      for (const [i,[key,label]] of kinds.entries()) {
        const size=key==='all'?entries().length:change[key].length;
        buttons[i].replaceChildren(el('span',t(label)),el('strong',String(size)));
        buttons[i].hidden=key!=='all' && size===0;
        if (key!=='all') buttons[i].dataset.changeCount=key;
      }
      const source=after.graph.source_snapshot.source_commit, prior=before?.graph.source_snapshot.source_commit;
      receipt.append(sourceText('span',previous?`${short(prior)} → ${short(source)}`:short(source)));
      if (/^[a-f0-9]{40}$/.test(prior) && /^[a-f0-9]{40}$/.test(source) && prior!==source)
        receipt.append(link('Source diff',`https://github.com/the-omega-institute/trureturing/compare/${prior}...${source}`));
      filters.hidden=change.baseline;search.disabled=false;
      await renderRows();
      if (token!==generation)return;
      root.dataset.state='ready';root.setAttribute('aria-busy','false');
      onChange?.(change,index);
    } catch(error) {
      if (token!==generation)return;
      root.dataset.state='unavailable';root.setAttribute('aria-busy','false');
      status.hidden=false;status.textContent=t('Comparison unavailable');
      records.replaceChildren();
      const retry=el('button',t('Retry comparison'));retry.type='button';retry.onclick=()=>{selection='';update(previous,current,index,total);};records.append(retry);
    }
  }
  return {update};
}
