// Editorial graphs never mutate the release DAG or infer proof completion.
export const STATES = Object.freeze({
  source: "Source located", candidate: "Candidate script", open: "Proof pending",
  specification: "Literature specification", unassessed: "Repository not inventoried"
});
export const EDGE_KINDS = Object.freeze({
  support: "Curated research connection", imports: "Direct source dependency", plan: "Bridge to construct", structure: "Problem structure"
});
export const VIEWS = ['map', 'catalogue', 'shared'];
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
export function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
export function sourceURL(source) {
  if (source.kind === 'repo') {
    const path = source.path.split('/').map(encodeURIComponent).join('/');
    return `https://github.com/${source.repo}/blob/${source.commit}/${path}`;
  }
  return safeURL(source.url);
}
export function indexGraph(problem) {
  const nodes = new Map(problem.nodes.map(n => [n.id, n]));
  const parents = new Map([...nodes.keys()].map(id => [id, []]));
  const children = new Map([...nodes.keys()].map(id => [id, []]));
  for (const e of problem.edges) {
    assert(nodes.has(e.from) && nodes.has(e.to), `Dangling edge ${e.from} -> ${e.to}`);
    children.get(e.from).push(e.to); parents.get(e.to).push(e.from);
  }
  for (const map of [parents, children]) for (const values of map.values()) values.sort();
  return { nodes, parents, children };
}
export function topological(problem) {
  const g = indexGraph(problem), degree = new Map([...g.parents].map(([id, a]) => [id, a.length]));
  const ready = [...degree].filter(([,d]) => !d).map(([id]) => id).sort(), result = [];
  while (ready.length) {
    const id = ready.shift(); result.push(id);
    for (const child of g.children.get(id)) {
      degree.set(child, degree.get(child) - 1);
      if (degree.get(child) === 0) { ready.push(child); ready.sort(); }
    }
  }
  assert(result.length === problem.nodes.length, `Cycle in ${problem.id}`);
  return result;
}
export function closure(problem, seeds, direction = 'parents') {
  assert(['parents', 'children'].includes(direction), 'Unknown closure direction');
  const g = indexGraph(problem), found = new Set(seeds), rounds = [new Set(seeds)];
  for (const id of found) assert(g.nodes.has(id), `Unknown seed ${id}`);
  let frontier = [...found];
  while (frontier.length) {
    const next = new Set();
    for (const id of frontier) for (const near of g[direction].get(id)) if (!found.has(near)) next.add(near);
    if (!next.size) break;
    for (const id of next) found.add(id);
    rounds.push(next); frontier = [...next];
  }
  return { ids: found, rounds, fixed: true }; // Finite reachability only, never a mathematical fixed-point certificate.
}
export function commonInputs(problem, first, second) {
  const a = closure(problem, [first]), b = closure(problem, [second]);
  return new Set([...a.ids].filter(id => b.ids.has(id) && id !== first && id !== second));
}
export function reuse(problem) {
  return problem.nodes.filter(n => n.kind === 'source').map(node => {
    const downstream = closure(problem, [node.id], 'children').ids;
    return { node, families: problem.families.filter(f => downstream.has(f.node)).map(f => f.id) };
  }).sort((a,b) => b.families.length - a.families.length || a.node.id.localeCompare(b.node.id));
}
export function layout(problem, visible = new Set(problem.nodes.map(n => n.id))) {
  const order = topological(problem), g = indexGraph(problem), layers = new Map();
  for (const id of order) if (visible.has(id)) {
    const near = g.parents.get(id).filter(p => visible.has(p));
    layers.set(id, near.length ? Math.max(...near.map(p => layers.get(p))) + 1 : 0);
  }
  const columns = [];
  for (const id of order) if (visible.has(id)) (columns[layers.get(id)] ||= []).push(id);
  // Deterministic barycentric ordering reduces crossings without external layout code.
  const positions = new Map();
  columns.forEach((ids, col) => {
    const barycenter = id => {
      const ps = g.parents.get(id).filter(p => positions.has(p));
      return ps.length ? ps.reduce((s,p) => s + positions.get(p).row, 0) / ps.length : 0;
    };
    ids.sort((a,b) => barycenter(a) - barycenter(b) || a.localeCompare(b));
    ids.forEach((id,row) => positions.set(id, { x: 30 + col * 280, y: 42 + row * 100, row, layer: col }));
  });
  return { positions, width: Math.max(640, columns.length * 280 + 30),
    height: Math.max(340, Math.max(0, ...columns.map(c => c.length)) * 100 + 70) };
}
export function inflate(raw) {
  const data = structuredClone(raw);
  for (const p of data.problems || []) {
    assert(Array.isArray(p.catalogue), `Missing raw catalogue ${p.id}`);
    const declared = new Set(p.catalogue.map(row => row[0]));
    for (const id of [...Object.keys(p.directions || {}), ...Object.keys(p.proof_sources || {}), ...(p.preprints || [])]) assert(declared.has(id), `Unknown progress ID ${id}`);
    p.formulations = p.catalogue.map(row => {
      assert(Array.isArray(row) && [4,5].includes(row.length), 'Invalid catalogue tuple');
      const [id, title, family, line, source = p.catalogue_source] = row;
      const [forward, reverse] = p.directions?.[id] || ['unassessed', 'unassessed'];
      return { id, title, family, line, excerpt: title, source, forward, reverse,
        state: (p.preprints || []).includes(id) ? 'preprint' : 'specification',
        ...(p.proof_sources?.[id] ? { proof_sources: p.proof_sources[id] } : {}) };
    });
  }
  return validate(data);
}
export function expandFamily(problem, familyId) {
  const family = problem.families.find(f => f.id === familyId);
  if (!family) return problem;
  const statements = problem.formulations.filter(f => f.family === familyId && f.id !== problem.root_formulation);
  if (!statements.length) return problem;
  return { ...problem,
    nodes: [...problem.nodes, ...statements.map(f => ({ id: f.id, title: f.title,
      kind: 'object', state: 'specification', summary: "Equivalent-formulation specification; proof progress is recorded separately in each direction.", sources: [f.source], formulation: f }))],
    edges: [...problem.edges.filter(e => !(e.from === family.node && e.to === problem.goal)),
      ...statements.flatMap(f => [
        { from: family.node, to: f.id, kind: 'structure', reason: "This family contains the statement; proof completion is not inferred.", sources: [f.source] },
        { from: f.id, to: problem.goal, kind: 'structure', reason: "RH equivalence target; evidence for both directions is recorded separately.", sources: [f.source] }
      ])]
  };
}
export function readRoute(href, data) {
  const params = new URL(href).searchParams;
  const problem = data.problems.find(p => p.id === params.get('problem')) || data.problems[0];
  const formulation = problem.formulations.find(f => f.id === params.get('node') && f.id !== problem.root_formulation);
  const node = formulation?.id || (problem.nodes.some(n => n.id === params.get('node')) ? params.get('node') : problem.goal);
  const family = formulation?.family || (problem.families.some(f => f.id === params.get('family')) ? params.get('family') : '');
  return { problem: problem.id, node, family, view: VIEWS.includes(params.get('view')) ? params.get('view') : 'map',
    specs: Boolean(formulation) || params.get('specs') === '1', q: (params.get('q') || '').slice(0,160) };
}
export function routeURL(href, changes) {
  const u = new URL(href);
  for (const [key,value] of Object.entries(changes)) if (value) u.searchParams.set(key, value); else u.searchParams.delete(key);
  return u.href;
}
export function counts(problem) {
  const states = Object.fromEntries(Object.keys(STATES).map(s => [s, 0]));
  for (const node of problem.nodes) states[node.state]++;
  return { states, specifications: problem.formulations.length, families: problem.families.length };
}
export function validate(data) {
  assert(data?.schema === 'pages-millennium.v1' && text(data.revision), 'Invalid Millennium schema');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.reviewed), 'Missing review date');
  assert(Array.isArray(data.problems) && data.problems.length === 7, 'Seven Millennium problems required');
  assert(data.sources && typeof data.sources === 'object', 'Missing sources');
  for (const [id,s] of Object.entries(data.sources)) {
    assert(ID.test(id) && text(s.label), 'Invalid source');
    if (s.kind === 'repo') {
      assert(/^[\w.-]+\/[\w.-]+$/.test(s.repo) && SHA.test(s.commit), `Unpinned source ${id}`);
      assert(text(s.path) && !s.path.startsWith('/') && !s.path.split('/').some(p => !p || p === '..' || p === '.'), `Bad path ${id}`);
    } else assert(['literature','receipt'].includes(s.kind) && safeURL(s.url), `Unsafe source ${id}`);
  }
  const unique = (items, name) => {
    const seen = new Set();
    for (const item of items) { assert(ID.test(item.id) && !seen.has(item.id), `Duplicate/invalid ${name} ${item.id}`); seen.add(item.id); }
    return seen;
  };
  unique(data.problems, 'problem');
  const refs = (ids, label) => assert(Array.isArray(ids) && ids.length > 0 && ids.every(id => data.sources[id]), `Missing source ${label}`);
  for (const p of data.problems) {
    assert(text(p.title) && text(p.summary) && text(p.question), `Incomplete problem ${p.id}`);
    assert(['open','solved'].includes(p.scientific_state) && ['curated','starter'].includes(p.coverage), `Invalid problem status ${p.id}`);
    refs(p.sources, p.id);
    assert(Array.isArray(p.nodes) && p.nodes.length > 0 && Array.isArray(p.edges), `Missing graph ${p.id}`);
    const nodes = unique(p.nodes, 'node');
    assert(nodes.has(p.goal), `Missing goal ${p.id}`);
    for (const n of p.nodes) {
      assert(Object.hasOwn(STATES, n.state) && ['source','bridge','family','goal','object'].includes(n.kind), `Bad node ${n.id}`);
      assert(text(n.title) && text(n.summary), `Incomplete node ${n.id}`); refs(n.sources, n.id);
    }
    const seen = new Set();
    for (const e of p.edges) {
      const id = `${e.from}:${e.to}`;
      assert(!seen.has(id) && e.from !== e.to && Object.hasOwn(EDGE_KINDS, e.kind) && text(e.reason), `Invalid edge ${id}`);
      refs(e.sources, id); seen.add(id);
    }
    topological(p);
    assert(Array.isArray(p.families) && Array.isArray(p.formulations) && Array.isArray(p.gaps), `Missing catalogue ${p.id}`);
    const families = unique(p.families, 'family'); unique(p.formulations, 'formulation');
    for (const f of p.families) assert(nodes.has(f.node) && text(f.title) && text(f.gap), `Incomplete family ${f.id}`);
    for (const f of p.formulations) {
      assert(families.has(f.family) && text(f.title) && text(f.excerpt) && ['specification','preprint'].includes(f.state), `Invalid formulation ${f.id}`);
      assert(data.sources[f.source] && Number.isInteger(f.line) && f.line > 0, `Unbound formulation ${f.id}`);
      for (const direction of ['forward','reverse']) {
        assert(['unassessed','conditional','candidate','identity'].includes(f[direction]), `Missing direction ${f.id}`);
        if (f[direction] === 'identity') assert(f.id === p.root_formulation, `Only the RH root has identity status ${f.id}`);
      }
      if (f.proof_sources) refs(f.proof_sources, f.id);
    }
    for (const n of p.nodes) assert(closure(p, [n.id], 'children').ids.has(p.goal), `Disconnected route ${n.id}`);
  }
  return data;
}
export function validateNotebook(value, data) {
  assert(value?.schema === 'pages-millennium-notebook.v1' && typeof value.entries === 'object' && !Array.isArray(value.entries) && value.entries !== null, 'Invalid notebook');
  const known = new Set(data.problems.flatMap(p => [...p.nodes, ...p.formulations].map(n => `${p.id}:${n.id}`)));
  for (const [key,e] of Object.entries(value.entries)) {
    assert(known.has(key) && typeof e.note === 'string' && e.note.length <= 5000 && typeof e.starred === 'boolean', `Invalid notebook entry ${key}`);
  }
  return value;
}
