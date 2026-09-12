# Version status contract and publication

`version-status.html` is a compact primary navigation entry alongside Evolution
and Conjectures. The home page only gains that link. The five counts, live and
upstream digests, lag, pending/blocked counts and quarantine total are visible;
per-release details are collapsed by default. The existing site localization
provides English by default and Chinese through `?lang=zh-CN` or the language
selector.

The generated artifact is **`_site/data/version-status.v1.json`**, served at
`data/version-status.v1.json`, beside Library history and ingestion receipts.
Production `data/` is a build output, not checked-in production state. Its
schema is `contracts/pages-version-status.v1.schema.json`, discriminator
`pages-version-status.v1`; the contract uses the repository's existing Python
schema validator and requires no additional dependencies.

## Evidence and fields

| Field | Meaning |
| --- | --- |
| `observed_at` | UTC time of the last complete, valid observation. Preserved on refresh failure; null if none exists. |
| `observation` | `state`: `fresh`, `last-good`, or `unavailable`; `checked_at`: latest attempt; `halt_stage` and `reason`: observation refresh failure, separately from release progress. |
| `publication` | `observed` or `on-deploy`. The latter is conditional on atomic site publication; an artifact/cache is never proof of deployment. |
| `counts` | `published`, `received`, `verified`, `generated`, `deployed`, `pending`, `blocked`, `quarantined`. Unknown is null, never a fabricated zero. |
| `head.current_truth_release_digest` | Current live/last-good history tip, confirmed by a matching served receipt with `deployed: true`. Null if no live coordinate is confirmed. |
| `head.upstream_latest_digest` | Last published release in the existing planner's source ancestry order, independent of GitHub listing order or publication dates. |
| `head.behind` | Number of published successors after live in that order. With no deployed history, all published releases are ahead. Null if the live coordinate cannot be placed, such as a mock/deleted release. Older pre-tip gaps are reported in blocked/pending, not counted as successors. |
| `upstream.latest_published_at` | Most recent actual publication timestamp, which can belong to an older source commit. It does not order releases. |
| `upstream.stale_after_seconds`, `stale` | Configurable publication inactivity signal (default 604800 seconds / 7 days). A signal, not proof of an upstream assembly failure; unknown without a publication timestamp. |
| `halt` | Earliest unresolved release's halt in ancestor order, used to highlight the stage that needs completion. Every release retains its own halt as well. |
| `releases[]` | One row per published release: `digest`, `source_commit`, `published_at`, five boolean `stages`, `furthest_stage`, `bundle_asset`, `halt`, `quarantined_count`. |

Stage counts are cumulative over the published release set, not counts of rows
at each furthest stage. `furthest_stage` is exactly one of `published`,
`received`, `verified`, `generated`, `deployed`.

1. **Published**: `reconcile_releases.GitHub.releases()` is the only GitHub
   reader. `plan_releases()` supplies the accepted publication set, missing,
   blocked and selected computation. A second call with empty history obtains
   the complete source ancestry order from that same planner. There is no new
   GitHub reader, tag parser or release-order algorithm. Drafts, prereleases,
   mutable source commits and unsafe ancestry retain existing semantics.
2. **Received / Verified / Generated**: a validated Library history entry is
   the atomic evidence for all three, so their booleans and counts agree. This
   preserves bundle verification, the #48 resolution gate, and Library snapshot
   generation. Downloaded bytes or workflow success alone are not history
   entries. A failed verification can be reported as a halt at `verified` while
   the release's furthest *proven* stage remains `published`; no intermediate
   received-only evidence is invented. An ingestion step outcome alone cannot
   distinguish its internal verification/build gates, so it reports
   `atomic-ingestion-failed`, not an invented exact failure.
3. **Deployed**: served receipt coordinates must match served Library entry
   digests and have `deployed: true`. In normal observation mode the builder
   reads live history/receipts through the existing `read_state` in an empty
   temporary directory, preventing local staged receipts from winning its
   local-file precedence rule. A local build with history but no live receipt
   therefore stops at `generated`, with `generated-not-deployed`.

The `--for-deployment` mode projects the staged history and receipt ledger into
the complete site that will be uploaded atomically. Like the existing ingestion
flag of that name, its deployed claims are conditional until those bytes are
served. `publication: on-deploy` makes this explicit to artifact readers. Failed
run diagnostics use normal observation mode and re-read the served ledger.
An unpublished `on-deploy` local JSON is never used as last-good fallback;
only reading it from the served URL turns it into observed publication evidence.
Neither mode changes any receipt, history entry, archive or ingest decision.

`pending` is exactly the existing planner's entire missing list, **including**
blocked releases; `blocked` is its pre-tip subset, not an additional disjoint
count. `quarantined` counts release/problem occurrences across published history
entries, not distinct problem slugs across time. A missing legacy
`quarantined_problems` is treated as an empty list. Quarantine does not halt an
otherwise verified release or weaken resolution checks.

## Halt reasons

Each halt has `stage` (the next incomplete/observed failing stage), `reason` and
`suspected_upstream_failure`. The furthest proven stage is recorded separately.

| Reason | Evidence and display |
| --- | --- |
| `bundle-missing` | Published tag has an assets list but lacks a nonempty uploaded archive with the exact expected name. Remains published; suspected upstream assembly failure. |
| `awaiting-ingestion` | No history entry; bundle exists or assets metadata is unknown. Does not claim acquisition or verification success/failure. |
| `bundle-download-failed`, `bundle-invalid` | An explicit digest-bound worker observation. Download failure may be a network problem. |
| `acquisition-failed` | Existing acquire step failed; its download/verification substep is not independently recorded. |
| `atomic-ingestion-failed` | Existing atomic ingest failed; internal gate is not independently recorded. |
| `verification-failed`, `generation-failed` | Explicit observed failure at the named stage; never creates history evidence. |
| `generated-not-deployed` | Complete Library entry, but no matching served deployment evidence; downstream succeeded without deployment. |
| `pre-tip-replay-required` | Planner's `source_at_or_before_archived_tip`; needs historical replay, never an append behind the tip. |
| `status-refresh-failed` | Status observation failed. Kept separate from release halts and never treated as an empty release listing. |

Archive presence is metadata, not archive verification. The status builder does
not download archives, run topology, inspect Base CI logs or produce proofs.
DOI-null/OEIS handling remains in the existing reader/verification/ingestion
path and is not duplicated in this read model.

## Fail-soft behavior and its static-site boundary

The builder validates the complete observation before replacing status output.
If a source is missing, corrupt or unreachable, it keeps a validated last-good
snapshot with its original counts, digests and `observed_at`, and records the
failed refresh stage/time. With no valid snapshot it emits explicit unavailable
state and null counts. It never substitutes zero for a failed network read.

The page embeds the **same status JSON as its deployed data file** in an escaped
`application/json` script. On a first visit it can render that snapshot even
when fetching the JSON returns 404, times out, fails validation or is older than
the HTML snapshot. It retains the last valid in-memory observation for subsequent
refreshes and labels the view “Showing the last valid version” / “显示的是最后有效版本”,
including the last observed halt stage and the status refresh failure. It needs
neither browser storage nor a prior successful visit. With no snapshot it says
status is unavailable. Source metadata is escaped before HTML rendering.

An observation older than two hours is visibly marked stale, even if fetching
the deployed JSON succeeds. The seven-day publication inactivity signal is also
recomputed from the browser clock. Both thresholds describe observation age or
publication inactivity; they do not fabricate progress or failure evidence.

**A static last-good site cannot see a failure that happened after its last
deployment until a new status observation is published.** Refresh reads the
served snapshot, not GitHub APIs or private workflow logs. A failed/no-op run's
new observation is available in its workflow summary and status artifact; it
does not silently update the existing live page. The page explicitly shows its
observation time and stale/unknown-current-progress notice. This change does not
introduce a second deployment path that could bypass the existing freshness or
fail-closed gates.

## Workflow and offline use

`pages.yml` observes status after preflight even if no release is eligible, and
retains `version-status-reconciliation`. After ingestion/finalization/cache save,
it stages version status in `_site` before the existing freshness check and
`upload-pages-artifact`; this also runs on cache restores. `data/` and the embedded
HTML therefore travel in the same Pages artifact as Library history/receipts.
On failure, a diagnostic observation reads local completed history against the
actual served ledger and is retained as `version-status-build`. No new deployment
is attempted on failure. The completed ingestion cache remains owned by the
existing pipeline, and status is regenerated on each publication attempt.

No-op/failed observations do not constitute deployment receipts. All original
ingestion, ordering, checkpoint and freshness checks remain fail closed.

Offline example using the committed reconciliation fixtures:

```bash
mkdir -p /tmp/pages-version-status/data
cp tests/fixtures/reconciliation/library-history.v1.json /tmp/pages-version-status/data/
/tmp/pagesvenv/bin/python -m lib.version_status \
  --output /tmp/pages-version-status \
  --releases-file tests/fixtures/reconciliation/releases.json \
  --ancestry-file tests/fixtures/reconciliation/ancestry.json
```

This fixture has 3 published, 1 received/verified/generated and 0 confirmed
deployed releases; it is not a live measurement. Assets metadata is absent, so
its bundle status is unknown, not missing. Explicit missing fixture paths fail
soft without initiating replacement network reads. To record a known failure,
provide all of `--failure-digest`, `--failure-stage` and `--failure-reason`.

```bash
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_version_status.py'
node --test tests/js/version-status.test.mjs
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_*.py'
node --test tests/js/*.test.mjs tests/js/*.test.js tests/research-workbench.test.mjs
```
