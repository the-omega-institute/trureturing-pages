(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingCounterfactualPreviewCore = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const SCHEMA = "pages-counterfactual-preview.v1";
  const DIGEST = /^sha256:[0-9a-f]{64}$/;
  const CLUSTER = /^cluster:sha256:[0-9a-f]{64}$/;
  const OPERATIONS = new Set(["add-node", "add-edge", "remove-edge"]);
  const CLASSIFICATIONS = new Set([
    "rejected-cycle",
    "rejected-topology",
    "structural-upside",
    "mixed-structural-risk",
    "structural-risk",
    "no-measured-gain"
  ]);
  const MAX_OPERATIONS = 64;
  const MAX_PATH_CHANGES = 32;
  const MAX_INTERFACE_CHANGES = 32;

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function requireObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${name} must be an object`);
    }
    return value;
  }

  function requireString(value, name, pattern) {
    const result = String(value || "");
    if (!result || result.length > 512 || pattern && !pattern.test(result)) {
      throw new TypeError(`${name} is invalid`);
    }
    return result;
  }

  function integerString(value, name) {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a safe non-negative integer`);
      }
      return String(value);
    }
    const result = String(value ?? "");
    if (!/^(?:0|[1-9][0-9]*)$/.test(result)) {
      throw new TypeError(`${name} must be a canonical non-negative integer`);
    }
    return result;
  }

  function ordinal(values, name, pattern) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    const result = values.map((value, index) =>
      requireString(value, `${name}[${index}]`, pattern));
    for (let index = 1; index < result.length; index += 1) {
      if (result[index - 1] >= result[index]) {
        throw new TypeError(`${name} must be strictly ordinal-sorted and unique`);
      }
    }
    return result;
  }

  function operationKey(value) {
    return [
      value.operation,
      value.stable_node_id || "",
      value.stable_dependency_id || "",
      value.stable_dependent_id || "",
      value.node_id || "",
      value.dependency_id || "",
      value.dependent_id || ""
    ].join("\u0000");
  }

  function normalizeOperation(input, index) {
    const value = requireObject(input, `operations[${index}]`);
    const operation = requireString(
      value.operation,
      `operations[${index}].operation`
    );
    if (!OPERATIONS.has(operation)) {
      throw new TypeError(`Unsupported operation ${operation}`);
    }
    const result = {
      operation,
      node_id: value.node_id == null ? null : requireString(
        value.node_id,
        `operations[${index}].node_id`
      ),
      stable_node_id: value.stable_node_id == null ? null : requireString(
        value.stable_node_id,
        `operations[${index}].stable_node_id`
      ),
      dependency_id: value.dependency_id == null ? null : requireString(
        value.dependency_id,
        `operations[${index}].dependency_id`
      ),
      dependent_id: value.dependent_id == null ? null : requireString(
        value.dependent_id,
        `operations[${index}].dependent_id`
      ),
      stable_dependency_id: value.stable_dependency_id == null ? null : requireString(
        value.stable_dependency_id,
        `operations[${index}].stable_dependency_id`
      ),
      stable_dependent_id: value.stable_dependent_id == null ? null : requireString(
        value.stable_dependent_id,
        `operations[${index}].stable_dependent_id`
      )
    };
    for (const forbidden of ["x", "y", "z", "fx", "fy", "fz", "camera"]) {
      if (forbidden in value) {
        throw new TypeError(`Counterfactual operation cannot carry ${forbidden}`);
      }
    }
    if (operation === "add-node") {
      if (!result.node_id || !result.stable_node_id
          || result.dependency_id || result.dependent_id
          || result.stable_dependency_id || result.stable_dependent_id) {
        throw new TypeError("add-node has an invalid shape");
      }
    } else if (result.node_id || result.stable_node_id
        || !result.dependency_id || !result.dependent_id
        || !result.stable_dependency_id || !result.stable_dependent_id) {
      throw new TypeError(`${operation} has an invalid shape`);
    }
    return result;
  }

  function normalizeMetrics(input) {
    const value = requireObject(input, "metrics");
    const names = [
      "reachability_gain",
      "reachability_loss",
      "path_compression",
      "shortest_path_change_count",
      "new_cut_bridge_count",
      "removed_cut_bridge_count",
      "new_interface_count",
      "removed_interface_count",
      "cycle_witness_count",
      "affected_stable_node_count",
      "touched_cluster_count",
      "edit_operation_count"
    ];
    return Object.fromEntries(names.map((name) => [
      name,
      integerString(value[name], `metrics.${name}`)
    ]));
  }

  function normalizePathChange(input, index) {
    const value = requireObject(input, `path_changes[${index}]`);
    return {
      source_node_id: requireString(
        value.source_node_id,
        `path_changes[${index}].source_node_id`
      ),
      target_node_id: requireString(
        value.target_node_id,
        `path_changes[${index}].target_node_id`
      ),
      before_distance: value.before_distance == null
        ? null
        : integerString(value.before_distance, `path_changes[${index}].before_distance`),
      after_distance: value.after_distance == null
        ? null
        : integerString(value.after_distance, `path_changes[${index}].after_distance`)
    };
  }

  function normalizeInterfaceChange(input, index) {
    const value = requireObject(input, `interface_changes[${index}]`);
    const relation = requireString(
      value.relation,
      `interface_changes[${index}].relation`
    );
    if (relation !== "added" && relation !== "removed") {
      throw new TypeError("interface change relation must be added or removed");
    }
    return {
      source_cluster_id: requireString(
        value.source_cluster_id,
        `interface_changes[${index}].source_cluster_id`,
        CLUSTER
      ),
      target_cluster_id: requireString(
        value.target_cluster_id,
        `interface_changes[${index}].target_cluster_id`,
        CLUSTER
      ),
      relation
    };
  }

  function validate(input, manifest) {
    const value = requireObject(input, "counterfactual preview");
    if (value.schema !== SCHEMA) throw new TypeError(`Expected ${SCHEMA}`);
    const classification = requireString(value.classification, "classification");
    if (!CLASSIFICATIONS.has(classification)) {
      throw new TypeError(`Unsupported classification ${classification}`);
    }
    if (value.authority !== "advisory") {
      throw new TypeError("Counterfactual preview authority must remain advisory");
    }
    const operations = Array.isArray(value.operations)
      ? value.operations.map(normalizeOperation)
      : (() => { throw new TypeError("operations must be an array"); })();
    if (operations.length > MAX_OPERATIONS) {
      throw new TypeError(`operations exceeds ${MAX_OPERATIONS}`);
    }
    for (let index = 1; index < operations.length; index += 1) {
      if (operationKey(operations[index - 1]) >= operationKey(operations[index])) {
        throw new TypeError("operations must be strictly ordinal-sorted and unique");
      }
    }
    const pathChanges = (value.path_changes || []).map(normalizePathChange);
    const interfaceChanges = (value.interface_changes || []).map(normalizeInterfaceChange);
    if (pathChanges.length > MAX_PATH_CHANGES) {
      throw new TypeError(`path_changes exceeds ${MAX_PATH_CHANGES}`);
    }
    if (interfaceChanges.length > MAX_INTERFACE_CHANGES) {
      throw new TypeError(`interface_changes exceeds ${MAX_INTERFACE_CHANGES}`);
    }
    const result = {
      schema: SCHEMA,
      candidate_ref: requireString(value.candidate_ref, "candidate_ref", DIGEST),
      valuation_ref: requireString(value.valuation_ref, "valuation_ref", DIGEST),
      truth_release_digest: requireString(
        value.truth_release_digest,
        "truth_release_digest",
        DIGEST
      ),
      topology_atlas_digest: requireString(
        value.topology_atlas_digest,
        "topology_atlas_digest",
        DIGEST
      ),
      counterfactual_ref: requireString(
        value.counterfactual_ref,
        "counterfactual_ref",
        DIGEST
      ),
      accepted: value.accepted === true,
      cycle_risk: value.cycle_risk === true,
      classification,
      authority: "advisory",
      operations,
      metrics: normalizeMetrics(value.metrics),
      affected_node_ids: ordinal(value.affected_node_ids || [], "affected_node_ids"),
      affected_stable_node_ids: ordinal(
        value.affected_stable_node_ids || [],
        "affected_stable_node_ids"
      ),
      touched_cluster_ids: ordinal(
        value.touched_cluster_ids || [],
        "touched_cluster_ids",
        CLUSTER
      ),
      path_changes: pathChanges,
      interface_changes: interfaceChanges
    };
    if (result.accepted && result.cycle_risk) {
      throw new TypeError("Accepted preview cannot carry cycle risk");
    }
    if (manifest) {
      if (manifest.truth_release_digest !== result.truth_release_digest
          || manifest.topology_atlas_digest !== result.topology_atlas_digest) {
        throw new TypeError("Counterfactual preview uses different release coordinates");
      }
    }
    return result;
  }

  function stableHash(value) {
    let result = 2166136261;
    for (const character of String(value || "")) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function mean(points) {
    if (!points.length) return { x: 0, y: 0, z: 0 };
    return points.reduce((sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
      z: sum.z + point.z / points.length
    }), { x: 0, y: 0, z: 0 });
  }

  function ghostPositions(preview, canonicalPositions) {
    const result = new Map();
    const added = preview.operations
      .filter((operation) => operation.operation === "add-node");
    for (const [index, operation] of added.entries()) {
      const neighbors = preview.operations
        .filter((edge) => edge.operation === "add-edge"
          && (edge.dependency_id === operation.node_id
            || edge.dependent_id === operation.node_id))
        .flatMap((edge) => [edge.dependency_id, edge.dependent_id])
        .filter((id) => id !== operation.node_id)
        .map((id) => canonicalPositions.get(id) || result.get(id))
        .filter(Boolean);
      const base = mean(neighbors.length
        ? neighbors
        : [...canonicalPositions.values()].slice(0, 1));
      const angle = ((stableHash(operation.stable_node_id) + index * 97) % 360)
        * Math.PI / 180;
      result.set(operation.node_id, {
        x: base.x + Math.cos(angle) * 42,
        y: base.y,
        z: base.z + Math.sin(angle) * 42
      });
    }
    return result;
  }

  function project(preview, canonicalPositions, clusterCentroids) {
    const ghosts = ghostPositions(preview, canonicalPositions);
    const position = (id) => canonicalPositions.get(id) || ghosts.get(id) || null;
    const nodes = preview.operations
      .filter((operation) => operation.operation === "add-node")
      .map((operation) => ({
        id: operation.node_id,
        stable_id: operation.stable_node_id,
        position: ghosts.get(operation.node_id),
        authority: "advisory"
      }));
    const edges = preview.operations
      .filter((operation) => operation.operation !== "add-node")
      .map((operation) => ({
        operation: operation.operation,
        source_id: operation.dependency_id,
        target_id: operation.dependent_id,
        source: position(operation.dependency_id),
        target: position(operation.dependent_id),
        authority: "advisory"
      }))
      .filter((edge) => edge.source && edge.target);
    const paths = preview.path_changes.map((change) => ({
      ...change,
      source: position(change.source_node_id),
      target: position(change.target_node_id),
      authority: "advisory"
    })).filter((change) => change.source && change.target);
    const interfaces = preview.interface_changes.map((change) => ({
      ...change,
      source: clusterCentroids.get(change.source_cluster_id) || null,
      target: clusterCentroids.get(change.target_cluster_id) || null,
      authority: "advisory"
    })).filter((change) => change.source && change.target);
    return { nodes, edges, paths, interfaces };
  }

  function summary(preview) {
    const addedNodes = preview.operations.filter((value) => value.operation === "add-node").length;
    const addedEdges = preview.operations.filter((value) => value.operation === "add-edge").length;
    const removedEdges = preview.operations.filter((value) => value.operation === "remove-edge").length;
    return {
      classification: preview.classification,
      accepted: preview.accepted,
      cycleRisk: preview.cycle_risk,
      addedNodes,
      addedEdges,
      removedEdges,
      pathChanges: preview.path_changes.length,
      interfaceChanges: preview.interface_changes.length
    };
  }

  return Object.freeze({
    CLASSIFICATIONS,
    CLUSTER,
    DIGEST,
    MAX_INTERFACE_CHANGES,
    MAX_OPERATIONS,
    MAX_PATH_CHANGES,
    OPERATIONS,
    SCHEMA,
    endpointId,
    ghostPositions,
    integerString,
    operationKey,
    project,
    stableHash,
    summary,
    validate
  });
}));
