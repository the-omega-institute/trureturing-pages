(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingRelations = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const TYPES = ["proof", "affinity", "document", "advisory", "authored"];
  const endpoint = (value) =>
    value && typeof value === "object" ? value.id : value;
  function category(edge) {
    const layer = String(edge.layer || "dependency");
    if (
      layer.includes("intuition") ||
      ["proposed", "advisory"].includes(edge.status)
    )
      return "advisory";
    if (layer.startsWith("blueprint-")) return "document";
    if (layer.includes("affinity")) return "affinity";
    if (
      [
        "truth-dependency",
        "module-import",
        "frozen-prerequisite",
        "dependency",
      ].includes(layer) ||
      edge.status === "certified"
    )
      return "proof";
    return "authored";
  }
  function createIndex(graph) {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const parents = new Map(graph.nodes.map((n) => [n.id, new Set()]));
    const children = new Map(graph.nodes.map((n) => [n.id, new Set()]));
    const incident = new Map(graph.nodes.map((n) => [n.id, []]));
    const edges = graph.edges
      .map((edge, index) => ({
        ...edge,
        source: endpoint(edge.source),
        target: endpoint(edge.target),
        relationId: String(index),
        category: category(edge),
      }))
      .filter((e) => byId.has(e.source) && byId.has(e.target));
    for (const edge of edges) {
      incident.get(edge.source).push(edge);
      if (edge.target !== edge.source) incident.get(edge.target).push(edge);
      if (edge.category === "proof") {
        parents.get(edge.target).add(edge.source);
        children.get(edge.source).add(edge.target);
      }
    }
    return { byId, parents, children, incident, edges };
  }
  function reachable(map, id, limit) {
    const visited = new Set([id]);
    const result = new Set();
    const queue = [[id, 0]];
    for (let i = 0; i < queue.length; i++) {
      const [current, depth] = queue[i];
      if (depth >= limit) continue;
      for (const next of map.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        result.add(next);
        queue.push([next, depth + 1]);
      }
    }
    return result;
  }
  function related(index, id, { depth = "all", types = TYPES } = {}) {
    const enabled = new Set(types);
    const limit = depth === "all" ? Infinity : Math.max(1, Number(depth) || 1);
    const upstream = enabled.has("proof")
      ? reachable(index.parents, id, limit)
      : new Set();
    const downstream = enabled.has("proof")
      ? reachable(index.children, id, limit)
      : new Set();
    const lineage = new Set([id, ...upstream, ...downstream]);
    const ids = new Set(lineage);
    for (const key of lineage)
      for (const edge of index.incident.get(key) || []) {
        if (edge.category !== "proof" && enabled.has(edge.category)) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
    const edges = index.edges.filter(
      (e) => enabled.has(e.category) && ids.has(e.source) && ids.has(e.target),
    );
    return {
      ids,
      lineage,
      upstream,
      downstream,
      nodes: [...index.byId.values()].filter((n) => ids.has(n.id)),
      edges,
      edgeIds: new Set(edges.map((e) => e.relationId)),
      counts: Object.fromEntries(
        TYPES.map((type) => [
          type,
          edges.filter((e) => e.category === type).length,
        ]),
      ),
    };
  }
  return Object.freeze({ TYPES, category, createIndex, related, reachable });
});
