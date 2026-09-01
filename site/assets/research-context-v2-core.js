(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingResearchContextV2Core = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const SCHEMA = "pages-research-context.v2";
  const DIGEST = /^sha256:[0-9a-f]{64}$/;
  const CLUSTER = /^cluster:sha256:[0-9a-f]{64}$/;
  const LIMITS = Object.freeze({
    selectedNodes: 16,
    selectedClusters: 8,
    selectedEdges: 64,
    neighborhood: 64,
    interfaces: 64,
    affinities: 32,
    witnessNodes: 16,
    hops: 3
  });
  const CERTIFIED_LAYERS = new Set([
    "truth-dependency",
    "module-import",
    "frozen-prerequisite"
  ]);

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function authority(edge) {
    const layer = String(edge && edge.layer || "");
    const status = String(edge && edge.status || "");
    if (CERTIFIED_LAYERS.has(layer) || status === "certified") return "certified";
    if (layer === "structural-affinity" || layer.includes("affinity")) return "derived";
    if (layer === "intuition-candidate" || status === "advisory" || status === "proposed") {
      return "advisory";
    }
    return layer.startsWith("blueprint-") ? "authored" : "authored";
  }

  function ordinal(values, limit, name, pattern) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    if (values.length > limit) throw new TypeError(`${name} exceeds ${limit}`);
    const result = values.map((value) => String(value || ""));
    if (result.some((value) => !value || pattern && !pattern.test(value))) {
      throw new TypeError(`${name} contains an invalid identity`);
    }
    result.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    for (let index = 1; index < result.length; index += 1) {
      if (result[index - 1] === result[index]) {
        throw new TypeError(`${name} contains duplicate ${result[index]}`);
      }
    }
    return result;
  }

  function requireDigest(value, name, nullable) {
    if (nullable && value == null) return null;
    const result = String(value || "");
    if (!DIGEST.test(result)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
    return result;
  }

  function createModel(graph, evidence) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new TypeError("Atlas graph must contain nodes and edges");
    }
    const nodeById = new Map();
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== "string" || !node.id || nodeById.has(node.id)) {
        throw new TypeError("Atlas graph contains invalid node identities");
      }
      nodeById.set(node.id, node);
    }
    const parents = new Map([...nodeById.keys()].map((id) => [id, new Set()]));
    const children = new Map([...nodeById.keys()].map((id) => [id, new Set()]));
    const edges = graph.edges.map((edge, index) => {
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (!nodeById.has(source) || !nodeById.has(target)) {
        throw new TypeError(`Atlas edge ${index} references an unknown node`);
      }
      const relationAuthority = authority(edge);
      if (relationAuthority === "certified") {
        parents.get(target).add(source);
        children.get(source).add(target);
      }
      return { ...edge, source, target, authority: relationAuthority };
    });
    const stableByNode = new Map();
    const identities = evidence && Array.isArray(evidence.node_identities)
      ? evidence.node_identities
      : [];
    for (const identity of identities) {
      if (identity && typeof identity.node_id === "string"
          && typeof identity.stable_node_id === "string"
          && nodeById.has(identity.node_id)
          && !stableByNode.has(identity.node_id)) {
        stableByNode.set(identity.node_id, identity.stable_node_id);
      }
    }
    return Object.freeze({
      graph,
      evidence: evidence || null,
      nodeById,
      edges,
      parents,
      children,
      stableByNode
    });
  }

  function boundedReach(adjacency, start, hops, allowed) {
    const result = new Set();
    let frontier = new Set([start]);
    for (let depth = 0; depth < hops; depth += 1) {
      const next = new Set();
      for (const id of frontier) {
        for (const neighbor of adjacency.get(id) || []) {
          if (allowed && !allowed.has(neighbor)) continue;
          if (result.has(neighbor) || neighbor === start) continue;
          result.add(neighbor);
          if (result.size >= LIMITS.neighborhood) return result;
          next.add(neighbor);
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    return result;
  }

  function intersection(sets) {
    if (!sets.length) return [];
    const first = [...sets[0]];
    return first.filter((value) => sets.slice(1).every((set) => set.has(value)))
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
      .slice(0, LIMITS.neighborhood);
  }

  function selectedCertifiedEdges(model, selected) {
    const ids = new Set(selected);
    return model.edges
      .filter((edge) => edge.authority === "certified"
        && ids.has(edge.source)
        && ids.has(edge.target))
      .map((edge) => ({
        dependency_id: edge.source,
        dependent_id: edge.target,
        is_cut_bridge: edge.is_cut_bridge === true,
        cluster_relation: edge.cluster_relation || null
      }))
      .sort((left, right) =>
        left.dependency_id < right.dependency_id ? -1
          : left.dependency_id > right.dependency_id ? 1
            : left.dependent_id < right.dependent_id ? -1
              : left.dependent_id > right.dependent_id ? 1 : 0)
      .slice(0, LIMITS.selectedEdges);
  }

  function clusterInterfaces(model, clusters) {
    const selected = new Set(clusters);
    return model.edges
      .filter((edge) => {
        if (edge.authority !== "certified") return false;
        const source = model.nodeById.get(edge.source);
        const target = model.nodeById.get(edge.target);
        const sourceCluster = source && source.atlas_cluster_id;
        const targetCluster = target && target.atlas_cluster_id;
        return sourceCluster && targetCluster && sourceCluster !== targetCluster
          && (selected.has(sourceCluster) || selected.has(targetCluster));
      })
      .map((edge) => {
        const source = model.nodeById.get(edge.source);
        const target = model.nodeById.get(edge.target);
        return {
          source_cluster_id: source.atlas_cluster_id,
          target_cluster_id: target.atlas_cluster_id,
          dependency_id: edge.source,
          dependent_id: edge.target,
          is_cut_bridge: edge.is_cut_bridge === true
        };
      })
      .sort((left, right) => {
        const leftKey = `${left.source_cluster_id}\u0000${left.target_cluster_id}\u0000${left.dependency_id}\u0000${left.dependent_id}`;
        const rightKey = `${right.source_cluster_id}\u0000${right.target_cluster_id}\u0000${right.dependency_id}\u0000${right.dependent_id}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
      .slice(0, LIMITS.interfaces);
  }

  function witnessArray(value, names) {
    for (const name of names) {
      if (Array.isArray(value && value[name])) {
        return ordinal(
          value[name],
          LIMITS.witnessNodes,
          `affinity_witness.${name}`
        );
      }
    }
    return [];
  }

  function affinityWitnesses(model, selectedNodes) {
    const selected = new Set(selectedNodes);
    const values = model.evidence && Array.isArray(model.evidence.affinity_witnesses)
      ? model.evidence.affinity_witnesses
      : [];
    return values
      .filter((value) => value && selected.has(value.source_node_id)
        || value && selected.has(value.neighbor_node_id))
      .map((value) => ({
        source_node_id: String(value.source_node_id || ""),
        neighbor_node_id: String(value.neighbor_node_id || ""),
        shared_prerequisite_node_ids: witnessArray(value, [
          "shared_prerequisite_node_ids",
          "shared_ancestor_node_ids",
          "shared_prerequisites"
        ]),
        shared_consequence_node_ids: witnessArray(value, [
          "shared_dependent_node_ids",
          "shared_descendant_node_ids",
          "shared_consequences"
        ]),
        deepest_common_prerequisite_node_ids: witnessArray(value, [
          "deepest_common_prerequisite_node_ids",
          "deepest_common_prerequisites"
        ])
      }))
      .filter((value) => value.source_node_id && value.neighbor_node_id)
      .sort((left, right) => {
        const leftKey = `${left.source_node_id}\u0000${left.neighbor_node_id}`;
        const rightKey = `${right.source_node_id}\u0000${right.neighbor_node_id}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
      .slice(0, LIMITS.affinities);
  }

  function buildContent(model, coordinates, selection) {
    const nodes = ordinal(
      selection.selected_node_ids || [],
      LIMITS.selectedNodes,
      "selected_node_ids"
    );
    const clusters = ordinal(
      selection.selected_cluster_ids || [],
      LIMITS.selectedClusters,
      "selected_cluster_ids",
      CLUSTER
    );
    for (const id of nodes) {
      if (!model.nodeById.has(id)) throw new TypeError(`Unknown selected node ${id}`);
    }
    const allowed = new Set(model.nodeById.keys());
    const upstream = nodes.map((id) =>
      boundedReach(model.parents, id, LIMITS.hops, allowed));
    const downstream = nodes.map((id) =>
      boundedReach(model.children, id, LIMITS.hops, allowed));
    const stable = nodes.map((id) => model.stableByNode.get(id) || id);
    const preview = selection.counterfactual_preview || null;
    return {
      truth_release_digest: requireDigest(
        coordinates.truth_release_digest,
        "truth_release_digest",
        false
      ),
      certified_topology_digest: requireDigest(
        coordinates.certified_topology_digest,
        "certified_topology_digest",
        false
      ),
      topology_atlas_digest: requireDigest(
        coordinates.topology_atlas_digest,
        "topology_atlas_digest",
        false
      ),
      pages_conformation_digest: requireDigest(
        coordinates.pages_conformation_digest,
        "pages_conformation_digest",
        false
      ),
      topology_atlas_evidence_digest: requireDigest(
        coordinates.topology_atlas_evidence_digest,
        "topology_atlas_evidence_digest",
        true
      ),
      selection: {
        selected_node_ids: nodes,
        selected_stable_node_ids: stable,
        selected_cluster_ids: clusters,
        selected_certified_edges: selectedCertifiedEdges(model, nodes),
        selected_path_ref: requireDigest(
          selection.selected_path_ref,
          "selected_path_ref",
          true
        )
      },
      certified_neighborhood: {
        hop_limit: LIMITS.hops,
        shared_prerequisite_node_ids: intersection(upstream),
        shared_consequence_node_ids: intersection(downstream)
      },
      cluster_interfaces: clusterInterfaces(model, clusters),
      affinity_witnesses: affinityWitnesses(model, nodes),
      counterfactual_preview: preview
        ? {
            candidate_ref: requireDigest(preview.candidate_ref, "candidate_ref", false),
            valuation_ref: requireDigest(preview.valuation_ref, "valuation_ref", false),
            counterfactual_ref: requireDigest(
              preview.counterfactual_ref,
              "counterfactual_ref",
              false
            ),
            classification: String(preview.classification || ""),
            accepted: preview.accepted === true,
            cycle_risk: preview.cycle_risk === true,
            authority: "advisory"
          }
        : null,
      evidence_status: model.evidence
        ? "topology-atlas-evidence-bound"
        : "topology-atlas-evidence-unavailable",
      bounds: { ...LIMITS },
      authority: {
        certified_dependency: "truth",
        topology_structure: "deterministic-derived",
        affinity_witness: "deterministic-derived",
        counterfactual_preview: "advisory",
        pages_coordinates_included: false,
        local_exploration_offsets_included: false
      }
    };
  }

  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  return Object.freeze({
    CERTIFIED_LAYERS,
    CLUSTER,
    DIGEST,
    LIMITS,
    SCHEMA,
    affinityWitnesses,
    authority,
    boundedReach,
    buildContent,
    canonical,
    clusterInterfaces,
    createModel,
    endpointId,
    intersection,
    selectedCertifiedEdges
  });
}));
