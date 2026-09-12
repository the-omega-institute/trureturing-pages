// Set projections over the existing architecture model. No new truth or metric authority.
export const PROFILE = 'knowledge-spaces-v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{64}$/;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const union = (...sets) => new Set(sets.flatMap(s => [...s]));
export const intersection = (a, b) => new Set([...a].filter(x => b.has(x)));

export function validateCatalog(catalog, manifest, binding, graph) {
  if (catalog.schema_version !== 'pages-knowledge-spaces.v1' || catalog.profile !== PROFILE ||
      manifest.schema_version !== 'pages-knowledge-spaces-manifest.v1' || manifest.profile !== PROFILE)
    throw new Error('Unsupported knowledge-space contract.');
  for (const key of ['truth_release_digest', 'atlas_graph_digest']) {
    if (!DIGEST.test(catalog[key]) || catalog[key] !== manifest[key] || catalog[key] !== binding[key])
      throw new Error('Knowledge spaces belong to a different release or Atlas.');
  }
  if (!/^[a-f0-9]{40}$/.test(catalog.source_commit) ||
      catalog.source_commit !== manifest.source_commit ||
      catalog.source_commit !== graph.source_snapshot.source_commit)
    throw new Error('Knowledge-space source commit mismatch.');
  const graphIds = new Set(graph.nodes.map(n => n.id));
  const recordIds = new Set();
  for (const r of catalog.records) {
    if (!graphIds.has(r.id) || recordIds.has(r.id) || typeof r.title !== 'string')
      throw new Error('Unknown or duplicate knowledge record.');
    recordIds.add(r.id);
  }
  if (recordIds.size !== graphIds.size) throw new Error('Incomplete knowledge record join.');
  const targets = new Set();
  for (const t of catalog.targets) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug) || targets.has(t.slug) ||
        !['proved', 'refuted', 'unresolved-in-release'].includes(t.result))
      throw new Error('Invalid knowledge target.');
    if (t.result !== 'unresolved-in-release' && !t.resolution?.kernel_verified)
      throw new Error('A target result is missing its upstream gate.');
    targets.add(t.slug);
  }
  const truthIds = new Set(graph.nodes.filter(n => n.kind === 'truth').map(n => n.id));
  const spaces = new Set();
  for (const s of catalog.spaces) {
    if (!ID.test(s.id) || spaces.has(s.id) ||
        !['domain', 'source', 'collection', 'target'].includes(s.kind) ||
        typeof s.title !== 'string' || new Set(s.member_ids).size !== s.member_ids.length ||
        s.member_ids.some(id => !truthIds.has(id)) ||
        s.problem_slugs.some(slug => !targets.has(slug)))
      throw new Error('Invalid space membership.');
    spaces.add(s.id);
  }
  return catalog;
}

export async function loadCatalog(base, startup, fetcher = fetch) {
  const manifestResponse = await fetcher(new URL('data/knowledge-spaces.v1.json', base), {cache: 'no-cache'});
  if (!manifestResponse.ok) throw new Error('Knowledge-space projection is unavailable for this deployment.');
  const manifest = await manifestResponse.json();
  if (!DIGEST.test(manifest.catalog_sha256) ||
      manifest.catalog_path !== `data/spaces/${manifest.catalog_sha256.slice(7)}.json`)
    throw new Error('Invalid knowledge-space content address.');
  const response = await fetcher(new URL(manifest.catalog_path, base));
  if (!response.ok) throw new Error('Knowledge-space catalog could not be loaded.');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(x => x.toString(16).padStart(2, '0')).join('');
  if ('sha256:' + hash !== manifest.catalog_sha256) throw new Error('Knowledge-space digest mismatch.');
  const catalog = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  return validateCatalog(catalog, manifest, startup.manifest, startup.graph);
}

export function predecessorClosure(seeds, architecture) {
  const result = new Set(seeds), queue = [...seeds];
  for (let i = 0; i < queue.length; i++) {
    for (const id of architecture.parents.get(queue[i]) || []) {
      if (!result.has(id)) { result.add(id); queue.push(id); }
    }
  }
  return result;
}

export function projectSpace(catalog, architecture, leftId = '', rightId = '', context = true) {
  const spaces = new Map(catalog.spaces.map(s => [s.id, s]));
  if (leftId && !spaces.has(leftId) || rightId && !spaces.has(rightId))
    throw new Error('This knowledge space is absent from the selected release.');
  const left = new Set(leftId ? spaces.get(leftId).member_ids : architecture.metrics.keys());
  const right = new Set(rightId ? spaces.get(rightId).member_ids : []);
  const members = union(left, right);
  const leftClosure = predecessorClosure(left, architecture);
  const rightClosure = predecessorClosure(right, architecture);
  const closure = union(leftClosure, rightClosure);
  const shared = new Set([...intersection(leftClosure, rightClosure)].filter(id => !members.has(id)));
  const ranking = [...closure].map(id => {
    const descendants = architecture.descendants.get(id) || new Set();
    return {id, support: intersection(descendants, members).size,
            left: intersection(descendants, left).size, right: intersection(descendants, right).size,
            ...architecture.metrics.get(id)};
  }).sort((a, b) => b.support - a.support || b.reach - a.reach || cmp(a.id, b.id));
  const aOnly = new Set([...left].filter(id => !right.has(id)));
  const bOnly = new Set([...right].filter(id => !left.has(id)));
  const forward = [], reverse = [];
  for (const a of [...aOnly].sort(cmp))
    for (const b of [...(architecture.children.get(a) || [])].sort(cmp))
      if (bOnly.has(b)) forward.push([a, b]);
  for (const b of [...bOnly].sort(cmp))
    for (const a of [...(architecture.children.get(b) || [])].sort(cmp))
      if (aOnly.has(a)) reverse.push([b, a]);
  return {left, right, members, closure, visible: context ? closure : members,
          overlap: intersection(left, right), shared, forward, reverse, ranking};
}

export function readRoute(search) {
  const p = new URLSearchParams(search);
  for (const key of ['space', 'compare'])
    if (p.has(key) && !ID.test(p.get(key))) throw new Error('Invalid knowledge-space address.');
  return {left: p.get('space') || '', right: p.get('compare') || '',
          node: p.get('node') || '', context: p.get('context') !== '0'};
}

export function routeSearch(state) {
  const p = new URLSearchParams();
  if (state.left) p.set('space', state.left);
  if (state.right) p.set('compare', state.right);
  if (state.node) p.set('node', state.node);
  if (!state.context) p.set('context', '0');
  return p.size ? '?' + p : '';
}

export function safeLink(value, base = 'https://example.invalid/') {
  if (typeof value !== 'string' || /[\s\x00-\x1f\x7f<>"\\]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
