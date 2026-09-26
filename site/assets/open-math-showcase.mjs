/** A self-contained presentation of pinned Pages evidence, with links into the full product. */
import { ready, t, locale } from './i18n.mjs';
await ready;
const PUBLIC = 'https://the-omega-institute.github.io/trureturing-pages/';
const REPO = 'https://github.com/the-omega-institute/trureturing/';
const $ = selector => document.querySelector(selector);
const svgNS = 'http://www.w3.org/2000/svg';
const element = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const siteURL = (path, hash = '') => {
  const url = new URL(path, PUBLIC);
  if (!path.endsWith('.json')) url.searchParams.set('lang', locale);
  if (hash) url.hash = hash;
  return url.href;
};
const link = (text, href, cls = 'inspector-secondary') => {
  const a = element('a', t(text), cls);
  a.href = href; a.target = '_blank'; a.rel = 'noopener';
  return a;
};
const short = id => id.split('/').at(-1);
const format = value => value.toLocaleString('en-US');

async function mount() {
  const response = await fetch(new URL('./open-math/atlas-excerpt.json', import.meta.url));
  if (!response.ok) throw new Error(`Atlas excerpt HTTP ${response.status}`);
  const data = await response.json();
  const nodes = new Map(data.nodes.map(n => [n.id, n]));
  const boundary = data.boundary;
  let selected = data.seed, mode = innerWidth < 760 ? 'local' : 'network', tab = 'explanation';
  const lookup = id => nodes.get(id) || boundary[id];
  const sourceURL = node => REPO + 'blob/' + data.source_commit + '/' + node.repo_path;
  const tabs = [...document.querySelectorAll('[data-inspector-tab]')];

  function inspect() {
    const node = nodes.get(selected);
    $('#deck-node-title').textContent = short(selected);
    $('#deck-node-title').title = selected;
    $('#deck-parent-count').textContent = node.in_degree;
    $('#deck-child-count').textContent = node.out_degree;
    $('#deck-reach-count').textContent = node.descendant_count;
    $('#deck-atlas-link').href = siteURL('atlas.html', new URLSearchParams({node: selected, mode: 'dependency'}));
    document.querySelectorAll('[data-focus-node]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.focusNode === selected)));
    tabs.forEach(b => {
      const active = b.dataset.inspectorTab === tab;
      b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1;
    });
    const content = $('#deck-inspector-content');
    content.setAttribute('aria-labelledby', `tab-${tab}`);
    content.replaceChildren();
    if (tab === 'explanation') {
      const summary = node.human_abstract || node.human_title || short(selected);
      if (locale !== 'en' && t(summary) === summary) content.append(element('span', t('PUBLISHED DESCRIPTION · ORIGINAL TEXT'), 'small-label'));
      content.append(element('p', t(summary), 'inspector-summary'));
      content.append(link('Read the published explanation ↗', siteURL(node.release_page), 'inspector-primary'));
      content.append(link('Inspect the formal source ↗', sourceURL(node)));
    } else if (tab === 'source') {
      const excerpt = data.source_excerpts[selected];
      content.append(element('span', t(excerpt ? 'EXACT STATEMENT · SOURCE EXCERPT' : 'FORMAL MODULE · PINNED SOURCE'), 'small-label'));
      if (excerpt) {
        const pre = element('pre'); pre.setAttribute('translate', 'no');
        pre.append(element('code', excerpt.text)); content.append(pre);
      } else {
        const path = element('p', node.repo_path, 'inspector-path'); path.setAttribute('translate', 'no'); content.append(path);
        content.append(element('p', t('Open the versioned module to inspect its statements, assumptions and proof.'), 'inspector-summary'));
      }
      content.append(link('Inspect the formal source ↗', sourceURL(node) + (excerpt ? '#L' + excerpt.line : ''), 'inspector-primary'));
    } else {
      content.append(element('span', t('IMMUTABLE RELEASE'), 'small-label'));
      const digest = element('code', data.release.slice(7, 23) + '…', 'record-digest'); digest.setAttribute('translate', 'no'); content.append(digest);
      content.append(element('p', t('The release preserves this result. Git history records changes to the module.'), 'inspector-summary'));
      content.append(link('Open the release record ↗', siteURL(node.release_page), 'inspector-primary'));
      content.append(link('Module change history ↗', REPO + 'commits/' + data.source_commit + '/' + node.repo_path));
      content.append(link('Explore version history in Pages ↗', siteURL('evolution.html', new URLSearchParams({node: selected, metric:'reach'}))));
    }
    content.scrollTop = 0;
  }

  function labelLines(name) {
    const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
    const lines = [''];
    for (const word of words) {
      if ((lines.at(-1) + word).length > 21) lines.push('');
      lines[lines.length - 1] += word + ' ';
    }
    return lines.slice(0, 2).map((line, i) => i === 1 && lines.length > 2 ? line.trim() + '…' : line.trim());
  }

  function draw() {
    const graph = $('#deck-dependency-graph');
    const edges = svg('g', {class:'atlas-edges'}), points = svg('g', {class:'atlas-nodes', translate:'no'});
    let positions = {}, shown, relations;
    const n = nodes.get(selected);
    if (mode === 'local') {
      positions[selected] = [340, 152];
      for (const [ids, x] of [[n.parents, 110], [n.children, 570]]) {
        ids.slice(0,5).forEach((id, i, list) => positions[id] = [x, list.length === 1 ? 152 : 28 + i*245/(list.length-1)]);
      }
      shown = Object.keys(positions);
      relations = [...n.parents.filter(id => positions[id]).map(id => ({source:id,target:selected})),
        ...n.children.filter(id => positions[id]).map(id => ({source:selected,target:id}))];
      graph.setAttribute('viewBox', '0 0 700 332');
      $('#deck-graph-hint').textContent = n.parents.length > 5 || n.children.length > 5
        ? t('Showing up to five neighbors per side. Open Atlas for all connections.')
        : t('Select a node to inspect its connections.');
    } else {
      positions = Object.fromEntries(Object.entries(data.positions).map(([id,[x,y]]) => [id,[x*700/660,y*332/550]])); shown = data.visible; relations = data.edges;
      graph.setAttribute('viewBox', '0 0 700 332');
      $('#deck-graph-hint').textContent = t('79 modules · 97 imports · the seed and its surrounding network');
    }
    $('.atlas-columns').classList.toggle('is-network', mode === 'network');
    const headings = mode === 'network' ? ['Deficit modules', 'Analytic modules', 'Other modules'] : ['PREREQUISITES', 'SELECTED MODULE', 'BUILDS ON IT'];
    $('.atlas-columns').replaceChildren(...headings.map(label => element('span', t(label))));
    $('.atlas-canvas').dataset.graphMode = mode;
    document.querySelectorAll('[data-graph-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.graphMode === mode)));
    for (const e of relations) {
      const [x,y] = positions[e.source], [xx,yy] = positions[e.target];
      const path = svg('path', {d: mode === 'local' ? `M${x+10} ${y}C${(x+xx)/2} ${y} ${(x+xx)/2} ${yy} ${xx-12} ${yy}` : `M${x} ${y}L${xx} ${yy}`});
      if (mode === 'local') path.setAttribute('marker-end', 'url(#deck-arrow)');
      if (e.source === selected || e.target === selected) path.classList.add('is-connected');
      edges.append(path);
    }
    for (const id of shown) {
      const node = lookup(id); if (!node) continue;
      const [x,y] = positions[id], active = id === selected;
      const a = svg('a', {href:siteURL(node.release_page), target:'_blank', rel:'noopener', 'data-node':id,
        class:'atlas-node'+(active?' is-selected':''), 'data-domain':node.domain || '', 'aria-label':short(id), transform:`translate(${x} ${y})`});
      if (nodes.has(id)) a.setAttribute('role', 'button');
      a.append(svg('title')); a.lastChild.textContent = id;
      a.append(svg('circle',{class:'node-hit',r: mode==='local'?23:12}), svg('circle',{class:'node-ring',r:mode==='local'?16:10}),
        svg('circle',{class:'node-dot',r:mode==='local'?6:active?6:3.7}));
      if (mode === 'local' || active) {
        const label = svg('text', {'text-anchor': 'middle'});
        labelLines(short(id)).forEach((line,i) => {const span = svg('tspan',{x:0,y: (mode==='local'?30:23)+i*15});span.textContent=line;label.append(span);});
        a.append(label);
      }
      a.addEventListener('click', event => {
        if (!nodes.has(id) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); selected = id; inspect(); draw();
        // Preserve keyboard focus after replacing the SVG.
        [...graph.querySelectorAll('[data-node]')].find(a => a.dataset.node === selected)?.focus({preventScroll:true});
      });
      a.addEventListener('keydown', event => {
        if (event.key === ' ' && nodes.has(id)) {event.preventDefault();a.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
      });
      points.append(a);
    }
    graph.querySelectorAll(':scope > g').forEach(g=>g.remove());
    graph.append(edges, points);
  }

  for (const button of document.querySelectorAll('[data-graph-mode]')) {
    button.disabled = false;
    button.addEventListener('click', () => {mode = button.dataset.graphMode; if (mode === 'network' && !data.visible.includes(selected)) {selected = data.seed; inspect();} draw();});
  }
  for (const button of document.querySelectorAll('[data-focus-node]')) {
    button.disabled = false;
    button.addEventListener('click', () => {selected = button.dataset.focusNode; mode = 'local'; inspect(); draw();});
  }
  tabs.forEach((button, i) => {
    button.disabled = false;
    button.addEventListener('click', () => {tab = button.dataset.inspectorTab; inspect();});
    button.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target=(i+1)%tabs.length;
      else if (event.key === 'ArrowLeft') target=(i+tabs.length-1)%tabs.length;
      else if (event.key === 'Home') target=0;
      else if (event.key === 'End') target=tabs.length-1;
      else return;
      event.preventDefault();tabs[target].click();tabs[target].focus();
    });
  });
  for (const button of document.querySelectorAll('[data-observation]')) {
    button.disabled = false;
    button.addEventListener('click', () => {
      const i = Number(button.dataset.observation), observation = data.observations[i];
      document.querySelectorAll('[data-observation]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
      document.querySelectorAll('.history-chart g').forEach((g,index) => g.classList.toggle('is-observed',index === i));
      const count = element('span');const number=element('b',format(observation.modules));number.setAttribute('translate','no');
      count.append(number,' ',element('span',t('modules in this Atlas observation')));
      $('#deck-history-detail').replaceChildren(count,link('Inspect this snapshot ↗',siteURL(observation.path),'history-snapshot-link'));
    });
  }
  // PDF always has a coherent opening state regardless of the last live interaction.
  let printState;
  addEventListener('beforeprint', () => {printState={selected,mode,tab};selected=data.seed;mode='local';tab='explanation';inspect();draw();});
  addEventListener('afterprint', () => {if (printState) {({selected,mode,tab}=printState);inspect();draw();}});
  inspect();draw();
  $('.atlas-workbench').dataset.ready = 'true';
}
mount().catch(() => {
  // The complete static illustration, explanation and evidence links remain available.
  $('#deck-graph-hint').textContent = t('Static snapshot. Open Atlas to explore the full library.');
});
