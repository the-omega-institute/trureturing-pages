# Release-bound Research Console

## Purpose

The Research Console lets a reader keep the certified DAG in view, select one node, and discuss an idea with an agent that first applies the Base repository's formal-answer workflow.

The implementation lives on `site/dag.html`. It is a thin browser client. Pages owns selection, context construction, rendering, typed writeback preparation, and explicit approval controls. It does not own mathematical truth, agent credentials, skill content, Intuition ranking, formalization execution, or Base admission.

## Existing skill

The skill already exists in Base:

```text
the-omega-institute/trureturing
└── skills/codex-formal-answer/SKILL.md
```

`site/data/research-agent.v1.json` carries two independent immutable coordinates:

- mathematical evidence is bound to the graph's `source_snapshot.source_commit` and mounted read-only;
- the skill prelude is bound to Base commit `8b6887a06076f3ddf1a663fc9e2b1e15b66b1409`, where the skill file has Git blob `7af641992ac46e3b66f7cfd19ab75d6b8cf7a4a6`.

The split is required because method provenance and mathematical evidence have different owners. Treating a current skill checkout as evidence would allow future declarations to leak into an older release-bound answer. Treating the release checkout as the skill coordinate would make old releases unable to use a later approved method.

Pages does not copy the skill text. CMA installs the pinned skill directory through the configured `session-skill-prelude` route and exposes the release source as a separate read-only evidence checkout.

## Context boundary

For each question, the browser constructs `pages-research-context.v1` from:

- the current graph or truth-release digest;
- the exact Base source commit and source tree;
- the selected node;
- its direct prerequisites and dependents;
- the reader's question;
- the requested response mode.

The full DAG is not sent. Node and Blueprint strings are serialized as read-only JSON data and are explicitly denied instruction authority in the agent prompt.

A session key contains the release key, CMA environment profile, profile revision, and skill commit. Publishing a different graph digest, changing the skill, or changing the session grant set therefore selects a different browser-side session coordinate.

## Public output

The public transcript shows:

- the reader's question;
- the agent's committed answer;
- compact tool names and statuses;
- explicit approval requests;
- terminal failures and runtime handovers.

Live reasoning text is not rendered. The interface only reports that the agent is formalizing. The committed answer remains visibly marked `ADVISORY`. A candidate draft, tool completion, compilation, or pull request never becomes certified truth on this page.

The two reader modes are:

1. `answer`: apply `codex-formal-answer`, then give an ordinary release-grounded answer.
2. `prepare-formalization`: apply the same skill, then include an advisory formalization draft with a candidate proposition, assumptions, reusable bridge, falsifier, evidence, and remaining gap.

## Typed writeback

After a committed agent answer, the reader may prepare a `human-intuition-candidate.v1` artifact. It binds:

- the exact truth-release digest;
- the exact certified-topology byte digest;
- source commit and source tree;
- selected node and optional edge identities;
- the human question and actor;
- a digest of the public agent answer;
- candidate kind and statement;
- an explicit falsifier;
- the creation timestamp.

`candidate_id` is the SHA-256 address of canonical `candidate_content` bytes. The browser does not invent an Intuition receipt. When `intuition_submit_enabled` is true, CMA must validate the exact artifact against the pinned Intuition contract, invoke the scoped Intuition capability once, and return the service-owned receipt. Until that grant exists, the page can prepare the typed candidate and clearly reports that it has not been registered.

The pinned candidate contract is:

```text
the-omega-institute/trureturing-intuition
@ 18b8e81b1c0db1b6bf37e98e4d9c12c041c5f682
contracts/human-intuition-candidate.v1.schema.json
blob ea9fa69eaa328b3e3f49b0e9bc55f8d7801ea002
```

## Formalize handoff

Formalize submission is available only after a candidate has been prepared and the page has access to exact `topology-publication.v1` bytes. The browser then constructs the external canonical `formalization-request.v1` contract. It binds the same truth release, the topology publication digest, the candidate identity, the target statement and GID intent, and a bounded expiry.

The reader must check an explicit submit-once approval before the request is sent. CMA must validate the bytes against the pinned contract and invoke the scoped Formalize capability exactly once. The request carries no repository commands.

The pinned external request contract is:

```text
the-omega-institute/trureturing-formalize
@ 8ed943f3e4140c597b563a90be8972528feec0bf
contracts/formalization-request.v1.schema.json
blob 90c44950c9b6863deaa15e3b8b53a0b934f81809
```

If `data/topology-publication.v1.json` is absent, the page refuses Formalize submission. It does not substitute a locally computed topology artifact digest for a publication digest.

## CMA transport

The browser uses `POST /api/v1/agui/run` and consumes the returned SSE stream with `fetch`.

Every prompt and writeback run has an explicit `runId`. Bearer credentials are requested immediately before each call and are never persisted. Writeback actions submit one exact typed artifact and require a terminal CMA event. A transport or capability failure remains a visible failure and never becomes a registration receipt.

The client handles:

- run lifecycle events;
- committed and live assistant text;
- tool start and end events;
- state deltas;
- typed run errors;
- `RUN_FINISHED` interrupts and AG-UI resume requests.

Approval decisions are collected for every interrupt and sent in a new run on the same session. No approval is inferred from page state.

## Configuration shipped in this repository

`site/data/research-agent.v1.json` ships with all external actions disabled:

```json
{
  "enabled": false,
  "cma_origin": "",
  "environment_profile": "trureturing-research",
  "profile_revision": "research-v2-writeback-disabled",
  "auth": {
    "mode": "bearer-provider",
    "provider": "trureturingResearchCredential"
  },
  "human_actor_provider": "trureturingResearchActor",
  "intuition_submit_enabled": false,
  "formalize_submit_enabled": false
}
```

The panel is visible while disabled, so layout, context construction, and typed artifacts can be reviewed before external deployment authority is granted. It makes no CMA writeback call while the corresponding capability flag is false.

## Shining handoff

The CMA deployment needs the following concrete configuration.

1. Add the production Pages browser origin to `CHRONO_SERVER_CORS_ORIGIN`. For the current GitHub Pages host, the browser origin is `https://the-omega-institute.github.io`.
2. Create or identify an environment profile named `trureturing-research`.
3. Give the profile a conversation-capable runtime and the baseline model service.
4. Mount the release's Base checkout at `/truth-source`, resolved from `source_snapshot.source_commit`, and make it read-only.
5. Install `skills/codex-formal-answer/` as a session skill prelude from Base commit `8b6887a06076f3ddf1a663fc9e2b1e15b66b1409`. Verify the expected Git blob `7af641992ac46e3b66f7cfd19ab75d6b8cf7a4a6`.
6. Ensure the agent uses `/truth-source` for mathematical evidence. The skill source checkout is method provenance and must not silently become the evidence checkout.
7. Keep repository and topology access read-only for ordinary answer and draft modes.
8. Provide a scoped Intuition registration capability that accepts only the pinned human-candidate contract and returns a typed registration receipt.
9. Provide a scoped Formalize capability that accepts only the pinned external request contract and preserves explicit approval.
10. Keep both submit flags false until each capability has passed one real vertical smoke.
11. Provide a page-global async function named `trureturingResearchCredential` that returns a current short-lived bearer credential without writing it to browser storage.
12. Provide a page-global async function named `trureturingResearchActor` that returns the authenticated human actor label.
13. Update `cma_origin`, bump `profile_revision`, and set `enabled: true` in the Pages configuration.

A same-origin deployment can instead select `auth.mode: same-origin-cookie` and leave the credential provider string empty.

`profile_revision` is part of the browser session key. Bump it whenever the environment's service grants, evidence mount, permission mode, skill installation, or pinned contract coordinate changes.

## Credential and actor callbacks

The default cross-origin integration expects:

```js
window.trureturingResearchCredential = async function () {
  return obtainCurrentShortLivedNyxIdCredential();
};

window.trureturingResearchActor = async function () {
  return obtainAuthenticatedResearchActor();
};
```

The credential callback is invoked separately for each request. It must return a non-empty string. The Research Console attaches it as a Bearer credential and discards the value after constructing the request.

## Local inspection

Serve `site/` over HTTP and open `dag.html`. With the shipped disabled configuration, selecting a node should populate the research context. A settled answer should expose the typed writeback form, while actual Intuition and Formalize submissions remain disabled.

The pure context, SSE, candidate, and request builders are tested without a browser:

```bash
node tests/js/research-context.test.js
node tests/js/research-writeback.test.js
```

The repository contract tests check HTML wiring, disabled-by-default configuration, exact Base skill and downstream contract bindings, credential non-persistence, typed writeback, and the absence of browser-side certification authority:

```bash
python -m unittest tests.test_research_console tests.test_research_writeback
```
