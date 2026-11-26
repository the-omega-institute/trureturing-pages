# Independent Chinese translation agent

Pages operates two separate downstream workers. Display health and maintenance
inspects public pages and can prepare bounded code repairs. The Chinese
translation agent consumes released research prose and publishes reviewed
translations. Their workflows, concurrency groups, model secrets and cost records
are independent. Neither requires a local operator loop.

A successful Pages deployment dispatches `research-translations.yml` with its
exact release digest. Before any model work, the agent checks the served source
and deployment manifest against that coordinate. An hourly check at minute 47
recovers a delayed CDN update, a missed dispatch or a remaining bounded batch.
Healthy checks and already translated sources use no model calls. Accepted text
is reused by the existing source-bound cache; publication refreshes the current
site through `pages.yml`. That refresh wakes translation again, but the reviewed
cache makes the follow-up a no-op.

The workflow has three permission boundaries:

1. `prepare` reads published content and the existing cache, then persists task
   reservations in `data/research-translation-agent.v1.json` on the existing
   `pages-translations` branch before admitting a model job. Contents writes use
   the observed file SHA; conflicting or unavailable history stops admission.
2. `translate` receives only the frozen task artifact and the dedicated
   `RESEARCH_TRANSLATION_API_KEY`. Its GitHub token has read permissions and
   checkout does not persist credentials. Each item has one translation request
   and one independent review request, each with a fresh fixed prompt. This is a
   model worker without code execution, tool calls, nested agents or persistent
   conversation history.
3. `publish` checks the exact run attempt, reserved source, fixed model, literal
   preservation and full-source fidelity review before updating the existing
   cache. It never receives the model key. Successful siblings survive a failed
   item; partial results are checkpointed in the worker artifact and verified
   separately. Only changed, accepted cache bytes request a site refresh.

The task ledger is required for model work. Initial rollout can create an empty
ledger only when all current source text is already reviewed. A missing ledger
with pending work fails closed for operator reconciliation. Reservation history
is not an expiring artifact, and neither a workflow retry nor a new source pin
can erase the history for identical prose.

Current usage bounds are sixteen items per run, two model requests per item,
128 reserved requests per UTC day, 96 KiB per request, and 8,192 output tokens
per request. Transport failures are not replayed: uncertain effects consume
their reservation. Each unchanged text can receive at most three attempts, with
at least six hours between attempts. Exhausted tasks stay pending in the run
summary; hourly wake-ups do not reset them. New or changed prose has its own
task identity. These bound usage and repetition, rather than setting a provider
currency cap. Both workflows use standard public-repository hosted runners;
model use is billed separately by its provider.

The model remains `gpt-6.2-sol`. Existing formula, code, numerical, quantifier and
scope checks remain authoritative. Unreviewed or rejected translations never
replace original text. Translations do not change mathematical source, formal
proofs, release ownership, mail, publication decisions or upstream workflows.

Run `python -m unittest tests.test_research_translation_agent
tests.test_research_translations tests.test_workflow_syntax` and
`node --test tests/js/research-translations.test.mjs` for local checks. Hosted
inspection separately establishes current public data and credential routing.
