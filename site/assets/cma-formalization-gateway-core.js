(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingCmaFormalizationGatewayCore = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const REQUEST_SCHEMA = "pages-formalization-gate-request.v1";
  const RESULT_SCHEMA = "pages-formalization-gate-result.v1";
  const SUBMISSION_SCHEMA = "pages-formalization-submission.v1";
  const DIGEST = /^sha256:[0-9a-f]{64}$/;
  const ROUTES = new Set(["github-user", "anonymous-service"]);
  const ACTIONS = new Set([
    "add-abstraction",
    "add-bridge",
    "add-counterexample",
    "add-definition-package",
    "add-premise",
    "add-subgoal",
    "change-representation",
    "formalize-open-node",
    "reroot"
  ]);
  const PRIVACY = new Set(["private-research", "public-contribution"]);
  const DECISIONS = new Set([
    "accept",
    "needs-clarification",
    "defer",
    "duplicate",
    "reject"
  ]);
  const VECTOR_KEYS = Object.freeze([
    "novelty",
    "structural_leverage",
    "reuse_value",
    "frontier_closure",
    "verification_readiness",
    "uncertainty"
  ]);

  function object(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${name} must be an object`);
    }
    return value;
  }

  function text(value, name, maximum) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${name} must be a non-empty string`);
    }
    const result = value.trim();
    if (result.length > maximum) throw new RangeError(`${name} exceeds ${maximum} characters`);
    return result;
  }

  function digest(value, name) {
    const result = String(value || "").toLowerCase();
    if (!DIGEST.test(result)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
    return result;
  }

  function optionalDigest(value, name) {
    return value == null || value === "" ? null : digest(value, name);
  }

  function timestamp(value, name) {
    const result = text(value, name, 64);
    if (!result.endsWith("Z") || !Number.isFinite(Date.parse(result))) {
      throw new TypeError(`${name} must be an RFC 3339 UTC timestamp`);
    }
    return result;
  }

  function sortedStrings(values, name, maximum) {
    if (!Array.isArray(values) || values.length > maximum) {
      throw new TypeError(`${name} must contain at most ${maximum} items`);
    }
    const result = values.map((value, index) => text(value, `${name}[${index}]`, 1000));
    for (let index = 1; index < result.length; index += 1) {
      if (result[index - 1] >= result[index]) {
        throw new TypeError(`${name} must be strictly ordinal-sorted and unique`);
      }
    }
    return result;
  }

  function endpointId(value) {
    return value && typeof value === "object" ? value.id : value;
  }

  function releaseIdentity(graph) {
    const value = object(graph, "graph");
    const snapshot = object(value.source_snapshot || {}, "graph.source_snapshot");
    return {
      truth_release_digest: optionalDigest(
        snapshot.truth_release_digest || snapshot.truth_graph_sha256,
        "truth_release_digest"
      ),
      source_repo: text(
        snapshot.source_repo || "the-omega-institute/trureturing",
        "source_repo",
        256
      ),
      source_commit: text(snapshot.source_commit, "source_commit", 64),
      source_tree: snapshot.source_tree == null ? null : text(snapshot.source_tree, "source_tree", 64)
    };
  }

  function nodeSummary(node) {
    const value = object(node, "node");
    return {
      id: text(value.id, "node.id", 512),
      gid: value.gid == null ? null : text(value.gid, "node.gid", 512),
      title: text(value.human_title || value.title || value.id, "node.title", 1000),
      state: String(value.state || value.status || "unknown"),
      structural_role: value.structural_role || value.primary_role || null,
      cluster_id: value.cluster_id || value.primary_cluster_id || null,
      descendant_count: Number.isSafeInteger(value.descendant_count)
        ? value.descendant_count
        : null
    };
  }

  function buildSelection(graph, nodeId) {
    const value = object(graph, "graph");
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      throw new TypeError("graph must contain nodes and edges arrays");
    }
    const nodes = new Map(value.nodes
      .filter((node) => node && typeof node.id === "string")
      .map((node) => [node.id, node]));
    const selected = nodes.get(text(nodeId, "nodeId", 512));
    if (!selected) throw new TypeError("selected node is absent from the graph");
    const prerequisites = [];
    const dependents = [];
    for (const edge of value.edges) {
      if (!edge || typeof edge !== "object") continue;
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (target === selected.id && nodes.has(source)) prerequisites.push(nodeSummary(nodes.get(source)));
      if (source === selected.id && nodes.has(target)) dependents.push(nodeSummary(nodes.get(target)));
    }
    const order = (left, right) => left.id.localeCompare(right.id);
    prerequisites.sort(order);
    dependents.sort(order);
    return {
      selected_node: nodeSummary(selected),
      certified_prerequisites: prerequisites,
      certified_dependents: dependents
    };
  }

  function secretLeak(value) {
    const source = String(value || "");
    const patterns = [
      ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
      ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
      ["bearer credential", /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i],
      ["API secret", /\bsk-[A-Za-z0-9_-]{20,}\b/]
    ];
    const found = patterns.find(([, pattern]) => pattern.test(source));
    return found ? found[0] : null;
  }

  function localPreflight(input) {
    const value = object(input, "preflight input");
    const reasons = [];
    const statement = typeof value.statement === "string" ? value.statement.trim() : "";
    const summary = typeof value.public_summary === "string" ? value.public_summary.trim() : "";
    if (statement.length < 20) reasons.push("Describe a mathematical claim or missing result in at least 20 characters.");
    if (summary.length < 12) reasons.push("Add a public contribution summary of at least 12 characters.");
    if (!ROUTES.has(value.contribution_route)) reasons.push("Choose a supported contribution route.");
    if (!ACTIONS.has(value.action)) reasons.push("Choose a supported formalization action.");
    if (!PRIVACY.has(value.privacy_class)) reasons.push("Choose a supported privacy class.");
    if (!value.selected_node_id) reasons.push("Select a mathematical concept in the Atlas.");
    const leak = secretLeak(`${statement}\n${summary}`);
    if (leak) reasons.push(`Remove the detected ${leak} before sending this request.`);
    return Object.freeze({ accepted: reasons.length === 0, reasons: Object.freeze(reasons) });
  }

  function buildRequest(input) {
    const value = object(input, "request input");
    const preflight = localPreflight(value);
    if (!preflight.accepted) throw new TypeError(preflight.reasons.join(" "));
    const graph = object(value.graph, "graph");
    const release = releaseIdentity(graph);
    if (!release.truth_release_digest) throw new TypeError("graph has no release digest");
    return {
      schema: REQUEST_SCHEMA,
      request_id: text(value.request_id, "request_id", 128),
      request_content: {
        release,
        certified_topology_digest: optionalDigest(
          value.certified_topology_digest,
          "certified_topology_digest"
        ),
        topology_atlas_digest: optionalDigest(value.topology_atlas_digest, "topology_atlas_digest"),
        pages_conformation_digest: optionalDigest(
          value.pages_conformation_digest,
          "pages_conformation_digest"
        ),
        selection: buildSelection(graph, value.selected_node_id),
        statement: text(value.statement, "statement", 8000),
        public_summary: text(value.public_summary, "public_summary", 1000),
        contribution_route: value.contribution_route,
        action: value.action,
        privacy_class: value.privacy_class,
        relation_authority: {
          certified: "truth-release-dependency",
          derived: "topology-derived-structure",
          advisory: "cma-or-intuition-candidate"
        },
        requested_at: timestamp(value.requested_at, "requested_at")
      }
    };
  }

  function validateGateResult(result, expected) {
    const value = object(result, "gate result");
    if (value.schema !== RESULT_SCHEMA) throw new TypeError(`expected ${RESULT_SCHEMA}`);
    digest(value.gate_id, "gate_id");
    const content = object(value.gate_content, "gate_content");
    text(content.request_id, "gate_content.request_id", 128);
    digest(content.truth_release_digest, "gate_content.truth_release_digest");
    if (!DECISIONS.has(content.decision)) throw new TypeError("unsupported gate decision");
    if (typeof content.formalization_allowed !== "boolean") {
      throw new TypeError("formalization_allowed must be boolean");
    }
    if (content.formalization_allowed !== (content.decision === "accept")) {
      throw new TypeError("formalization_allowed disagrees with decision");
    }
    const vector = object(content.value_vector, "value_vector");
    for (const key of VECTOR_KEYS) {
      const score = vector[key];
      if (score !== null && (!Number.isSafeInteger(score) || score < 0 || score > 1000)) {
        throw new TypeError(`value_vector.${key} must be null or 0..1000`);
      }
    }
    sortedStrings(content.reasons || [], "reasons", 32);
    sortedStrings(content.missing_inputs || [], "missing_inputs", 32);
    sortedStrings(content.reuse_candidates || [], "reuse_candidates", 64);
    const routes = sortedStrings(content.allowed_contribution_routes || [], "allowed_contribution_routes", 2);
    for (const route of routes) if (!ROUTES.has(route)) throw new TypeError("unsupported allowed route");
    if (!content.formalization_allowed && routes.length) {
      throw new TypeError("a refused gate cannot allow contribution routes");
    }
    timestamp(content.evaluated_at, "evaluated_at");
    timestamp(content.expires_at, "expires_at");
    if (Date.parse(content.expires_at) <= Date.parse(content.evaluated_at)) {
      throw new TypeError("gate result must expire after evaluation");
    }
    if (expected) {
      if (content.request_id !== expected.request_id) throw new TypeError("gate result is bound to another request");
      if (content.truth_release_digest !== expected.truth_release_digest) {
        throw new TypeError("gate result is bound to another truth release");
      }
    }
    return value;
  }

  function buildSubmission(request, gate, approvedAt) {
    const typedRequest = object(request, "request");
    if (typedRequest.schema !== REQUEST_SCHEMA) throw new TypeError(`expected ${REQUEST_SCHEMA}`);
    const result = validateGateResult(gate, {
      request_id: typedRequest.request_id,
      truth_release_digest: typedRequest.request_content.release.truth_release_digest
    });
    if (!result.gate_content.formalization_allowed) {
      throw new TypeError("submission requires an accepted gate result");
    }
    if (!result.gate_content.allowed_contribution_routes.includes(
      typedRequest.request_content.contribution_route
    )) {
      throw new TypeError("selected contribution route was not admitted");
    }
    return {
      schema: SUBMISSION_SCHEMA,
      request: typedRequest,
      gate_result: result,
      explicit_approval: true,
      approved_at: timestamp(approvedAt, "approved_at")
    };
  }

  return Object.freeze({
    ACTIONS,
    DECISIONS,
    DIGEST,
    PRIVACY,
    REQUEST_SCHEMA,
    RESULT_SCHEMA,
    ROUTES,
    SUBMISSION_SCHEMA,
    VECTOR_KEYS,
    buildRequest,
    buildSelection,
    buildSubmission,
    localPreflight,
    releaseIdentity,
    secretLeak,
    validateGateResult
  });
}));
