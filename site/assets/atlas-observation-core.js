(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingAtlasObservation = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const SHA256 = /^sha256:[0-9a-f]{64}$/;
  const GIT_OBJECT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  const CLUSTER_ID = /^cluster:sha256:[0-9a-f]{64}$/;
  const PRIVACY_CLASSES = new Set([
    "private-research",
    "team-research",
    "public-candidate"
  ]);
  const GESTURE_KINDS = new Set([
    "selection",
    "compare",
    "bring-together",
    "cluster-peel",
    "path-inspection",
    "frontier-mark"
  ]);
  const CERTIFIED_LAYERS = new Set([
    "truth-dependency",
    "module-import",
    "frozen-prerequisite"
  ]);

  function requireObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${name} must be an object`);
    }
    return value;
  }

  function nonEmpty(value, name, maximum) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${name} must be a non-empty string`);
    }
    const normalized = value.trim();
    if (maximum && normalized.length > maximum) {
      throw new RangeError(`${name} exceeds ${maximum} characters`);
    }
    return normalized;
  }

  function optionalString(value) {
    return typeof value === "string" && value.trim() !== ""
      ? value.trim()
      : null;
  }

  function requireDigest(value, name) {
    const normalized = nonEmpty(value, name).toLowerCase();
    if (!SHA256.test(normalized)) {
      throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
    }
    return normalized;
  }

  function optionalDigest(value, name) {
    if (value === null || value === undefined || value === "") return null;
    return requireDigest(value, name);
  }

  function requireGitObject(value, name) {
    const normalized = nonEmpty(value, name).toLowerCase();
    if (!GIT_OBJECT.test(normalized)) {
      throw new TypeError(`${name} must be a lowercase Git object id`);
    }
    return normalized;
  }

  function requireTimestamp(value, name) {
    const normalized = nonEmpty(value, name);
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== normalized) {
      throw new TypeError(`${name} must be a canonical UTC timestamp`);
    }
    return normalized;
  }

  function ordinal(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function sortUniqueStrings(values, name) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    const normalized = values.map((value, index) =>
      nonEmpty(value, `${name}[${index}]`)
    ).sort(ordinal);
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index - 1] === normalized[index]) {
        throw new TypeError(`${name} must be unique`);
      }
    }
    return normalized;
  }

  function edgeKey(dependencyId, dependentId) {
    return `${dependencyId}\u0000${dependentId}`;
  }

  function normalizeEdges(values, name) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    const result = values.map((value, index) => {
      const edge = requireObject(value, `${name}[${index}]`);
      const dependencyId = nonEmpty(
        edge.dependency_id ?? edge.dependencyId ?? edge.source,
        `${name}[${index}].dependency_id`
      );
      const dependentId = nonEmpty(
        edge.dependent_id ?? edge.dependentId ?? edge.target,
        `${name}[${index}].dependent_id`
      );
      if (dependencyId === dependentId) {
        throw new TypeError(`${name}[${index}] cannot be a self edge`);
      }
      return {
        dependency_id: dependencyId,
        dependent_id: dependentId
      };
    }).sort((left, right) =>
      ordinal(left.dependency_id, right.dependency_id)
      || ordinal(left.dependent_id, right.dependent_id)
    );
    for (let index = 1; index < result.length; index += 1) {
      if (edgeKey(
        result[index - 1].dependency_id,
        result[index - 1].dependent_id
      ) === edgeKey(result[index].dependency_id, result[index].dependent_id)) {
        throw new TypeError(`${name} must be unique`);
      }
    }
    return result;
  }

  function encodeHex(codeUnit) {
    return codeUnit.toString(16).toUpperCase().padStart(4, "0");
  }

  function encodeString(value) {
    let result = '"';
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code === 0x5c) {
        result += "\\\\";
      } else if (code === 0x08) {
        result += "\\b";
      } else if (code === 0x09) {
        result += "\\t";
      } else if (code === 0x0a) {
        result += "\\n";
      } else if (code === 0x0c) {
        result += "\\f";
      } else if (code === 0x0d) {
        result += "\\r";
      } else if (code < 0x20
          || code >= 0x7f
          || code === 0x22
          || code === 0x26
          || code === 0x27
          || code === 0x2b
          || code === 0x2f
          || code === 0x3c
          || code === 0x3e
          || code === 0x60) {
        result += `\\u${encodeHex(code)}`;
      } else {
        result += value[index];
      }
    }
    return result + '"';
  }

  function canonicalText(value) {
    if (value === null) return "null";
    if (typeof value === "string") return encodeString(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) {
        throw new TypeError("canonical observation numbers must be safe integers");
      }
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(canonicalText).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort(ordinal).map((key) =>
        `${encodeString(key)}:${canonicalText(value[key])}`
      ).join(",")}}`;
    }
    throw new TypeError(`unsupported canonical value type: ${typeof value}`);
  }

  function canonicalBytes(value) {
    return new TextEncoder().encode(`${canonicalText(value)}\n`);
  }

  async function sha256Reference(value, cryptoSource) {
    const source = cryptoSource
      || (typeof globalThis === "object" ? globalThis.crypto : null);
    if (!source || !source.subtle || typeof source.subtle.digest !== "function") {
      throw new Error("Web Crypto SHA-256 is unavailable");
    }
    const bytes = value instanceof Uint8Array ? value : canonicalBytes(value);
    const digest = new Uint8Array(await source.subtle.digest("SHA-256", bytes));
    return `sha256:${[...digest]
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function edgeAuthority(edge) {
    const layer = String((edge && edge.layer) || "");
    const status = String((edge && edge.status) || "");
    return CERTIFIED_LAYERS.has(layer) || status === "certified"
      ? "certified"
      : "other";
  }

  function graphIndex(graph) {
    const value = requireObject(graph, "graph");
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      throw new TypeError("graph must carry nodes and edges arrays");
    }
    const nodes = new Map();
    for (const node of value.nodes) {
      if (!node || typeof node.id !== "string" || node.id === "") continue;
      if (nodes.has(node.id)) throw new TypeError(`duplicate graph node: ${node.id}`);
      nodes.set(node.id, node);
    }
    const clusters = new Set();
    for (const cluster of Array.isArray(value.clusters) ? value.clusters : []) {
      if (cluster && typeof cluster.cluster_id === "string") {
        clusters.add(cluster.cluster_id);
      }
    }
    const certifiedEdges = new Set();
    for (const edge of value.edges) {
      if (!edge || edgeAuthority(edge) !== "certified") continue;
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (typeof source === "string" && typeof target === "string") {
        certifiedEdges.add(edgeKey(source, target));
      }
    }
    return { nodes, clusters, certifiedEdges };
  }

  function normalizeSelection(selection, index) {
    const value = requireObject(selection, "selection");
    const selectedNodeIds = sortUniqueStrings(
      value.selected_node_ids || [],
      "selection.selected_node_ids"
    );
    const selectedClusterIds = sortUniqueStrings(
      value.selected_cluster_ids || [],
      "selection.selected_cluster_ids"
    );
    const selectedEdges = normalizeEdges(
      value.selected_edges || [],
      "selection.selected_edges"
    );
    const selectedPathRef = optionalDigest(
      value.selected_path_ref,
      "selection.selected_path_ref"
    );
    if (!selectedNodeIds.length && !selectedClusterIds.length
        && !selectedEdges.length && !selectedPathRef) {
      throw new TypeError("selection must contain a node, cluster, edge, or path");
    }
    for (const nodeId of selectedNodeIds) {
      if (!index.nodes.has(nodeId)) {
        throw new TypeError(`selection contains unknown graph node: ${nodeId}`);
      }
    }
    for (const clusterId of selectedClusterIds) {
      if (!CLUSTER_ID.test(clusterId) || !index.clusters.has(clusterId)) {
        throw new TypeError(`selection contains unknown Atlas cluster: ${clusterId}`);
      }
    }
    for (const edge of selectedEdges) {
      if (!index.certifiedEdges.has(edgeKey(
        edge.dependency_id,
        edge.dependent_id
      ))) {
        throw new TypeError(
          `selection contains a relation that is not certified: ${edge.dependency_id} -> ${edge.dependent_id}`
        );
      }
    }
    return {
      selected_node_ids: selectedNodeIds,
      selected_cluster_ids: selectedClusterIds,
      selected_edges: selectedEdges,
      selected_path_ref: selectedPathRef
    };
  }

  function requireSubset(values, allowed, name) {
    const selected = new Set(allowed);
    const unknown = values.find((value) => !selected.has(value));
    if (unknown) throw new TypeError(`${name} contains ${unknown} outside selection`);
  }

  function normalizeGesture(gesture, selection) {
    const value = requireObject(gesture, "gesture");
    const kind = nonEmpty(value.kind, "gesture.kind");
    if (!GESTURE_KINDS.has(kind)) {
      throw new TypeError(`unsupported gesture kind: ${kind}`);
    }
    const result = {
      kind,
      source_node_ids: sortUniqueStrings(
        value.source_node_ids || [],
        "gesture.source_node_ids"
      ),
      target_node_ids: sortUniqueStrings(
        value.target_node_ids || [],
        "gesture.target_node_ids"
      ),
      source_cluster_ids: sortUniqueStrings(
        value.source_cluster_ids || [],
        "gesture.source_cluster_ids"
      ),
      target_cluster_ids: sortUniqueStrings(
        value.target_cluster_ids || [],
        "gesture.target_cluster_ids"
      )
    };
    requireSubset(
      result.source_node_ids,
      selection.selected_node_ids,
      "gesture.source_node_ids"
    );
    requireSubset(
      result.target_node_ids,
      selection.selected_node_ids,
      "gesture.target_node_ids"
    );
    requireSubset(
      result.source_cluster_ids,
      selection.selected_cluster_ids,
      "gesture.source_cluster_ids"
    );
    requireSubset(
      result.target_cluster_ids,
      selection.selected_cluster_ids,
      "gesture.target_cluster_ids"
    );
    const sourceCount = result.source_node_ids.length
      + result.source_cluster_ids.length;
    const targetCount = result.target_node_ids.length
      + result.target_cluster_ids.length;
    if ((kind === "compare" || kind === "bring-together")
        && (!sourceCount || !targetCount)) {
      throw new TypeError(`${kind} requires non-empty source and target selection`);
    }
    if (kind === "cluster-peel" && !result.source_cluster_ids.length) {
      throw new TypeError("cluster-peel requires a source cluster");
    }
    if (kind === "path-inspection" && !selection.selected_path_ref) {
      throw new TypeError("path-inspection requires selected_path_ref");
    }
    return result;
  }

  function certifiedPathEdges(path) {
    if (!path || !Array.isArray(path.nodeIds)) return [];
    const result = [];
    for (let index = 0; index + 1 < path.nodeIds.length; index += 1) {
      result.push({
        dependency_id: path.nodeIds[index],
        dependent_id: path.nodeIds[index + 1]
      });
    }
    return result;
  }

  function deriveCapture(graph, input) {
    const value = requireObject(input, "capture input");
    const index = graphIndex(graph);
    const comparison = value.comparison && typeof value.comparison === "object"
      ? value.comparison
      : null;
    const requestedKind = optionalString(value.gesture_kind);
    const peeledClusterId = optionalString(value.peeled_cluster_id);
    const selectedNodeId = optionalString(value.selected_node_id);
    const activeClusterId = optionalString(value.active_cluster_id);
    let selection;
    let gesture;
    let defaultKind;
    let summary;

    if (comparison && comparison.kind === "node-pair") {
      const leftId = nonEmpty(comparison.left && comparison.left.id,
        "comparison.left.id");
      const rightId = nonEmpty(comparison.right && comparison.right.id,
        "comparison.right.id");
      const pathNodeIds = comparison.certifiedPath
        && Array.isArray(comparison.certifiedPath.nodeIds)
        ? comparison.certifiedPath.nodeIds
        : [];
      selection = {
        selected_node_ids: [...new Set([leftId, rightId, ...pathNodeIds])],
        selected_cluster_ids: [],
        selected_edges: certifiedPathEdges(comparison.certifiedPath),
        selected_path_ref: optionalDigest(
          value.selected_path_ref,
          "capture.selected_path_ref"
        )
      };
      defaultKind = "compare";
      const kind = requestedKind || defaultKind;
      gesture = {
        kind,
        source_node_ids: kind === "selection" ? [] : [leftId],
        target_node_ids: kind === "selection" ? [] : [rightId],
        source_cluster_ids: [],
        target_cluster_ids: []
      };
      summary = `Concept comparison: ${leftId} and ${rightId}`;
    } else if (comparison && comparison.kind === "cluster-pair") {
      const leftId = nonEmpty(comparison.left && comparison.left.id,
        "comparison.left.id");
      const rightId = nonEmpty(comparison.right && comparison.right.id,
        "comparison.right.id");
      const edges = Array.isArray(comparison.crossEdges)
        ? comparison.crossEdges.map((edge) => ({
          dependency_id: edge.source,
          dependent_id: edge.target
        }))
        : [];
      selection = {
        selected_node_ids: edges.flatMap((edge) => [
          edge.dependency_id,
          edge.dependent_id
        ]),
        selected_cluster_ids: [leftId, rightId],
        selected_edges: edges,
        selected_path_ref: null
      };
      defaultKind = "compare";
      const kind = requestedKind || defaultKind;
      gesture = {
        kind,
        source_node_ids: [],
        target_node_ids: [],
        source_cluster_ids: kind === "selection" ? [] : [leftId],
        target_cluster_ids: kind === "selection" ? [] : [rightId]
      };
      summary = `Community comparison: ${leftId} and ${rightId}`;
    } else if (peeledClusterId) {
      selection = {
        selected_node_ids: [],
        selected_cluster_ids: [peeledClusterId],
        selected_edges: [],
        selected_path_ref: null
      };
      defaultKind = "cluster-peel";
      const kind = requestedKind || defaultKind;
      gesture = {
        kind,
        source_node_ids: [],
        target_node_ids: [],
        source_cluster_ids: kind === "cluster-peel" ? [peeledClusterId] : [],
        target_cluster_ids: []
      };
      summary = `Peeled community: ${peeledClusterId}`;
    } else if (selectedNodeId) {
      selection = {
        selected_node_ids: [selectedNodeId],
        selected_cluster_ids: [],
        selected_edges: [],
        selected_path_ref: optionalDigest(
          value.selected_path_ref,
          "capture.selected_path_ref"
        )
      };
      defaultKind = String(value.active_mode || "") === "frontier"
        ? "frontier-mark"
        : "selection";
      const kind = requestedKind || defaultKind;
      gesture = {
        kind,
        source_node_ids: kind === "frontier-mark" ? [selectedNodeId] : [],
        target_node_ids: [],
        source_cluster_ids: [],
        target_cluster_ids: []
      };
      summary = `Selected concept: ${selectedNodeId}`;
    } else if (activeClusterId && activeClusterId !== "All") {
      selection = {
        selected_node_ids: [],
        selected_cluster_ids: [activeClusterId],
        selected_edges: [],
        selected_path_ref: null
      };
      defaultKind = String(value.active_mode || "") === "frontier"
        ? "frontier-mark"
        : "selection";
      const kind = requestedKind || defaultKind;
      gesture = {
        kind,
        source_node_ids: [],
        target_node_ids: [],
        source_cluster_ids: kind === "frontier-mark" ? [activeClusterId] : [],
        target_cluster_ids: []
      };
      summary = `Selected community: ${activeClusterId}`;
    } else {
      throw new TypeError("Select a concept, community, comparison, or peeled community first");
    }

    const normalizedSelection = normalizeSelection(selection, index);
    const normalizedGesture = normalizeGesture(gesture, normalizedSelection);
    return Object.freeze({
      selection: normalizedSelection,
      gesture: normalizedGesture,
      default_gesture_kind: defaultKind,
      summary
    });
  }

  function releaseCoordinates(graph, manifest) {
    const graphValue = requireObject(graph, "graph");
    const manifestValue = requireObject(manifest, "manifest");
    if (manifestValue.schema_version !== "pages-atlas-manifest.v1") {
      throw new TypeError("manifest must use pages-atlas-manifest.v1");
    }
    const snapshot = requireObject(
      graphValue.source_snapshot || {},
      "graph.source_snapshot"
    );
    const truthReleaseDigest = requireDigest(
      manifestValue.truth_release_digest,
      "manifest.truth_release_digest"
    );
    if (snapshot.truth_release_digest
        && requireDigest(snapshot.truth_release_digest,
          "graph.source_snapshot.truth_release_digest") !== truthReleaseDigest) {
      throw new TypeError("graph and manifest use different truth releases");
    }
    const sourceCommit = requireGitObject(
      manifestValue.source_commit,
      "manifest.source_commit"
    );
    const sourceTree = requireGitObject(
      manifestValue.source_tree,
      "manifest.source_tree"
    );
    if (sourceCommit.length !== sourceTree.length) {
      throw new TypeError("source commit and tree use different Git object widths");
    }
    if (snapshot.source_commit
        && requireGitObject(snapshot.source_commit,
          "graph.source_snapshot.source_commit") !== sourceCommit) {
      throw new TypeError("graph and manifest use different source commits");
    }
    if (snapshot.source_tree
        && requireGitObject(snapshot.source_tree,
          "graph.source_snapshot.source_tree") !== sourceTree) {
      throw new TypeError("graph and manifest use different source trees");
    }
    return {
      truth_release_digest: truthReleaseDigest,
      certified_topology_digest: requireDigest(
        manifestValue.certified_topology_digest,
        "manifest.certified_topology_digest"
      ),
      topology_atlas_digest: requireDigest(
        manifestValue.topology_atlas_digest,
        "manifest.topology_atlas_digest"
      ),
      pages_conformation_digest: requireDigest(
        manifestValue.conformation_digest,
        "manifest.conformation_digest"
      ),
      source_commit: sourceCommit,
      source_tree: sourceTree
    };
  }

  async function buildObservation(input, cryptoSource) {
    const value = requireObject(input, "input");
    if (value.explicitly_saved !== true) {
      throw new TypeError("an observation must be explicitly saved by the human");
    }
    const coordinates = releaseCoordinates(value.graph, value.manifest);
    const index = graphIndex(value.graph);
    const selection = normalizeSelection(value.selection, index);
    const gesture = normalizeGesture(value.gesture, selection);
    const privacyClass = nonEmpty(value.privacy_class, "privacy_class");
    if (!PRIVACY_CLASSES.has(privacyClass)) {
      throw new TypeError(`unsupported privacy class: ${privacyClass}`);
    }
    const content = {
      topology_atlas_input_receipt_ref: requireDigest(
        value.topology_atlas_input_receipt_ref,
        "topology_atlas_input_receipt_ref"
      ),
      truth_release_digest: coordinates.truth_release_digest,
      certified_topology_digest: coordinates.certified_topology_digest,
      topology_atlas_digest: coordinates.topology_atlas_digest,
      pages_conformation_digest: coordinates.pages_conformation_digest,
      pages_research_context_digest: optionalDigest(
        value.pages_research_context_digest,
        "pages_research_context_digest"
      ),
      source_commit: coordinates.source_commit,
      source_tree: coordinates.source_tree,
      source_surface: "trureturing-pages",
      human_actor: nonEmpty(value.human_actor, "human_actor", 256),
      selection,
      gesture,
      human_note: nonEmpty(value.human_note, "human_note", 8000),
      privacy_class: privacyClass,
      explicitly_saved: true,
      created_at: requireTimestamp(value.created_at, "created_at")
    };
    return {
      schema: "human-structure-observation.v1",
      observation_id: await sha256Reference(content, cryptoSource),
      observation_content: content
    };
  }

  return Object.freeze({
    GESTURE_KINDS,
    PRIVACY_CLASSES,
    buildObservation,
    canonicalBytes,
    canonicalText,
    deriveCapture,
    edgeAuthority,
    edgeKey,
    releaseCoordinates,
    sha256Reference
  });
}));
