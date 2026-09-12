import {loadStartup} from './atlas-startup.mjs';
import {analyzeArchitecture} from './architecture-core.mjs';
import {loadCatalog, projectSpace, readRoute, routeSearch, safeLink} from './knowledge-spaces-core.mjs';

const $ = id => document.getElementById(id);
const node = (tag, value, className = '') => {
  const el = document.createElement(tag);
  if (value !== undefined) el.textContent = value;
  if (className) el.className = className;
  return el;
};
const kindNames = {domain:'Source domain', source:'Literature source', collection:'Question source', target:'Research target'};
const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420;
let catalog, startup, architecture, records, graph, projection, positions, renderer;
let route = {left:'', right:'', node:'', context:true};
let spaceLimit = 60, nodeLimit = 40, rankLimit = 12, currentNodeIds = new Set();

function link(label, url) {
  const href = safeLink(url, location.href);
  if (!href) return node('span', label);
  const a = node('a', label); a.href = href;
  if (new URL(href).origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  return a;
}
function stat(label, count) {
  const el = node('div', undefined, 'spaces-stat');
  el.append(node('strong', count.toLocaleString('en-US')), node('span', label));
  return el;
}
function moduleButton(id, caption = '') {
  const item = records.get(id);
  const b = node('button', undefined, 'spaces-module'); b.type = 'button';
  b.append(node('strong', item?.title || id));
  if (caption) b.append(node('small', caption));
  b.addEventListener('click', () => chooseNode(id));
  return b;
}
function commitRoute(push = true) {
  history[push ? 'pushState' : 'replaceState'](null, '', location.pathname + routeSearch(route));
}
function renderList() {
  const q = $('spaces-query').value.trim().toLocaleLowerCase();
  const kind = $('spaces-kind').value;
  const matches = catalog.spaces.filter(s => (!kind || s.kind === kind) &&
    (!q || (s.title + ' ' + s.key + ' ' + s.references.map(r => `${r.authors || ''} ${r.title}`).join(' ')).toLocaleLowerCase().includes(q)));
  $('spaces-count').textContent = `${matches.length} spaces`;
  $('spaces-list').replaceChildren(...matches.slice(0, spaceLimit).map(s => {
    const b = node('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(s.id === route.left));
    b.append(node('strong', s.title), node('small', `${kindNames[s.kind]} / ${s.member_ids.length} modules`));
    b.addEventListener('click', () => chooseSpace(s.id)); return b;
  }));
  if (!matches.length) $('spaces-list').append(node('p', 'No spaces match this search.', 'spaces-muted'));
  $('spaces-more').hidden = matches.length <= spaceLimit;
}
function chooseSpace(id) {
  route.left = id; route.node = ''; rankLimit = 12; nodeLimit = 40;
  commitRoute(); refresh();
}
function chooseNode(id) {
  if (!records.has(id)) return;
  route.node = id; commitRoute(); renderReader();
  if (!currentNodeIds.has(id)) drawGraph();
  renderer?.nodeColor(color).nodeVal(size);
  const p = positions?.[id];
  if (p && currentNodeIds.has(id)) renderer?.cameraPosition({x:p.x + 100, y:p.y + 70, z:p.z + 220}, p, motion);
}
function color(n) {
  if (n.id === route.node) return '#fff3cf';
  if (projection.shared.has(n.id) || projection.overlap.has(n.id)) return '#e5c879';
  if (projection.right.has(n.id)) return '#b0a0ec';
  return projection.left.has(n.id) ? '#72d1bf' : '#547e8b';
}
function size(n) {
  return n.id === route.node ? 28 : 2 + Math.log2(1 + (architecture.metrics.get(n.id)?.reach || 0)) * 1.8;
}
function graphEdges(ids) {
  const edges = [];
  for (const id of ids) for (const child of architecture.children.get(id) || [])
    if (ids.has(child)) edges.push({source:id, target:child});
  return edges;
}
function drawGraph() {
  if (!renderer) return;
  const displayed = new Set(projection.visible);
  if (route.node && architecture.metrics.has(route.node)) {
    displayed.add(route.node);
    for (const id of architecture.parents.get(route.node)) displayed.add(id);
    for (const id of architecture.children.get(route.node)) displayed.add(id);
  }
  currentNodeIds = new Set([...displayed].filter(id => positions[id]));
  const omitted = displayed.size - currentNodeIds.size;
  const nodes = [...currentNodeIds].map(id => ({id, ...positions[id],
    fx:positions[id].x, fy:positions[id].y, fz:positions[id].z}));
  renderer.graphData({nodes, links:graphEdges(currentNodeIds)}).nodeColor(color).nodeVal(size);
  $('spaces-graph-note').textContent = projection.visible.size ?
    `${nodes.length} modules shown${displayed.size > projection.visible.size ? ', including inspection neighbors' : ''}. Select a node to read its explanation.${omitted ? ` ${omitted} have no supplied display position; use the module list.` : ''}` :
    'This space has no mapped modules in the selected release. Its source and target records remain readable.';
  if (nodes.length) renderer.zoomToFit(motion, 45);
}
function renderAnalysis() {
  const rows = projection.ranking.filter(r => r.support > 0);
  $('spaces-ranking').replaceChildren(...rows.slice(0, rankLimit).map(r =>
    moduleButton(r.id, `Supports ${r.support} selected modules / ${r.direct} direct consumers across the release`)));
  if (!rows.length) $('spaces-ranking').append(node('p', 'No supporting dependencies recorded for this selection.', 'spaces-muted'));
  $('spaces-rank-more').hidden = rows.length <= rankLimit;
  const connection = $('spaces-connections'); connection.replaceChildren();
  if (!route.right) {
    connection.append(node('p', 'Choose a second space to inspect common foundations and actual cross-space module dependencies.', 'spaces-muted'));
    return;
  }
  connection.append(node('p', `${projection.shared.size} shared foundations outside the selected memberships. ${projection.overlap.size} modules belong to both spaces.`, 'spaces-muted'));
  for (const [label, edges] of [['Selected to comparison', projection.forward], ['Comparison to selected', projection.reverse]]) {
    connection.append(node('p', `${label}: ${edges.length} direct recorded dependencies.`, 'spaces-muted'));
    const details = node('details'); details.append(node('summary', `Inspect all ${edges.length} connections`));
    for (const [a,b] of edges) {
      const row = node('div'); row.append(moduleButton(a), node('small', 'Used by'), moduleButton(b)); details.append(row);
    }
    connection.append(details);
  }
  connection.append(node('p', 'Overlap is excluded from directional counts. These are dependency observations; mathematical transfer and novelty need separate evidence.', 'spaces-muted'));
}
function renderNodes() {
  const q = $('spaces-node-query').value.trim().toLocaleLowerCase();
  const ids = [...projection.visible].filter(id => !q || records.get(id).title.toLocaleLowerCase().includes(q))
    .sort((a,b) => records.get(a).title.localeCompare(records.get(b).title));
  $('spaces-nodes').replaceChildren(...ids.slice(0, nodeLimit).map(id => moduleButton(id)));
  $('spaces-node-more').hidden = ids.length <= nodeLimit;
  if (!ids.length) $('spaces-nodes').append(node('p', 'No modules match.', 'spaces-muted'));
}
function citations(root, references) {
  if (!references.length) return;
  root.append(node('h3', 'Sources and acknowledgements'));
  for (const r of references) {
    const el = node('div', undefined, 'spaces-reference');
    el.append(link(r.title, r.source_url || r.url));
    const attribution = [r.authors, r.year, r.role].filter(Boolean).join(' / ');
    el.append(node('small', attribution));
    if (r.declaration_gid) {
      const detail = node('details'); detail.append(node('summary', 'Attributed declaration'), node('code', r.declaration_gid)); el.append(detail);
    }
    root.append(el);
  }
}
function renderReader() {
  const root = $('spaces-reader'); root.replaceChildren();
  const selected = records.get(route.node);
  if (route.node && !selected) {
    root.append(node('h2', 'Concept absent from this release'), node('p', 'The saved identity was not found. No replacement has been inferred.')); return;
  }
  if (selected) {
    root.append(node('p', selected.domain, 'spaces-eyebrow'), node('h2', selected.title));
    root.append(node('p', selected.summary || 'No authored summary is supplied for this concept. Open its Library entry to inspect the source.'));
    if (selected.statement) root.append(node('blockquote', selected.statement));
    root.append(link('Read the full Library entry', selected.wiki_path));
    for (const [label, ids] of [['Built from', architecture.parents.get(selected.id)], ['Used by', architecture.children.get(selected.id)]]) {
      root.append(node('h3', label));
      const list = [...(ids || [])];
      if (!list.length) root.append(node('p', 'None recorded in this release.', 'spaces-muted'));
      else {
        root.append(...list.slice(0, 8).map(id => moduleButton(id)));
        if (list.length > 8) {
          const details = node('details'); details.append(node('summary', `All ${list.length} connections`));
          details.append(...list.slice(8).map(id => moduleButton(id))); root.append(details);
        }
      }
    }
    citations(root, selected.references);
    const details = node('details'); details.append(node('summary', 'Source and release evidence'),
      node('p', `Recorded module state: ${selected.state}`), node('code', selected.id),
      node('p', catalog.truth_release_digest));
    if (selected.blueprint_path && !selected.blueprint_path.split('/').some(p => p === '..'))
      details.append(link('Pinned Scribe emission', `https://github.com/the-omega-institute/trureturing/blob/${catalog.source_commit}/${selected.blueprint_path.split('/').map(encodeURIComponent).join('/')}`));
    root.append(details); return;
  }
  const space = catalog.spaces.find(s => s.id === route.left);
  root.append(node('p', space ? kindNames[space.kind] : 'THE COLLECTION', 'spaces-eyebrow'), node('h2', space?.title || 'A connected body of knowledge'));
  root.append(node('p', space ? 'This view is generated from the selected release. Select a module to follow its explanation and dependencies.' :
    'Explore the released knowledge by source domain, literature or research target. All views use the same object identities and display coordinates.'));
  if (space) {
    citations(root, space.references);
    for (const slug of space.problem_slugs) {
      const t = catalog.targets.find(p => p.slug === slug);
      root.append(node('h3', 'Research target'), link(t.title, t.path));
      root.append(node('p', t.result === 'unresolved-in-release' ? 'No resolution recorded in this release.' : `Source-recorded ${t.result}; resolving declaration passed the release gate.`));
      if (t.missing_anchor_ids.length) root.append(node('p', `${t.missing_anchor_ids.length} source anchors are absent from this graph.`, 'spaces-muted'));
      root.append(node('p', `Literature status: ${t.literature_status}`, 'spaces-muted'));
    }
  }
}
function refresh() {
  projection = projectSpace(catalog, architecture, route.left, route.right, route.context);
  $('spaces-status').classList.remove('spaces-error');
  const space = catalog.spaces.find(s => s.id === route.left);
  $('space-title').textContent = space?.title || 'The connected knowledge';
  $('space-kind').textContent = space ? kindNames[space.kind] : 'GLOBAL VIEW';
  $('spaces-compare').value = route.right; $('spaces-context').checked = route.context;
  $('spaces-summary').replaceChildren(stat('Selected modules', projection.left.size), stat('Supporting context', projection.closure.size - projection.members.size));
  if (route.right) $('spaces-summary').append(stat('Comparison modules', projection.right.size), stat('Shared foundations', projection.shared.size));
  renderList(); renderAnalysis(); renderNodes(); renderReader(); drawGraph();
}
async function displayPositions(graph, supplied) {
  if (supplied) return supplied;
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL('./atlas-public-worker.mjs', import.meta.url), {type:'module'});
    worker.onmessage = ({data}) => {
      if (data.positions) { worker.terminate(); resolve(data.positions); }
      else if (data.error) { worker.terminate(); reject(new Error(data.error)); }
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('Atlas layout worker unavailable.')); };
    worker.postMessage(graph);
  });
}
async function main() {
  startup = await loadStartup(new URL('./', location.href));
  catalog = await loadCatalog(new URL('./', location.href), startup);
  graph = startup.graph; architecture = analyzeArchitecture(graph);
  records = new Map(catalog.records.map(r => [r.id, r]));
  route = readRoute(location.search);
  const groups = new Map();
  for (const s of catalog.spaces) {
    if (!groups.has(s.kind)) { const g = node('optgroup'); g.label = kindNames[s.kind]; groups.set(s.kind, g); }
    const option = node('option', s.title); option.value = s.id; groups.get(s.kind).append(option);
  }
  $('spaces-compare').append(...groups.values()); $('spaces-compare').disabled = false;
  $('spaces-status').textContent = `${architecture.nodeCount.toLocaleString('en-US')} released modules / ${catalog.spaces.length.toLocaleString('en-US')} generated spaces`;
  const coverage = $('spaces-coverage');
  for (const [key,value] of Object.entries(catalog.coverage))
    coverage.append(node('p', `${key.replaceAll('_',' ')}: ${Array.isArray(value) ? value.length + ' records' : value}`));
  coverage.append(node('code', catalog.truth_release_digest));
  for (const id of ['spaces-kind','spaces-query']) $(id).addEventListener('input', () => { spaceLimit=60; renderList(); });
  $('spaces-more').addEventListener('click', () => {spaceLimit+=60; renderList();});
  $('spaces-all').addEventListener('click', () => {route.right=''; chooseSpace('');});
  $('spaces-compare').addEventListener('change', () => {route.right=$('spaces-compare').value; route.node=''; commitRoute(); refresh();});
  $('spaces-context').addEventListener('change', () => {route.context=$('spaces-context').checked; commitRoute(); refresh();});
  $('spaces-rank-more').addEventListener('click', () => {rankLimit+=24; renderAnalysis();});
  $('spaces-node-more').addEventListener('click', () => {nodeLimit+=40; renderNodes();});
  $('spaces-node-query').addEventListener('input', () => {nodeLimit=40; renderNodes();});
  window.addEventListener('popstate', () => {
    try { route=readRoute(location.search); refresh(); }
    catch (error) {
      $('spaces-status').textContent=error.message; $('spaces-status').classList.add('spaces-error');
      renderer?.graphData({nodes:[], links:[]});
      for (const id of ['spaces-summary','spaces-ranking','spaces-connections','spaces-nodes','spaces-reader']) $(id).replaceChildren();
      $('spaces-graph-note').textContent='The saved view is unavailable. Choose a known space to continue.';
    }
  });
  refresh();
  // A display-library failure leaves the same verified module list and citations usable.
  try {
    positions = await displayPositions(graph, startup.positions);
    if (!window.ForceGraph3D) throw new Error('The 3D display library is unavailable.');
    const el = $('spaces-scene');
    renderer = window.ForceGraph3D({controlType:'orbit'})(el)
      .width(el.clientWidth).height(el.clientHeight).backgroundColor('#090c10')
      .showNavInfo(false).nodeLabel(() => '').nodeRelSize(2.2).nodeColor(color).nodeVal(size)
      .linkColor(() => '#4b727e').linkOpacity(.55).linkWidth(.5)
      .linkDirectionalArrowLength(3).linkDirectionalArrowRelPos(.85)
      .warmupTicks(0).cooldownTicks(0).enableNodeDrag(false)
      .onNodeClick(n => chooseNode(n.id))
      .onNodeHover(n => { if (n) $('spaces-graph-note').textContent = records.get(n.id).title; });
    const observer = new ResizeObserver(() => renderer.width(el.clientWidth).height(el.clientHeight)); observer.observe(el);
    $('spaces-fit').disabled=false; $('spaces-fit').addEventListener('click', () => renderer.zoomToFit(motion,45));
    window.addEventListener('pagehide', () => { observer.disconnect(); renderer.pauseAnimation?.(); }, {once:true});
    drawGraph();
  } catch (error) {
    $('spaces-graph-note').textContent=error.message + ' Browse the complete module list below.';
    document.querySelector('.spaces-directory').open=true;
  }
}
main().catch(error => {
  $('spaces-status').textContent=error.message;
  $('spaces-status').classList.add('spaces-error');
  $('spaces-graph-note').textContent='No unverified fallback data has been loaded. The Global Atlas remains available.';
});
