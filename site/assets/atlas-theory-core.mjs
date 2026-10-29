// Editorial reading routes through published module imports. Every intermediate
// module is retained; an absent route never becomes an inferred proof edge.
export const THEORY_ROUTES = [
  {
    id: "readouts", title: "From readouts to acquisition", color: "#6ad7c8",
    question: "How does a concept become an observation we can acquire?",
    summary: "Concept fibers, joint readouts and adaptive experiments lead to actual tree readout and acquisition.",
    waypoints: ["D5/S3/ConceptDynamics/ConceptFiberDecomposition", "D5/S3/ConceptDynamics/ConceptJoinUniversal", "D5/S3/Arith/FibonacciAtomic/ActualTreeReadoutAcquisition"],
  },
  {
    id: "measurement", title: "From records to measurement", color: "#a3b7fa",
    question: "What remains when a measurement record is unread?",
    summary: "Record conditioning becomes an orthogonal projection, then a basis measurement and an entropy construction.",
    waypoints: ["D5/S3/Observer/Conditioning", "D5/S3/Observer/Conditioning/UnreadStateOrthogonalProjection", "D5/S3/Quantum/Measurement/BasisMeasurementProjection", "D5/S3/Quantum/Divergence/VonNeumannEntropyPinching", "D5/S3/Quantum/Information/PartialTraceMutualInformation"],
  },
  {
    id: "uncertainty", title: "From information loss to prediction", color: "#edc66d",
    question: "How does lost information constrain prediction?",
    summary: "Classical divergence and entropy provide a route to conditional entropy and prediction stability.",
    waypoints: ["D5/S3/Divergence/ClassicalDPI", "D5/S3/Entropy/ConditionalEntropy", "D5/S3/ObserverMemory/Prediction/ConditionalEntropyStability"],
  },
  {
    id: "arithmetic", title: "From names to arithmetic structure", color: "#ef9285",
    question: "How do digit names generate a structured infinite word?",
    summary: "The W-digit convention develops through golden names, gaps and substitution to the Zeckendorf gap word.",
    waypoints: ["D5/S0/Conventions/WDigits", "D5/S0/Tower/GoldenNames", "D5/S0/Tower/GoldenGaps", "D5/S0/Tower/GoldenSubstitution", "D5/S0/Tower/GoldenGapFrequency", "D5/S0/Tower/GoldenGapWord", "D5/S0/Tower/GoldenGapZeckendorf"],
  },
];

export function importPath(architecture, from, to) {
  if (!architecture.children.has(from) || !architecture.children.has(to)) return [];
  const queue = [from], previous = new Map([[from, null]]);
  for (let i = 0; i < queue.length && !previous.has(to); i++) {
    for (const child of [...architecture.children.get(queue[i])].sort()) {
      if (previous.has(child)) continue;
      previous.set(child, queue[i]); queue.push(child);
    }
  }
  if (!previous.has(to)) return [];
  const path = [];
  for (let id = to; id !== null; id = previous.get(id)) path.push(id);
  return path.reverse();
}

export function theoryModel(model, architecture, definitions = THEORY_ROUTES) {
  const routes = [], unavailable = [];
  for (const definition of definitions) {
    const ids = [], segments = definition.waypoints.slice(1).map((id, i) =>
      importPath(architecture, definition.waypoints[i], id));
    if (!segments.length || segments.some(path => !path.length)) {
      unavailable.push(definition.id); continue;
    }
    for (const path of segments) ids.push(...path.slice(ids.length ? 1 : 0));
    routes.push({ ...definition, ids, members: new Set(ids) });
  }
  const ids = new Set(routes.flatMap(route => route.ids));
  // Show the actual shared construction reached by the first three routes.
  // These are paths in the release, never arrows inferred from the prose.
  for (const from of [
    "D5/S3/Quantum/Measurement/BasisMeasurementProjection",
    "D5/S3/Divergence/ClassicalDPI",
  ]) {
    const to = "D5/S3/Arith/FibonacciAtomic/ActualTreeReadoutAcquisition";
    if (ids.has(from) && ids.has(to))
      for (const id of importPath(architecture, from, to)) ids.add(id);
  }
  // Older releases still get an honest, navigable dependency overview.
  if (!ids.size) {
    const roots = model.nodes.filter(n => !architecture.parents.get(n.id).size)
      .sort((a, b) => architecture.metrics.get(b.id).reach - architecture.metrics.get(a.id).reach || a.id.localeCompare(b.id));
    for (const root of roots.slice(0, 4)) {
      let id = root.id;
      for (let i = 0; id && i < 6; i++) {
        ids.add(id);
        id = [...architecture.children.get(id)].sort((a, b) => architecture.metrics.get(b).reach - architecture.metrics.get(a).reach || a.localeCompare(b))[0];
      }
    }
  }
  return {
    routes, unavailable, ids,
    nodes: model.nodes.filter(n => ids.has(n.id)),
    edges: model.edges.filter(e => ids.has(e.source) && ids.has(e.target)),
  };
}

export function theoryLayout(theory, fallback, dagre) {
  const graph = new dagre.graphlib.Graph().setGraph({
    rankdir: "TB", nodesep: 55, ranksep: 80, edgesep: 20,
  }).setDefaultEdgeLabel(() => ({}));
  for (const node of theory.nodes) graph.setNode(node.id, { width: 205, height: 45 });
  for (const edge of theory.edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);
  const parents = new Map(theory.nodes.map(n => [n.id, 0]));
  const children = new Map(theory.nodes.map(n => [n.id, []]));
  const depth = new Map(theory.nodes.map(n => [n.id, 0]));
  for (const edge of theory.edges) {
    parents.set(edge.target, parents.get(edge.target) + 1);
    children.get(edge.source).push(edge.target);
  }
  const queue = theory.nodes.filter(n => !parents.get(n.id)).map(n => n.id);
  for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i])) {
    depth.set(child, Math.max(depth.get(child), depth.get(queue[i]) + 1));
    parents.set(child, parents.get(child) - 1);
    if (!parents.get(child)) queue.push(child);
  }
  const result = { ...fallback }, { width } = graph.graph();
  const maxDepth = Math.max(0, ...depth.values());
  for (const node of theory.nodes) {
    const p = graph.node(node.id);
    result[node.id] = { x: p.x - width / 2, y: (maxDepth / 2 - depth.get(node.id)) * 125, z: 0 };
  }
  return result;
}
