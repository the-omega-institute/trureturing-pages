(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TrureturingCmaResearchRoutingCore = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const ADMISSION_SCHEMA = "pages-formalization-admission.v1";
  const CONTRIBUTION_SCHEMA = "pages-contribution-intent.v1";
  const ADMISSION_MODE = "formalization-admission";
  const CONTRIBUTION_MODE = "contribution-submit";
  const ROUTES = new Set(["github-user-pr", "anonymous-system-pr"]);
  const ALLOWED_DECISIONS = new Set([
    "formalization-candidate",
    "priority-candidate"
  ]);
  const ALL_DECISIONS = new Set([
    "discussion-only",
    "needs-clarification",
    "reuse-existing",
    "formalization-candidate",
    "priority-candidate",
    "declined-policy",
    "rate-limited"
  ]);
  const SHA256 = /^sha256:[0-9a-f]{64}$/;

  function object(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${name} must be an object`);
    }
    return value;
  }

  function string(value, name) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${name} must be a non-empty string`);
    }
    return value.trim();
  }

  function digest(value, name, nullable) {
    if (value === null && nullable) return null;
    const normalized = string(value, name).toLowerCase();
    if (!SHA256.test(normalized)) {
      throw new TypeError(`${name} must use sha256:<64 lowercase hex>`);
    }
    return normalized;
  }

  function sortedUniqueStrings(values, name) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
    let previous = null;
    for (const value of values) {
      const current = string(value, name);
      if (previous !== null && previous.localeCompare(current) >= 0) {
        throw new TypeError(`${name} must be strictly sorted and unique`);
      }
      previous = current;
    }
    return values;
  }

  function dimension(value, name) {
    const result = object(value, name);
    if (!new Set(["open", "measured"]).has(result.status)) {
      throw new TypeError(`${name}.status is unsupported`);
    }
    if (!Array.isArray(result.evidence_refs)) {
      throw new TypeError(`${name}.evidence_refs must be an array`);
    }
    sortedUniqueStrings(result.evidence_refs, `${name}.evidence_refs`);
    result.evidence_refs.forEach((item, index) =>
      digest(item, `${name}.evidence_refs[${index}]`, false));
    if (result.status === "open") {
      if (result.value !== null) throw new TypeError(`${name}.value must be null while open`);
    } else if (!Number.isInteger(result.value) || result.value < 0 || result.value > 1000) {
      throw new TypeError(`${name}.value must be an integer from 0 through 1000`);
    }
    return result;
  }

  function validateAdmission(value, expected) {
    const admission = object(value, "admission");
    if (admission.schema !== ADMISSION_SCHEMA) {
      throw new TypeError(`admission schema must be ${ADMISSION_SCHEMA}`);
    }
    digest(admission.admission_id, "admission.admission_id", false);
    const content = object(admission.admission_content, "admission.admission_content");
    digest(content.research_context_ref, "admission.research_context_ref", false);
    digest(content.truth_release_digest, "admission.truth_release_digest", false);
    digest(content.topology_atlas_digest, "admission.topology_atlas_digest", true);
    digest(content.pages_conformation_digest, "admission.pages_conformation_digest", false);
    digest(content.question_digest, "admission.question_digest", false);
    if (!ALL_DECISIONS.has(content.decision)) {
      throw new TypeError(`admission decision ${content.decision} is unsupported`);
    }
    if (typeof content.formalization_allowed !== "boolean") {
      throw new TypeError("admission.formalization_allowed must be boolean");
    }
    sortedUniqueStrings(content.reason_codes, "admission.reason_codes");
    sortedUniqueStrings(content.missing_inputs, "admission.missing_inputs");
    if (!Array.isArray(content.reuse_candidates) || content.reuse_candidates.length > 16) {
      throw new TypeError("admission.reuse_candidates must be a bounded array");
    }
    for (const [index, candidate] of content.reuse_candidates.entries()) {
      const item = object(candidate, `admission.reuse_candidates[${index}]`);
      string(item.declaration_id, `admission.reuse_candidates[${index}].declaration_id`);
      if (!new Set(["project", "mathlib"]).has(item.source)) {
        throw new TypeError(`admission.reuse_candidates[${index}].source is unsupported`);
      }
      if (!new Set([
        "exact-statement",
        "exact-name",
        "specialization",
        "composition-candidate",
        "lexical-candidate"
      ]).has(item.match_basis)) {
        throw new TypeError(`admission.reuse_candidates[${index}].match_basis is unsupported`);
      }
    }
    const vector = object(content.value_vector, "admission.value_vector");
    for (const name of [
      "novelty",
      "structural_reach",
      "reuse",
      "frontier_closure",
      "verification_readiness",
      "uncertainty"
    ]) dimension(vector[name], `admission.value_vector.${name}`);
    sortedUniqueStrings(
      content.allowed_contribution_routes,
      "admission.allowed_contribution_routes"
    );
    for (const route of content.allowed_contribution_routes) {
      if (!ROUTES.has(route)) throw new TypeError(`unsupported contribution route ${route}`);
    }
    if (content.policy_profile !== "pages-formalization-admission-v1") {
      throw new TypeError("admission policy_profile is unsupported");
    }
    const expiry = Date.parse(content.expires_at);
    if (!Number.isFinite(expiry)) throw new TypeError("admission.expires_at is invalid");

    const decisionAllows = ALLOWED_DECISIONS.has(content.decision);
    if (content.formalization_allowed !== decisionAllows) {
      throw new TypeError("admission decision and formalization_allowed disagree");
    }
    if (!content.formalization_allowed && content.allowed_contribution_routes.length !== 0) {
      throw new TypeError("a declined admission cannot expose contribution routes");
    }
    if (content.formalization_allowed && content.allowed_contribution_routes.length === 0) {
      throw new TypeError("an admitted candidate needs at least one contribution route");
    }

    if (expected) {
      if (expected.truth_release_digest
          && content.truth_release_digest !== expected.truth_release_digest) {
        throw new TypeError("admission is bound to another truth release");
      }
      if (expected.topology_atlas_digest !== undefined
          && content.topology_atlas_digest !== expected.topology_atlas_digest) {
        throw new TypeError("admission is bound to another Topology Atlas");
      }
      if (expected.pages_conformation_digest
          && content.pages_conformation_digest !== expected.pages_conformation_digest) {
        throw new TypeError("admission is bound to another Pages conformation");
      }
      if (expected.research_context_ref
          && content.research_context_ref !== expected.research_context_ref) {
        throw new TypeError("admission is bound to another research context");
      }
    }
    return admission;
  }

  function canFormalize(admission, now) {
    const value = validateAdmission(admission);
    return value.admission_content.formalization_allowed
      && Date.parse(value.admission_content.expires_at) > (now || Date.now());
  }

  function routeRequirements(route) {
    if (!ROUTES.has(route)) throw new TypeError(`unsupported contribution route ${route}`);
    return route === "github-user-pr"
      ? Object.freeze({
        credential: "github-research-subject",
        connection: "nyxid-github-user-service",
        pull_request_owner: "connected-github-user",
        commit_author: "connected-github-user"
      })
      : Object.freeze({
        credential: "sponsored-anonymous-research-subject",
        connection: null,
        pull_request_owner: "system-service",
        commit_author: "system-service"
      });
  }

  function contributionContent(options) {
    const input = object(options, "options");
    const admission = validateAdmission(input.admission);
    if (!canFormalize(admission, input.now)) {
      throw new TypeError("formalization admission is absent, declined, or expired");
    }
    const route = string(input.route, "options.route");
    if (!admission.admission_content.allowed_contribution_routes.includes(route)) {
      throw new TypeError(`contribution route ${route} was not admitted`);
    }
    const actor = object(input.actor, "options.actor");
    const subjectRef = digest(actor.subject_ref, "actor.subject_ref", false);
    const researchContextRef = digest(
      input.research_context_ref,
      "options.research_context_ref",
      false
    );
    const truthReleaseDigest = digest(
      input.truth_release_digest,
      "options.truth_release_digest",
      false
    );
    if (truthReleaseDigest !== admission.admission_content.truth_release_digest) {
      throw new TypeError("contribution intent and admission use different truth releases");
    }

    let githubConnectionRef = null;
    let githubLogin = null;
    let anonymousSessionRef = null;
    let statement;
    let attribution;
    if (route === "github-user-pr") {
      githubConnectionRef = digest(
        actor.github_connection_ref,
        "actor.github_connection_ref",
        false
      );
      githubLogin = string(actor.github_login, "actor.github_login");
      if (!/^[A-Za-z0-9-]{1,39}$/.test(githubLogin)) {
        throw new TypeError("actor.github_login is invalid");
      }
      if (actor.anonymous_session_ref !== null && actor.anonymous_session_ref !== undefined) {
        throw new TypeError("GitHub contribution cannot carry anonymous_session_ref");
      }
      statement = "I approve creation of one contributor-owned pull request after I review the generated diff.";
      attribution = {
        commit_author_mode: "connected-github-user",
        pull_request_owner_mode: "connected-github-user",
        public_credit_mode: "github-user"
      };
    } else {
      anonymousSessionRef = digest(
        actor.anonymous_session_ref,
        "actor.anonymous_session_ref",
        false
      );
      if (actor.github_connection_ref !== null && actor.github_connection_ref !== undefined) {
        throw new TypeError("anonymous contribution cannot carry github_connection_ref");
      }
      if (actor.github_login !== null && actor.github_login !== undefined) {
        throw new TypeError("anonymous contribution cannot carry github_login");
      }
      statement = "I approve one system-owned formalization attempt and pull request under an anonymous research identifier.";
      attribution = {
        commit_author_mode: "system-service",
        pull_request_owner_mode: "system-service",
        public_credit_mode: "anonymous-research-id"
      };
    }
    const createdAt = string(input.created_at, "options.created_at");
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new TypeError("options.created_at is invalid");
    }
    return {
      admission_ref: admission.admission_id,
      research_context_ref: researchContextRef,
      truth_release_digest: truthReleaseDigest,
      route,
      actor: {
        subject_ref: subjectRef,
        github_connection_ref: githubConnectionRef,
        github_login: githubLogin,
        anonymous_session_ref: anonymousSessionRef
      },
      attribution,
      confirmation: {
        explicit: true,
        statement,
        confirmed_at: createdAt
      },
      created_at: createdAt
    };
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function admissionFromEvent(event) {
    if (!event || typeof event !== "object") return null;
    if (event.type === "STATE_SNAPSHOT") {
      const state = event.snapshot || event.state || event.value;
      return state && (state.formalizationAdmission || state.formalization_admission) || null;
    }
    if (event.type === "STATE_DELTA" && Array.isArray(event.delta)) {
      for (const patch of event.delta) {
        if (!patch || patch.op !== "replace" && patch.op !== "add") continue;
        if (patch.path === "/formalizationAdmission"
            || patch.path === "/formalization_admission") {
          return patch.value || null;
        }
      }
    }
    if (event.type === "CUSTOM"
        && (event.name === "trureturing.formalization_admission"
          || event.eventName === "trureturing.formalization_admission")) {
      return event.value || event.payload || null;
    }
    return null;
  }

  return Object.freeze({
    ADMISSION_MODE,
    ADMISSION_SCHEMA,
    ALLOWED_DECISIONS,
    CONTRIBUTION_MODE,
    CONTRIBUTION_SCHEMA,
    ROUTES,
    admissionFromEvent,
    canFormalize,
    canonical,
    contributionContent,
    routeRequirements,
    validateAdmission
  });
}));
