import {t,ready} from './i18n.mjs';
await ready;
const root=document.querySelector('.curated-collection');
if(root) {
  const cards=[...root.querySelectorAll('[data-curated-question]')];
  const input=root.querySelector('#curated-search'),more=root.querySelector('#curated-more'),reset=root.querySelector('#curated-reset');
  let field='',source='',limit=6;
  function render(){
    const words=input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches=cards.filter(c=>(!field||c.dataset.field===field)&&(!source||c.dataset.collection===source)&&words.every(word=>`${c.dataset.search} ${c.textContent}`.toLocaleLowerCase().includes(word)));
    const visible=new Set(matches.slice(0,limit));
    for(const card of cards)card.hidden=!visible.has(card);
    for(const b of root.querySelectorAll('[data-curated-field]'))b.setAttribute('aria-pressed',String(b.dataset.curatedField===field));
    for(const b of root.querySelectorAll('[data-curated-source]'))b.setAttribute('aria-pressed',String(b.dataset.curatedSource===source));
    root.querySelector('#curated-count').textContent=t('{0} of {1} questions',Math.min(limit,matches.length),matches.length);
    root.querySelector('#curated-empty').hidden=matches.length>0;
    more.hidden=matches.length<=limit;
    reset.hidden=!field&&!source&&!words.length;
  }
  function reveal(){
    let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
    const params=new URLSearchParams(location.hash.slice(1)),question=params.get('rp');
    if(params.has('q')||params.has('node')){field='';source='';input.value=params.get('q')||params.get('node')||'';limit=6;render();return;}
    if(id==='curated-bibliography'){field='';source='papers';input.value='';limit=6;render();root.scrollIntoView({block:'start'});return;}
    const target=document.getElementById(question ? `question-${question}` : id)||document.getElementById(`direction-${question}`);
    const card=target?.closest('[data-curated-question]');
    if(!card)return;
    field='';source='';input.value='';limit=Math.max(6,cards.indexOf(card)+1);render();
    card.querySelector('.curated-detail').open=true;
    if(target.tagName==='DETAILS')target.open=true;
    requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
  }
  root.querySelector('.curated-tools').hidden=false;
  for(const button of root.querySelectorAll('[data-curated-field]'))button.onclick=()=>{field=button.dataset.curatedField;limit=6;render();};
  for(const button of root.querySelectorAll('[data-curated-source]'))button.onclick=()=>{source=button.dataset.curatedSource;limit=6;render();};
  input.oninput=()=>{limit=6;render();};
  more.onclick=()=>{limit+=6;render();};
  reset.onclick=()=>{field='';source='';input.value='';limit=6;render();};
  addEventListener('hashchange',reveal);
  render();reveal();
}
