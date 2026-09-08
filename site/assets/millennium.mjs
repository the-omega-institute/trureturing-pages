import { STATES, EDGE_KINDS, inflate, sourceURL, readRoute, routeURL, counts,
  indexGraph, closure, commonInputs, reuse, layout, expandFamily, validateNotebook } from './millennium-core.mjs';

const KEY = 'trureturing.millennium.notebook.v1';
const DIRECTIONS = { unassessed: 'Unassessed', conditional: 'Conditional bridge', candidate: 'Candidate script', identity: 'Root statement' };
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const link = (text, href) => Object.assign(el('a', text), { href });
const button = (text, action, cls) => { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; };
const svgEl = (tag, attrs = {}, text) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); if (text) n.textContent = text; return n; };
let cataloguePromise;
function loadData() {
  return cataloguePromise ||= fetch(new URL('./millennium-data.json', import.meta.url), { signal: AbortSignal.timeout(15000) })
    .then(response => { if (!response.ok) throw new Error(`目录 HTTP ${response.status}`); return response.json(); }).then(inflate);
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
      if (s.pr) list.append(link(`查看 PR #${s.pr} 的实时状态`, `https://github.com/${s.repo}/pull/${s.pr}`));
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
    el('p', '每道题一张研究图。查看已有对象、待补桥梁，以及不同路线共有的前置。'),
    link('打开 RH 研究 DAG', 'millennium.html?problem=rh'));
  const anchor = home.querySelector('.conjecture-destinations') || home.querySelector('.page-heading');
  if (anchor) anchor.after(section); else home.prepend(section);
  try {
    const data = await loadData(), cards = el('nav', undefined, 'mm-entry-cards'); cards.setAttribute('aria-label','Millennium problem maps');
    for (const p of data.problems) {
      const a = link('', `millennium.html?problem=${p.id}`);
      a.append(el('strong', p.title), el('span', p.id === 'rh' ? `${p.formulations.length} 个规格 · ${p.families.length} 个族` : '独立起始图 · 库内待盘点'));
      if (p.scientific_state === 'solved') a.append(el('small', '科学界已解决：Poincaré'));
      cards.append(a);
    }
    section.append(cards, el('small', '人工目录与候选状态不改变 Truth release。高复用节点不自动成为数学不动点。'));
  } catch {
    section.append(el('p', '目录暂不可用。现有题库与发布证明仍可正常浏览。', 'mm-warning'));
  }
}
export async function mountMillennium() {
  const root = document.getElementById('mm-app'); if (!root) return;
  stylesheet();
  let data;
  try { data = await loadData(); }
  catch (error) {
    root.replaceChildren(el('h1', '研究图暂不可用'), el('p', error.message, 'mm-warning'),
      link('返回 Conjectures', 'conjectures.html'), el('p', '目录读取失败不会改变发布证明或已有笔记。'));
    root.setAttribute('role','alert'); return;
  }
  let route = readRoute(location.href, data), zoom = 0.85, autoZoom = true, overview = 'highlights';
  let notebook = { schema:'pages-millennium-notebook.v1', revision:data.revision, entries:{} }, storageMessage = '';
  let compare = ['F02','F04'];
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { notebook = validateNotebook(JSON.parse(saved), data); if (notebook.revision !== data.revision) storageMessage = '目录版本已变化；原笔记保留，请重新核对来源。'; }
  } catch { storageMessage = '旧笔记或浏览器存储不可用。本次修改保存在内存中，请导出；不会覆盖无法验证的旧记录。'; }
  let maySave = !storageMessage.startsWith('旧笔记');
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
    catch { storageMessage = '保存失败，笔记仅在内存中。请在离开前导出。'; maySave = false; return false; }
  }
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { const incoming = validateNotebook(JSON.parse(event.newValue), data); notebook.entries = {...notebook.entries, ...incoming.entries}; render(); }
    catch { /* Ignore malformed records from another tab. */ }
  });
  const announce = text => { const n = document.getElementById('mm-message'); if (n) n.textContent = text; };
  function navigate(changes, replace = false) {
    const href = routeURL(location.href, changes);
    history[replace ? 'replaceState' : 'pushState']({},'',href); route = readRoute(href,data); render();
  }
  function download() {
    const blob = new Blob([JSON.stringify(notebook,null,2)+'\n'], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = link('下载笔记',url); a.download='millennium-notebook.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); announce('已导出本机观察清单。它不含任何证明状态修改。');
  }
  function selectControl(id, caption, options, value, onChange) {
    const wrap = el('label',caption,'mm-field'); wrap.htmlFor=id;
    const select = el('select'); select.id=id;
    for (const [v,t] of options) { const o=el('option',t); o.value=v; select.append(o); }
    select.value=value; select.addEventListener('change',()=>onChange(select.value)); wrap.append(select); return wrap;
  }
  function detail(problem, graph, id) {
    const node = graph.nodes.find(n=>n.id===id) || graph.nodes.find(n=>n.id===problem.goal);
    const panel = el('aside',undefined,'mm-detail'); panel.id='mm-detail'; panel.setAttribute('aria-label','所选节点详情');
    panel.append(el('p',`${node.kind.toUpperCase()} / ${node.id}`,'mm-eyebrow'),el('h2',node.title),el('span',STATES[node.state],`mm-badge mm-state-${node.state}`),el('p',node.summary));
    if (node.state === 'source') panel.append(el('p','源码定位记录不等于本图附带了 kernel 核验或进入当前 Truth release。','mm-fine'));
    if (node.state === 'candidate') panel.append(el('p','候选脚本保留其原始前提。本图未复跑 Lean，也未附核验回执。','mm-fine'));
    const formulation = node.formulation;
    if (formulation) {
      const labels = el('div',undefined,'mm-directions');
      labels.append(el('p',`RH ⇒ 此表述：${DIRECTIONS[formulation.forward]}`),el('p',`此表述 ⇒ RH：${DIRECTIONS[formulation.reverse]}`));
      panel.append(labels,el('p','此处为规格摘要；完整函数、定义域、量词及原始文献请查看理论卷定位。','mm-fine'));
      if (formulation.state==='preprint') panel.append(el('p',`${formulation.id} 是预印本规格，独立核验仍待完成。`,'mm-warning'));
      panel.append(sourceLinks(data,[formulation.source,...(formulation.proof_sources||[])],formulation.line));
    } else panel.append(sourceLinks(data,node.sources));
    const family = problem.families.find(f=>f.node===id);
    if (family) panel.append(el('h3','下一条解析义务'),el('p',family.gap),button('查看该族全部规格',()=>navigate({view:'catalogue',family:family.id,node:family.node,q:''})));
    const incident=graph.edges.filter(e=>e.to===node.id || e.from===node.id);
    const relations=el('details'); relations.append(el('summary',`连接及依据（${incident.length}）`));
    for (const e of incident) {
      const other=e.from===node.id?e.to:e.from;
      const row=el('div',undefined,'mm-relation');
      row.append(button(`${e.to===node.id?'前置':'后继'} · ${graph.nodes.find(n=>n.id===other).title}`,()=>navigate({node:other})),el('small',`${EDGE_KINDS[e.kind]}：${e.reason}`));
      relations.append(row);
    }
    panel.append(relations);
    const key=`${problem.id}:${node.id}`, existing=notebook.entries[key] || {note:'',starred:false};
    const notebookBox=el('section',undefined,'mm-note'); notebookBox.append(el('h3','稳定核心候选 / 本机笔记'));
    notebookBox.append(el('p','先标记可复用锚点。数学不动点还需指定映射 T、状态空间、T(x)=x 和稳定性定义。','mm-fine'));
    notebookBox.append(button(existing.starred?'移出观察清单':'加入观察清单',()=>{
      const current=notebook.entries[key] || existing; notebook.entries[key]={...current,starred:!current.starred}; save(); render();
    },'mm-star'));
    const label=el('label','研究记录'); label.htmlFor='mm-note-text';
    const input=el('textarea'); input.id='mm-note-text'; input.maxLength=5000; input.rows=4;
    input.placeholder='复用在哪些路线？需要哪个映射、哪个稳定性定理？'; input.value=existing.note;
    input.addEventListener('input',()=>{
      notebook.entries[key]={note:input.value,starred:notebook.entries[key]?.starred || false};
      const ok=save(); announce(ok?'笔记已保存于本浏览器；证明状态未更改。':storageMessage);
    });
    notebookBox.append(label,input,button('导出观察清单',download)); panel.append(notebookBox);
    return panel;
  }
  function renderGraph(problem, graph, visible, common = new Set()) {
    const frame=el('section',undefined,'mm-graph-section'), controls=el('div',undefined,'mm-graph-controls');
    const scroll=el('div',undefined,'mm-graph-scroll'); scroll.id='mm-graph-scroll'; scroll.tabIndex=0;
    scroll.setAttribute('aria-label','研究 DAG；可拖动背景、滚动或使用缩放按钮。节点也可用下方列表访问。');
    const {positions,width,height}=layout(graph,visible);
    const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':`${problem.title} 研究 DAG`});
    const description=svgEl('desc',{},'从左到右为人工研究支撑和待补桥梁。边不是证明已完成的标记。'); svg.append(description);
    const defs=svgEl('defs'), marker=svgEl('marker',{id:'mm-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
    marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'currentColor'})); defs.append(marker);svg.append(defs);
    let focus=new Set();
    if (route.node!==problem.goal && graph.nodes.some(n=>n.id===route.node)) focus=new Set([...closure(graph,[route.node]).ids,...closure(graph,[route.node],'children').ids]);
    for (const e of graph.edges) if (visible.has(e.from)&&visible.has(e.to)) {
      const a=positions.get(e.from),b=positions.get(e.to),start=a.x+236,end=b.x,mid=(start+end)/2;
      const path=svgEl('path',{d:`M${start},${a.y+37} C${mid},${a.y+37} ${mid},${b.y+37} ${end},${b.y+37}`,class:`mm-edge mm-edge-${e.kind}${focus.size&&!(focus.has(e.from)&&focus.has(e.to))?' mm-dim':''}`,'marker-end':'url(#mm-arrow)'});
      path.append(svgEl('title',{},`${e.from} → ${e.to} / ${EDGE_KINDS[e.kind]} / ${e.reason}`)); svg.append(path);
    }
    const g=indexGraph(graph);
    for (const node of graph.nodes.filter(n=>visible.has(n.id))) {
      const pos=positions.get(node.id),group=svgEl('g',{transform:`translate(${pos.x},${pos.y})`,role:'button',tabindex:0,
        'data-mm-node':node.id,'aria-label':`${node.title}，${STATES[node.state]}`,'aria-pressed':String(node.id===route.node),
        class:`mm-node mm-state-${node.state}${node.id===route.node?' mm-selected':''}${common.has(node.id)?' mm-common':''}${focus.size&&!focus.has(node.id)?' mm-dim':''}`});
      group.append(svgEl('rect',{width:236,height:74,rx:10}),svgEl('title',{},`${node.title} / ${node.summary}`));
      const label=svgEl('text',{x:14,y:24,class:'mm-node-title'}), chars=[...node.title];
      const lines=chars.length>23?[chars.slice(0,23).join(''),chars.slice(23,46).join('')+(chars.length>46?'…':'')]:[node.title];
      lines.forEach((line,i)=>label.append(svgEl('tspan',{x:14,dy:i?18:0},line)));group.append(label);
      group.append(svgEl('text',{x:14,y:61,class:'mm-node-state'},`${node.id} · ${STATES[node.state]}`));
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
    controls.append(button('缩小',()=>{autoZoom=false;zoom=Math.max(.3,zoom-.15);applyZoom();}),scaleLabel,button('放大',()=>{autoZoom=false;zoom=Math.min(2,zoom+.15);applyZoom();}),
      button('适合宽度',()=>{autoZoom=false;zoom=Math.max(.3,Math.min(1,scroll.clientWidth/width));applyZoom();}),
      button('重置',()=>{autoZoom=true;zoom=Math.min(1,Math.max(.7,scroll.clientWidth/width));applyZoom();scroll.scrollTo(0,0);}),el('small',`${visible.size} 个可见节点 · 先选判据族可收拢路线`));
    let drag;
    scroll.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.target.closest('[data-mm-node]')||event.button!==0)return;
      drag={x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(event.pointerId);});
    scroll.addEventListener('pointermove',event=>{if(!drag)return;scroll.scrollLeft=drag.left+drag.x-event.clientX;scroll.scrollTop=drag.top+drag.y-event.clientY;});
    scroll.addEventListener('pointerup',()=>{drag=null;});scroll.addEventListener('pointercancel',()=>{drag=null;});
    const list=el('details',undefined,'mm-node-list');list.append(el('summary',`以列表浏览这 ${visible.size} 个节点`));
    const choices=el('div');
    for(const n of graph.nodes.filter(n=>visible.has(n.id)))choices.append(button(`${n.title} · ${STATES[n.state]}`,()=>navigate({node:n.id})));
    list.append(choices);frame.append(controls,scroll,list);applyZoom();requestAnimationFrame(()=>{if(autoZoom&&scroll.isConnected){zoom=Math.min(1,Math.max(.7,scroll.clientWidth/width));applyZoom();}});return frame;
  }
  function renderCatalogue(problem) {
    const host=el('section',undefined,'mm-catalogue');
    host.append(el('h2','等价表述目录'),el('p','目录按理论卷规格计数，包含参数族与派生表达。正反证明分别登记；未核验不代表库内不存在。','mm-fine'));
    const q=route.q.toLocaleLowerCase();
    const rows=problem.formulations.filter(f=>(!route.family||f.family===route.family)&&`${f.id} ${f.title} ${f.family}`.toLocaleLowerCase().includes(q));
    host.append(el('p',`${rows.length} / ${problem.formulations.length} 个规格`,'mm-result-count'));
    if(!rows.length)host.append(el('p',problem.coverage==='starter'?'本题尚未录入等价目录。问题图中的节点也不代表已形式化。':'没有匹配项。可清空搜索或判据族。','mm-empty'));
    for(const f of rows){
      const card=el('article',undefined,'mm-spec-card');
      card.append(el('p',`${f.id} / ${f.family}${f.state==='preprint'?' / 预印本待核验':''}`,'mm-eyebrow'),el('h3',f.title));
      card.append(el('p',`RH ⇒ 此表述：${DIRECTIONS[f.forward]}　·　此表述 ⇒ RH：${DIRECTIONS[f.reverse]}`,'mm-directions'));
      card.append(link('完整对象、量词与文献',sourceURL(data.sources[f.source])+`#L${f.line}`),
        button('在 DAG 中查看',()=>navigate({view:'map',node:f.id===problem.root_formulation?problem.goal:f.id,family:f.family,specs:'1',q:''})));
      host.append(card);
    }
    const gaps=el('details',undefined,'mm-gaps');gaps.append(el('summary',`公开文献覆盖仍开放：${problem.gaps.length} 组已知缺口`));
    for(const gap of problem.gaps)gaps.append(el('p',`${gap.id} · ${gap.title}`));
    if(problem.gaps.length)gaps.append(sourceLinks(data,['atlas']));host.append(gaps);return host;
  }
  function render() {
    const oldFocus=document.activeElement?.id, oldStart=document.activeElement?.selectionStart;
    const oldScroll=document.getElementById('mm-graph-scroll');const savedScroll=oldScroll?{left:oldScroll.scrollLeft,top:oldScroll.scrollTop}:null;
    const p=data.problems.find(p=>p.id===route.problem);
    let graph=(route.specs&&route.family)?expandFamily(p,route.family):p;
    const shell=el('div',undefined,'mm-layout'),nav=el('nav',undefined,'mm-problems');nav.setAttribute('aria-label','千禧难题');
    nav.append(el('p','SEVEN PROBLEMS','mm-eyebrow'));
    for(const item of data.problems){
      const a=link('',routeURL(location.href,{problem:item.id,view:'map',node:'',family:'',specs:'',q:''}));
      a.append(el('strong',item.subtitle),el('small',item.title));if(item.id===p.id)a.setAttribute('aria-current','page');
      a.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();overview='highlights';navigate({problem:item.id,view:'map',node:'',family:'',specs:'',q:''});});nav.append(a);
    }
    const stars=Object.entries(notebook.entries).filter(([,n])=>n.starred);
    const starBox=el('details',undefined,'mm-watchlist');starBox.append(el('summary',`本机观察清单（${stars.length}）`));
    for(const [key] of stars){const [pid,nid]=key.split(':');const op=data.problems.find(p=>p.id===pid);const n=op.nodes.find(n=>n.id===nid)||op.formulations.find(f=>f.id===nid);
      if(n)starBox.append(button(n.title,()=>navigate({problem:pid,node:nid,view:'map',family:n.family||'',specs:n.family?'1':''})));}
    starBox.append(button('导出笔记',download));nav.append(starBox);
    const main=el('div',undefined,'mm-main'),head=el('header',undefined,'mm-heading');
    head.append(el('p','CONJECTURES / MILLENNIUM RESEARCH MAP','mm-eyebrow'),el('h1',p.title),el('p',p.summary,'mm-lede'));
    const science=el('p',p.scientific_state==='solved'?'科学界：已解决（Poincaré）　·　项目形式化：尚未盘点':'科学界：公开问题　·　项目进度以下方证据为准','mm-science');
    science.append(document.createTextNode('　'),link('Clay 原始问题',sourceURL(data.sources[p.sources[0]])));head.append(science);
    const c=counts(p),stats=el('div',undefined,'mm-stats');
    for(const [value,label] of [[c.specifications,'已编目规格'],[c.families,'判据族'],[c.states.source,'定位到源码的节点'],[c.states.candidate,'候选脚本节点']]){
      const stat=el('div');stat.append(el('strong',String(value)),el('span',label));stats.append(stat);
    }
    const progress=el('section',undefined,'mm-progress');
    [[c.states.source,'源码已定位','可追溯到固定提交，仍不等于本页重新核验'],[c.states.candidate,'候选桥梁','已有候选脚本或研究连接，待补完整证明'],[c.states.open,'开放缺口','明确记录的解析或形式化义务']].forEach(([value,label,note])=>{const card=el('article');card.append(el('strong',String(value)),el('span',label),el('span',note));progress.append(card);});
    main.append(head,stats,progress,el('p',`人工快照 ${data.reviewed} · ${data.revision}。本图没有附带 kernel 核验回执，不给出“RH 完成百分比”。`,'mm-boundary'));
    if(p.coverage==='starter')main.append(el('p','本题目前是有来源的问题结构起始图。源码、等价形式和证明依赖尚未盘点；不会从其他问题的进度推断本题已完成。','mm-warning'));
    const tabs=el('nav',undefined,'mm-tabs');tabs.setAttribute('aria-label','研究图视图');
    for(const [id,label] of [['map','路线 DAG'],['catalogue','等价目录'],['shared','共享核心']]){
      const b=button(label,()=>navigate({view:id}),route.view===id?'mm-active':'');b.setAttribute('aria-current',route.view===id?'page':'false');tabs.append(b);
    }main.append(tabs);
    const tools=el('div',undefined,'mm-tools');
    if(route.view!=='shared'){
      tools.append(selectControl('mm-family','判据族',[['','全部判据族'],...p.families.map(f=>[f.id,`${f.id} · ${f.title}`])],route.family,value=>navigate({family:value,node:value||p.goal,specs:'',q:''})));
      if(route.view==='map'){
        tools.append(selectControl('mm-scope','图的范围',[['highlights','重点路线'],['all','全部路线']],overview,value=>{overview=value;render();}));
        const lab=el('label',undefined,'mm-checkbox'),cb=el('input');cb.type='checkbox';cb.id='mm-specs';cb.checked=route.specs;cb.disabled=!route.family;
        cb.addEventListener('change',()=>navigate({specs:cb.checked?'1':'',node:route.family||p.goal}));lab.append(cb,document.createTextNode('展开所选族的规格节点'));tools.append(lab);
      }
      const lab=el('label','查找规格','mm-field');lab.htmlFor='mm-search';const search=el('input');search.id='mm-search';search.type='search';search.value=route.q;
      search.placeholder='5040、A045、Li、Nyman…';search.maxLength=160;
      search.addEventListener('input',()=>navigate({q:search.value,view:'catalogue'},true));lab.append(search);tools.append(lab);
      tools.append(button('清空筛选',()=>navigate({q:'',family:'',node:p.goal,specs:''})));
    }
    main.append(tools);
    const content=el('div',undefined,'mm-content');
    if(route.view==='catalogue')content.append(renderCatalogue(p));
    else {
      let visible=new Set(graph.nodes.map(n=>n.id)),common=new Set();
      if(route.view==='shared'){
        if(p.families.length>=2){
          compare=compare.map((id,i)=>p.families.some(f=>f.id===id)?id:p.families[i].id);
          for(let i=0;i<2;i++)tools.append(selectControl(`mm-compare-${i}`,i?'路线 B':'路线 A',p.families.map(f=>[f.id,`${f.id} · ${f.title}`]),compare[i],v=>{compare[i]=v;render();}));
          graph=p;const a=p.families.find(f=>f.id===compare[0]).node,b=p.families.find(f=>f.id===compare[1]).node;
          const ca=closure(p,[a]),cb=closure(p,[b]);common=commonInputs(p,a,b);
          visible=new Set([...ca.ids,...cb.ids,p.goal]);
          content.append(el('h2',`${common.size} 个共同前置节点`),el('p','高亮两个路线的共同祖先。计数只覆盖这张人工图的研究连接，包含待补边；不代表全库调用次数或已证明推论。','mm-fine'));
          const fixed=el('details');fixed.append(el('summary','查看结构闭包的稳定过程'),el('p',`前置闭包分别在 ${ca.rounds.length-1}、${cb.rounds.length-1} 轮扩张后不再增加节点。C(S)=S∪Pred(S) 在有限图上的不动点只是可达性闭包，不是 RH、算子或动力系统的不动点证明。`));content.append(fixed);
        }else content.append(el('p','本题的研究路线尚未盘点，暂不计算共同前置或复用排行。','mm-empty'));
      } else if(route.family){
        const leaves=graph.nodes.filter(n=>n.formulation?.family===route.family).map(n=>n.id);
        visible=closure(graph,leaves.length?leaves:[route.family]).ids;visible.add(p.goal);
      } else if(overview==='highlights' && p.highlights.length){
        visible=closure(graph,p.highlights).ids;visible.add(p.goal);
        if(route.node!==p.goal)for(const id of closure(graph,[route.node]).ids)visible.add(id);
      }
      const legend=el('div',undefined,'mm-legend');
      for(const [state,label] of Object.entries(STATES).filter(([s])=>s!=='verified'))legend.append(el('span',label,`mm-badge mm-state-${state}`));
      content.append(legend,el('p','箭头：研究支撑 → 待补桥梁 → 判据族 → 目标。虚线表示待构造连接；点线仅组织问题。等价关系不画成环，也不自动传播“已证明”状态。','mm-fine'));
      const detailId = route.view === 'shared' ? p.goal : route.node;
      const work=el('div',undefined,'mm-work');work.append(renderGraph(p,graph,visible,common),detail(p,graph,detailId));content.append(work);
      if(route.view==='shared' && p.coverage==='curated'){
        const list=el('section',undefined,'mm-reuse');list.append(el('h2','按本图可达判据族排列的复用节点'),el('p','只计人工连接可达的不同判据族，包括待补连接；没有跨时间稳定性或数学不动点认证。','mm-fine'));
        for(const row of reuse(p)){const b=button('',()=>navigate({node:row.node.id,view:'map',family:'',specs:''}));b.append(el('strong',row.node.title),el('span',`${row.families.length} 个可达判据族`));list.append(b);}content.append(list);
      }
    }
    main.append(content);
    const provenance=el('details',undefined,'mm-provenance');provenance.append(el('summary','人工维护、来源快照与更新记录'),el('p','修改 site/assets/millennium-data.json，并运行图验证测试。源码定位、候选脚本、文献规格与核验凭据分别维护；记录不会改写上游 Truth release。'));
    for(const event of p.history)provenance.append(el('p',`${event.date} · ${event.title}`));provenance.append(sourceLinks(data,p.sources));main.append(provenance);
    const message=el('p',storageMessage||'选择节点可查看前提、源码、证明缺口；观察清单仅保存在本浏览器。','mm-message');message.id='mm-message';message.setAttribute('role','status');main.append(message);
    shell.append(nav,main);root.replaceChildren(shell);document.title=`${p.title} | Millennium Research | trureturing`;
    if(savedScroll){const sc=document.getElementById('mm-graph-scroll');if(sc){sc.scrollLeft=savedScroll.left;sc.scrollTop=savedScroll.top;}}
    if(oldFocus){const target=document.getElementById(oldFocus);if(target){target.focus({preventScroll:true});if(oldStart!==null&&oldStart!==undefined&&target.type==='search')target.setSelectionRange?.(oldStart,oldStart);}}
  }
  window.addEventListener('popstate',()=>{route=readRoute(location.href,data);render();});render();
}
if (typeof document !== 'undefined' && document.getElementById('mm-app')) mountMillennium();
