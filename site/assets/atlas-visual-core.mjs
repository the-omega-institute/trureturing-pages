export function structuralScaffold(model, architecture) {
  const score = (id) => {
    const m = architecture.metrics.get(id);
    return m ? Math.log2(1 + m.reach) * 2 + Math.log2(1 + m.direct) : 0;
  };
  const parent = new Map();
  const spine = new Set();
  const depth = new Map();
  const local = model.edges.filter(
    (e) => model.byId.get(e.source).family === model.byId.get(e.target).family,
  );
  for (const edge of local) {
    const previous = parent.get(edge.target);
    if (
      !previous ||
      score(edge.source) > score(previous.source) ||
      (score(edge.source) === score(previous.source) &&
        edge.source < previous.source)
    )
      parent.set(edge.target, edge);
  }
  for (const node of [...model.nodes].sort(
    (a, b) =>
      architecture.metrics.get(a.id).depth -
        architecture.metrics.get(b.id).depth || a.id.localeCompare(b.id),
  )) {
    const edge = parent.get(node.id);
    depth.set(node.id, edge ? (depth.get(edge.source) || 0) + 1 : 0);
    if (edge && architecture.metrics.get(edge.source).reach >= 3)
      spine.add(edge.relationId);
  }
  const landmarks = new Set(
    model.families.flatMap((family) =>
      [...family.nodes]
        .filter((n) => architecture.metrics.get(n.id).direct > 0)
        .sort((a, b) => score(b.id) - score(a.id) || a.id.localeCompare(b.id))
        .slice(0, 4)
        .map((n) => n.id),
    ),
  );
  return { parent, spine, depth, landmarks, score };
}

export function focusRole(id, selected, related, model) {
  if (id === selected) return "selected";
  if (!related?.ids.has(id)) return "context";
  if (related.upstream.has(id)) return "upstream";
  if (related.downstream.has(id)) return "downstream";
  if (model.byId.get(id)?.kind !== "truth") return "document";
  return "affinity";
}

export const ROLE_COLORS = {
  selected: "#ffffff",
  upstream: "#efc66e",
  downstream: "#6ad7c8",
  document: "#82b5e0",
  affinity: "#d7a0ca",
  context: "#253036",
};

export function relationBundles(model, edges = model.edges) {
  const groups = new Map();
  for (const edge of edges) {
    if (edge.category !== "proof") continue;
    const source = model.byId.get(edge.source),
      target = model.byId.get(edge.target);
    if (
      source?.kind !== "truth" ||
      target?.kind !== "truth" ||
      source.family === target.family
    )
      continue;
    const key = `${source.family}:${target.family}`;
    if (!groups.has(key))
      groups.set(key, {
        key,
        source: source.family,
        target: target.family,
        edges: [],
        ids: new Set(),
      });
    const group = groups.get(key);
    group.edges.push(edge);
    group.ids.add(source.id);
    group.ids.add(target.id);
  }
  return [...groups.values()].sort(
    (a, b) => b.edges.length - a.edges.length || a.key.localeCompare(b.key),
  );
}

export function researchMarkers(research, positions, slug = null) {
  if (!research) return [];
  return [...research.problems.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((problem, index) => {
      const points = problem.anchors.map((id) => positions[id]).filter(Boolean);
      if (!points.length) return null;
      const center = points.reduce(
        (sum, p) => ({
          x: sum.x + p.x / points.length,
          y: sum.y + p.y / points.length,
          z: sum.z + p.z / points.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      const angle = index * 2.39996323;
      return {
        type: "research",
        key: problem.slug,
        title: problem.title,
        anchors: problem.anchors,
        count: points.length,
        point: {
          x: center.x + Math.cos(angle) * 150,
          y: center.y + Math.sin(angle) * 140,
          z: center.z + 130 + (index % 3) * 30,
        },
      };
    })
    .filter((item) => item && (!slug || item.key === slug));
}

export function visualLevel(distance, selected = false) {
  return selected || distance < 950
    ? "detail"
    : distance < 1900
      ? "near"
      : "overview";
}
