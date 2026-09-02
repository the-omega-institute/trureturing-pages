(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingAtlasStructure = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const CERTIFIED_LAYERS = new Set([
    "truth-dependency",
    "module-import",
    "frozen-prerequisite"
  ]);
  const MODES = new Set(["structure", "dependency", "frontier"]);

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function edgeAuthority(edge) {
    const layer = String((edge && edge.layer) || "");
    const status = String((edge && edge.status) || "");
    if (layer === "intuition-candidate" || status === "proposed" || status === "advisory") {
      return "advisory";
    }
    if (CERTIFIED_LAYERS.has(layer) || status === "certified") return "certified";
    if (layer.startsWith("blueprint-")) return "authored";
    if (layer === "structural-affinity" || layer.includes("affinity")) return "derived";
    return "authored";
  }

  function stableHash(value) {
    let result = 2166136261;
    for (const character of String(value || "")) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function clusterHue(clusterId) {
    return (stableHash(clusterId) * 137.508) % 360;
  }

  function clusterColor(clusterId, state, selected) {
    if (selected) return "hsl(195 92% 72%)";
    if (!clusterId) return "hsl(210 12% 62%)";
    const hue = clusterHue(clusterId).toFixed(1);
    const normalized = String(state || "").toLowerCase();
    const saturation = normalized === "semantic" ? 18 : 62;
    const lightness = normalized === "open" ? 72
      : normalized === "tail" ? 68
        : normalized === "semantic" ? 64
          : 57;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }

  function rationalNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const match = value.trim().match(/^(\d+)(?:\/(\d+))?$/);
      if (!match) return 0;
      const denominator = Number(match[2] || 1);
      return denominator > 0 ? Number(match[1]) / denominator : 0;
    }
    if (value && typeof value === "object") {
      const numerator = Number(value.numerator);
      const denominator = Number(value.denominator);
      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
        ? numerator / denominator
        : 0;
    }
    return 0;
  }

  function humanize(value) {
    return String(value || "")
      .replace(/\.lean$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function humanTitle(node) {
    if (!node) return "Concept";
    if (typeof node.human_title === "string" && node.human_title.trim() && node.human_title !== "None") {
      return node.human_title.trim();
    }
    const raw = String(node.repo_path || node.title || node.id || "Concept");
    const leaf = humanize(raw.split("/").pop()) || "Concept";
    const domain = humanize(node.domain);
    return domain && domain.toLowerCase() !== leaf.toLowerCase()
      ? `${domain}: ${leaf}`
      : leaf;
  }

  function trueDepth(node) {
    for (const value of [node && node.true_depth, node && node.max_depth, node && node.depth]) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  function roleScale(role) {
    return ({
      foundation: 1.12,
      hub: 1.35,
      bridge: 1.26,
      interface: 1.2,
      "frontier-adjacent": 1.12,
      "specialized-leaf": 0.9,
      internal: 1
    })[role] || 1;
  }

  function createModel(graph, conformation) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new TypeError("Atlas graph must contain nodes and edges arrays");
    }
    if (!conformation || !Array.isArray(conformation.nodes) || !Array.isArray(conformation.regions)) {
      throw new TypeError("Atlas conformation must contain nodes and regions arrays");
    }

    const nodeById = new Map();
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== "string" || !node.id || nodeById.has(node.id)) {
        throw new TypeError("Atlas nodes require unique non-empty ids");
      }
      nodeById.set(node.id, node);
    }

    const positionById = new Map();
    for (const record of conformation.nodes) {
      if (!record || typeof record.node_id !== "string" || positionById.has(record.node_id)) {
        throw new TypeError("Conformation coordinates require unique node ids");
      }
      positionById.set(record.node_id, record.aligned);
    }
    for (const id of nodeById.keys()) {
      if (!positionById.has(id)) throw new TypeError(`Missing conformation coordinate for ${id}`);
    }

    const clusters = Array.isArray(graph.clusters) ? graph.clusters.slice() : [];
    const clusterById = new Map();
    for (const cluster of clusters) {
      if (!cluster || typeof cluster.cluster_id !== "string" || clusterById.has(cluster.cluster_id)) {
        throw new TypeError("Atlas clusters require unique cluster ids");
      }
      clusterById.set(cluster.cluster_id, cluster);
    }

    const regionById = new Map();
    for (const region of conformation.regions) {
      if (!region || typeof region.region_id !== "string" || regionById.has(region.region_id)) {
        throw new TypeError("Conformation regions require unique ids");
      }
      regionById.set(region.region_id, region);
    }

    const parents = new Map([...nodeById.keys()].map((id) => [id, new Set()]));
    const children = new Map([...nodeById.keys()].map((id) => [id, new Set()]));
    const edges = graph.edges.map((edge, index) => {
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (!nodeById.has(source) || !nodeById.has(target)) {
        throw new TypeError(`Atlas edge ${index} references an unknown node`);
      }
      const authority = edgeAuthority(edge);
      if (authority === "certified") {
        parents.get(target).add(source);
        children.get(source).add(target);
      }
      return { ...edge, source, target, authority };
    });

    const hasTopologyAtlas = Boolean(
      graph.topology_atlas
      && graph.topology_atlas.schema_version === "topology-atlas.v1"
      && clusters.length
    );
    const leafClusters = hasTopologyAtlas
      ? clusters.filter((cluster) => Number(cluster.level) === 2)
      : conformation.regions.map((region) => ({
        cluster_id: region.region_id,
        parent_cluster_id: null,
        level: 2,
        level_name: "pages-fallback-region",
        display_label: region.label,
        label_authority: "pages-derived",
        member_node_ids: region.member_node_ids || [],
        representative_node_ids: (region.member_node_ids || []).slice(0, 3),
        boundary_node_ids: [],
        authority: region.authority
      }));

    return Object.freeze({
      graph,
      conformation,
      nodeById,
      positionById,
      edges,
      parents,
      children,
      clusterById,
      regionById,
      leafClusters,
      hasTopologyAtlas
    });
  }

  function nodeMatches(node, state, clusterId) {
    const stateMatch = state === "All" || node.status === state;
    const clusterMatch = clusterId === "All"
      || node.atlas_cluster_id === clusterId
      || node.kind !== "truth" && node.region_id === clusterId;
    return stateMatch && clusterMatch;
  }

  function visibleNodeIds(model, options) {
    const mode = MODES.has(options.mode) ? options.mode : "structure";
    const state = options.state || "All";
    const clusterId = options.clusterId || "All";
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
      for (const parent of model.parents.get(id) || []) if (base.has(parent)) expanded.add(parent);
      for (const child of model.children.get(id) || []) if (base.has(child)) expanded.add(child);
    }
    return expanded;
  }

  function visibleEdges(model, nodeIds, options) {
    const mode = MODES.has(options.mode) ? options.mode : "structure";
    const selectedId = options.selectedId || null;
    return model.edges.filter((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
      const incident = selectedId && (edge.source === selectedId || edge.target === selectedId);
      if (mode === "dependency") {
        return edge.authority === "certified"
          || edge.authority === "advisory"
          || incident && edge.authority === "authored";
      }
      if (mode === "frontier") {
        return edge.authority === "certified"
          || edge.authority === "advisory" && incident;
      }
      if (edge.authority === "derived") return Boolean(incident);
      if (edge.authority === "authored") return Boolean(incident);
      if (edge.authority === "advisory") return true;
      return Boolean(
        edge.is_cut_bridge
        || edge.cluster_relation === "inter-cluster"
        || incident
      );
    });
  }

  function graphView(model, options) {
    const nodeIds = visibleNodeIds(model, options);
    const nodes = model.graph.nodes.filter((node) => nodeIds.has(node.id));
    const edges = visibleEdges(model, nodeIds, options);
    return { nodes, edges, nodeIds };
  }

  function clusterDescriptors(model, nodeIds) {
    return model.leafClusters
      .map((cluster) => {
        const members = (cluster.member_node_ids || [])
          .filter((id) => nodeIds.has(id) && model.positionById.has(id));
        if (!members.length) return null;
        const region = model.regionById.get(cluster.cluster_id);
        return {
          ...cluster,
          members,
          memberCount: members.length,
          color: clusterColor(cluster.cluster_id, "closed", false),
          centroid: region && region.aligned_centroid
            ? region.aligned_centroid
            : null
        };
      })
      .filter(Boolean)
      .sort((left, right) =>
        right.memberCount - left.memberCount
        || String(left.display_label).localeCompare(String(right.display_label))
        || left.cluster_id.localeCompare(right.cluster_id));
  }

  function nodeValue(node) {
    if (node.kind !== "truth") return 1.25;
    const cost = Math.max(0, Number(node.descendant_cost) || 0);
    return (1.65 + Math.log1p(cost) * 1.05) * roleScale(node.structural_role);
  }

  function linkWidth(edge, selectedId) {
    if (selectedId && (edge.source === selectedId || edge.target === selectedId)) return 2.2;
    if (edge.is_cut_bridge) return 1.8;
    if (edge.cluster_relation === "inter-cluster") return 1.15;
    if (edge.authority === "certified") {
      return 0.42 + Math.min(0.7, Math.log1p(rationalNumber(edge.edge_betweenness)) * 0.18);
    }
    return edge.authority === "advisory" ? 0.8 : 0.32;
  }

  function linkColor(edge, selectedId) {
    if (selectedId && (edge.source === selectedId || edge.target === selectedId)) {
      return "rgba(126,216,255,0.88)";
    }
    if (edge.authority === "advisory") return "rgba(205,164,255,0.68)";
    if (edge.authority === "derived") return "rgba(139,176,226,0.52)";
    if (edge.authority === "authored") return "rgba(231,196,116,0.48)";
    if (edge.is_cut_bridge) return "rgba(242,214,145,0.9)";
    if (edge.cluster_relation === "inter-cluster") return "rgba(184,225,211,0.72)";
    return "rgba(155,190,176,0.32)";
  }

  function structuralSummary(model) {
    const roleCounts = new Map();
    for (const node of model.graph.nodes) {
      const role = node.structural_role;
      if (role) roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    }
    return {
      source: model.hasTopologyAtlas ? "topology-atlas.v1" : "pages-fallback-regions",
      clusters: model.leafClusters.length,
      cutBridges: model.edges.filter((edge) => edge.is_cut_bridge).length,
      interClusterEdges: model.edges.filter((edge) => edge.cluster_relation === "inter-cluster").length,
      affinityEdges: model.edges.filter((edge) => edge.authority === "derived").length,
      roleCounts
    };
  }

  return Object.freeze({
    CERTIFIED_LAYERS,
    MODES,
    clusterColor,
    clusterDescriptors,
    clusterHue,
    createModel,
    edgeAuthority,
    endpointId,
    graphView,
    humanTitle,
    linkColor,
    linkWidth,
    nodeValue,
    rationalNumber,
    roleScale,
    stableHash,
    structuralSummary,
    trueDepth,
    visibleEdges,
    visibleNodeIds
  });
}));
