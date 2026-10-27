// Pages-owned navigation over the released module DAG. No topic or similarity
// relation becomes a proof edge, and Mathlib's external foundations are absent.
export const FOUNDATION_SCHEMA = 'pages-foundations.v1';
export const FOUNDATION_PROFILE = 'released-module-foundations-v1';
const digest = /^sha256:[a-f0-9]{64}$/;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function foundationModel(data, manifest) {
  if (data?.schema_version !== FOUNDATION_SCHEMA || data.profile !== FOUNDATION_PROFILE ||
      data.atlas_graph_digest !== manifest.atlas_graph_digest ||
      data.truth_release_digest !== manifest.truth_release_digest ||
      !digest.test(data.atlas_graph_digest) || !digest.test(data.truth_release_digest) ||
      !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !data.nodes.length)
    throw Error('Foundations do not bind the published Atlas.');
  const byId = new Map(), parents = new Map(), children = new Map();
  for (const node of data.nodes) {
    if (typeof node.id !== 'string' || !node.id || byId.has(node.id) ||
        typeof node.title !== 'string' || typeof node.domain !== 'string' ||
        typeof node.summary !== 'string' ||
        ['direct', 'reach', 'coverage', 'depth'].some(k => !Number.isSafeInteger(node[k]) || node[k] < 0) ||
        node.reach >= data.nodes.length || node.direct > node.reach || node.coverage > node.reach)
      throw Error('Invalid foundation module.');
    byId.set(node.id, node); parents.set(node.id, []); children.set(node.id, []);
  }
  const pairs = new Set();
  for (const edge of data.edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || !byId.has(edge[0]) || !byId.has(edge[1]) || edge[0] === edge[1])
      throw Error('Invalid foundation dependency.');
    const key = JSON.stringify(edge);
    if (pairs.has(key)) throw Error('Duplicate foundation dependency.');
    pairs.add(key); children.get(edge[0]).push(edge[1]); parents.get(edge[1]).push(edge[0]);
  }
  const pending = new Map(data.nodes.map(n => [n.id, parents.get(n.id).length]));
  const order = data.nodes.filter(n => !pending.get(n.id)).map(n => n.id), depth = new Map(order.map(id => [id, 0]));
  for (let i = 0; i < order.length; i++) for (const child of children.get(order[i])) {
    depth.set(child, Math.max(depth.get(child) || 0, depth.get(order[i]) + 1));
    pending.set(child, pending.get(child) - 1);
    if (!pending.get(child)) order.push(child);
  }
  if (order.length !== data.nodes.length || data.nodes.some(n => n.direct !== children.get(n.id).length || n.depth !== depth.get(n.id)))
    throw Error('Foundation dependency metrics disagree.');
  const ranked = data.nodes.slice().sort((a,b) => b.reach - a.reach || b.coverage - a.coverage || cmp(a.id,b.id));
  return {data, byId, parents, children, ranked, pairs};
}

export function shortestPaths(model, start, direction = 'downstream') {
  const adjacency = direction === 'upstream' ? model.parents : model.children;
  if (!model.byId.has(start)) return new Map();
  const previous = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const id of adjacency.get(queue[i])) {
    if (previous.has(id)) continue;
    previous.set(id, queue[i]); queue.push(id);
  }
  return previous;
}

export function dependencyPath(previous, target, direction = 'downstream') {
  if (!previous.has(target)) return [];
  const path = [];
  for (let id = target; id !== null; id = previous.get(id)) path.push(id);
  return direction === 'upstream' ? path : path.reverse();
}

export function coreModules(model, mode = 'shared') {
  const candidates = model.ranked.filter(n => n.reach > 0);
  if (mode === 'roots') return candidates.filter(n => !model.parents.get(n.id).length);
  if (mode === 'direct') return candidates.slice().sort((a,b) => b.direct-a.direct || b.reach-a.reach || cmp(a.id,b.id));
  return candidates;
}

// The overview contains a bounded selection of highly reused modules plus the
// shortest actual import paths between them. All displayed arrows are direct.
export function coreOverview(model, mode = 'shared', limit = 16) {
  const roots = coreModules(model, mode).slice(0, limit);
  const ids = new Set(roots.map(n => n.id));
  // Root-only rankings have no mutual edges. Show immediate reused children so
  // a foundation's consequences are visible without inventing a collapsed edge.
  if (mode === 'roots') for (const node of roots) {
    model.children.get(node.id).map(id => model.byId.get(id))
      .sort((a,b) => b.reach-a.reach || cmp(a.id,b.id)).slice(0,2).forEach(n => ids.add(n.id));
  } else for (const root of roots) {
    const previous = shortestPaths(model, root.id);
    for (const target of roots) for (const id of dependencyPath(previous, target.id)) ids.add(id);
  }
  return {nodes: [...ids].map(id => model.byId.get(id)), edges: model.data.edges.filter(([a,b]) => ids.has(a) && ids.has(b)), roots};
}

export function focusGraph(model, id, target = null, direction = 'downstream') {
  const ids = new Set([id]), previous = shortestPaths(model, id, direction);
  let path = [];
  if (target) {
    path = dependencyPath(previous, target, direction);
    for (const member of path) ids.add(member);
  } else {
    // All immediate prerequisites are retained. Dependents are a labelled
    // sample; the inspector exposes every reachable module through search.
    for (const parent of model.parents.get(id) || []) ids.add(parent);
    for (const child of (model.children.get(id) || []).map(k => model.byId.get(k))
      .sort((a,b) => b.reach-a.reach || cmp(a.id,b.id)).slice(0,12)) ids.add(child.id);
  }
  return {nodes:[...ids].map(k=>model.byId.get(k)).filter(Boolean),
    edges:model.data.edges.filter(([a,b])=>ids.has(a)&&ids.has(b)), path, previous};
}

export function findModules(nodes, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return nodes.filter(n => words.every(w => `${n.title} ${n.id} ${n.domain} ${n.summary}`.toLowerCase().includes(w)));
}

export function fullAtlasURL(id = null) {
  return `atlas-explorer.html#${new URLSearchParams({mode:'dependency', ...(id ? {node:id} : {})})}`;
}

async function hash(bytes) {
  return 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function loadFoundations(base, fetcher = fetch) {
  const started = performance.now();
  // A deployment can replace the two small mutable pointers between requests.
  // Retry the pair once, but never accept mixed release bindings.
  for (let attempt=0; attempt<2; attempt++) {
    const [mr, ir] = await Promise.all([
      fetcher(new URL('data/pages-atlas-manifest.v1.json',base), {cache:'no-cache'}),
      fetcher(new URL('data/atlas-startup.v1.json',base), {cache:'no-cache'}),
    ]);
    if (!mr.ok || !ir.ok) throw Error('Published foundations are unavailable.');
    const manifest=await mr.json(), index=await ir.json(), entry=index.foundations;
    if (manifest.schema_version !== 'pages-atlas-manifest.v1' || index.schema_version !== 'pages-atlas-startup.v1')
      throw Error('Unsupported foundations publication.');
    if (index.atlas_graph_digest !== manifest.atlas_graph_digest || index.truth_release_digest !== manifest.truth_release_digest) {
      if (!attempt) continue;
      throw Error('The release changed while loading. Please retry.');
    }
    if (!entry || !digest.test(entry.digest) || entry.path !== `data/atlas-startup/${entry.digest.slice(7)}.json.gz`)
      throw Error('The foundations view is not available for this release yet.');
    const response=await fetcher(new URL(entry.path,base), {cache:'force-cache'});
    if (!response.ok) throw Error('The foundations artifact could not be loaded.');
    const bytes=await response.arrayBuffer();
    if (await hash(bytes) !== entry.digest) throw Error('Foundations artifact digest mismatch.');
    const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const model=foundationModel(JSON.parse(text),manifest);
    return {model,manifest,timing:{dataReadyMs:performance.now()-started,compressedBytes:bytes.byteLength,decodedBytes:new TextEncoder().encode(text).length}};
  }
}
