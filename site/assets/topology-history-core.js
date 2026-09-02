(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingTopologyHistoryCore = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MANIFEST_SCHEMA = "pages-topology-history.v1";
  const DELTA_SCHEMA = "topology-atlas-delta.v1";
  const DIGEST = /^sha256:[0-9a-f]{64}$/;
  const CLUSTER = /^cluster:sha256:[0-9a-f]{64}$/;
  const MAX_DELTAS = 128;
  const MAX_TRANSITIONS = 20000;
  const NODE_RELATIONS = new Set(["added", "retained", "retired"]);
  const EDGE_RELATIONS = new Set(["added", "retained", "removed"]);
  const CLUSTER_RELATIONS = new Set([
    "continuation",
    "split",
    "merge",
    "reorganization",
    "new",
    "retired"
  ]);
  const TOP_LEVEL = [
    "schema_version",
    "from_truth_release_digest",
    "to_truth_release_digest",
    "from_topology_atlas_digest",
    "to_topology_atlas_digest",
    "from_evidence_digest",
    "to_evidence_digest",
    "algorithm_profile_digest",
    "producer_commit",
    "node_transitions",
    "edge_transitions",
    "cluster_lineage",
    "frontier_delta",
    "summary"
  ];

  function requireObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${name} must be an object`);
    }
    return value;
  }

  function exactKeys(value, expected, name) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
      throw new TypeError(`${name} members must be exactly ${wanted.join(", ")}`);
    }
  }

  function string(value, name, pattern) {
    const result = String(value || "");
    if (!result || result.length > 512 || pattern && !pattern.test(result)) {
      throw new TypeError(`${name} is invalid`);
    }
    return result;
  }

  function nullableString(value, name, pattern) {
    return value == null ? null : string(value, name, pattern);
  }

  function count(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a safe non-negative integer`);
    }
    return value;
  }

  function sortedStrings(values, name, pattern) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    const result = values.map((value, index) =>
      string(value, `${name}[${index}]`, pattern));
    for (let index = 1; index < result.length; index += 1) {
      if (result[index - 1] >= result[index]) {
        throw new TypeError(`${name} must be strictly ordinal-sorted and unique`);
      }
    }
    return result;
  }

  function forbidPresentationState(value, path) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if ([
        "x", "y", "z", "fx", "fy", "fz",
        "camera", "camera_position", "conformation",
        "drag_offset", "drag_offsets", "cluster_offsets"
      ].includes(key)) {
        throw new TypeError(`${path}.${key} is presentation state and cannot enter history`);
      }
      forbidPresentationState(child, `${path}.${key}`);
    }
  }

  function nodeTransition(value, index) {
    const item = requireObject(value, `node_transitions[${index}]`);
    exactKeys(item, [
      "stable_node_id",
      "relation",
      "from_node_id",
      "to_node_id",
      "source_path_changed",
      "from_primary_role",
      "to_primary_role",
      "added_traits",
      "removed_traits"
    ], `node_transitions[${index}]`);
    const relation = string(item.relation, `node_transitions[${index}].relation`);
    if (!NODE_RELATIONS.has(relation)) {
      throw new TypeError(`Unsupported node transition ${relation}`);
    }
    const result = {
      stable_node_id: string(
        item.stable_node_id,
        `node_transitions[${index}].stable_node_id`
      ),
      relation,
      from_node_id: nullableString(
        item.from_node_id,
        `node_transitions[${index}].from_node_id`
      ),
      to_node_id: nullableString(
        item.to_node_id,
        `node_transitions[${index}].to_node_id`
      ),
      source_path_changed: item.source_path_changed === true,
      from_primary_role: nullableString(
        item.from_primary_role,
        `node_transitions[${index}].from_primary_role`
      ),
      to_primary_role: nullableString(
        item.to_primary_role,
        `node_transitions[${index}].to_primary_role`
      ),
      added_traits: sortedStrings(
        item.added_traits,
        `node_transitions[${index}].added_traits`
      ),
      removed_traits: sortedStrings(
        item.removed_traits,
        `node_transitions[${index}].removed_traits`
      )
    };
    if (relation === "added" && (result.from_node_id !== null || !result.to_node_id)) {
      throw new TypeError("Added node transition has invalid endpoints");
    }
    if (relation === "retired" && (!result.from_node_id || result.to_node_id !== null)) {
      throw new TypeError("Retired node transition has invalid endpoints");
    }
    if (relation === "retained" && (!result.from_node_id || !result.to_node_id)) {
      throw new TypeError("Retained node transition requires both endpoints");
    }
    return result;
  }

  function edgeTransition(value, index) {
    const item = requireObject(value, `edge_transitions[${index}]`);
    exactKeys(item, [
      "stable_dependency_id",
      "stable_dependent_id",
      "relation",
      "from_dependency_id",
      "from_dependent_id",
      "to_dependency_id",
      "to_dependent_id"
    ], `edge_transitions[${index}]`);
    const relation = string(item.relation, `edge_transitions[${index}].relation`);
    if (!EDGE_RELATIONS.has(relation)) {
      throw new TypeError(`Unsupported edge transition ${relation}`);
    }
    return {
      stable_dependency_id: string(
        item.stable_dependency_id,
        `edge_transitions[${index}].stable_dependency_id`
      ),
      stable_dependent_id: string(
        item.stable_dependent_id,
        `edge_transitions[${index}].stable_dependent_id`
      ),
      relation,
      from_dependency_id: nullableString(
        item.from_dependency_id,
        `edge_transitions[${index}].from_dependency_id`
      ),
      from_dependent_id: nullableString(
        item.from_dependent_id,
        `edge_transitions[${index}].from_dependent_id`
      ),
      to_dependency_id: nullableString(
        item.to_dependency_id,
        `edge_transitions[${index}].to_dependency_id`
      ),
      to_dependent_id: nullableString(
        item.to_dependent_id,
        `edge_transitions[${index}].to_dependent_id`
      )
    };
  }

  function rational(value, name) {
    const item = requireObject(value, name);
    exactKeys(item, ["numerator", "denominator"], name);
    const numerator = count(item.numerator, `${name}.numerator`);
    const denominator = count(item.denominator, `${name}.denominator`);
    if (denominator === 0) throw new TypeError(`${name}.denominator must be positive`);
    return { numerator, denominator };
  }

  function clusterLineage(value, index) {
    const item = requireObject(value, `cluster_lineage[${index}]`);
    exactKeys(item, [
      "level",
      "relation",
      "source_cluster_id",
      "target_cluster_id",
      "source_member_count",
      "target_member_count",
      "overlap_count",
      "member_jaccard",
      "shared_stable_node_ids"
    ], `cluster_lineage[${index}]`);
    const relation = string(item.relation, `cluster_lineage[${index}].relation`);
    if (!CLUSTER_RELATIONS.has(relation)) {
      throw new TypeError(`Unsupported cluster lineage relation ${relation}`);
    }
    const level = count(item.level, `cluster_lineage[${index}].level`);
    if (level > 2) throw new TypeError("Cluster lineage level must be from 0 through 2");
    return {
      level,
      relation,
      source_cluster_id: nullableString(
        item.source_cluster_id,
        `cluster_lineage[${index}].source_cluster_id`,
        CLUSTER
      ),
      target_cluster_id: nullableString(
        item.target_cluster_id,
        `cluster_lineage[${index}].target_cluster_id`,
        CLUSTER
      ),
      source_member_count: count(
        item.source_member_count,
        `cluster_lineage[${index}].source_member_count`
      ),
      target_member_count: count(
        item.target_member_count,
        `cluster_lineage[${index}].target_member_count`
      ),
      overlap_count: count(
        item.overlap_count,
        `cluster_lineage[${index}].overlap_count`
      ),
      member_jaccard: rational(
        item.member_jaccard,
        `cluster_lineage[${index}].member_jaccard`
      ),
      shared_stable_node_ids: sortedStrings(
        item.shared_stable_node_ids,
        `cluster_lineage[${index}].shared_stable_node_ids`
      )
    };
  }

  function summary(value) {
    const item = requireObject(value, "summary");
    const fields = [
      "nodes_added",
      "nodes_retired",
      "nodes_retained",
      "edges_added",
      "edges_removed",
      "edges_retained",
      "cluster_continuations",
      "cluster_splits",
      "cluster_merges",
      "cluster_reorganizations",
      "clusters_new",
      "clusters_retired"
    ];
    exactKeys(item, fields, "summary");
    return Object.fromEntries(fields.map((field) => [field, count(item[field], `summary.${field}`)]));
  }

  function validateSummary(delta) {
    const nodeCount = (relation) =>
      delta.node_transitions.filter((value) => value.relation === relation).length;
    const edgeCount = (relation) =>
      delta.edge_transitions.filter((value) => value.relation === relation).length;
    const clusterCount = (relation) =>
      delta.cluster_lineage.filter((value) => value.relation === relation).length;
    const expected = {
      nodes_added: nodeCount("added"),
      nodes_retired: nodeCount("retired"),
      nodes_retained: nodeCount("retained"),
      edges_added: edgeCount("added"),
      edges_removed: edgeCount("removed"),
      edges_retained: edgeCount("retained"),
      cluster_continuations: clusterCount("continuation"),
      cluster_splits: clusterCount("split"),
      cluster_merges: clusterCount("merge"),
      cluster_reorganizations: clusterCount("reorganization"),
      clusters_new: clusterCount("new"),
      clusters_retired: clusterCount("retired")
    };
    for (const [field, value] of Object.entries(expected)) {
      if (delta.summary[field] !== value) {
        throw new TypeError(`summary.${field} disagrees with transitions`);
      }
    }
  }

  function validateDelta(input) {
    const value = requireObject(input, "Topology Atlas delta");
    forbidPresentationState(value, "$delta");
    exactKeys(value, TOP_LEVEL, "Topology Atlas delta");
    if (value.schema_version !== DELTA_SCHEMA) {
      throw new TypeError(`Expected ${DELTA_SCHEMA}`);
    }
    const nodes = Array.isArray(value.node_transitions)
      ? value.node_transitions.map(nodeTransition)
      : (() => { throw new TypeError("node_transitions must be an array"); })();
    const edges = Array.isArray(value.edge_transitions)
      ? value.edge_transitions.map(edgeTransition)
      : (() => { throw new TypeError("edge_transitions must be an array"); })();
    const clusters = Array.isArray(value.cluster_lineage)
      ? value.cluster_lineage.map(clusterLineage)
      : (() => { throw new TypeError("cluster_lineage must be an array"); })();
    if (nodes.length + edges.length + clusters.length > MAX_TRANSITIONS) {
      throw new TypeError(`Delta exceeds ${MAX_TRANSITIONS} structural transitions`);
    }
    for (let index = 1; index < nodes.length; index += 1) {
      if (nodes[index - 1].stable_node_id >= nodes[index].stable_node_id) {
        throw new TypeError("node_transitions must be strictly ordinal-sorted");
      }
    }
    for (let index = 1; index < edges.length; index += 1) {
      const previous = `${edges[index - 1].stable_dependency_id}\u0000${edges[index - 1].stable_dependent_id}`;
      const current = `${edges[index].stable_dependency_id}\u0000${edges[index].stable_dependent_id}`;
      if (previous >= current) {
        throw new TypeError("edge_transitions must be strictly ordinal-sorted");
      }
    }
    const frontier = requireObject(value.frontier_delta, "frontier_delta");
    exactKeys(frontier, ["entered_frontier", "left_frontier"], "frontier_delta");
    const result = {
      schema_version: DELTA_SCHEMA,
      from_truth_release_digest: string(
        value.from_truth_release_digest,
        "from_truth_release_digest",
        DIGEST
      ),
      to_truth_release_digest: string(
        value.to_truth_release_digest,
        "to_truth_release_digest",
        DIGEST
      ),
      from_topology_atlas_digest: string(
        value.from_topology_atlas_digest,
        "from_topology_atlas_digest",
        DIGEST
      ),
      to_topology_atlas_digest: string(
        value.to_topology_atlas_digest,
        "to_topology_atlas_digest",
        DIGEST
      ),
      from_evidence_digest: string(
        value.from_evidence_digest,
        "from_evidence_digest",
        DIGEST
      ),
      to_evidence_digest: string(
        value.to_evidence_digest,
        "to_evidence_digest",
        DIGEST
      ),
      algorithm_profile_digest: string(
        value.algorithm_profile_digest,
        "algorithm_profile_digest",
        DIGEST
      ),
      producer_commit: string(
        value.producer_commit,
        "producer_commit",
        /^[0-9a-f]{40}$/
      ),
      node_transitions: nodes,
      edge_transitions: edges,
      cluster_lineage: clusters,
      frontier_delta: {
        entered_frontier: sortedStrings(
          frontier.entered_frontier,
          "frontier_delta.entered_frontier"
        ),
        left_frontier: sortedStrings(
          frontier.left_frontier,
          "frontier_delta.left_frontier"
        )
      },
      summary: summary(value.summary)
    };
    if (result.from_truth_release_digest === result.to_truth_release_digest) {
      throw new TypeError("A history delta must cross two releases");
    }
    validateSummary(result);
    return result;
  }

  function validateManifest(input) {
    const value = requireObject(input, "history manifest");
    exactKeys(value, [
      "schema",
      "current_truth_release_digest",
      "entries"
    ], "history manifest");
    if (value.schema !== MANIFEST_SCHEMA) {
      throw new TypeError(`Expected ${MANIFEST_SCHEMA}`);
    }
    if (!Array.isArray(value.entries) || value.entries.length > MAX_DELTAS) {
      throw new TypeError(`entries must contain at most ${MAX_DELTAS} deltas`);
    }
    const entries = value.entries.map((entry, index) => {
      const item = requireObject(entry, `entries[${index}]`);
      exactKeys(item, [
        "delta_path",
        "delta_digest",
        "from_truth_release_digest",
        "to_truth_release_digest",
        "from_topology_atlas_digest",
        "to_topology_atlas_digest"
      ], `entries[${index}]`);
      const path = string(item.delta_path, `entries[${index}].delta_path`);
      if (!/^data\/[A-Za-z0-9._/-]+\.json$/.test(path)
          || path.includes("..") || path.includes("//")) {
        throw new TypeError(`entries[${index}].delta_path is unsafe`);
      }
      return {
        delta_path: path,
        delta_digest: string(
          item.delta_digest,
          `entries[${index}].delta_digest`,
          DIGEST
        ),
        from_truth_release_digest: string(
          item.from_truth_release_digest,
          `entries[${index}].from_truth_release_digest`,
          DIGEST
        ),
        to_truth_release_digest: string(
          item.to_truth_release_digest,
          `entries[${index}].to_truth_release_digest`,
          DIGEST
        ),
        from_topology_atlas_digest: string(
          item.from_topology_atlas_digest,
          `entries[${index}].from_topology_atlas_digest`,
          DIGEST
        ),
        to_topology_atlas_digest: string(
          item.to_topology_atlas_digest,
          `entries[${index}].to_topology_atlas_digest`,
          DIGEST
        )
      };
    });
    const digests = new Set();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (digests.has(entry.delta_digest)) {
        throw new TypeError("History manifest repeats a delta digest");
      }
      digests.add(entry.delta_digest);
      if (index > 0) {
        const previous = entries[index - 1];
        if (previous.to_truth_release_digest !== entry.from_truth_release_digest
            || previous.to_topology_atlas_digest !== entry.from_topology_atlas_digest) {
          throw new TypeError("History manifest release chain is discontinuous");
        }
      }
    }
    const current = string(
      value.current_truth_release_digest,
      "current_truth_release_digest",
      DIGEST
    );
    if (entries.length
        && entries[entries.length - 1].to_truth_release_digest !== current) {
      throw new TypeError("History manifest does not terminate at current release");
    }
    return {
      schema: MANIFEST_SCHEMA,
      current_truth_release_digest: current,
      entries
    };
  }

  function bindDelta(entry, delta, digest) {
    if (entry.delta_digest !== digest
        || entry.from_truth_release_digest !== delta.from_truth_release_digest
        || entry.to_truth_release_digest !== delta.to_truth_release_digest
        || entry.from_topology_atlas_digest !== delta.from_topology_atlas_digest
        || entry.to_topology_atlas_digest !== delta.to_topology_atlas_digest) {
      throw new TypeError("History entry does not bind the exact delta artifact");
    }
    return { entry, delta, digest };
  }

  function aggregate(records) {
    const result = {
      releaseTransitions: records.length,
      fromRelease: records[0] && records[0].delta.from_truth_release_digest || null,
      toRelease: records.at(-1) && records.at(-1).delta.to_truth_release_digest || null,
      nodesAdded: 0,
      nodesRetired: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      clusterSplits: 0,
      clusterMerges: 0,
      clusterReorganizations: 0,
      frontierEntered: 0,
      frontierLeft: 0
    };
    for (const record of records) {
      const delta = record.delta;
      result.nodesAdded += delta.summary.nodes_added;
      result.nodesRetired += delta.summary.nodes_retired;
      result.edgesAdded += delta.summary.edges_added;
      result.edgesRemoved += delta.summary.edges_removed;
      result.clusterSplits += delta.summary.cluster_splits;
      result.clusterMerges += delta.summary.cluster_merges;
      result.clusterReorganizations += delta.summary.cluster_reorganizations;
      result.frontierEntered += delta.frontier_delta.entered_frontier.length;
      result.frontierLeft += delta.frontier_delta.left_frontier.length;
    }
    return result;
  }

  function rows(record, kind) {
    if (kind === "nodes") return record.delta.node_transitions;
    if (kind === "edges") return record.delta.edge_transitions;
    if (kind === "clusters") return record.delta.cluster_lineage;
    if (kind === "frontier") {
      return [
        ...record.delta.frontier_delta.entered_frontier.map((stable) => ({
          stable_node_id: stable,
          relation: "entered-frontier"
        })),
        ...record.delta.frontier_delta.left_frontier.map((stable) => ({
          stable_node_id: stable,
          relation: "left-frontier"
        }))
      ];
    }
    return [];
  }

  return Object.freeze({
    CLUSTER_RELATIONS,
    DELTA_SCHEMA,
    DIGEST,
    EDGE_RELATIONS,
    MANIFEST_SCHEMA,
    MAX_DELTAS,
    MAX_TRANSITIONS,
    NODE_RELATIONS,
    aggregate,
    bindDelta,
    forbidPresentationState,
    rows,
    validateDelta,
    validateManifest
  });
}));
