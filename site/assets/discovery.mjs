import {search, connections} from './discovery-core.mjs';
const element = (tag, text) => {const node=document.createElement(tag); if(text)node.textContent=text; return node;};
const link = (text, url) => {const a=element('a',text);a.href=url;return a;};
const status=document.getElementById('discovery-status'), input=document.getElementById('discovery-query');
const results=document.getElementById('discovery-results'), detail=document.getElementById('discovery-detail');
let index;
function select(record) {
  const url=new URL(location.href);url.searchParams.set('record',record.id);history.replaceState(null,'',url);
  for(const item of results.children)item.dataset.selected=String(item.dataset.id===record.id);
  detail.replaceChildren(element('p',record.kind.toUpperCase()),element('h2',record.title),element('p',record.summary));
  if(record.kind==='result')detail.append(element('strong',record.status==='proved'?'Proved: reviewed pinned result':'Refuted: reviewed pinned result'));
  if(record.scope)detail.append(element('p',record.scope));
  detail.append(link('Read full record',record.url));
  if(record.evidence?.lean_url) {const p=element('p');p.append(link('Exact Lean source',record.evidence.lean_url));detail.append(p);}
  if(record.evidence?.source_commit)detail.append(element('p','Proof source commit: '+record.evidence.source_commit));
  const edges=connections(index,record.id);
  detail.append(element('h3',`Research connections (${edges.length})`));
  for(const edge of edges) {
    const section=element('section');section.className='connection';
    const label=element('p',(edge.outgoing?'To: ':'From: ')+edge.kind.replaceAll('_',' '));label.className='eyebrow';
    const button=element('button',edge.neighbor.title);button.type='button';button.addEventListener('click',()=>select(edge.neighbor));
    section.append(label,button,element('p',edge.scope),link('Relationship source',edge.evidence_url));detail.append(section);
  }
  if(!edges.length)detail.append(element('p','No curated connections indexed yet.'));
}
function render() {
  const params=new URLSearchParams(location.search);input.value=params.get('q') || '';
  const matches=search(index,input.value);results.replaceChildren();
  status.textContent=`${matches.length} ${matches.length===1?'record':'records'} found${matches.length>60?' (first 60 shown)':''}`;
  for(const record of matches.slice(0,60)) {
    const article=element('article');article.dataset.id=record.id;
    const button=element('button',record.title);button.type='button';button.addEventListener('click',()=>select(record));
    article.append(element('small',`${record.kind} / ${record.status}`),element('h2'));article.lastChild.append(button);
    article.append(element('p',record.summary));results.append(article);
  }
  const chosen=index.records.find(r=>r.id===params.get('record')) || matches[0];
  if(chosen)select(chosen);else detail.replaceChildren(element('h2','No indexed match'),element('p','An absent record means not indexed here, not that a problem is unsolved.'));
}
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(!index)return;const u=new URL(location.href);u.searchParams.set('q',input.value);u.searchParams.delete('record');history.pushState(null,'',u);render();});
window.addEventListener('popstate',()=>{if(index)render();});
try {
  const response=await fetch('api/v1/index.json');if(!response.ok)throw new Error('Index unavailable');
  index=await response.json();render();
} catch {status.textContent='Research index unavailable. Please try again later.';}
