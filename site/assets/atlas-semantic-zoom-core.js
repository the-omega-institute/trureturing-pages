(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingAtlasSemanticZoom = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const LEVELS = Object.freeze(["far", "medium", "near", "focus"]);
  const LEVEL_RANK = Object.freeze({ far: 0, medium: 1, near: 2, focus: 3 });
  const IMPORTANT_ROLES = new Set([
    "foundation",
    "hub",
    "bridge",
    "interface",
    "frontier-adjacent"
  ]);

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function normalizeLevel(value, fallback) {
    return LEVEL_RANK[value] === undefined ? fallback : value;
  }

  function canonicalRadius(positionById) {
    const points = [...positionById.values()]
      .filter((point) => point
        && Number.isFinite(Number(point.x))
        && Number.isFinite(Number(point.y))
        && Number.isFinite(Number(point.z)))
      .map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
        z: Number(point.z)
      }));
    if (!points.length) return 1;
    const center = points.reduce((sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
      z: sum.z + point.z / points.length
    }), { x: 0, y: 0, z: 0 });
    return Math.max(1, ...points.map((point) => Math.hypot(
      point.x - center.x,
      point.y - center.y,
      point.z - center.z
    )));
  }

  function levelFromCamera(distance, radius, previousLevel) {
    const previous = normalizeLevel(previousLevel, "far");
    if (!Number.isFinite(distance) || distance <= 0
        || !Number.isFinite(radius) || radius <= 0) {
      return previous;
    }
    const ratio = distance / radius;
    if (previous === "far") {
      return ratio < 2.55 ? "medium" : "far";
    }
    if (previous === "medium") {
      if (ratio >= 3.05) return "far";
      if (ratio < 1.28) return "near";
      return "medium";
    }
    if (previous === "near") {
      return ratio >= 1.68 ? "medium" : "near";
    }
    return ratio >= 1.68 ? "medium" : "near";
  }

  function effectiveLevel(automaticLevel, selectedId, clusterId) {
    if (selectedId) return "focus";
    if (clusterId && clusterId !== "All") return "near";
    return normalizeLevel(automaticLevel, "far");
  }

  function nodeMatches(node, state, clusterId) {
    const stateMatch = state === "All" || node.status === state;
    const clusterMatch = clusterId === "All"
      || node.atlas_cluster_id === clusterId
      || node.kind !== "truth" && node.region_id === clusterId;
    return stateMatch && clusterMatch;
  }

  function baseNodeIds(model, options) {
    const state = options.state || "All";
    const clusterId = options.clusterId || "All";
    const mode = options.mode || "structure";
    const base = new Set(model.graph.nodes
      .filter((node) => nodeMatches(node, state, clusterId))
      .map((node) => node.id));
    if (mode !== "frontier") return base;

    const frontier = new Set();
    for (const id of base) {
      const node = model.nodeById.get(id);
      const role = String(node.structural_role || "");
      const nodeState = String(node.state || node.status || "").toLowerCase();
      if (nodeState === "open" || role === "frontier-adjacent") frontier.add(id);
    }
    const expanded = new Set(frontier);
    for (const id of frontier) {
      for (const parent of model.parents.get(id) || []) {
        if (base.has(parent)) expanded.add(parent);
      }
      for (const child of model.children.get(id) || []) {
        if (base.has(child)) expanded.add(child);
      }
    }
    return expanded;
  }

  function addClusterRepresentatives(model, base, visible) {
    for (const cluster of model.leafClusters) {
      const members = (cluster.member_node_ids || [])
        .filter((id) => base.has(id));
      if (!members.length) continue;
      const representatives = (cluster.representative_node_ids || [])
        .filter((id) => base.has(id));
      const selected = representatives.length
        ? representatives.slice(0, 3)
        : members.slice().sort().slice(0, 1);
      selected.forEach((id) => visible.add(id));
    }
  }

  function addCertifiedBackboneEndpoints(model, base, visible) {
    for (const edge of model.edges) {
      if (edge.authority !== "certified"
          || !base.has(edge.source)
          || !base.has(edge.target)) continue;
      if (edge.is_cut_bridge || edge.cluster_relation === "inter-cluster") {
        visible.add(edge.source);
        visible.add(edge.target);
      }
    }
  }

  function addImportantRoles(model, base, visible) {
    for (const id of base) {
      const node = model.nodeById.get(id);
      if (IMPORTANT_ROLES.has(String(node.structural_role || ""))) {
        visible.add(id);
      }
    }
  }

  function addFocusNeighborhood(model, base, selectedId, visible) {
    if (!selectedId || !base.has(selectedId)) {
      base.forEach((id) => visible.add(id));
      return;
    }
    visible.add(selectedId);
    let frontier = new Set([selectedId]);
    for (let hop = 0; hop < 2; hop += 1) {
      const next = new Set();
      for (const id of frontier) {
        for (const neighbor of [
          ...(model.parents.get(id) || []),
          ...(model.children.get(id) || [])
        ]) {
          if (base.has(neighbor) && !visible.has(neighbor)) {
            visible.add(neighbor);
            next.add(neighbor);
          }
        }
      }
      frontier = next;
    }
    for (const edge of model.edges) {
      if (edge.source !== selectedId && edge.target !== selectedId) continue;
      const other = edge.source === selectedId ? edge.target : edge.source;
      if (base.has(other)) visible.add(other);
    }
  }

  function nodeIdsForLevel(model, options, level) {
    const base = baseNodeIds(model, options);
    const effective = normalizeLevel(level, "far");
    if (effective === "near") return base;

    const visible = new Set();
    if (effective === "focus") {
      addFocusNeighborhood(model, base, options.selectedId || null, visible);
      return visible;
    }

    addClusterRepresentatives(model, base, visible);
    addCertifiedBackboneEndpoints(model, base, visible);
    if (effective === "medium") addImportantRoles(model, base, visible);

    if (!visible.size && base.size) {
      visible.add([...base].sort()[0]);
    }
    return visible;
  }

  function edgesForLevel(model, nodeIds, options, level) {
    const effective = normalizeLevel(level, "far");
    const mode = options.mode || "structure";
    const selectedId = options.selectedId || null;
    return model.edges.filter((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
      const incident = Boolean(selectedId)
        && (edge.source === selectedId || edge.target === selectedId);

      if (effective === "far") {
        return edge.authority === "certified"
          && (edge.is_cut_bridge || edge.cluster_relation === "inter-cluster");
      }

      if (effective === "medium") {
        if (edge.authority !== "certified") return incident;
        if (edge.is_cut_bridge || edge.cluster_relation === "inter-cluster") return true;
        const sourceRole = String(model.nodeById.get(edge.source).structural_role || "");
        const targetRole = String(model.nodeById.get(edge.target).structural_role || "");
        return IMPORTANT_ROLES.has(sourceRole) || IMPORTANT_ROLES.has(targetRole);
      }

      if (effective === "focus") {
        if (edge.authority === "certified") return true;
        return incident;
      }

      if (mode === "dependency") {
        return edge.authority === "certified"
          || edge.authority === "advisory"
          || incident && edge.authority === "authored";
      }
      if (mode === "frontier") {
        return edge.authority === "certified"
          || edge.authority === "advisory" && incident;
      }
      if (edge.authority === "derived" || edge.authority === "authored") {
        return incident;
      }
      if (edge.authority === "advisory") return true;
      return true;
    });
  }

  function graphView(model, options, level) {
    const nodeIds = nodeIdsForLevel(model, options, level);
    return {
      level: normalizeLevel(level, "far"),
      nodeIds,
      nodes: model.graph.nodes.filter((node) => nodeIds.has(node.id)),
      edges: edgesForLevel(model, nodeIds, options, level)
    };
  }

  function levelLabel(level) {
    return ({
      far: "Atlas overview",
      medium: "Structural landmarks",
      near: "Certified detail",
      focus: "Concept neighborhood"
    })[normalizeLevel(level, "far")];
  }

  return Object.freeze({
    IMPORTANT_ROLES,
    LEVELS,
    LEVEL_RANK,
    baseNodeIds,
    canonicalRadius,
    edgesForLevel,
    effectiveLevel,
    endpointId,
    graphView,
    levelFromCamera,
    levelLabel,
    nodeIdsForLevel,
    normalizeLevel
  });
}));
