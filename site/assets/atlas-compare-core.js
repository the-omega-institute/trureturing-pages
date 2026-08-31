(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingAtlasCompare = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MAX_REACHABLE = 4096;
  const MAX_LIST = 32;
  const MAX_PATH = 256;

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function certifiedEdges(model) {
    return model.edges.filter((edge) => edge.authority === "certified");
  }

  function edgeKey(source, target) {
    return `${source}\u0000${target}`;
  }

  function nodeDepth(node) {
    for (const value of [node && node.true_depth, node && node.max_depth, node && node.depth]) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  function title(model, nodeId) {
    const node = model.nodeById.get(nodeId);
    if (!node) return nodeId;
    if (typeof node.human_title === "string" && node.human_title.trim()) {
      return node.human_title.trim();
    }
    const raw = String(node.repo_path || node.title || node.id || nodeId)
      .replace(/\.lean$/i, "")
      .split("/")
      .pop();
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim() || nodeId;
  }

  function stableNodeOrder(model, ids, direction) {
    const multiplier = direction === "descending" ? -1 : 1;
    return [...new Set(ids)].sort((left, right) => {
      const depth = (nodeDepth(model.nodeById.get(left))
        - nodeDepth(model.nodeById.get(right))) * multiplier;
      if (depth) return depth;
      const byTitle = title(model, left).localeCompare(title(model, right));
      return byTitle || left.localeCompare(right);
    });
  }

  function reachable(startIds, adjacency, limit) {
    const bounded = Number.isInteger(limit) && limit > 0 ? limit : MAX_REACHABLE;
    const visited = new Set();
    const queue = [...new Set(startIds)].sort();
    for (const start of queue) visited.add(start);
    let cursor = 0;
    while (cursor < queue.length && visited.size < bounded) {
      const current = queue[cursor++];
      for (const next of adjacency.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
        if (visited.size >= bounded) break;
      }
    }
    for (const start of startIds) visited.delete(start);
    return visited;
  }

  function ancestors(model, nodeIds, limit) {
    return reachable(nodeIds, model.parents, limit);
  }

  function descendants(model, nodeIds, limit) {
    return reachable(nodeIds, model.children, limit);
  }

  function intersection(left, right) {
    const result = new Set();
    const smaller = left.size <= right.size ? left : right;
    const larger = smaller === left ? right : left;
    for (const value of smaller) if (larger.has(value)) result.add(value);
    return result;
  }

  function difference(left, right) {
    const result = new Set();
    for (const value of left) if (!right.has(value)) result.add(value);
    return result;
  }

  function shortestCertifiedPath(model, sourceId, targetId) {
    if (!model.nodeById.has(sourceId) || !model.nodeById.has(targetId)) {
      throw new TypeError("Certified path endpoints must be Atlas nodes.");
    }
    if (sourceId === targetId) {
      return {
        sourceId,
        targetId,
        nodeIds: [sourceId],
        edgeKeys: [],
        length: 0
      };
    }

    const queue = [sourceId];
    const previous = new Map([[sourceId, null]]);
    let cursor = 0;
    while (cursor < queue.length && queue.length <= MAX_REACHABLE) {
      const current = queue[cursor++];
      for (const child of model.children.get(current) || []) {
        if (previous.has(child)) continue;
        previous.set(child, current);
        if (child === targetId) {
          cursor = queue.length;
          break;
        }
        queue.push(child);
      }
    }
    if (!previous.has(targetId)) return null;

    const nodeIds = [];
    let current = targetId;
    while (current !== null && nodeIds.length <= MAX_PATH) {
      nodeIds.push(current);
      current = previous.get(current) ?? null;
    }
    if (nodeIds[nodeIds.length - 1] !== sourceId) return null;
    nodeIds.reverse();
    const edgeKeys = [];
    for (let index = 0; index + 1 < nodeIds.length; index += 1) {
      edgeKeys.push(edgeKey(nodeIds[index], nodeIds[index + 1]));
    }
    return {
      sourceId,
      targetId,
      nodeIds,
      edgeKeys,
      length: edgeKeys.length
    };
  }

  function pathBetween(model, leftId, rightId) {
    const leftToRight = shortestCertifiedPath(model, leftId, rightId);
    if (leftToRight) return { direction: "left-to-right", ...leftToRight };
    const rightToLeft = shortestCertifiedPath(model, rightId, leftId);
    if (rightToLeft) return { direction: "right-to-left", ...rightToLeft };
    return null;
  }

  function derivedRelation(model, leftId, rightId) {
    const records = model.edges.filter((edge) =>
      edge.authority === "derived"
      && ((edge.source === leftId && edge.target === rightId)
        || (edge.source === rightId && edge.target === leftId))
    );
    if (!records.length) return null;
    const record = records.slice().sort((left, right) =>
      Number(left.affinity_rank || Number.MAX_SAFE_INTEGER)
      - Number(right.affinity_rank || Number.MAX_SAFE_INTEGER)
      || edgeKey(left.source, left.target).localeCompare(edgeKey(right.source, right.target))
    )[0];
    return {
      sourceId: record.source,
      targetId: record.target,
      rank: Number.isFinite(Number(record.affinity_rank))
        ? Number(record.affinity_rank)
        : null,
      mutualTopK: Boolean(record.mutual_top_k),
      directDependency: Boolean(record.direct_dependency),
      sharedAncestorJaccard: record.shared_ancestor_jaccard || null,
      sharedDescendantJaccard: record.shared_descendant_jaccard || null,
      pathDistance: Number.isFinite(Number(record.undirected_path_distance))
        ? Number(record.undirected_path_distance)
        : null,
      deepestCommonPrerequisiteDepth:
        record.deepest_common_prerequisite_depth ?? null,
      authority: "derived"
    };
  }

  function nodeComparison(model, leftId, rightId) {
    if (leftId === rightId) throw new TypeError("Select two different concepts.");
    const left = model.nodeById.get(leftId);
    const right = model.nodeById.get(rightId);
    if (!left || !right) throw new TypeError("Comparison endpoints must be Atlas nodes.");

    const leftAncestors = ancestors(model, [leftId]);
    const rightAncestors = ancestors(model, [rightId]);
    const leftDescendants = descendants(model, [leftId]);
    const rightDescendants = descendants(model, [rightId]);
    const sharedPrerequisites = intersection(leftAncestors, rightAncestors);
    const sharedDependents = intersection(leftDescendants, rightDescendants);
    const path = pathBetween(model, leftId, rightId);
    const leftCluster = left.atlas_cluster_id || null;
    const rightCluster = right.atlas_cluster_id || null;

    return {
      kind: "node-pair",
      left: { id: leftId, title: title(model, leftId), clusterId: leftCluster },
      right: { id: rightId, title: title(model, rightId), clusterId: rightCluster },
      sameCluster: Boolean(leftCluster && leftCluster === rightCluster),
      certifiedPath: path,
      derivedRelation: derivedRelation(model, leftId, rightId),
      sharedPrerequisites: stableNodeOrder(
        model,
        sharedPrerequisites,
        "descending"
      ).slice(0, MAX_LIST),
      leftOnlyPrerequisites: stableNodeOrder(
        model,
        difference(leftAncestors, rightAncestors),
        "descending"
      ).slice(0, MAX_LIST),
      rightOnlyPrerequisites: stableNodeOrder(
        model,
        difference(rightAncestors, leftAncestors),
        "descending"
      ).slice(0, MAX_LIST),
      sharedDependents: stableNodeOrder(
        model,
        sharedDependents,
        "ascending"
      ).slice(0, MAX_LIST),
      leftOnlyDependents: stableNodeOrder(
        model,
        difference(leftDescendants, rightDescendants),
        "ascending"
      ).slice(0, MAX_LIST),
      rightOnlyDependents: stableNodeOrder(
        model,
        difference(rightDescendants, leftDescendants),
        "ascending"
      ).slice(0, MAX_LIST),
      deepestCommonPrerequisites: stableNodeOrder(
        model,
        sharedPrerequisites,
        "descending"
      ).slice(0, 8),
      authority: {
        path: path ? "certified" : "absent",
        proximity: derivedRelation(model, leftId, rightId) ? "derived" : "absent"
      }
    };
  }

  function clusterMembers(model, clusterId) {
    const cluster = model.clusterById.get(clusterId);
    if (!cluster) throw new TypeError(`Unknown Atlas cluster: ${clusterId}`);
    return {
      cluster,
      members: new Set(cluster.member_node_ids || [])
    };
  }

  function unionReachable(model, memberIds, direction) {
    const adjacency = direction === "ancestors" ? model.parents : model.children;
    return reachable(memberIds, adjacency, MAX_REACHABLE);
  }

  function clusterComparison(model, leftClusterId, rightClusterId) {
    if (leftClusterId === rightClusterId) {
      throw new TypeError("Select two different structural communities.");
    }
    const left = clusterMembers(model, leftClusterId);
    const right = clusterMembers(model, rightClusterId);
    const crossEdges = certifiedEdges(model).filter((edge) =>
      (left.members.has(edge.source) && right.members.has(edge.target))
      || (right.members.has(edge.source) && left.members.has(edge.target))
    );
    const leftBoundary = new Set();
    const rightBoundary = new Set();
    for (const edge of crossEdges) {
      if (left.members.has(edge.source)) leftBoundary.add(edge.source);
      if (left.members.has(edge.target)) leftBoundary.add(edge.target);
      if (right.members.has(edge.source)) rightBoundary.add(edge.source);
      if (right.members.has(edge.target)) rightBoundary.add(edge.target);
    }

    const leftAncestors = unionReachable(model, [...left.members], "ancestors");
    const rightAncestors = unionReachable(model, [...right.members], "ancestors");
    const sharedFoundations = intersection(leftAncestors, rightAncestors);
    const leftDescendants = unionReachable(model, [...left.members], "descendants");
    const rightDescendants = unionReachable(model, [...right.members], "descendants");
    const sharedConsequences = intersection(leftDescendants, rightDescendants);

    return {
      kind: "cluster-pair",
      left: {
        id: leftClusterId,
        label: left.cluster.display_label || "Structural community",
        memberCount: left.members.size,
        representativeNodeIds: left.cluster.representative_node_ids || []
      },
      right: {
        id: rightClusterId,
        label: right.cluster.display_label || "Structural community",
        memberCount: right.members.size,
        representativeNodeIds: right.cluster.representative_node_ids || []
      },
      crossEdges: crossEdges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        isCutBridge: Boolean(edge.is_cut_bridge),
        dependencySpan: Number(edge.dependency_span || 0),
        authority: "certified"
      })),
      leftBoundaryNodeIds: stableNodeOrder(model, leftBoundary, "ascending"),
      rightBoundaryNodeIds: stableNodeOrder(model, rightBoundary, "ascending"),
      sharedFoundationNodeIds: stableNodeOrder(
        model,
        sharedFoundations,
        "descending"
      ).slice(0, MAX_LIST),
      sharedConsequenceNodeIds: stableNodeOrder(
        model,
        sharedConsequences,
        "ascending"
      ).slice(0, MAX_LIST),
      certifiedInterfacePresent: crossEdges.length > 0,
      authority: "deterministic-derived-summary-of-certified-edges"
    };
  }

  function pathSteps(model, path) {
    if (!path) return [];
    return path.nodeIds.map((id, index) => ({
      index: index + 1,
      nodeId: id,
      title: title(model, id),
      depth: nodeDepth(model.nodeById.get(id)),
      incomingEdgeKey: index === 0
        ? null
        : edgeKey(path.nodeIds[index - 1], id)
    }));
  }

  function highlight(model, comparison, pathOnly) {
    if (!comparison) return { nodeIds: new Set(), edgeKeys: new Set() };
    if (comparison.kind === "node-pair") {
      const nodeIds = new Set([comparison.left.id, comparison.right.id]);
      const edgeKeys = new Set();
      if (comparison.certifiedPath) {
        comparison.certifiedPath.nodeIds.forEach((id) => nodeIds.add(id));
        comparison.certifiedPath.edgeKeys.forEach((key) => edgeKeys.add(key));
      }
      if (!pathOnly) {
        comparison.sharedPrerequisites.forEach((id) => nodeIds.add(id));
        comparison.sharedDependents.forEach((id) => nodeIds.add(id));
      }
      return { nodeIds, edgeKeys };
    }
    const edgeKeys = new Set(comparison.crossEdges.map((edge) =>
      edgeKey(edge.source, edge.target)
    ));
    const nodeIds = new Set([
      ...comparison.leftBoundaryNodeIds,
      ...comparison.rightBoundaryNodeIds
    ]);
    if (!pathOnly) {
      comparison.sharedFoundationNodeIds.forEach((id) => nodeIds.add(id));
      comparison.sharedConsequenceNodeIds.forEach((id) => nodeIds.add(id));
    }
    return { nodeIds, edgeKeys };
  }

  return Object.freeze({
    MAX_LIST,
    MAX_PATH,
    MAX_REACHABLE,
    ancestors,
    clusterComparison,
    descendants,
    edgeKey,
    highlight,
    nodeComparison,
    pathBetween,
    pathSteps,
    shortestCertifiedPath,
    title
  });
}));
