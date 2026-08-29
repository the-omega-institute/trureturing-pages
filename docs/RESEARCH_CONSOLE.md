# Release-bound Research Console

## Purpose

The Research Console lets a reader keep the certified DAG in view, select one node, and discuss an idea with an agent that first applies the Base repository's formal-answer workflow.

The first implementation lives on `site/dag.html`. It is a thin browser client. Pages owns selection, context construction, rendering, and explicit approval controls. It does not own mathematical truth, agent credentials, skill content, formalization execution, or Base admission.

## Existing skill

The skill already exists in Base:

```text
the-omega-institute/trureturing
└── skills/codex-formal-answer/SKILL.md
```

`site/data/research-agent.v1.json` carries two independent immutable coordinates:

- mathematical evidence is bound to the graph's `source_snapshot.source_commit` and mounted read-only;
- the skill prelude is bound to Base commit `b064e24d5e0d98ed5b5007e513dc34b81a38b781`, where the skill file has Git blob `7af641992ac46e3b66f7cfd19ab75d6b8cf7a4a6`.

The split is required because the currently published graph points to Base commit `90059ebbb6c1d61da93690723af581145b88bad1`, which predates `codex-formal-answer`. Treating the skill ref as the truth ref would make the current release unable to start. Treating the current Base tree as the evidence tree would allow future declarations to leak into an older release-bound answer.

Pages does not copy the skill text. CMA installs the pinned skill directory through the configured `session-skill-prelude` route and exposes the release source as a separate read-only evidence checkout.

## Context boundary

For each question, the browser constructs `pages-research-context.v1` from:

- the current graph or truth-release digest;
- the exact Base source commit and optional source tree;
- the selected node;
- its direct prerequisites and dependents;
- the reader's question;
- the requested response mode.

The full DAG is not sent. Node and Blueprint strings are serialized as read-only JSON data and are explicitly denied instruction authority in the agent prompt.

A session key contains the release key, CMA environment profile, profile revision, and skill commit. Publishing a different graph digest, changing the skill, or changing the session grant set therefore selects a different browser-side session coordinate. The current single-file truth graph remains the input. Physical release sharding is outside this feature.

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

`formalize-submit` is an internal third mode. It is reachable only after a completed draft, an explicit browser confirmation, and `formalize_submit_enabled: true`.

## CMA transport

The browser uses `POST /api/v1/agui/run` and consumes the returned SSE stream with `fetch`.

Every prompt run has an explicit `runId`. A transport retry reuses the same request body and run ID. The first CMA frame supplies the service-owned `threadId`, which is stored by release and environment profile. Bearer credentials are requested immediately before each call and are never persisted.

The client handles:

- run lifecycle events;
- committed and live assistant text;
- tool start and end events;
- state deltas;
- typed run errors;
- `RUN_FINISHED` interrupts and AG-UI resume requests.

Approval decisions are collected for every interrupt and sent in a new run on the same session. No approval is inferred from page state.

## Configuration shipped in this repository

`site/data/research-agent.v1.json` ships with:

```json
{
  "enabled": false,
  "cma_origin": "",
  "environment_profile": "trureturing-research",
  "profile_revision": "research-v1-disabled",
  "auth": {
    "mode": "bearer-provider",
    "provider": "trureturingResearchCredential"
  },
  "formalize_submit_enabled": false
}
```

The panel is visible while disabled, so layout and release context can be reviewed before external deployment authority is granted. It makes no network call to CMA until `enabled` is set to `true`.

## Shining handoff

The CMA deployment needs the following concrete configuration.

1. Add the production Pages browser origin to `CHRONO_SERVER_CORS_ORIGIN`. For the current GitHub Pages host, the browser origin is `https://the-omega-institute.github.io`.
2. Create or identify an environment profile named `trureturing-research`.
3. Give the profile a conversation-capable runtime and the baseline model service.
4. Mount the release's Base checkout at `/truth-source`, resolved from `source_snapshot.source_commit`, and make it read-only.
5. Install `skills/codex-formal-answer/` as a session skill prelude from Base commit `b064e24d5e0d98ed5b5007e513dc34b81a38b781`. Verify the expected Git blob `7af641992ac46e3b66f7cfd19ab75d6b8cf7a4a6`.
6. Ensure the agent uses `/truth-source` for mathematical evidence. The skill source checkout is method provenance and must not silently become the evidence checkout.
7. Keep repository and topology access read-only for ordinary answer and draft modes.
8. Keep tool-body recording disabled unless there is an explicit audit need.
9. Expose Formalize only through a scoped service. Keep `formalize_submit_enabled` false until that service and its approval behavior are verified.
10. Provide a page-global async function named `trureturingResearchCredential` that returns a current short-lived bearer credential without writing it to browser storage.
11. Update `cma_origin`, bump `profile_revision`, and set `enabled: true` in the Pages configuration.

A same-origin deployment can instead select `auth.mode: same-origin-cookie` and leave the provider string empty.

`profile_revision` is part of the browser session key. Bump it whenever the environment's service grants, evidence mount, permission mode, or skill installation changes. Existing CMA sessions keep their creation-time reach and skill bytes, so reusing an old revision after a grant change would produce a misleading interface.

## Credential provider contract

The default cross-origin integration expects:

```js
window.trureturingResearchCredential = async function () {
  return obtainCurrentShortLivedNyxIdCredential();
};
```

The callback is invoked separately for each request. It must return a non-empty string. The Research Console attaches it as a Bearer credential and discards the value after constructing the request.

## Formalize handoff

When the profile is ready, set:

```json
"formalize_submit_enabled": true
```

A completed `prepare-formalization` answer then exposes a second confirmation surface. The reader must check an explicit statement approving one submission. The next CMA run instructs the current agent to submit the immediately preceding draft exactly once through the configured Formalize capability.

The Formalize result remains a candidate or terminal workflow outcome. Only the existing Base settlement and release path can change certified truth.

## Local inspection

Serve `site/` over HTTP and open `dag.html`. With the shipped disabled configuration, selecting a node should populate the research context while the composer remains disabled.

The pure context builder and SSE parser are tested without a browser:

```bash
node tests/js/research-context.test.js
```

The repository contract test checks the HTML wiring, disabled-by-default configuration, exact Base skill binding, context schemas, and credential non-persistence boundary:

```bash
python -m unittest tests.test_research_console
```
