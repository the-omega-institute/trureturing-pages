import {loadFoundations, coreModules, coreOverview, focusGraph, shortestPaths, dependencyPath, findModules, fullAtlasURL} from './foundations-core.mjs';
import {ready, t} from './i18n.mjs';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const source = (tag,text,cls) => {const n=el(tag,text,cls);n.setAttribute('translate','no');return n;};
const button = (text,cls,click) => {const n=el('button',text,cls);n.type='button';n.onclick=click;return n;};
const link = (text,href) => {const n=el('a',t(text));n.href=href;return n;};
const fmt = n => n.toLocaleString();
const NS='http://www.w3.org/2000/svg';
const svg = (tag, attrs={}, text) => {const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let model, manifest, selected=null, target=null, direction='downstream', mode='shared', scale=1, scene, layout, timing;
let rankLimit=8, reachLimit=8, reachQuery='';
const modeLabels={shared:'Shared foundations',roots:'Starting points',direct:'Direct reuse'};

function readRoute() {
  const q=new URLSearchParams(location.hash.slice(1));
  mode=Object.hasOwn(modeLabels,q.get('perspective'))?q.get('perspective'):'shared';
  selected=model.byId.has(q.get('foundation'))?q.get('foundation'):null;
  direction=q.get('direction')==='upstream'?'upstream':'downstream';
  target=selected&&shortestPaths(model,selected,direction).has(q.get('target'))?q.get('target'):null;
}
function route() {
  const q=new URLSearchParams();
  if(mode!=='shared')q.set('perspective',mode);
  if(selected)q.set('foundation',selected);
  if(target)q.set('target',target);
  if(direction!=='downstream')q.set('direction',direction);
  history.replaceState(null,'',location.pathname+location.search+(q.size?'#'+q:''));
}
function select(id) {
  selected=id;target=null;direction='downstream';reachLimit=8;reachQuery='';
  $('foundation-search-results').hidden=true;
  render();route();
}
function overview() {selected=null;target=null;render();route();}
function moduleRow(node, handler=()=>select(node.id), subtitle=null) {
  const row=button('', 'foundation-row',handler),copy=el('span');
  row.dataset.module=node.id;
  copy.append(source('strong',node.title),el('small',subtitle || t('{0} downstream modules · {1} source domains',fmt(node.reach),node.coverage)));
  row.append(copy,el('b',mode==='direct'?fmt(node.direct):fmt(node.reach)));return row;
}

function wrapTitle(text, width=26) {
  const lines=[];let current='';
  for(const word of text.split(/\s+/)) {
    if(current && (current+' '+word).length>width){lines.push(current);current=word;}else current+=(current?' ':'')+word;
  }
  if(current)lines.push(current);
  return lines.length>3?[...lines.slice(0,2),lines[2].slice(0,23)+'…']:lines;
}
function drawMap() {
  const root=$('foundation-map');root.replaceChildren();
  if(!scene.nodes.length)return;
  if(!window.dagre)throw Error('The dependency map could not start.');
  const graph=new window.dagre.graphlib.Graph().setGraph({rankdir:'LR',ranksep:52,nodesep:20,marginx:24,marginy:24}).setDefaultEdgeLabel(()=>({}));
  for(const n of scene.nodes)graph.setNode(n.id,{width:200,height:98});
  for(const [a,b] of scene.edges)graph.setEdge(a,b);
  window.dagre.layout(graph);
  layout=graph.graph();
  const canvas=svg('svg',{viewBox:`0 0 ${layout.width} ${layout.height}`,'aria-label':t('Released module dependencies')});
  const defs=svg('defs'),marker=svg('marker',{id:'foundation-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'});
  marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 Z',fill:'#a7c1a2'}));defs.append(marker);canvas.append(defs);
  const pathPairs=new Set((scene.path||[]).slice(1).map((id,i)=>JSON.stringify([scene.path[i],id])));
  for(const [a,b] of scene.edges) {
    const points=graph.edge(a,b).points;
    const path=svg('path',{d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '),
      class:'core-edge'+(pathPairs.has(JSON.stringify([a,b]))?' path-edge':''),'marker-end':'url(#foundation-arrow)'});
    path.append(svg('title',{},`${model.byId.get(a).title} → ${model.byId.get(b).title}`));canvas.append(path);
  }
  for(const n of scene.nodes) {
    const p=graph.node(n.id),active=n.id===selected,rootNode=!model.parents.get(n.id).length;
    const group=svg('g',{transform:`translate(${p.x-100} ${p.y-49})`,role:'button',tabindex:0,
      'aria-label':`${n.title}. ${t('{0} downstream modules',n.reach)}`, 'data-map-module':n.id,'translate':'no'});
    group.append(svg('rect',{width:200,height:98,rx:7,fill:active?'#344633':rootNode?'#243a2b':'#192a22',stroke:active?'#e4d08d':rootNode?'#8baf7f':'#49664f','stroke-width':active?2:1}));
    group.append(svg('rect',{x:0,y:20,width:3,height:58,rx:1,fill:active?'#e4d08d':rootNode?'#c7dfa4':'#708f79'}));
    const lines=wrapTitle(n.title);
    lines.forEach((line,i)=>group.append(svg('text',{x:14,y:23+i*16,fill:'#eaf0df','font-size':12,'font-weight':500},line)));
    group.append(svg('text',{x:14,y:84,fill:'#adc0a9','font-size':10},t('{0} downstream · {1} direct',fmt(n.reach),fmt(n.direct))));
    group.append(svg('title',{},n.title));
    group.onclick=()=>select(n.id);group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(n.id);}};
    canvas.append(group);
  }
  root.append(canvas);fit();
}
function sizeMap() {
  const canvas=$('foundation-map').querySelector('svg');if(!canvas)return;
  canvas.style.width=layout.width*scale+'px';canvas.style.height=layout.height*scale+'px';
}
function fit() {
  if(!layout)return;
  // Keep labels readable; wide structures remain scrollable at overview size.
  scale=Math.max(.72,Math.min(1,($('foundation-map').clientWidth-10)/layout.width,($('foundation-map').clientHeight-10)/layout.height));
  sizeMap();$('foundation-map').scrollTo(0,0);
}

function renderOverview(root) {
  root.append(el('p',t('STRUCTURE BEFORE SUBJECTS'),'foundation-eyebrow'),el('h2',t(modeLabels[mode])));
  root.append(el('p',t({shared:'These modules support the most other modules through recorded dependency paths. Select one to see where that support leads.',roots:'These modules have no prerequisites inside this released graph. Their external mathematical foundations may live in Mathlib.',direct:'These modules are imported most often by immediate dependents. Select one to inspect the actual connections.'}[mode])));
  const ranked=coreModules(model,mode),list=el('div',undefined,'foundation-ranking');
  for(const node of ranked.slice(0,rankLimit))list.append(moduleRow(node));
  root.append(list);
  if(rankLimit<ranked.length)root.append(button(t('Show more foundations'),'foundation-more',()=>{rankLimit+=8;renderInspector();}));
  root.append(el('p',t('{0} modules with recorded reuse. Search covers all {1} modules.',fmt(ranked.length),fmt(model.data.nodes.length))));
}
function sourceURL(node) {
  const path=node.source_path === undefined ? node.id+'.lean' : node.source_path;
  if(!/^[a-f0-9]{40}$/.test(model.data.source_commit)||! /^[A-Za-z0-9_/-][A-Za-z0-9_./-]*\.lean$/.test(path||'')||path.split('/').includes('..'))return null;
  return `https://github.com/the-omega-institute/trureturing/blob/${model.data.source_commit}/${path}`;
}
function renderInspector() {
  const root=$('foundation-inspector');root.replaceChildren();
  if(!selected){renderOverview(root);return;}
  const node=model.byId.get(selected);
  root.append(el('p',t('SELECTED STRUCTURE'),'foundation-eyebrow'),source('h2',node.title));
  if(node.summary)root.append(source('p',node.summary));
  const stats=el('div',undefined,'foundation-stats');
  for(const [label,value] of [['Downstream modules',node.reach],['Direct dependents',node.direct],['Source domains',node.coverage]]){
    const item=el('div');item.append(el('strong',fmt(value)),el('small',t(label)));stats.append(item);
  }
  root.append(stats);
  const links=el('div',undefined,'foundation-links');
  if(node.knowledge_page === undefined) {
    const read=link('Read the mathematics','knowledge/');links.append(read);
    crypto.subtle.digest('SHA-256',new TextEncoder().encode(node.id)).then(bytes=>{
      read.href=`knowledge/node/${[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')}/`;
    });
  } else if(/^knowledge\/node\/[a-f0-9]{64}\/$/.test(node.knowledge_page||''))links.append(link('Read the mathematics',node.knowledge_page));
  const url=sourceURL(node);if(url)links.append(link('Lean source',url));
  links.append(link('Full dependency graph',fullAtlasURL(node.id)),link('Evolution',`evolution.html#node=${encodeURIComponent(node.id)}`));root.append(links);
  const descendants=shortestPaths(model,node.id),domains=new Map();
  for(const id of descendants.keys())if(id!==node.id){const domain=model.byId.get(id).domain;domains.set(domain,(domains.get(domain)||0)+1);}
  if(domains.size){
    root.append(el('h3',t('REUSED ACROSS')));const chips=el('div',undefined,'foundation-chips');
    for(const [domain,count] of [...domains].sort((a,b)=>b[1]-a[1]).slice(0,8))chips.append(source('span',`${domain.replace(/([a-z])([A-Z])/g,'$1 $2')} · ${count}`));root.append(chips);
  }
  if(target){
    const path=dependencyPath(shortestPaths(model,selected,direction),target,direction);
    root.append(el('h3',t('A SHORTEST DEPENDENCY PATH')),el('p',t('{0} direct dependency steps. Every arrow is recorded in this release.',path.length-1)));
    const list=el('ol',undefined,'foundation-path-list');
    for(const id of path){const row=el('li'),b=button(model.byId.get(id).title,'',()=>select(id));b.setAttribute('translate','no');row.append(b);list.append(row);}root.append(list);
  }
  root.append(el('h3',t('EXPLORE THE CONNECTIONS')));
  const controls=el('div',undefined,'foundation-reach-controls'),selectDirection=el('select');
  selectDirection.setAttribute('aria-label',t('Dependency direction'));
  for(const [value,label] of [['downstream','Builds on this'],['upstream','This builds on']]){const option=el('option',t(label));option.value=value;selectDirection.append(option);}
  selectDirection.value=direction;
  selectDirection.onchange=()=>{direction=selectDirection.value;target=null;reachLimit=8;reachQuery='';render();route();};
  const search=el('input');search.type='search';search.placeholder=t('Find a connected module');search.setAttribute('aria-label',t('Find a connected module'));search.value=reachQuery;
  const count=el('p'),list=el('div'),more=button(t('Show more connections'),'foundation-more',()=>{reachLimit+=8;renderReach();});
  const previous=shortestPaths(model,selected,direction);
  const reachable=model.ranked.filter(n=>n.id!==selected&&previous.has(n.id));
  function renderReach(){
    const matches=findModules(reachable,reachQuery);count.textContent=t('{0} connected modules',fmt(matches.length));list.replaceChildren();
    for(const n of matches.slice(0,reachLimit))list.append(moduleRow(n,()=>{target=n.id;render();route();},t('Show dependency path · {0} steps',dependencyPath(previous,n.id,direction).length-1)));
    if(!matches.length)list.append(el('p',t('No matching connections in this released graph.')));
    more.hidden=matches.length<=reachLimit;
  }
  search.oninput=()=>{reachQuery=search.value;reachLimit=8;renderReach();};controls.append(selectDirection,search);root.append(controls,count,list,more);renderReach();
}

function render() {
  scene=selected?focusGraph(model,selected,target,direction):coreOverview(model,mode,12);
  for(const button of document.querySelectorAll('[data-core-mode]'))button.setAttribute('aria-pressed',String(button.dataset.coreMode===mode));
  $('foundation-overview').hidden=!selected;
  $('foundation-map-kicker').textContent=t(selected?'FOLLOW THE DEPENDENCIES':'THE SHARED CORE');
  $('foundation-map-title').textContent=t(target?'From foundation to consequence':selected?'What it builds on. What it enables.':'Foundations, connected.');
  $('foundation-map-caption').textContent=target?t('Every step is a direct module dependency. Select any module to explore further.'):
    selected?t('All immediate prerequisites and up to 12 immediate dependents. Search the connections to trace any reachable module.'):
      t('{0} modules in this overview. Arrows show actual dependencies; select a module to reveal its wider reach.',scene.nodes.length);
  drawMap();renderInspector();
}
function search() {
  const host=$('foundation-search-results'),query=$('foundation-query').value.trim();host.hidden=!query;host.replaceChildren();
  if(!query||!model)return;
  const matches=findModules(model.ranked,query);
  host.append(el('p',t('{0} matching modules',fmt(matches.length))));
  for(const n of matches.slice(0,12))host.append(moduleRow(n));
  if(matches.length>12)host.append(el('p',t('Refine your search to see more specific matches.')));
}

async function start() {
  const status=$('foundation-status');status.hidden=false;status.replaceChildren(el('span',t('Loading the mathematical structure…')));
  try {
    await ready;
    ({model,manifest,timing}=await loadFoundations(new URL('./',location.href)));
    readRoute();render();status.hidden=true;
    const totals=$('foundation-totals').querySelectorAll('dd');totals[0].textContent=fmt(model.data.nodes.length);totals[1].textContent=fmt(model.data.edges.length);
    $('foundation-release').textContent=t('Verified release · {0}',model.data.truth_release_digest.slice(7,19));
    $('foundation-provenance').href=`library-history.html#release=${encodeURIComponent(model.data.truth_release_digest)}`;
    timing.readyMs=performance.now();
    window.foundationDiagnostics=()=>({ready:true,selected,target,direction,mode,totalNodes:model.data.nodes.length,totalEdges:model.data.edges.length,
      shownNodes:scene.nodes.map(n=>n.id),shownEdges:scene.edges,path:scene.path||[],timing});
  } catch(error) {
    status.hidden=false;status.replaceChildren(el('p',t('The foundation map could not be loaded.')),el('p',error.message),
      button(t('Retry'),'foundation-retry',start),document.createTextNode(' '),link('Open the full Atlas','atlas-explorer.html'));
  }
}
$('foundation-query').oninput=search;
$('foundation-search').onsubmit=e=>{e.preventDefault();search();};
$('foundation-query').onkeydown=e=>{if(e.key==='Escape')$('foundation-search-results').hidden=true;};
$('foundation-overview').onclick=overview;
$('foundation-fit').onclick=fit;
$('foundation-zoom-in').onclick=()=>{scale=Math.min(2,scale*1.25);sizeMap();};
$('foundation-zoom-out').onclick=()=>{scale=Math.max(.35,scale/1.25);sizeMap();};
for(const button of document.querySelectorAll('[data-core-mode]'))button.onclick=()=>{if(!model)return;mode=button.dataset.coreMode;rankLimit=8;overview();};
window.addEventListener('hashchange',()=>{if(model){readRoute();render();}});
new ResizeObserver(()=>{if(layout)fit();}).observe($('foundation-map'));
start();
