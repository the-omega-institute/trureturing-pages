"use strict";

const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const Writeback = require("../../site/assets/research-writeback.js");

const context = {
  schema: "pages-research-context.v1",
  release: {
    release_key: `sha256:${"1".repeat(64)}`,
    truth_release_digest: `sha256:${"1".repeat(64)}`,
    truth_graph_sha256: `sha256:${"2".repeat(64)}`,
    source_repo: "the-omega-institute/trureturing",
    source_commit: "3".repeat(40),
    source_tree: "4".repeat(40),
    blessed_by: null,
    approved_at: null
  },
  selected_node: {
    id: "D5/S3/ConceptDynamics/Bridge",
    gid: "D5/S3/ConceptDynamics/Bridge.bridge",
    title: "Bridge",
    status: "Open",
    state: "open",
    depth: 4,
    layer: "S3",
    domain: "ConceptDynamics",
    repo_path: "D5/S3/ConceptDynamics/Bridge.lean",
    interpretation: null,
    theorem_label: null
  },
  neighborhood: {
    prerequisites: [],
    dependents: []
  },
  human_prompt: "Could these concepts share a stronger invariant?",
  requested_mode: "answer",
  client: {
    surface: "trureturing-pages/dag",
    context_version: "pages-research-context.v1"
  }
};

async function candidate() {
  return Writeback.buildHumanCandidate({
    context,
    topologyDigest: `sha256:${"5".repeat(64)}`,
    humanActor: "human:lexa",
    agentText: "The candidate is conditional on preserving the stated invariant.",
    candidateKind: "bridge",
    candidateStatement: "There exists a structure-preserving bridge.",
    falsifier: "A typed counterexample destroys every proposed invariant.",
    createdAt: "2026-08-29T10:00:00.000Z"
  }, webcrypto);
}

(async () => {
  const first = await candidate();
  const second = await candidate();
  assert.deepEqual(first, second);
  assert.match(first.candidate_id, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.schema, "human-intuition-candidate.v1");
  assert.equal(first.candidate_content.source_surface, "trureturing-pages");
  assert.deepEqual(
    first.candidate_content.selected_node_ids,
    ["D5/S3/ConceptDynamics/Bridge"]
  );

  const request = await Writeback.buildFormalizationRequest({
    context,
    candidate: first,
    topologyPublicationDigest: `sha256:${"6".repeat(64)}`,
    lemmaStatement: first.candidate_content.candidate_statement,
    lemmaGidIntent: "D5/S3/ConceptDynamics/Bridge.bridge",
    issuedAt: "2026-08-29T10:00:00.000Z",
    nextTruthReleaseAt: "2026-08-31T10:00:00.000Z"
  }, webcrypto);
  assert.equal(request.schema_version, "formalization-request.v1");
  assert.equal(
    request.request_content.originating_service.service,
    "intuition"
  );
  assert.equal(
    request.request_content.originating_service.config_digest,
    first.candidate_id
  );
  assert.equal(
    request.request_content.expires_at,
    "2026-08-30T10:00:00.000Z"
  );

  await assert.rejects(
    () => Writeback.buildHumanCandidate({
      context,
      topologyDigest: `sha256:${"5".repeat(64)}`,
      humanActor: "human:lexa",
      agentText: "answer",
      candidateKind: "unsupported",
      candidateStatement: "statement",
      falsifier: "falsifier",
      createdAt: "2026-08-29T10:00:00.000Z"
    }, webcrypto),
    /unsupported candidate kind/
  );

  console.log("PASS typed research writeback");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
