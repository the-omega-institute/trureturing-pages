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

// Layout uses only directed dependencies and their connected components.
// y strictly decreases with import depth. Square-root spacing keeps long tails
// visible alongside broad shallow branches; x/z are relaxed by the actual edges.
export function theoryLayout(theory, architecture) {
  const centers = new Map();
  let shelfX = -800, shelfZ = 340, shelfHeight = 0;
  const connected = theory.components.filter(c => c.edgeCount);
  connected.forEach((component, index) => {
    const radius = 4 + Math.sqrt(component.ids.length) * 3;
    if (!index) centers.set(component.id, { x: 0, z: 0, radius: 300, stretch: 2.2 });
    else {
      if (shelfX + radius * 2 > 800) {
        shelfX = -800; shelfZ += shelfHeight + 15; shelfHeight = 0;
      }
      centers.set(component.id, { x: shelfX + radius, z: shelfZ + radius, radius });
      shelfX += radius * 2 + 12; shelfHeight = Math.max(shelfHeight, radius * 2);
    }
  });
  const result = {}, nodes = [];
  let isolatedIndex = 0;
  for (const node of theory.nodes) {
    const component = theory.componentByNode.get(node.id);
    const depth = architecture.metrics.get(node.id).depth;
    if (!component.edgeCount) {
      result[node.id] = { x: 760 + (isolatedIndex % 36) * 9, y: 0, z: -170 + Math.floor(isolatedIndex / 36) * 9 };
      isolatedIndex++; continue;
    }
    const center = centers.get(component.id), seed = hash(node.id);
    const angle = seed * 0.0001, radius = Math.sqrt((seed >>> 8) / 0xffffff) * center.radius;
    const y = -Math.sqrt(depth) * 105;
    nodes.push({ id: node.id, x: center.x + Math.cos(angle) * radius,
      y, fy: y, z: center.z + Math.sin(angle) * radius, center });
  }
  const simulation = forceSimulation(nodes, 3).stop()
    .force('link', forceLink(theory.edges.map(e => ({ source: e.source, target: e.target })))
      .id(n => n.id).distance(e => Math.abs(e.source.fy - e.target.fy) + 12).strength(0.7))
    .force('charge', forceManyBody().strength(-8).distanceMax(80))
    .force('collision', forceCollide(2.2))
    .force('x', forceX(n => n.center.x).strength(0.012))
    .force('z', forceZ(n => n.center.z).strength(0.012));
  simulation.tick(85);
  for (const node of nodes) result[node.id] = {
    // Give the main connected DAG enough horizontal room for branches and joins.
    x: node.center.x + (node.x - node.center.x) * (node.center.stretch || 1),
    y: node.fy, z: node.z,
  };
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
