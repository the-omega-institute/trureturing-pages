"use strict";

const assert = require("node:assert/strict");
const Core = require("../../site/assets/cma-research-routing-core.js");

const digest = (value) => `sha256:${String(value).repeat(64)}`;
const dimension = (value) => ({
  status: value === null ? "open" : "measured",
  value,
  evidence_refs: value === null ? [] : [digest("e")]
});

function admission(overrides = {}) {
  const content = {
    research_context_ref: digest("1"),
    truth_release_digest: digest("2"),
    topology_atlas_digest: digest("3"),
    pages_conformation_digest: digest("4"),
    question_digest: digest("5"),
    decision: "formalization-candidate",
    formalization_allowed: true,
    reason_codes: [
      "clear-mathematical-target",
      "exact-release-bound",
      "verification-route-available"
    ],
    missing_inputs: [],
    reuse_candidates: [],
    value_vector: {
      novelty: dimension(720),
      structural_reach: dimension(810),
      reuse: dimension(650),
      frontier_closure: dimension(500),
      verification_readiness: dimension(740),
      uncertainty: dimension(210)
    },
    allowed_contribution_routes: [
      "anonymous-system-pr",
      "github-user-pr"
    ],
    policy_profile: "pages-formalization-admission-v1",
    expires_at: "2099-01-01T00:00:00Z",
    ...overrides
  };
  return {
    schema: Core.ADMISSION_SCHEMA,
    admission_id: digest("a"),
    admission_content: content
  };
}

const value = admission();
assert.equal(Core.validateAdmission(value), value);
assert.equal(Core.canFormalize(value, Date.parse("2098-01-01T00:00:00Z")), true);
assert.equal(Core.canFormalize(value, Date.parse("2100-01-01T00:00:00Z")), false);
assert.equal(Core.routeRequirements("github-user-pr").pull_request_owner, "connected-github-user");
assert.equal(Core.routeRequirements("anonymous-system-pr").pull_request_owner, "system-service");

assert.throws(() => Core.validateAdmission(admission({
  decision: "discussion-only",
  formalization_allowed: true
})), /disagree/);
assert.throws(() => Core.validateAdmission(admission({
  decision: "needs-clarification",
  formalization_allowed: false
})), /cannot expose contribution routes/);
assert.throws(() => Core.validateAdmission(value, {
  truth_release_digest: digest("f")
}), /another truth release/);

const githubContent = Core.contributionContent({
  admission: value,
  research_context_ref: digest("1"),
  truth_release_digest: digest("2"),
  route: "github-user-pr",
  actor: {
    subject_ref: digest("6"),
    github_connection_ref: digest("7"),
    github_login: "researcher-one",
    anonymous_session_ref: null
  },
  created_at: "2026-09-01T00:00:00Z",
  now: Date.parse("2026-09-01T00:00:00Z")
});
assert.equal(githubContent.route, "github-user-pr");
assert.equal(githubContent.attribution.commit_author_mode, "connected-github-user");
assert.equal(githubContent.actor.github_login, "researcher-one");
assert.equal(githubContent.actor.anonymous_session_ref, null);

const anonymousContent = Core.contributionContent({
  admission: value,
  research_context_ref: digest("1"),
  truth_release_digest: digest("2"),
  route: "anonymous-system-pr",
  actor: {
    subject_ref: digest("8"),
    github_connection_ref: null,
    github_login: null,
    anonymous_session_ref: digest("9")
  },
  created_at: "2026-09-01T00:00:00Z",
  now: Date.parse("2026-09-01T00:00:00Z")
});
assert.equal(anonymousContent.route, "anonymous-system-pr");
assert.equal(anonymousContent.attribution.pull_request_owner_mode, "system-service");
assert.equal(anonymousContent.attribution.public_credit_mode, "anonymous-research-id");

assert.throws(() => Core.contributionContent({
  admission: value,
  research_context_ref: digest("1"),
  truth_release_digest: digest("2"),
  route: "github-user-pr",
  actor: {
    subject_ref: digest("6"),
    github_connection_ref: digest("7"),
    github_login: "researcher-one",
    anonymous_session_ref: digest("9")
  },
  created_at: "2026-09-01T00:00:00Z",
  now: Date.parse("2026-09-01T00:00:00Z")
}), /cannot carry anonymous_session_ref/);

assert.equal(Core.admissionFromEvent({
  type: "STATE_DELTA",
  delta: [{
    op: "replace",
    path: "/formalizationAdmission",
    value
  }]
}), value);
assert.equal(Core.admissionFromEvent({
  type: "STATE_SNAPSHOT",
  state: { formalization_admission: value }
}), value);
assert.equal(Core.admissionFromEvent({
  type: "CUSTOM",
  name: "trureturing.formalization_admission",
  payload: value
}), value);

const canonicalA = Core.canonical({ b: 2, a: { z: 1, y: 0 } });
const canonicalB = Core.canonical({ a: { y: 0, z: 1 }, b: 2 });
assert.equal(canonicalA, canonicalB);

console.log("CMA research routing tests passed");
