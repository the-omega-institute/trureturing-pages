(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingStructureObservation = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const SCHEMA = "human-structure-observation.v1";
  const ENVELOPE_SCHEMA = "pages-human-structure-observation-request.v1";
  const GESTURES = new Set([
    "selection",
    "compare",
    "bring-together",
    "cluster-peel",
    "path-inspection",
    "frontier-mark"
  ]);
  const PRIVACY = new Set([
    "private-research",
    "team-research",
    "public-candidate"
  ]);
  const DIGEST = /^sha256:[0-9a-f]{64}$/;
  const CLUSTER = /^cluster:sha256:[0-9a-f]{64}$/;

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function sortedUnique(values, name, pattern) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    const result = values.map((value) => String(value || ""));
    if (result.some((value) => !value)) {
      throw new TypeError(`${name} contains an empty identity`);
    }
    if (pattern && result.some((value) => !pattern.test(value))) {
      throw new TypeError(`${name} contains an invalid identity`);
    }
    result.sort((left, right) => left.localeCompare(right, "en", { sensitivity: "variant" }));
    for (let index = 1; index < result.length; index += 1) {
      if (result[index - 1] === result[index]) {
        throw new TypeError(`${name} contains a duplicate identity`);
      }
    }
    return result;
  }

  function selectedEdges(edges) {
    if (!Array.isArray(edges)) throw new TypeError("selected_edges must be an array");
    const result = edges.map((edge) => {
      const dependency = String(edge && edge.dependency_id || endpointId(edge && edge.source) || "");
      const dependent = String(edge && edge.dependent_id || endpointId(edge && edge.target) || "");
      if (!dependency || !dependent) {
        throw new TypeError("selected_edges contains an incomplete edge");
      }
      return { dependency_id: dependency, dependent_id: dependent };
    }).sort((left, right) =>
      left.dependency_id.localeCompare(right.dependency_id, "en", { sensitivity: "variant" })
      || left.dependent_id.localeCompare(right.dependent_id, "en", { sensitivity: "variant" }));
    for (let index = 1; index < result.length; index += 1) {
      const previous = result[index - 1];
      const current = result[index];
      if (previous.dependency_id === current.dependency_id
          && previous.dependent_id === current.dependent_id) {
        throw new TypeError("selected_edges contains a duplicate edge");
      }
    }
    return result;
  }

  function validateDigest(value, name, nullable) {
    if (nullable && value == null) return null;
    const result = String(value || "");
    if (!DIGEST.test(result)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
    return result;
  }

  function normalizeSelection(input) {
    const selection = input || {};
    return {
      selected_node_ids: sortedUnique(selection.selected_node_ids || [], "selected_node_ids"),
      selected_cluster_ids: sortedUnique(
        selection.selected_cluster_ids || [],
        "selected_cluster_ids",
        CLUSTER
      ),
      selected_edges: selectedEdges(selection.selected_edges || []),
      selected_path_ref: validateDigest(
        selection.selected_path_ref,
        "selected_path_ref",
        true
      )
    };
  }

  function normalizeGesture(input, selection) {
    const gesture = input || {};
    const kind = String(gesture.kind || "selection");
    if (!GESTURES.has(kind)) throw new TypeError(`Unsupported gesture ${kind}`);
    const sourceNodeIds = sortedUnique(
      gesture.source_node_ids || [],
      "source_node_ids"
    );
    const targetNodeIds = sortedUnique(
      gesture.target_node_ids || [],
      "target_node_ids"
    );
    const sourceClusterIds = sortedUnique(
      gesture.source_cluster_ids || [],
      "source_cluster_ids",
      CLUSTER
    );
    const targetClusterIds = sortedUnique(
      gesture.target_cluster_ids || [],
      "target_cluster_ids",
      CLUSTER
    );
    const selectedNodes = new Set(selection.selected_node_ids);
    const selectedClusters = new Set(selection.selected_cluster_ids);
    for (const value of [...sourceNodeIds, ...targetNodeIds]) {
      if (!selectedNodes.has(value)) {
        throw new TypeError("Gesture node endpoints must be part of the saved selection");
      }
    }
    for (const value of [...sourceClusterIds, ...targetClusterIds]) {
      if (!selectedClusters.has(value)) {
        throw new TypeError("Gesture cluster endpoints must be part of the saved selection");
      }
    }
    if ((kind === "compare" || kind === "bring-together")
        && !(sourceNodeIds.length || sourceClusterIds.length)
        || (kind === "compare" || kind === "bring-together")
        && !(targetNodeIds.length || targetClusterIds.length)) {
      throw new TypeError(`${kind} requires explicit source and target selections`);
    }
    if (kind === "cluster-peel" && sourceClusterIds.length !== 1) {
      throw new TypeError("cluster-peel requires exactly one source cluster");
    }
    if (kind === "path-inspection" && !selection.selected_path_ref) {
      throw new TypeError("path-inspection requires selected_path_ref");
    }
    return {
      kind,
      source_node_ids: sourceNodeIds,
      target_node_ids: targetNodeIds,
      source_cluster_ids: sourceClusterIds,
      target_cluster_ids: targetClusterIds
    };
  }

  function buildContent(input) {
    if (!input || typeof input !== "object") throw new TypeError("Observation input is required");
    const selection = normalizeSelection(input.selection);
    const selectedCount = selection.selected_node_ids.length
      + selection.selected_cluster_ids.length
      + selection.selected_edges.length
      + (selection.selected_path_ref ? 1 : 0);
    if (!selectedCount) throw new TypeError("An explicit saved observation needs a selection");
    const privacy = String(input.privacy_class || "private-research");
    if (!PRIVACY.has(privacy)) throw new TypeError(`Unsupported privacy class ${privacy}`);
    const note = String(input.human_note || "").trim();
    if (!note || note.length > 8000) {
      throw new TypeError("human_note must contain from 1 through 8000 characters");
    }
    const actor = String(input.human_actor || "").trim();
    if (!actor || actor.length > 256) {
      throw new TypeError("human_actor must contain from 1 through 256 characters");
    }
    const observedAt = String(input.created_at || new Date().toISOString());
    if (!Number.isFinite(Date.parse(observedAt))) {
      throw new TypeError("created_at must be an RFC 3339 timestamp");
    }
    const content = {
      topology_atlas_input_receipt_ref: validateDigest(
        input.topology_atlas_input_receipt_ref,
        "topology_atlas_input_receipt_ref",
        false
      ),
      truth_release_digest: validateDigest(
        input.truth_release_digest,
        "truth_release_digest",
        false
      ),
      certified_topology_digest: validateDigest(
        input.certified_topology_digest,
        "certified_topology_digest",
        false
      ),
      topology_atlas_digest: validateDigest(
        input.topology_atlas_digest,
        "topology_atlas_digest",
        false
      ),
      pages_conformation_digest: validateDigest(
        input.pages_conformation_digest,
        "pages_conformation_digest",
        false
      ),
      research_context_digest: validateDigest(
        input.research_context_digest,
        "research_context_digest",
        true
      ),
      source_commit: String(input.source_commit || ""),
      source_tree: String(input.source_tree || ""),
      source_surface: "trureturing-pages",
      human_actor: actor,
      selection,
      gesture: normalizeGesture(input.gesture, selection),
      human_note: note,
      privacy_class: privacy,
      explicitly_saved: true,
      created_at: observedAt
    };
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(content.source_commit)
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(content.source_tree)
        || content.source_commit.length !== content.source_tree.length) {
      throw new TypeError("source_commit and source_tree must be matching lowercase Git object IDs");
    }
    return content;
  }

  function buildRequest(input) {
    return {
      schema: ENVELOPE_SCHEMA,
      observation_schema: SCHEMA,
      observation_content: buildContent(input)
    };
  }

  function selectedCertifiedEdges(graph, nodeIds) {
    const selected = new Set(nodeIds || []);
    return (graph && Array.isArray(graph.edges) ? graph.edges : [])
      .filter((edge) => {
        const source = endpointId(edge.source);
        const target = endpointId(edge.target);
        const authority = String(edge.authority || edge.status || "");
        const layer = String(edge.layer || "");
        const certified = authority === "certified"
          || layer === "truth-dependency"
          || layer === "module-import"
          || layer === "frozen-prerequisite";
        return certified && selected.has(source) && selected.has(target);
      })
      .map((edge) => ({
        dependency_id: endpointId(edge.source),
        dependent_id: endpointId(edge.target)
      }));
  }

  return Object.freeze({
    CLUSTER,
    DIGEST,
    ENVELOPE_SCHEMA,
    GESTURES,
    PRIVACY,
    SCHEMA,
    buildContent,
    buildRequest,
    normalizeGesture,
    normalizeSelection,
    selectedCertifiedEdges
  });
}));
