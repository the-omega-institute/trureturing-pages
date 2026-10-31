import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceZ } from './vendor/d3-force-3d.mjs';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function hash(value) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

const label = node => node.human_title || (node.repo_path || node.id).split('/').pop().replace(/\.lean$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
// Only admitted modules and real imports belong to the mathematical model.
// Components describe actual connectivity, independently of editorial subjects.
export function theoryModel(model, architecture) {
  const admitted = new Set(model.nodes.map(n => n.id));
  const seen = new Set(), components = [], componentByNode = new Map();
  for (const node of model.nodes) {
    if (seen.has(node.id)) continue;
    const ids = [node.id]; seen.add(node.id);
    for (let i = 0; i < ids.length; i++) {
      for (const next of [...architecture.parents.get(ids[i]), ...architecture.children.get(ids[i])]) {
        if (!admitted.has(next) || seen.has(next)) continue;
        seen.add(next); ids.push(next);
      }
    }
    ids.sort(compare);
    const component = { id: ids[0], ids, members: new Set(ids), edgeCount: 0 };
    const domains = new Map();
    for (const id of ids) {
      const domain = model.byId.get(id).domain || 'Unclassified';
      domains.set(domain, (domains.get(domain) || 0) + 1);
    }
    component.domains = [...domains].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
    component.anchor = ids.slice().sort((a, b) => architecture.metrics.get(b).reach - architecture.metrics.get(a).reach || compare(a, b))[0];
    component.label = `${component.domains.slice(0, 2).map(([d]) => d.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' · ')} / ${label(model.byId.get(component.anchor))}`;
    component.joins = ids.filter(id => architecture.parents.get(id).size > 1)
      .sort((a, b) => architecture.parents.get(b).size - architecture.parents.get(a).size || compare(a, b));
    components.push(component);
    for (const id of ids) componentByNode.set(id, component);
  }
  for (const edge of model.edges) componentByNode.get(edge.source).edgeCount++;
  components.sort((a, b) => b.ids.length - a.ids.length || compare(a.id, b.id));
  return {
    nodes: model.nodes, edges: model.edges, components, componentByNode,
    isolated: components.filter(c => c.ids.length === 1 && !c.edgeCount).length,
    roots: model.nodes.filter(n => !architecture.parents.get(n.id).size).length,
    maxDepth: Math.max(0, ...model.nodes.map(n => architecture.metrics.get(n.id).depth)),
  };
}

// Directed breadth-first search: every adjacent pair is an existing module import.
export function directedPath(architecture, from, to) {
  if (!architecture.children.has(from) || !architecture.children.has(to)) return null;
  const previous = new Map([[from, null]]), queue = [from];
  for (let i = 0; i < queue.length && !previous.has(to); i++)
    for (const next of architecture.children.get(queue[i]))
      if (!previous.has(next)) { previous.set(next, queue[i]); queue.push(next); }
  if (!previous.has(to)) return null;
  const path = [];
  for (let next = to; next !== null; next = previous.get(next)) path.unshift(next);
  return path;
}

// Primary parents organize drawing only. Secondary parents and every original
// import remain in the graph. Branch basins use graph distance, never topics.
export function dependencyBranches(theory, architecture) {
  const primary = new Map(), rootByNode = new Map(), trees = new Map();
  const order = [...theory.nodes].sort((a, b) => architecture.metrics.get(a.id).depth - architecture.metrics.get(b.id).depth || compare(a.id, b.id));
  for (const node of order) {
    const parent = [...architecture.parents.get(node.id)].sort((a, b) => architecture.metrics.get(b).reach - architecture.metrics.get(a).reach || compare(a, b))[0];
    if (parent) primary.set(node.id, parent);
    const root = parent ? rootByNode.get(parent) : node.id;
    rootByNode.set(node.id, root);
    if (!trees.has(root)) trees.set(root, []);
    trees.get(root).push(node.id);
  }
  const palette = ['#72d8d5', '#83b9f0', '#c4a9ec', '#edc785', '#89c9aa', '#e29da9', '#88d4ec', '#b9cc7d', '#beadf0', '#e6ad83', '#76bde1', '#c4d7dd'];
  const groups = [], byNode = new Map(), spine = new Set();
  for (const component of theory.components) {
    if (!component.edgeCount) continue;
    const roots = [...new Set(component.ids.map(id => rootByNode.get(id)))];
    const seeds = component.ids.length > 500
      ? roots.sort((a, b) => trees.get(b).length - trees.get(a).length || compare(a, b)).slice(0, 12)
      : [component.anchor];
    const queue = [];
    for (const seed of seeds) {
      const group = { id: seed, anchor: seed, ids: [], component: component.id, color: palette[groups.length % palette.length] };
      groups.push(group);
      for (const id of (trees.get(seed) || [seed])) { byNode.set(id, group); queue.push(id); }
    }
    // A multi-source breadth-first expansion attaches remaining modules through
    // actual imports. Seeding the primary trees preserves complete long branches.
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const next of [...architecture.parents.get(id), ...architecture.children.get(id)]) {
        if (byNode.has(next)) continue;
        byNode.set(next, byNode.get(id)); queue.push(next);
      }
    }
    for (const id of component.ids) byNode.get(id).ids.push(id);
  }
  for (const [target, source] of primary) {
    if (architecture.metrics.get(source).reach >= 25 && architecture.metrics.get(target).reach >= 8)
      spine.add(JSON.stringify([source, target]));
  }
  return { groups, byNode, primary, spine };
}

// Depth opens the dense early levels; branch basins keep real import trees
// separated in 3D. Positions are deterministic and remain fixed on selection.
export function theoryLayout(theory, architecture) {
  const branches = dependencyBranches(theory, architecture), centers = new Map();
  const main = theory.components.find(c => c.edgeCount);
  const major = branches.groups.filter(g => g.component === main?.id);
  major.forEach((group, index) => {
    const fraction = major.length === 1 ? 0.5 : index / (major.length - 1);
    centers.set(group.id, { x: (fraction - 0.5) * 1850, z: Math.sin(index * 2.4) * 170 });
  });
  let shelfX = 1260, shelfZ = 0, rowHeight = 0;
  for (const group of branches.groups.filter(g => g.component !== main?.id)) {
    const radius = 5 + Math.sqrt(group.ids.length) * 3;
    if (shelfX + radius * 2 > 2300) { shelfX = 1260; shelfZ -= rowHeight + 12; rowHeight = 0; }
    centers.set(group.id, { x: shelfX + radius, z: shelfZ - radius });
    shelfX += radius * 2 + 12; rowHeight = Math.max(rowHeight, radius * 2);
  }
  const result = {}, nodes = [];
  let isolatedIndex = 0;
  for (const node of theory.nodes) {
    const group = branches.byNode.get(node.id);
    if (!group) {
      result[node.id] = { x: 1300 + (isolatedIndex % 32) * 12, y: -930 - Math.floor(isolatedIndex / 32) * 7, z: 70 };
      isolatedIndex++; continue;
    }
    const center = centers.get(group.id), seed = hash(node.id);
    const angle = seed * 0.0001, radius = Math.sqrt((seed >>> 8) / 0xffffff) * (20 + Math.sqrt(group.ids.length) * 3.5);
    const y = -Math.log2(1 + architecture.metrics.get(node.id).depth) * 200;
    nodes.push({ id: node.id, x: center.x + Math.cos(angle) * radius, y, fy: y, z: center.z + Math.sin(angle) * radius, center, branch: group.id });
  }
  const simulation = forceSimulation(nodes, 3).stop()
    .force('link', forceLink(theory.edges.map(e => ({ source: e.source, target: e.target })))
      .id(n => n.id).distance(e => Math.abs(e.source.fy - e.target.fy) + 28)
      .strength(e => e.source.branch === e.target.branch ? 0.48 : 0.06))
    .force('charge', forceManyBody().strength(-16).distanceMax(100))
    .force('collision', forceCollide(3.4))
    .force('x', forceX(n => n.center.x).strength(0.13))
    .force('z', forceZ(n => n.center.z).strength(0.13));
  simulation.tick(100);
  for (const node of nodes) result[node.id] = { x: node.x, y: node.fy, z: node.z };
  return result;
}

export function documentPositions(model, positions) {
  const result = { ...positions };
  for (const node of model.allNodes) {
    if (result[node.id]) continue;
    const anchors = (model.relationships.incident.get(node.id) || [])
      .map(e => positions[e.source === node.id ? e.target : e.source]).filter(Boolean);
    const point = anchors.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y, z: sum.z + p.z }), { x: 0, y: 0, z: 0 });
    const count = anchors.length || 1;
    result[node.id] = { x: point.x / count + 12, y: point.y / count, z: point.z / count + 18 };
  }
  return result;
}

// Previously shared editorial-route URLs now locate their starting module in
// the complete graph, without restricting the displayed nodes or dependencies.
export const LEGACY_ROUTE_ANCHORS = {
  readouts: 'D5/S3/ConceptDynamics/ConceptFiberDecomposition',
  measurement: 'D5/S3/Observer/Conditioning',
  uncertainty: 'D5/S3/Divergence/ClassicalDPI',
  arithmetic: 'D5/S0/Conventions/WDigits',
};
