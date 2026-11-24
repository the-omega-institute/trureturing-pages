import {ready, locale} from './i18n.mjs';

export const FIELDS = ['headline','formal_title','question','finding','context','impact','idea','boundary'];
const hashPattern = /^sha256:[a-f0-9]{64}$/;
export function canonical(value) {
  return JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)) : v);
}
export async function validateEntry(key, entry, cryptoAPI = globalThis.crypto) {
  if (!hashPattern.test(key) || entry?.source_digest !== key || !entry.fields || !entry.segments
      || Object.keys(entry.fields).sort().join() !== [...FIELDS].sort().join()
      || Object.keys(entry.segments).sort().join() !== [...FIELDS].sort().join()
      || Object.values(entry.fields).some(v=>typeof v !== 'string' || v.length>32768)
      || Object.values(entry.segments).some(parts=>!Array.isArray(parts) || parts.some(p=>
        !p || Object.keys(p).sort().join()!=='kind,text' || !['text','math','code'].includes(p.kind) || typeof p.text!=='string'))
      || entry.review?.passed !== true || !Array.isArray(entry.review?.issues) || entry.review.issues.length !== 0
      || entry.review?.source_context !== 'full-source.v1'
      || entry.review?.source_digest !== key || entry.review?.content_digest !== entry.content_digest
      || !entry.review?.model || !hashPattern.test(entry.review?.response_digest)) return false;
  const raw = new TextEncoder().encode(canonical({fields:entry.fields,segments:entry.segments}));
  const bytes = await cryptoAPI.subtle.digest('SHA-256', raw);
  const hash = 'sha256:'+[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
  return hash === entry.content_digest;
}

function fragment(parts) {
  const nodes = document.createDocumentFragment();
  for (const part of parts) {
    if (part.kind === 'text') nodes.append(document.createTextNode(part.text));
    else if (part.kind === 'code') {
      const code = document.createElement('code'); code.textContent=part.text; nodes.append(code);
    } else {
      const math = document.createElement('span'); math.className='math-inline';
      if (globalThis.katex) globalThis.katex.render(part.text,math,{throwOnError:false,trust:false});
      else math.textContent=part.text;
      nodes.append(math);
    }
  }
  return nodes;
}

export async function installTranslations(root=document, fetcher=globalThis.fetch) {
  await ready;
  if (locale !== 'zh-CN' || !root.querySelector('[data-translation-source]')) return;
  let entries={};
  const catalogNode=root.querySelector('#result-catalog');
  const catalog=catalogNode ? JSON.parse(catalogNode.textContent) : [];
  try {
    const response=await fetcher(new URL('./locales/research.zh-CN.v1.json',import.meta.url),
      {cache:'no-cache',signal:AbortSignal.timeout(15000)});
    if (!response.ok) return;
    const cache=await response.json();
    if (cache.schema_version!=='research-translations.v1' || cache.policy!=='research-translation.v1'
        || cache.locale!=='zh-CN' || !cache.entries || Array.isArray(cache.entries)) return;
    const wanted=new Set([...root.querySelectorAll('[data-translation-source]')].map(n=>n.dataset.translationSource));
    for (const template of root.querySelectorAll('template[data-research-highlight]'))
      for (const node of template.content.querySelectorAll('[data-translation-source]')) wanted.add(node.dataset.translationSource);
    for (const record of catalog) wanted.add(record.translation_source);
    await Promise.all([...wanted].map(async key=>{
      const entry=cache.entries[key];
      if (await validateEntry(key,entry)) entries[key]=entry;
    }));
  } catch { return; }

  // Search indexes accepted Chinese text; DOM/math rendering follows visibility.
  for (const row of root.querySelectorAll('[data-result-row]')) {
    const key=row.querySelector('[data-translation-source]')?.dataset.translationSource;
    if (entries[key]) row.dataset.search+=' '+Object.values(entries[key].fields).join(' ').toLowerCase();
  }
  const index=root.querySelector('[data-research-index]');
  const records=index?.resultRecords || (catalogNode ? catalog : null);
  if (records) for (const record of records) {
    const entry=entries[record.translation_source];
    if (entry) record.search+=' '+Object.values(entry.fields).join(' ').toLowerCase();
  }
  if (index && records) index.resultRecords=records;
  function apply() {
    const scopes=index ? [...index.querySelectorAll('[data-result-row]')].filter(row=>!row.hidden) : [root];
    const visible=[];
    for (const scope of scopes) for (const node of scope.querySelectorAll('[data-translation-source]:not([data-translated])')) {
      const entry=entries[node.dataset.translationSource], field=node.dataset.translationField;
      if (entry && FIELDS.includes(field) && node.checkVisibility()) visible.push([node,entry,field]);
    }
    // Finish visibility reads before KaTeX/DOM writes to avoid repeated layouts.
    for (const [node,entry,field] of visible) {
      node.replaceChildren(fragment(entry.segments[field]));
      node.lang='zh-CN'; node.dataset.translated='true';
    }
  }
  let scheduled=false;
  function schedule() {
    if (!scheduled) {scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
  }
  addEventListener('research-results-rendered',schedule);
  root.addEventListener('toggle',schedule,true);
  apply();
  dispatchEvent(new Event('research-translations-ready'));
}
if (typeof document!=='undefined') installTranslations();
