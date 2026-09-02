(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingAtlasExploration = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MAX_LOCAL_OFFSETS = 64;
  const MAX_HOPS = 6;
  const MAX_FOCUS_NODES = 120;

  function finitePoint(value) {
    return value
      && Number.isFinite(Number(value.x))
      && Number.isFinite(Number(value.y))
      && Number.isFinite(Number(value.z));
  }

  function point(value) {
    return finitePoint(value)
      ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) }
      : { x: 0, y: 0, z: 0 };
  }

  function add(left, right) {
    return {
      x: left.x + right.x,
      y: left.y + right.y,
      z: left.z + right.z
    };
  }

  function subtract(left, right) {
    return {
      x: left.x - right.x,
      y: left.y - right.y,
      z: left.z - right.z
    };
  }

  function displayPosition(
    nodeId,
    canonicalById,
    nodeOffsets,
    clusterOffsets,
    nodeById
  ) {
    const canonical = point(canonicalById.get(nodeId));
    const nodeOffset = point(nodeOffsets.get(nodeId));
    const node = nodeById.get(nodeId) || {};
    const clusterOffset = point(clusterOffsets.get(
      node.atlas_cluster_id || node.region_id || ""
    ));
    return add(add(canonical, clusterOffset), nodeOffset);
  }

  function composePositions(
    canonicalById,
    nodeOffsets,
    clusterOffsets,
    nodeById
  ) {
    const result = new Map();
    for (const nodeId of canonicalById.keys()) {
      result.set(nodeId, displayPosition(
        nodeId,
        canonicalById,
        nodeOffsets,
        clusterOffsets,
        nodeById
      ));
    }
    return result;
  }

  function nodeOffsetFromDrag(
    nodeId,
    draggedPoint,
    canonicalById,
    clusterOffsets,
    nodeById
  ) {
    const canonical = point(canonicalById.get(nodeId));
    const node = nodeById.get(nodeId) || {};
    const clusterOffset = point(clusterOffsets.get(
      node.atlas_cluster_id || node.region_id || ""
    ));
    return subtract(point(draggedPoint), add(canonical, clusterOffset));
  }

  function centroid(nodeIds, positions) {
    const values = nodeIds
      .map((id) => positions.get(id))
      .filter(finitePoint)
      .map(point);
    if (!values.length) return { x: 0, y: 0, z: 0 };
    return values.reduce((sum, value) => ({
      x: sum.x + value.x / values.length,
      y: sum.y + value.y / values.length,
      z: sum.z + value.z / values.length
    }), { x: 0, y: 0, z: 0 });
  }

  function stableAngle(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return (hash % 3600) / 3600 * Math.PI * 2;
  }

  function peelOffset(clusterId, memberNodeIds, allNodeIds, positions, distance) {
    const clusterCenter = centroid(memberNodeIds, positions);
    const atlasCenter = centroid(allNodeIds, positions);
    let x = clusterCenter.x - atlasCenter.x;
    let z = clusterCenter.z - atlasCenter.z;
    let length = Math.hypot(x, z);
    if (length < 1e-6) {
      const angle = stableAngle(clusterId);
      x = Math.cos(angle);
      z = Math.sin(angle);
      length = 1;
    }
    const magnitude = Number.isFinite(distance) && distance > 0 ? distance : 260;
    return {
      x: x / length * magnitude,
      y: 0,
      z: z / length * magnitude
    };
  }

  function clampHops(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.max(0, Math.min(MAX_HOPS, parsed));
  }

  function focusNodeIds(model, options) {
    const selectedId = options.selectedId;
    if (!selectedId || !model.nodeById.has(selectedId)) return new Set();
    const upstreamHops = clampHops(options.upstreamHops, 2);
    const downstreamHops = clampHops(options.downstreamHops, 2);
    const includeRelated = Boolean(options.includeRelated);
    const allowed = options.allowedNodeIds || new Set(model.nodeById.keys());
    const visible = new Set([selectedId]);

    function expand(seed, hops, adjacency) {
      let frontier = new Set([seed]);
      for (let hop = 0; hop < hops && visible.size < MAX_FOCUS_NODES; hop += 1) {
        const next = new Set();
        for (const id of frontier) {
          for (const neighbor of adjacency.get(id) || []) {
            if (!allowed.has(neighbor) || visible.has(neighbor)) continue;
            visible.add(neighbor);
            next.add(neighbor);
            if (visible.size >= MAX_FOCUS_NODES) break;
          }
          if (visible.size >= MAX_FOCUS_NODES) break;
        }
        frontier = next;
      }
    }

    expand(selectedId, upstreamHops, model.parents);
    expand(selectedId, downstreamHops, model.children);

    if (includeRelated) {
      for (const edge of model.edges) {
        if (edge.authority !== "derived") continue;
        if (edge.source !== selectedId && edge.target !== selectedId) continue;
        const other = edge.source === selectedId ? edge.target : edge.source;
        if (allowed.has(other) && visible.size < MAX_FOCUS_NODES) {
          visible.add(other);
        }
      }
    }
    return visible;
  }

  function focusGraphView(model, options, semanticView) {
    if (!options.selectedId || semanticView.level !== "focus") return semanticView;
    const allowed = options.allowedNodeIds || semanticView.nodeIds;
    const nodeIds = focusNodeIds(model, {
      selectedId: options.selectedId,
      upstreamHops: options.upstreamHops,
      downstreamHops: options.downstreamHops,
      includeRelated: options.includeRelated,
      allowedNodeIds: allowed
    });
    return {
      ...semanticView,
      nodeIds,
      nodes: model.graph.nodes.filter((node) => nodeIds.has(node.id)),
      edges: model.edges.filter((edge) => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
        if (edge.authority === "certified") return true;
        return edge.source === options.selectedId || edge.target === options.selectedId;
      })
    };
  }

  function encodeSession(
    releaseKey,
    nodeOffsets,
    clusterOffsets,
    expansion
  ) {
    const nodes = [...nodeOffsets.entries()]
      .filter(([, value]) => finitePoint(value))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_LOCAL_OFFSETS)
      .map(([id, value]) => [id, point(value)]);
    const clusters = [...clusterOffsets.entries()]
      .filter(([, value]) => finitePoint(value))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 16)
      .map(([id, value]) => [id, point(value)]);
    return JSON.stringify({
      schema: "pages-local-exploration.v1",
      release_key: String(releaseKey || ""),
      nodes,
      clusters,
      expansion: {
        upstream_hops: clampHops(expansion && expansion.upstreamHops, 2),
        downstream_hops: clampHops(expansion && expansion.downstreamHops, 2),
        include_related: Boolean(expansion && expansion.includeRelated)
      }
    });
  }

  function decodeSession(text, releaseKey, validNodeIds, validClusterIds) {
    try {
      const value = JSON.parse(String(text || ""));
      if (!value || value.schema !== "pages-local-exploration.v1"
          || value.release_key !== String(releaseKey || "")
          || !Array.isArray(value.nodes)
          || !Array.isArray(value.clusters)) return null;
      const nodeOffsets = new Map();
      for (const entry of value.nodes.slice(0, MAX_LOCAL_OFFSETS)) {
        if (!Array.isArray(entry) || entry.length !== 2
            || !validNodeIds.has(entry[0]) || !finitePoint(entry[1])) continue;
        nodeOffsets.set(entry[0], point(entry[1]));
      }
      const clusterOffsets = new Map();
      for (const entry of value.clusters.slice(0, 16)) {
        if (!Array.isArray(entry) || entry.length !== 2
            || !validClusterIds.has(entry[0]) || !finitePoint(entry[1])) continue;
        clusterOffsets.set(entry[0], point(entry[1]));
      }
      return {
        nodeOffsets,
        clusterOffsets,
        expansion: {
          upstreamHops: clampHops(value.expansion && value.expansion.upstream_hops, 2),
          downstreamHops: clampHops(value.expansion && value.expansion.downstream_hops, 2),
          includeRelated: Boolean(value.expansion && value.expansion.include_related)
        }
      };
    } catch (_) {
      return null;
    }
  }

  return Object.freeze({
    MAX_FOCUS_NODES,
    MAX_HOPS,
    MAX_LOCAL_OFFSETS,
    canonicalPoint: point,
    composePositions,
    decodeSession,
    displayPosition,
    encodeSession,
    focusGraphView,
    focusNodeIds,
    nodeOffsetFromDrag,
    peelOffset
  });
}));
