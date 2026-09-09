import { STATES, EDGE_KINDS, inflate, sourceURL, readRoute, routeURL, counts,
  indexGraph, closure, commonInputs, reuse, layout, expandFamily, validateNotebook } from './millennium-core.mjs';
import { t, localizeData, ready, canonicalText } from './i18n.mjs';
await ready;

const KEY = 'trureturing.millennium.notebook.v1';
const DIRECTIONS = { unassessed: 'Unassessed', conditional: 'Conditional bridge', candidate: 'Candidate script', identity: 'Root statement' };
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = t(text); if (cls) n.className = cls; return n; };
const link = (text, href) => Object.assign(el('a', text), { href });
const button = (text, action, cls) => { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; };
const svgEl = (tag, attrs = {}, text) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,t(v)); if (text) n.textContent = t(text); return n; };
let cataloguePromise;
function loadData() {
  return cataloguePromise ||= fetch(new URL('./millennium-data.json', import.meta.url), { signal: AbortSignal.timeout(15000) })
    .then(response => { if (!response.ok) throw new Error(t("Catalogue HTTP {0}", response.status)); return response.json(); }).then(raw => inflate(localizeData(raw)));
}
function stylesheet() {
  if (document.querySelector('[data-millennium-style]')) return;
  const css = el('link'); css.rel = 'stylesheet'; css.href = new URL('./millennium.css', import.meta.url).href;
  css.dataset.millenniumStyle = ''; document.head.append(css);
}
function sourceLinks(data, ids, line) {
  const list = el('div', undefined, 'mm-sources');
  for (const id of new Set(ids)) {
    const s = data.sources[id], url = sourceURL(s) + (line && id === 'atlas' ? `#L${line}` : '');
    const a = link(s.label, url); a.target = '_blank'; a.rel = 'noopener noreferrer'; list.append(a);
    if (s.kind === 'repo') {
      list.append(el('small', `${s.commit.slice(0,12)} · ${s.path}`));
      if (s.pr) list.append(link(t("View live status of PR #{0}", s.pr), `https://github.com/${s.repo}/pull/${s.pr}`));
    }
  }
  return list;
}
export async function mountMillenniumEntry() {
  const home = document.querySelector('.research-home');
  if (!home || document.getElementById('millennium-entry')) return;
  stylesheet();
  const section = el('section', undefined, 'mm-entry'); section.id = 'millennium-entry';
  const title = el('h2', 'Millennium Problems'); title.id = 'millennium-entry-title';
  section.setAttribute('aria-labelledby', title.id);
  section.append(el('p', 'CONJECTURES / DEDICATED RESEARCH MAPS', 'mm-eyebrow'), title,
    el('p', 'One research map for each problem. Inspect known objects, missing bridges, and prerequisites shared by different routes.'),
    link('Open the RH research DAG', 'millennium.html?problem=rh'));
  const anchor = home.querySelector('.conjecture-destinations') || home.querySelector('.page-heading');
  if (anchor) anchor.after(section); else home.prepend(section);
  try {
    const data = await loadData(), cards = el('nav', undefined, 'mm-entry-cards'); cards.setAttribute('aria-label','Millennium problem maps');
    for (const p of data.problems) {
      const a = link('', `millennium.html?problem=${p.id}`);
      a.append(el('strong', p.title), el('span', p.id === 'rh' ? t('{0} specifications · {1} families', p.formulations.length, p.families.length) : 'Independent starter map · Repository inventory pending'));
      if (p.scientific_state === 'solved') a.append(el('small', 'Solved in the mathematical literature: Poincare'));
      cards.append(a);
    }
    section.append(cards, el('small', 'This manual catalogue and its candidate states do not change the Truth release. High-reuse nodes are not automatically mathematical fixed points.'));
  } catch {
    section.append(el('p', t("The catalogue is temporarily unavailable. You can still browse the question library and released proofs."), 'mm-warning'));
  }
}
export async function mountMillennium() {
  const root = document.getElementById('mm-app'); if (!root) return;
  stylesheet();
  let data;
  try { data = await loadData(); }
  catch (error) {
    root.replaceChildren(el('h1', t("Research map unavailable")), el('p', error.message, 'mm-warning'),
      link(t("Back to Conjectures"), 'conjectures.html'), el('p', t("A catalogue loading failure does not change released proofs or existing notes.")));
    root.setAttribute('role','alert'); return;
  }
  let route = readRoute(location.href, data), zoom = 0.85, autoZoom = true, overview = 'highlights';
  let notebook = { schema:'pages-millennium-notebook.v1', revision:data.revision, entries:{} }, storageMessage = '';
  let maySave = true;
  let compare = ['F02','F04'];
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { notebook = validateNotebook(JSON.parse(saved), data); if (notebook.revision !== data.revision) storageMessage = t("The catalogue version has changed. Your notes are retained; please check their sources again."); }
  } catch { maySave = false; storageMessage = t("Previous notes or browser storage are unavailable. Changes are held in memory; export them before leaving. Unvalidated records will not be overwritten."); }

  function save() {
    if (!maySave) return false;
    try {
      const latest = localStorage.getItem(KEY);
      if (latest) {
        const parsed = validateNotebook(JSON.parse(latest), data);
        notebook.entries = {...parsed.entries, ...notebook.entries};
      }
      notebook.revision = data.revision; localStorage.setItem(KEY,JSON.stringify(notebook)); return true;
    }
    catch { storageMessage = t("Saving failed. Notes are held in memory only; export them before leaving."); maySave = false; return false; }
  }
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { const incoming = validateNotebook(JSON.parse(event.newValue), data); notebook.entries = {...notebook.entries, ...incoming.entries}; render(); }
    catch { /* Ignore malformed records from another tab. */ }
  });
  const announce = text => { const n = document.getElementById('mm-message'); if (n) n.textContent = t(text); };
  function navigate(changes, replace = false) {
    const href = routeURL(location.href, changes);
    history[replace ? 'replaceState' : 'pushState']({},'',href); route = readRoute(href,data); render();
  }
  function download() {
    const blob = new Blob([JSON.stringify(notebook,null,2)+'\n'], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = link(t("Download notes"),url); a.download='millennium-notebook.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); announce(t("Local watchlist exported. It contains no changes to proof status."));
  }
  function selectControl(id, caption, options, value, onChange) {
    const wrap = el('label',caption,'mm-field'); wrap.htmlFor=id;
    const select = el('select'); select.id=id;
    for (const [v,t] of options) { const o=el('option',t); o.value=v; select.append(o); }
    select.value=value; select.addEventListener('change',()=>onChange(select.value)); wrap.append(select); return wrap;
  }
  function detail(problem, graph, id) {
    const node = graph.nodes.find(n=>n.id===id) || graph.nodes.find(n=>n.id===problem.goal);
    const panel = el('aside',undefined,'mm-detail'); panel.id='mm-detail'; panel.setAttribute('aria-label',t("Selected node details"));
    panel.append(el('p',`${t(node.kind.toUpperCase())} / ${node.id}`,'mm-eyebrow'),el('h2',node.title),el('span',t(STATES[node.state]),`mm-badge mm-state-${node.state}`),el('p',node.summary));
    if (node.state === 'source') panel.append(el('p',t("Locating source code does not imply kernel verification here or inclusion in the current Truth release."),'mm-fine'));
    if (node.state === 'candidate') panel.append(el('p',t("Candidate scripts retain their original assumptions. This map has neither rerun Lean nor attached a verification receipt."),'mm-fine'));
    const formulation = node.formulation;
    if (formulation) {
      const labels = el('div',undefined,'mm-directions');
      labels.append(el('p',t("RH ⇒ this statement: {0}", t(DIRECTIONS[formulation.forward]))),el('p',t("This statement ⇒ RH: {0}", t(DIRECTIONS[formulation.reverse]))));
      panel.append(labels,el('p',t("This is a specification summary. See the pinned theory volume for complete functions, domains, quantifiers and references."),'mm-fine'));
      if (formulation.state==='preprint') panel.append(el('p',t("{0} is a preprint specification; independent verification remains pending.", formulation.id),'mm-warning'));
      panel.append(sourceLinks(data,[formulation.source,...(formulation.proof_sources||[])],formulation.line));
    } else panel.append(sourceLinks(data,node.sources));
    const family = problem.families.find(f=>f.node===id);
    if (family) panel.append(el('h3',t("Next analytic obligation")),el('p',family.gap),button(t("View all specifications in this family"),()=>navigate({view:'catalogue',family:family.id,node:family.node,q:''})));
    const incident=graph.edges.filter(e=>e.to===node.id || e.from===node.id);
    const relations=el('details'); relations.append(el('summary',t("Connections and evidence ({0})", incident.length)));
    for (const e of incident) {
      const other=e.from===node.id?e.to:e.from;
      const row=el('div',undefined,'mm-relation');
      row.append(button(`${e.to===node.id?t('Prerequisite'):t('Successor')} · ${graph.nodes.find(n=>n.id===other).title}`,()=>navigate({node:other})),el('small',`${t(EDGE_KINDS[e.kind])}: ${t(e.reason)}`));
      relations.append(row);
    }
    panel.append(relations);
    const key=`${problem.id}:${node.id}`, existing=notebook.entries[key] || {note:'',starred:false};
    const notebookBox=el('section',undefined,'mm-note'); notebookBox.append(el('h3',t("Stable core candidates / Local notes")));
    notebookBox.append(el('p',t("Mark reusable anchors first. A mathematical fixed point also needs a map T, a state space, T(x)=x and a definition of stability."),'mm-fine'));
    notebookBox.append(button(existing.starred?t("Remove from watchlist"):t("Add to watchlist"),()=>{
      const current=notebook.entries[key] || existing; notebook.entries[key]={...current,starred:!current.starred}; save(); render();
    },'mm-star'));
    const label=el('label',t("Research notes")); label.htmlFor='mm-note-text';
    const input=el('textarea'); input.id='mm-note-text'; input.maxLength=5000; input.rows=4;
    input.placeholder=t("Which routes reuse this? Which map and stability theorem are needed?"); input.value=existing.note;
    input.addEventListener('input',()=>{
      notebook.entries[key]={note:input.value,starred:notebook.entries[key]?.starred || false};
      const ok=save(); announce(ok?t("Notes saved in this browser; proof status is unchanged."):storageMessage);
    });
    notebookBox.append(label,input,button(t("Export watchlist"),download)); panel.append(notebookBox);
    return panel;
  }
  function renderGraph(problem, graph, visible, common = new Set()) {
    const frame=el('section',undefined,'mm-graph-section'), controls=el('div',undefined,'mm-graph-controls');
    const scroll=el('div',undefined,'mm-graph-scroll'); scroll.id='mm-graph-scroll'; scroll.tabIndex=0;
    scroll.setAttribute('aria-label',t("Research DAG. Drag the background, scroll or use the zoom controls. Nodes are also accessible in the list below."));
    const {positions,width,height}=layout(graph,visible);
    const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':t("{0} research DAG", problem.title)});
    const description=svgEl('desc',{},t("From left to right: curated research support and missing bridges. Edges do not certify completed proofs.")); svg.append(description);
    const defs=svgEl('defs'), marker=svgEl('marker',{id:'mm-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
    marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'currentColor'})); defs.append(marker);svg.append(defs);
    let focus=new Set();
    if (route.node!==problem.goal && graph.nodes.some(n=>n.id===route.node)) focus=new Set([...closure(graph,[route.node]).ids,...closure(graph,[route.node],'children').ids]);
    for (const e of graph.edges) if (visible.has(e.from)&&visible.has(e.to)) {
      const a=positions.get(e.from),b=positions.get(e.to),start=a.x+236,end=b.x,mid=(start+end)/2;
      const path=svgEl('path',{d:`M${start},${a.y+37} C${mid},${a.y+37} ${mid},${b.y+37} ${end},${b.y+37}`,class:`mm-edge mm-edge-${e.kind}${focus.size&&!(focus.has(e.from)&&focus.has(e.to))?' mm-dim':''}`,'marker-end':'url(#mm-arrow)'});
      path.append(svgEl('title',{},`${e.from} → ${e.to} / ${t(EDGE_KINDS[e.kind])} / ${t(e.reason)}`)); svg.append(path);
    }
    const g=indexGraph(graph);
    for (const node of graph.nodes.filter(n=>visible.has(n.id))) {
      const pos=positions.get(node.id),group=svgEl('g',{transform:`translate(${pos.x},${pos.y})`,role:'button',tabindex:0,
        'data-mm-node':node.id,'aria-label':`${node.title}, ${t(STATES[node.state])}`,'aria-pressed':String(node.id===route.node),
        class:`mm-node mm-state-${node.state}${node.id===route.node?' mm-selected':''}${common.has(node.id)?' mm-common':''}${focus.size&&!focus.has(node.id)?' mm-dim':''}`});
      group.append(svgEl('rect',{width:236,height:74,rx:10}),svgEl('title',{},`${node.title} / ${t(node.summary)}`));
      const label=svgEl('text',{x:14,y:24,class:'mm-node-title'}), chars=[...node.title];
      const lines=chars.length>23?[chars.slice(0,23).join(''),chars.slice(23,46).join('')+(chars.length>46?'…':'')]:[node.title];
      lines.forEach((line,i)=>label.append(svgEl('tspan',{x:14,dy:i?18:0},line)));group.append(label);
      group.append(svgEl('text',{x:14,y:61,class:'mm-node-state'},`${node.id} · ${t(STATES[node.state])}`));
      group.addEventListener('click',()=>navigate({node:node.id}));
      group.addEventListener('keydown',event=>{
        if (['Enter',' '].includes(event.key)) { event.preventDefault(); navigate({node:node.id}); }
        if (['ArrowLeft','ArrowRight'].includes(event.key)) {
          event.preventDefault(); const next=g[event.key==='ArrowLeft'?'parents':'children'].get(node.id).find(n=>visible.has(n));
          if (next) svg.querySelector(`[data-mm-node="${next}"]`)?.focus();
        }
      });svg.append(group);
    }
    scroll.append(svg);
    const scaleLabel=el('span');
    const applyZoom=()=>{svg.style.width=`${width*zoom}px`;svg.style.height=`${height*zoom}px`;scroll.style.height=`${Math.max(250,Math.min(550,height*zoom+20))}px`;scaleLabel.textContent=`${Math.round(zoom*100)}%`;};
    controls.append(button(t("Zoom out"),()=>{autoZoom=false;zoom=Math.max(.3,zoom-.15);applyZoom();}),scaleLabel,button(t("Zoom in"),()=>{autoZoom=false;zoom=Math.min(2,zoom+.15);applyZoom();}),
      button(t("Fit to width"),()=>{autoZoom=false;zoom=Math.max(.3,Math.min(1,scroll.clientWidth/width));applyZoom();}),
      button(t("Reset"),()=>{autoZoom=true;zoom=Math.min(1,Math.max(.7,scroll.clientWidth/width));applyZoom();scroll.scrollTo(0,0);}),el('small',t("{0} visible nodes · Select a criterion family to focus the routes", visible.size)));
    let drag;
    scroll.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.target.closest('[data-mm-node]')||event.button!==0)return;
      drag={x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(event.pointerId);});
    scroll.addEventListener('pointermove',event=>{if(!drag)return;scroll.scrollLeft=drag.left+drag.x-event.clientX;scroll.scrollTop=drag.top+drag.y-event.clientY;});
    scroll.addEventListener('pointerup',()=>{drag=null;});scroll.addEventListener('pointercancel',()=>{drag=null;});
    const list=el('details',undefined,'mm-node-list');list.append(el('summary',t("Browse these {0} nodes as a list", visible.size)));
    const choices=el('div');
    for(const n of graph.nodes.filter(n=>visible.has(n.id)))choices.append(button(`${n.title} · ${t(STATES[n.state])}`,()=>navigate({node:n.id})));
    list.append(choices);frame.append(controls,scroll,list);applyZoom();requestAnimationFrame(()=>{if(autoZoom&&scroll.isConnected){zoom=Math.min(1,Math.max(.7,scroll.clientWidth/width));applyZoom();}});return frame;
  }
  function renderCatalogue(problem) {
    const host=el('section',undefined,'mm-catalogue');
    host.append(el('h2',t("Equivalent formulations")),el('p',t("Counts follow the theory volume, including parameter families and derived expressions. Both proof directions are tracked separately; unassessed does not mean absent from the repository."),'mm-fine'));
    const q=route.q.toLocaleLowerCase();
    const rows=problem.formulations.filter(f=>(!route.family||f.family===route.family)&&`${f.id} ${f.title} ${canonicalText(f.title)} ${f.family}`.toLocaleLowerCase().includes(q));
    host.append(el('p',t("{0} / {1} specifications", rows.length, problem.formulations.length),'mm-result-count'));
    if(!rows.length)host.append(el('p',problem.coverage==='starter'?t("No equivalent-formulation catalogue has been entered for this problem. Nodes in the map do not imply completed formalization."):t("No matches. Clear the search or criterion family filter."),'mm-empty'));
    for(const f of rows){
      const card=el('article',undefined,'mm-spec-card');
      card.append(el('p',`${f.id} / ${f.family}${f.state==='preprint'?t(' / Preprint: verification pending'):''}`,'mm-eyebrow'),el('h3',f.title));
      card.append(el('p',t("RH ⇒ this statement: {0} · This statement ⇒ RH: {1}", t(DIRECTIONS[f.forward]), t(DIRECTIONS[f.reverse])),'mm-directions'));
      card.append(link(t("Full objects, quantifiers and references"),sourceURL(data.sources[f.source])+`#L${f.line}`),
        button(t("View in DAG"),()=>navigate({view:'map',node:f.id===problem.root_formulation?problem.goal:f.id,family:f.family,specs:'1',q:''})));
      host.append(card);
    }
    const gaps=el('details',undefined,'mm-gaps');gaps.append(el('summary',t("Literature coverage remains open: {0} known gap groups", problem.gaps.length)));
    for(const gap of problem.gaps)gaps.append(el('p',`${gap.id} · ${gap.title}`));
    if(problem.gaps.length)gaps.append(sourceLinks(data,['atlas']));host.append(gaps);return host;
  }
  function render() {
    const oldNode=document.activeElement?.getAttribute('data-mm-node');
    const oldFocus=document.activeElement?.id, oldStart=document.activeElement?.selectionStart;
    const oldScroll=document.getElementById('mm-graph-scroll');const savedScroll=oldScroll?{left:oldScroll.scrollLeft,top:oldScroll.scrollTop}:null;
    const p=data.problems.find(p=>p.id===route.problem);
    let graph=(route.specs&&route.family)?expandFamily(p,route.family):p;
    const shell=el('div',undefined,'mm-layout'),nav=el('nav',undefined,'mm-problems');nav.setAttribute('aria-label',t("Millennium Problems"));
    nav.append(el('p','SEVEN PROBLEMS','mm-eyebrow'));
    for(const item of data.problems){
      const a=link('',routeURL(location.href,{problem:item.id,view:'map',node:'',family:'',specs:'',q:''}));
      a.append(el('strong',item.subtitle),el('small',item.title));if(item.id===p.id)a.setAttribute('aria-current','page');
      a.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();overview='highlights';navigate({problem:item.id,view:'map',node:'',family:'',specs:'',q:''});});nav.append(a);
    }
    const stars=Object.entries(notebook.entries).filter(([,n])=>n.starred);
    const starBox=el('details',undefined,'mm-watchlist');starBox.append(el('summary',t("Local watchlist ({0})", stars.length)));
    for(const [key] of stars){const [pid,nid]=key.split(':');const op=data.problems.find(p=>p.id===pid);const n=op.nodes.find(n=>n.id===nid)||op.formulations.find(f=>f.id===nid);
      if(n)starBox.append(button(n.title,()=>navigate({problem:pid,node:nid,view:'map',family:n.family||'',specs:n.family?'1':''})));}
    starBox.append(button(t("Export notes"),download));nav.append(starBox);
    const main=el('div',undefined,'mm-main'),head=el('header',undefined,'mm-heading');
    head.append(el('p','CONJECTURES / MILLENNIUM RESEARCH MAP','mm-eyebrow'),el('h1',p.title),el('p',p.summary,'mm-lede'));
    const science=el('p',p.scientific_state==='solved'?t("Mathematical literature: solved (Poincaré) · Project formalization: not yet inventoried"):t("Mathematical literature: open problem · Project progress is recorded by the evidence below"),'mm-science');
    science.append(document.createTextNode('　'),link(t("Original Clay problem"),sourceURL(data.sources[p.sources[0]])));head.append(science);
    const c=counts(p),stats=el('div',undefined,'mm-stats');
    for(const [value,label] of [[c.specifications,t("Catalogued specifications")],[c.families,t("Criterion families")],[c.states.source,t("Nodes with located source")],[c.states.candidate,t("Candidate script nodes")]]){
      const stat=el('div');stat.append(el('strong',String(value)),el('span',label));stats.append(stat);
    }
    const progress=el('section',undefined,'mm-progress');
    [[c.states.source,t("Source located"),t("Traceable to a pinned commit; not reverified on this page")],[c.states.candidate,t("Candidate bridges"),t("Candidate scripts or research connections exist; complete proofs remain pending")],[c.states.open,t("Open gaps"),t("Explicit analytic or formalization obligations")]].forEach(([value,label,note])=>{const card=el('article');card.append(el('strong',String(value)),el('span',label),el('span',note));progress.append(card);});
    main.append(head,stats,progress,el('p',t("Curated snapshot {0} · {1}. This map has no kernel verification receipt and does not report an RH completion percentage.", data.reviewed, data.revision),'mm-boundary'));
    if(p.coverage==='starter')main.append(el('p',t("This is a sourced starter map of the problem structure. Source code, equivalent formulations and proof dependencies have not yet been inventoried; progress on other problems does not establish completion here."),'mm-warning'));
    const tabs=el('nav',undefined,'mm-tabs');tabs.setAttribute('aria-label',t("Research map views"));
    for(const [id,label] of [['map',t("Route DAG")],['catalogue',t("Equivalence catalogue")],['shared',t("Shared core")]]){
      const b=button(label,()=>navigate({view:id, ...(id === 'shared' ? {node:p.goal, family:'', specs:''} : {})}),route.view===id?'mm-active':'');b.setAttribute('aria-current',route.view===id?'page':'false');tabs.append(b);
    }main.append(tabs);
    const tools=el('div',undefined,'mm-tools');
    if(route.view!=='shared'){
      tools.append(selectControl('mm-family',t("Criterion families"),[['',t("All criterion families")],...p.families.map(f=>[f.id,`${f.id} · ${f.title}`])],route.family,value=>navigate({family:value,node:value||p.goal,specs:'',q:''})));
      if(route.view==='map'){
        tools.append(selectControl('mm-scope',t("Map scope"),[['highlights',t("Highlighted routes")],['all',t("All routes")]],overview,value=>{overview=value;render();}));
        const lab=el('label',undefined,'mm-checkbox'),cb=el('input');cb.type='checkbox';cb.id='mm-specs';cb.checked=route.specs;cb.disabled=!route.family;
        cb.addEventListener('change',()=>navigate({specs:cb.checked?'1':'',node:route.family||p.goal}));lab.append(cb,document.createTextNode(t("Expand specification nodes in the selected family")));tools.append(lab);
      }
      const lab=el('label',t("Find a specification"),'mm-field');lab.htmlFor='mm-search';const search=el('input');search.id='mm-search';search.type='search';search.value=route.q;
      search.placeholder='5040, A045, Li, Nyman…';search.maxLength=160;
      search.addEventListener('input',()=>navigate({q:search.value,view:'catalogue'},true));lab.append(search);tools.append(lab);
      tools.append(button(t("Clear filters"),()=>navigate({q:'',family:'',node:p.goal,specs:''})));
    }
    main.append(tools);
    const content=el('div',undefined,'mm-content');
    if(route.view==='catalogue')content.append(renderCatalogue(p));
    else {
      let visible=new Set(graph.nodes.map(n=>n.id)),common=new Set();
      if(route.view==='shared'){
        if(p.families.length>=2){
          compare=compare.map((id,i)=>p.families.some(f=>f.id===id)?id:p.families[i].id);
          for(let i=0;i<2;i++)tools.append(selectControl(`mm-compare-${i}`,i?t("Route B"):t("Route A"),p.families.map(f=>[f.id,`${f.id} · ${f.title}`]),compare[i],v=>{compare[i]=v;render();}));
          graph=p;const a=p.families.find(f=>f.id===compare[0]).node,b=p.families.find(f=>f.id===compare[1]).node;
          const ca=closure(p,[a]),cb=closure(p,[b]);common=commonInputs(p,a,b);
          visible=new Set([...ca.ids,...cb.ids,p.goal]);
          content.append(el('h2',t("{0} shared prerequisite nodes", common.size)),el('p',t("Highlight the common ancestors of two routes. Counts cover only this curated graph, including missing connections; they are neither repository-wide reference counts nor proven implications."),'mm-fine'));
          const fixed=el('details');fixed.append(el('summary',t("Inspect convergence of the structural closure")),el('p',t("The prerequisite closures stop adding nodes after {0} and {1} expansion rounds. The fixed point of C(S)=S∪Pred(S) on a finite graph is a reachability closure, not a fixed-point proof for RH, an operator or a dynamical system.", ca.rounds.length-1, cb.rounds.length-1)));content.append(fixed);
        }else content.append(el('p',t("Research routes for this problem have not yet been inventoried. Shared prerequisites and reuse rankings are not available."),'mm-empty'));
      } else if(route.family){
        const leaves=graph.nodes.filter(n=>n.formulation?.family===route.family).map(n=>n.id);
        visible=closure(graph,leaves.length?leaves:[route.family]).ids;visible.add(p.goal);
      } else if(overview==='highlights' && p.highlights.length){
        visible=closure(graph,p.highlights).ids;visible.add(p.goal);
        if(route.node!==p.goal)for(const id of closure(graph,[route.node]).ids)visible.add(id);
      }
      const legend=el('div',undefined,'mm-legend');
      for(const [state,label] of Object.entries(STATES).filter(([s])=>s!=='verified'))legend.append(el('span',label,`mm-badge mm-state-${state}`));
      content.append(legend,el('p',t("Arrows: research support → missing bridges → criterion families → goal. Dashed lines mark connections to build; dotted lines organize the problem. Equivalences are not drawn as cycles and do not automatically propagate proven status."),'mm-fine'));
      const detailId = graph.nodes.some(n => n.id === route.node) ? route.node : p.goal;
      const work=el('div',undefined,'mm-work');work.append(renderGraph(p,graph,visible,common),detail(p,graph,detailId));content.append(work);
      if(route.view==='shared' && p.coverage==='curated'){
        const list=el('section',undefined,'mm-reuse');list.append(el('h2',t("Reusable nodes ranked by reachable criterion families")),el('p',t("Counts include distinct criterion families reachable through curated connections, including missing bridges. They do not certify stability over time or mathematical fixed points."),'mm-fine'));
        for(const row of reuse(p)){const b=button('',()=>navigate({node:row.node.id,view:'map',family:'',specs:''}));b.append(el('strong',row.node.title),el('span',t("{0} reachable criterion families", row.families.length)));list.append(b);}content.append(list);
      }
    }
    main.append(content);
    const provenance=el('details',undefined,'mm-provenance');provenance.append(el('summary',t("Editorial maintenance, source snapshots and update history")),el('p',t("Edit site/assets/millennium-data.json and run graph validation tests. Source locations, candidate scripts, literature specifications and verification receipts are maintained separately; these records do not rewrite the upstream Truth release.")));
    for(const event of p.history)provenance.append(el('p',`${event.date} · ${event.title}`));provenance.append(sourceLinks(data,p.sources));main.append(provenance);
    const message=el('p',storageMessage||t("Select a node to inspect assumptions, source code and proof gaps. The watchlist is stored only in this browser."),'mm-message');message.id='mm-message';message.setAttribute('role','status');main.append(message);
    shell.append(nav,main);root.replaceChildren(shell);document.title=`${p.title} | Millennium Research | trureturing`;
    if(savedScroll){const sc=document.getElementById('mm-graph-scroll');if(sc){sc.scrollLeft=savedScroll.left;sc.scrollTop=savedScroll.top;}}
    if(oldNode)root.querySelector(`[data-mm-node="${oldNode}"]`)?.focus({preventScroll:true});
    if(oldFocus){const target=document.getElementById(oldFocus);if(target){target.focus({preventScroll:true});if(oldStart!==null&&oldStart!==undefined&&target.type==='search')target.setSelectionRange?.(oldStart,oldStart);}}
  }
  window.addEventListener('popstate',()=>{route=readRoute(location.href,data);render();});render();
}
if (typeof document !== 'undefined' && document.getElementById('mm-app')) mountMillennium();
