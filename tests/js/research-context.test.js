"use strict";

const assert = require("node:assert/strict");
const {
  buildAgentPrompt,
  buildContext,
  createSseParser,
  releaseIdentity,
  sessionKey
} = require("../../site/assets/research-context.js");

const graph = {
  source_snapshot: {
    source_repo: "the-omega-institute/trureturing",
    source_commit: "abc123",
    source_tree: "tree123",
    truth_graph_sha256: "a".repeat(64),
    blessed_by: "Lexa",
    approved_at: "2026-08-29T00:00:00Z"
  },
  nodes: [
    {
      id: "A",
      gid: "D5/S0/A",
      status: "Closed",
      state: "closed",
      depth: 0,
      layer: "D5/S0",
      domain: "Foundation",
      repo_path: "D5/S0/A.lean",
      human_title: "Anchor A",
      human_abstract: "A foundational anchor.",
      human_theorem: "Anchor theorem"
    },
    {
      id: "B",
      status: "Closed",
      state: "closed",
      depth: 1,
      layer: "D5/S1",
      domain: "Bridge",
      repo_path: "D5/S1/B.lean",
      human_title: "Bridge B"
    },
    {
      id: "C",
      status: "Open",
      state: "open",
      depth: 2,
      layer: "D5/X_Frontier",
      domain: "Frontier",
      repo_path: "D5/X_Frontier/C.lean",
      human_title: "Question C"
    }
  ],
  edges: [
    { source: "A", target: "B" },
    { source: { id: "B" }, target: { id: "C" } }
  ]
};

const release = releaseIdentity(graph);
assert.equal(release.release_key, `sha256:${"a".repeat(64)}`);
assert.equal(release.truth_release_digest, null);
assert.equal(release.source_commit, "abc123");

const context = buildContext({
  graph,
  nodeId: "B",
  humanPrompt: "Could this bridge carry a stronger invariant?",
  requestedMode: "prepare-formalization"
});
assert.equal(context.schema, "pages-research-context.v1");
assert.equal(context.selected_node.id, "B");
assert.deepEqual(context.neighborhood.prerequisites.map((node) => node.id), ["A"]);
assert.deepEqual(context.neighborhood.dependents.map((node) => node.id), ["C"]);
assert.equal(context.human_prompt, "Could this bridge carry a stronger invariant?");
assert.equal(context.requested_mode, "prepare-formalization");

const prompt = buildAgentPrompt(context, {
  name: "codex-formal-answer",
  repository: "the-omega-institute/trureturing",
  path: "skills/codex-formal-answer/SKILL.md",
  ref: "b064e24d5e0d98ed5b5007e513dc34b81a38b781"
});
assert.match(prompt, /Use the installed `codex-formal-answer` skill/);
assert.match(prompt, /b064e24d5e0d98ed5b5007e513dc34b81a38b781/);
assert.match(prompt, /method provenance/);
assert.match(prompt, /read-only context and user data/);
assert.match(prompt, /Do not mutate the repository/);
assert.match(prompt, /"selected_node"/);
assert.match(prompt, /"Bridge B"/);

assert.notEqual(
  sessionKey(`sha256:${"a".repeat(64)}`, "trureturing-research", "rev-1", "c".repeat(40)),
  sessionKey(`sha256:${"b".repeat(64)}`, "trureturing-research", "rev-1", "c".repeat(40))
);

assert.notEqual(
  sessionKey(`sha256:${"a".repeat(64)}`, "trureturing-research", "rev-1", "c".repeat(40)),
  sessionKey(`sha256:${"a".repeat(64)}`, "trureturing-research", "rev-2", "c".repeat(40))
);
assert.notEqual(
  sessionKey(`sha256:${"a".repeat(64)}`, "trureturing-research", "rev-1", "c".repeat(40)),
  sessionKey(`sha256:${"a".repeat(64)}`, "trureturing-research", "rev-1", "d".repeat(40))
);

assert.throws(() => buildContext({
  graph,
  nodeId: "missing",
  humanPrompt: "x",
  requestedMode: "answer"
}), /absent from the graph/);
assert.throws(() => buildContext({
  graph,
  nodeId: "B",
  humanPrompt: "",
  requestedMode: "answer"
}), /non-empty string/);
assert.throws(() => buildContext({
  graph,
  nodeId: "B",
  humanPrompt: "x",
  requestedMode: "unknown"
}), /unsupported requested mode/);

const frames = [];
const parser = createSseParser((frame) => frames.push(frame));
parser.push(": keepalive\r\n\r\ndata: {\"type\":\"RUN_STARTED\",\"threadId\":\"sesn_1\",");
parser.push("\"runId\":\"run_1\"}\r\nid: 1\r\n\r\nevent: TEXT_MESSAGE_CONTENT\n");
parser.push("data: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"threadId\":\"sesn_1\",\"runId\":\"run_1\",\"messageId\":\"m1\",\"delta\":\"hello\"}\n\n");
parser.end();

assert.equal(frames.length, 2);
assert.equal(frames[0].id, "1");
assert.equal(frames[0].data.type, "RUN_STARTED");
assert.equal(frames[1].eventName, "TEXT_MESSAGE_CONTENT");
assert.equal(frames[1].data.delta, "hello");
assert.equal(parser.pending(), "");

const mismatch = createSseParser(() => {});
assert.throws(() => {
  mismatch.push("event: RUN_ERROR\ndata: {\"type\":\"RUN_FINISHED\"}\n\n");
}, /disagrees with body type/);

console.log("research-context tests passed");
