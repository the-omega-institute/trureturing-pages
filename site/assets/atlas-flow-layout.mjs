import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceZ } from "./vendor/d3-force-3d.mjs";

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const seed = id => {
  let value = 2166136261;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};

// Prefer the immediately preceding prerequisite. Every chosen segment is a real
// import. Cross-parent imports remain in the simulation and renderer as well.
export function flowParents(architecture) {
  const primary = new Map();
  for (const [id, parents] of architecture.parents) {
    const parent = [...parents].sort((a, b) => architecture.metrics.get(b).depth - architecture.metrics.get(a).depth || architecture.metrics.get(b).reach - architecture.metrics.get(a).reach || compare(a, b))[0];
    if (parent) primary.set(id, parent);
  }
  return primary;
}

// Entry points are actual directed lineages. They may overlap at real joins;
// no module is assigned to an artificial, mutually exclusive drawing basin.
export function flowLineages(theory, architecture) {
  const main = theory.components[0];
  if (!main) return {groups:[],byNode:new Map()};
  const roots = main.ids.filter(id => !architecture.parents.get(id).size)
    .sort((a,b) => architecture.metrics.get(b).reach - architecture.metrics.get(a).reach || compare(a,b));
  const groups = [];
  for (const anchor of roots) {
    const members = new Set([anchor,...architecture.descendants.get(anchor)]);
    if (groups.some(group => {
      let shared = 0;
      for (const id of members) if (group.members.has(id)) shared++;
      return shared / Math.min(members.size, group.members.size) >= .2;
    })) continue;
    groups.push({id:anchor,anchor,members,ids:[...members],component:main.id});
    if (groups.length === 3) break;
  }
  const byNode = new Map();
  for (const group of groups) for (const id of group.ids) if (!byNode.has(id)) byNode.set(id,group);
  return {groups,byNode};
}

export function readFlowLayout(layout, theory, graphDigest) {
  if (layout?.schema_version !== "pages-atlas-flow-preview.v1" || layout.atlas_graph_digest !== graphDigest || !Array.isArray(layout.nodes) || layout.nodes.length !== theory.nodes.length)
    throw new Error("Flow layout does not match this publication.");
  const ids = new Set(theory.nodes.map(node => node.id)), positions = {};
  for (const row of layout.nodes) {
    if (!Array.isArray(row) || row.length !== 4 || !ids.delete(row[0]) || !row.slice(1).every(Number.isFinite))
      throw new Error("Invalid flow coordinate identity.");
    positions[row[0]] = { x: row[1], y: row[2], z: row[3] };
  }
  if (ids.size || theory.edges.some(edge => positions[edge.source].y <= positions[edge.target].y))
    throw new Error("Flow coordinates do not preserve directed depth.");
  return positions;
}

export function flowLayout(theory, architecture) {
  const primary = flowParents(architecture);
  const result = {};
  const connected = theory.components.filter(component => component.edgeCount);
  let shelfX = 0, shelfY = 0, shelfHeight = 0;
  for (const [index, component] of connected.entries()) {
    const ids = [...component.ids].sort(compare);
    const members = component.members;
    const edges = theory.edges.filter(edge => members.has(edge.source)).sort((a, b) => compare(a.source, b.source) || compare(a.target, b.target));
    const maxDepth = Math.max(...ids.map(id => architecture.metrics.get(id).depth));
    const counts = Array.from({ length: maxDepth + 1 }, () => 0);
    for (const id of ids) counts[architecture.metrics.get(id).depth]++;
    const levels = [0];
    // Broad ranks need room; long, sparse chains retain visible separation.
    for (let depth = 1; depth <= maxDepth; depth++) levels.push(levels.at(-1) + 28 + 2.4 * Math.sqrt((counts[depth - 1] + counts[depth]) / 2));
    const scale = index === 0 ? Math.min(1, 1050 / (levels.at(-1) || 1)) : 1;
    const spread = Math.max(25, Math.sqrt(ids.length) * 7);
    const nodes = ids.map(id => {
      const value = seed(id), angle = value / 0x100000000 * Math.PI * 2;
      const radius = Math.sqrt((seed(id + ":radius") + .5) / 0x100000000) * spread;
      const y = -levels[architecture.metrics.get(id).depth] * scale;
      return { id, x: Math.cos(angle) * radius, y, fy: y, z: Math.sin(angle) * radius * .55 };
    });
    const simulation = forceSimulation(nodes, 3).stop()
      .force("link", forceLink(edges.map(edge => ({ source: edge.source, target: edge.target })))
        .id(node => node.id)
        .distance(edge => Math.hypot(edge.source.fy - edge.target.fy, 24))
        .strength(edge => primary.get(edge.target.id) === edge.source.id ? .85 : .25))
      .force("charge", forceManyBody().strength(-22).distanceMax(220).theta(1.1))
      .force("collision", forceCollide(4.5))
      .force("x", forceX(0).strength(.006))
      .force("z", forceZ(0).strength(.018));
    simulation.tick(index === 0 ? 70 : 35);
    const bounds = axis => [Math.min(...nodes.map(n => n[axis])), Math.max(...nodes.map(n => n[axis]))];
    const [x0, x1] = bounds("x"), [y0, y1] = bounds("y"), [z0, z1] = bounds("z");
    let offsetX = -(x0 + x1) / 2, offsetY = -y1;
    if (index > 0) {
      if (shelfX + x1 - x0 > 1500) { shelfX = 0; shelfY -= shelfHeight + 65; shelfHeight = 0; }
      offsetX = 1250 + shelfX - x0; offsetY = shelfY - y1;
      shelfX += x1 - x0 + 55; shelfHeight = Math.max(shelfHeight, y1 - y0);
    }
    for (const node of nodes) result[node.id] = {
      x: (node.x + offsetX) * 1.4, y: node.y + offsetY, z: (node.z - (z0 + z1) / 2) * .55,
    };
  }
  // Separate disconnected records from the connected flow; never fabricate links.
  let isolated = 0;
  for (const component of theory.components.filter(c => !c.edgeCount)) {
    for (const id of component.ids) {
      result[id] = { x: (1300 + isolated % 40 * 12) * 1.4, y: shelfY - shelfHeight - 100 - Math.floor(isolated / 40) * 12, z: 0 };
      isolated++;
    }
  }
  return result;
}
