"use strict";

const assert = require("node:assert/strict");
const Core = require("../../site/assets/cma-formalization-gateway-core.js");

const digest = (value) => `sha256:${value.repeat(64)}`;
const graph = {
  source_snapshot: {
    truth_release_digest: digest("1"),
    source_repo: "the-omega-institute/trureturing",
    source_commit: "a".repeat(40),
    source_tree: "b".repeat(40)
  },
  nodes: [
    { id: "A", human_title: "Foundation", state: "Closed" },
    { id: "B", human_title: "Target", state: "Open", descendant_count: 4 }
  ],
  edges: [{ source: "A", target: "B", relation: "certified" }]
};
const input = {
  graph,
  request_id: "gate_request_1",
  selected_node_id: "B",
  statement: "Formalize a reusable bridge from the selected open theorem to its foundation.",
  public_summary: "Add one reusable bridge theorem for this dependency chain.",
  contribution_route: "github-user",
  action: "add-bridge",
  privacy_class: "public-contribution",
  certified_topology_digest: digest("2"),
  topology_atlas_digest: digest("3"),
  pages_conformation_digest: digest("4"),
  requested_at: "2026-09-01T00:00:00Z"
};

assert.equal(Core.localPreflight(input).accepted, true);
const request = Core.buildRequest(input);
assert.equal(request.schema, Core.REQUEST_SCHEMA);
assert.equal(request.request_content.selection.selected_node.id, "B");
assert.deepEqual(
  request.request_content.selection.certified_prerequisites.map((node) => node.id),
  ["A"]
);
assert.equal(request.request_content.relation_authority.certified, "truth-release-dependency");

const content = {
  request_id: request.request_id,
  truth_release_digest: digest("1"),
  decision: "accept",
  formalization_allowed: true,
  value_vector: {
    novelty: 700,
    structural_leverage: 800,
    reuse_value: 600,
    frontier_closure: 750,
    verification_readiness: 720,
    uncertainty: 180
  },
  reasons: ["Bounded verification route exists.", "Structural reuse is material."],
  missing_inputs: [],
  reuse_candidates: [],
  allowed_contribution_routes: ["anonymous-service", "github-user"],
  evaluated_at: "2026-09-01T00:01:00Z",
  expires_at: "2026-09-01T01:01:00Z"
};
const gate = { schema: Core.RESULT_SCHEMA, gate_id: digest("5"), gate_content: content };
assert.equal(Core.validateGateResult(gate, {
  request_id: request.request_id,
  truth_release_digest: digest("1")
}), gate);
const submission = Core.buildSubmission(request, gate, "2026-09-01T00:02:00Z");
assert.equal(submission.explicit_approval, true);
assert.equal(submission.schema, Core.SUBMISSION_SCHEMA);

assert.equal(Core.localPreflight({
  ...input,
  statement: "Use github_pat_abcdefghijklmnopqrstuvwxyz0123456789 for this proof."
}).accepted, false);
assert.throws(() => Core.validateGateResult({
  ...gate,
  gate_content: { ...content, formalization_allowed: false }
}), /disagrees/);
assert.throws(() => Core.buildSubmission(request, {
  ...gate,
  gate_content: {
    ...content,
    decision: "defer",
    formalization_allowed: false,
    allowed_contribution_routes: []
  }
}, "2026-09-01T00:02:00Z"), /accepted/);
assert.equal("scalar_score" in content, false);

console.log("cma formalization gateway tests passed");
