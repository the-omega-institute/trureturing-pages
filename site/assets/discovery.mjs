import {search, connections} from './discovery-core.mjs';
import {renderMap} from './discovery-map.mjs';
import {ready,t} from './i18n.mjs';
await ready;
const element = (tag, text) => {const node=document.createElement(tag); if(text)node.textContent=t(text); return node;};
const link = (text, url) => {const a=element('a',text);a.href=url;return a;};
const status=document.getElementById('discovery-status'), input=document.getElementById('discovery-query');
const results=document.getElementById('discovery-results'), detail=document.getElementById('discovery-detail');
let index;
const labels={public_problem:'Public problem',general_theorem:'General theorem',representation:'Representation bridge',new_problem:'Transfer to a new problem',human_understanding:'Independent understanding'};
const states={'source-located':'Original question located','reviewed-pinned-result':'Reviewed pinned proof','reviewed-pinned-statement':'Named equality in pinned proof','not-documented':'Evidence still needed',proposed:'Next question · transfer not measured','explanation-available':'Explanation available · reader assessment pending'};
function renderChain(record) {
  const host=document.getElementById('research-chain');host.replaceChildren();
  const path=index.research_paths?.find(p=>p.stages.some(s=>s.records.includes(record.id)));
  if(!path)return;
  host.append(element('p','FROM A PUBLIC QUESTION TO UNDERSTANDING'));
  const list=element('ol');list.className='research-chain';
  for(const [i,stage] of path.stages.entries()){
    const item=element('li');item.dataset.state=stage.status;
    item.append(element('small',String(i+1).padStart(2,'0')),element('h3',labels[stage.kind]),element('p',states[stage.status] || stage.status));
    for(const id of stage.records.slice(0,1)) {const target=index.records.find(r=>r.id===id);if(!target)continue;const button=element('button',target.title);button.type='button';button.onclick=()=>select(target);item.append(button);}
    list.append(item);
  }
  host.append(list,element('p','A verified representation is a foundation for transfer. Improvement on new problems and independent human understanding still need separate evidence.'));
}
function select(record, push=true) {
  const url=new URL(location.href);url.searchParams.set('record',record.id);
  if(push)history.pushState(null,'',url);else history.replaceState(null,'',url);
  for(const item of results.children)item.dataset.selected=String(item.dataset.id===record.id);
  detail.replaceChildren(element('p',record.kind.toUpperCase()),element('h2',record.title),element('p',record.summary));
  if(record.kind==='result')detail.append(element('strong',record.status==='proved'?'Proved: reviewed pinned result':'Refuted: reviewed pinned result'));
  if(record.authors)detail.append(element('p',record.authors+(record.year?' · '+record.year:'')));
  if(record.scope)detail.append(element('p',record.scope));
  if(!record.url.includes('discover.html?record='))detail.append(link('Read full record',record.url));
  if(record.evidence?.source_url){const p=element('p');p.append(link('Original source',record.evidence.source_url));detail.append(p);}
  if(record.evidence?.lean_url) {const p=element('p');p.append(link('Exact Lean source',record.evidence.lean_url));detail.append(p);}
  if(record.evidence?.declaration) {const p=element('code',record.evidence.declaration);detail.append(p);}
  if(record.evidence?.source_commit)detail.append(element('p',t('Proof source commit: {0}',record.evidence.source_commit)));
  const edges=connections(index,record.id);
  detail.append(element('h3',t('Research connections ({0})',edges.length)));
  for(const edge of edges) {
    const section=element('section');section.className='connection';
    const label=element('p',t(edge.outgoing?'To: {0}':'From: {0}',t(edge.kind.replaceAll('_',' '))));label.className='eyebrow';
    const button=element('button',edge.neighbor.title);button.type='button';button.addEventListener('click',()=>select(edge.neighbor));
    section.append(label,button,element('p',edge.scope),link('Relationship source',edge.evidence_url));detail.append(section);
  }
  if(!edges.length)detail.append(element('p','No curated connections indexed yet.'));
  renderChain(record);renderMap(index,record,select);
}
function render() {
  const params=new URLSearchParams(location.search);input.value=params.get('q') || '';
  const matches=search(index,input.value);results.replaceChildren();
  status.textContent=t('{0} records found',matches.length)+(matches.length>60?' · '+t('First 60 shown'):'');
  for(const record of matches.slice(0,60)) {
    const article=element('article');article.dataset.id=record.id;
    const button=element('button',record.title);button.type='button';button.addEventListener('click',()=>{select(record);document.getElementById('map-title').scrollIntoView({block:'start'});});
    article.append(element('small',`${record.kind} / ${record.status}`),element('h2'));article.lastChild.append(button);
    article.append(element('p',record.summary));results.append(article);
  }
  const chosen=index.records.find(r=>r.id===params.get('record')) || (!input.value&&index.records.find(r=>r.id==='result:thue-morse-reduced-abelian-odd')) || matches[0];
  if(chosen)select(chosen,false);else {
    detail.replaceChildren(element('h2','No indexed match'),element('p','An absent record means not indexed here, not that a problem is unsolved.'));
    document.getElementById('discovery-map').replaceChildren();document.getElementById('research-chain').replaceChildren();document.getElementById('map-status').textContent='';
  }
}
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(!index)return;const u=new URL(location.href);u.searchParams.set('q',input.value);u.searchParams.delete('record');history.pushState(null,'',u);render();});
window.addEventListener('popstate',()=>{if(index)render();});
try {
  const response=await fetch('api/v1/index.json');if(!response.ok)throw new Error('Index unavailable');
  index=await response.json();
  for(const path of index.research_paths || []) {const button=element('button',path.title.split(':')[0]);button.type='button';button.onclick=()=>select(index.records.find(r=>r.id===path.result));document.getElementById('research-paths').append(button);}
  render();
} catch {status.textContent=t('Research index unavailable. Please try again later.');}
