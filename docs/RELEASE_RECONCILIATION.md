# Release ingestion reconciliation (Step 1c)

`lib.reconcile_releases` finds published Base releases missing from the Library.
It uses the existing `pages.yml` projection/deployment pipeline and
`living_library.build_library` archive implementation. It does not run the Base
producer, Lean, or topology while planning.

The compact [Version status entry](VERSION_STATUS.md) projects this same planner,
Library history and served receipt evidence into `data/version-status.v1.json`.
It distinguishes publication, atomic reception/verification/generation, and
deployment, with a last-good fallback and explicit observation timestamps.

## Rebuild the currently deployed release

Pages code and UI changes can be published without waiting for another Base
release. Dispatch the existing `pages.yml` on `dev` with `rebuild_current=true`:

```bash
gh workflow run pages.yml --repo the-omega-institute/trureturing-pages \
  --ref dev -f rebuild_current=true
```

In the Actions UI, choose **Run workflow**, branch **dev**, and enable
`rebuild_current`. This explicit mode takes precedence over both `reconcile` and
`truth_release_digest`, including the default `mock`. It uses real content from
the served release; it does not select a missing release or create a mock site.
With `rebuild_current=false` (the default), all existing selection behavior is
unchanged, including an already ingested requested digest remaining a no-op.

The selection step calls `plan --rebuild-current --previous-url …`. It reads the
served `data/library-history.v1.json` with a cache-busting query, resolves
`current_truth_release_digest` to its history entry, and validates that entry's
immutable `source_commit`. A local `_site` candidate cannot override the served
coordinate. The plan returns `mode: "rebuild"`, `should_build: true` and exactly
one `selected` release; GitHub outputs include `rebuild=true`, `should_build=true`,
`release_digest` and `source_commit`. This remains possible when every missing
release is blocked. It does not need the release listing or missing-release
ancestry ordering, because it is re-rendering the already admitted current
coordinate. `--requested-digest` and `--rebuild-current` are mutually exclusive
CLI modes, and rebuild requires `--limit 1`.

The deploy job uses the same acquire → verify → build-basic → topology/Atlas →
repair-history → ingest → finalize → version-status → freshness → upload →
deploy sequence. Rebuild skips completed-site cache restore/save, so each refresh
reacquires the digest-addressed bundle and `build-basic` copies the current
`site/`, including new pages. Acquisition rechecks the served coordinate and
compares the verified bundle source with the planned commit. No new deployment
job, artifact publication shortcut or freshness exception is introduced.

`ingest --rebuild-current` re-verifies the bundle and projected source, then calls
the existing Library builder in explicit rebuild mode. The builder still runs
the exact source checkout checks, #48 resolution/Frozen gate, Atlas binding and
archive digest checks. It restores the original snapshots and timeline, renders
Library/research routes using the current Pages code, and stages the original
history entries and receipt rows. It creates no snapshot coordinate or receipt,
and preserves receipt bindings, timestamps and `deployed` values. Ordinary
`build_library` calls retain their existing same-release no-op behavior.

Missing/invalid current history, missing immutable source identity, unreadable
remote state, source/digest mismatch and damaged archives all fail closed. A
fresh site without a current release must use its initial ingestion path first.
Rebuild also requires a complete existing receipt ledger; it fails rather than
manufacturing recovery receipts. The existing explicit duplicate-history repair
still runs before ingestion and keeps its original correction/recovery rules;
those repairs are separate from the rebuild's no-append behavior.

Read-only offline selection example (the committed history is the authority):

```bash
/tmp/pagesvenv/bin/python -m lib.reconcile_releases plan --rebuild-current \
  --dry-run --history tests/fixtures/reconciliation/library-history.v1.json
```

## Read-only audit

From the Pages repository:

```bash
/tmp/pagesvenv/bin/python -m lib.reconcile_releases --dry-run --limit 1 \
  --previous-url https://the-omega-institute.github.io/trureturing-pages/
```

The `plan` subcommand is optional. Planning is always read-only, including without
`--dry-run`: it never downloads bundles, runs builds, dispatches workflows or
creates receipts. JSON goes to stdout. `--limit N` bounds the `selected` list,
defaults to 1, accepts 0 for an audit without selections, and rejects negatives.
`pending` lists **all** missing releases, including items beyond the limit.

The script paginates the public GitHub releases API, ignores drafts, prereleases
and unrelated tags, and accepts only `truth-release-<64 lowercase hex>` tags.
Base's publication workflow binds `target_commitish` to its full `source_commit`;
a mutable branch name fails. This metadata is a scheduling coordinate. The worker
subsequently verifies the bundle and checks that its publication source matches
the selected source.

The planner pins the current Base `dev` SHA and checks actual ancestry using the
GitHub compare API. Publication dates and list order do not determine ingestion
order. An existing local Base checkout can provide the same checks without
network ancestry queries:

```bash
/tmp/pagesvenv/bin/python -m lib.reconcile_releases --dry-run --limit 3 \
  --source-repo ../trureturing --source-ref dev \
  --previous-url https://the-omega-institute.github.io/trureturing-pages/
```

This reads Git objects only; it does not fetch, check out files or invoke the
producer. A missing commit or a stale local `dev` fails the check. Anonymous API
reads work without a token; optional `GH_TOKEN` raises the API rate allowance.
HTTP errors and rate limits fail the audit instead of becoming an empty list.

For local state, omit `--previous-url`: history and receipts are read from
`--output _site` by default. `--history PATH` and `--receipts PATH` select explicit
input files; a missing explicitly named file is an error. The repository root
does not contain production `data/`: those files belong to the built/deployed
site.

An offline reproducible audit is included:

```bash
/tmp/pagesvenv/bin/python -m lib.reconcile_releases --dry-run --limit 1 \
  --releases-file tests/fixtures/reconciliation/releases.json \
  --history tests/fixtures/reconciliation/library-history.v1.json \
  --ancestry-file tests/fixtures/reconciliation/ancestry.json
```

It reports 3 published releases, 1 ingested, 2 missing, and selects `sha256:bbb…`.
The fixture deliberately reverses publication dates relative to ancestry. These
are fixture counts, not measurements of the live Base repository.

## Ordering and fail-closed behavior

History digests are skipped before any download, even when their receipts are
missing. Receipts must bind to an existing history entry; a receipt without that
entry stops processing and requires restoration of the matching history. Both
JSON indexes reject corrupt coordinates and duplicate receipt digests.

Missing sources must be ancestors of the pinned `dev` and form a single ancestry
chain. Divergent sources and competing digests at the same source commit fail.
Releases at or before the archived tip appear in `blocked` with
`source_at_or_before_archived_tip`; they never get appended after a newer release.
Safe successors can still be selected. Such older gaps require historical replay
from a suitable baseline; normal ingestion does not insert them behind the tip
or pretend those gaps were ingested. The duplicate-coordinate repair below is a
separate, bounded correction to the Pages read model.

An explicit `--requested-digest` is admitted only if already ingested (a no-op)
or the oldest eligible missing release. It cannot jump over the queue.

An individual `Problems/*.md` parse failure is quarantined by the existing
Library builder, so an immutable release with one malformed dossier can still
be ingested. The public `data/library-history.v1.json` records each release's
`quarantined_problems` list, with filename-derived `slug`, source `path` and exact
failure `reason`. The same list is stored in the content-addressed snapshot at
that entry's `path`; its digest binds the audit record to the release. An empty
list means no problems were quarantined in that build, and `problem_count`
excludes quarantined dossiers. See [Living knowledge](LIVING_KNOWLEDGE.md) for
the data contract and legacy archive behavior.

This exception applies only to dossier parsing. Bundle verification,
truth-export contracts, resolution binding and formalization/Frozen checks,
Atlas/manifest and archive digests still fail closed, including checks on
resolutions attached to quarantined dossiers. Those resolutions are withheld
from display after the checks succeed. Quarantine uses the existing snapshot,
history and receipt path; it does not change release ordering, idempotency,
receipt recovery or duplicate-history repair.

## Workflow and resource bounds

`reconcile-truth-releases.yml` runs hourly at minute 17 UTC and can be dispatched
manually. It only requests `pages.yml` on `dev` with `reconcile=true`. Its
acknowledgement is not an ingestion receipt. `receive-truth-release.yml` uses the
same request after validating the notification; the digest is a wake-up hint.

`pages.yml` keeps its existing workflow-wide concurrency group, so preflight,
build and publication share the same serialized boundary. Its new `prepare` job
reads current history/receipts and computes the plan with **`--limit 1`**. No
missing eligible release means the build job is skipped. All jobs use GitHub's
`ubuntu-latest` runners, with no work sent to a Mac Studio or self-hosted producer.
The default `truth_release_digest=mock` fixture path remains available. Explicit
real digest dispatches now perform the same skip and oldest-first checks.

For the selected release, the existing worker does the following:

1. Rechecks history/receipts before downloading. Downloads one bounded archive,
   calls `vertical_smoke.extract_archive` and `vertical_smoke.verify_bundle`, and
   checks the selected source against the verified publication.
2. Runs the existing Pages/Topology projection and exact source checkout steps.
3. Calls `reconcile_releases repair-history` to remove legacy duplicate Library
   coordinates and align receipts in `_site`, then calls `reconcile_releases
   ingest` on the final Atlas. Ingestion reuses bundle
   verification, calls `build_library`, then appends the receipt. The optional
   `previous_index` argument pins the already inspected index; historical
   snapshots still use `build_library`'s original digest/contract verification.
4. Finalizes and caches the complete `_site` before attempting deployment.
5. Runs the original freshness check and deploys the site atomically.

Only the planner exposes `--limit N`; the scheduled worker deliberately consumes
one selection per run. To catch up faster, repeat bounded runs after completion.
The scheduler does not fan out a list of heavyweight builds.

## Repairing legacy duplicate Library coordinates

`data/library-history.v1.json` is a Pages consumption projection that can be
regenerated from authoritative Base releases. Its repair does not edit the Base
append-only frozen ledger. Normal `build_library` still rejects a history that
contains multiple entries for the same `truth_release_digest`; ingestion does
not silently weaken that guard.

The explicit repair command keeps the **first entry in the original history
order for each release digest**, retaining that entry's exact snapshot digest
and metadata. Later entries for the same release are removed from the index.
Distinct releases keep their relative order, and `current_truth_release_digest`
is set to the surviving tip. The command verifies retained snapshot bytes and
release bindings with the same loader as `build_library`, then rebuilds the
content timeline with the existing timeline generator so its observation indexes
refer to the shortened history. Content addressed snapshot files are retained;
the correction is to their index, and can be reversed from the original state.

For a local site or downloaded projection (including its referenced snapshots):

```bash
/tmp/pagesvenv/bin/python -m lib.reconcile_releases repair-history \
  --output _site > /tmp/library-history-repair.json
```

To read missing inputs from the deployed site and stage the repaired projection:

```bash
/tmp/pagesvenv/bin/python -m lib.reconcile_releases repair-history \
  --output _site \
  --previous-url https://the-omega-institute.github.io/trureturing-pages/ \
  --for-deployment > /tmp/library-history-repair.json
```

JSON stdout uses `pages-library-history-repair.v1` and includes `changed`,
`before_count`, `after_count`, `removed_entries` and `removed_receipts`. Output
contains the clean `data/library-history.v1.json`, aligned
`data/ingestion-receipts.v1.json`, retained snapshots and the rebuilt timeline.
The command stages Library data; `pages.yml` completes the successor release's
Atlas, pages, manifest and deployment. A standalone repaired index is not a
complete site, and its retained tip can have a different Atlas digest from the
currently served manifest. Keep the original projection when preparing a manual
repair for review or rollback.

Receipts pointing to removed entries are deleted, including legacy ledgers that
contain receipts for both copies of a release. Surviving receipts retain their
binding, timestamps and `deployed` value. Missing receipts for retained entries
are restored using the existing ingestion recovery path: `ingested_at: null`,
with the recovery time in `recorded_at`. An unrelated orphan receipt aborts a
duplicate repair before either index changes; it may be evidence of CDN lag and
is not discarded as a duplicate. Normal planning/ingestion still reject duplicate
receipt ledgers, so those must first be repaired locally before planning from
that local output.

Repair takes the same ingestion and receipt locks as the worker, prepares and
validates the cleaned ledger, writes receipts first, and replaces history last.
If interrupted between the replacements, cleaned receipts still match entries
in the old history, and retry completes the correction without changing their
times. An already clean history is a no-op: index/artifact bytes and modification
times are preserved, no snapshots are downloaded, and missing legacy receipts
remain the responsibility of normal ingestion recovery.

After this change reaches `dev`, a normal `pages.yml` dispatch with
`reconcile=true` selects at most one oldest eligible missing release. Its deploy
job runs repair immediately before ingestion and publishes both repaired history
and receipts with the complete successor site. The repair report is included in
the job summary. Completed cache restores skip both steps because repair already
preceded the cached ingestion. When no release is eligible, preflight still skips
the deploy job; the standalone command remains available to prepare a correction.

## Receipts and recovery

Successful ingestion generates `data/ingestion-receipts.v1.json` beneath the site
output, with schema `pages-ingestion-receipts.v1` and an `entries` array:

```json
{
  "release_digest": "sha256:<64 hex>",
  "library_entry_digest": "sha256:<64 hex>",
  "ingested_at": "2026-09-11T03:00:00Z",
  "recorded_at": "2026-09-11T03:00:00Z",
  "deployed": false
}
```

`library_entry_digest` is the existing Library entry's `digest`, not the Atlas
graph digest. Each release has at most one immutable receipt. File replacement is
atomic under a local lock; retries preserve existing rows and their times.
Changing an existing receipt's Library binding is rejected. The explicit legacy
repair described above can remove a receipt for an entry being removed and then
recover a missing receipt for the retained entry; normal append never rebinds it.

Local ingestion records `deployed: false`. `pages.yml` uses `--for-deployment` to
stage new `deployed: true` rows in the candidate site that will be published as a
unit with its history. **Only the served site's ledger confirms publication**;
a candidate directory or cache is not evidence that deployment succeeded. A
failed deployment leaves the served ledger unchanged. Existing receipt rows are
never edited to toggle status: `deployed` describes their original publication
context, not an independently mutable deployment monitor.

`build_library` writes its history index last. If execution stops after that
write but before the new receipt, the next ingestion attempt uses the local
history, skips bundle verification/building, and appends the missing receipt.
The original ingestion time is unknowable for a legacy entry or a lost receipt,
so recovery records `ingested_at: null` and the actual recovery time in
`recorded_at`. Prior remote receipts are preserved before the Library commit
point so that recovery retains their original timestamps. Missing legacy
receipts are also recovered when the next release is ingested.

The workflow cache key includes the Pages commit and release digest. If
publication was interrupted after the complete site was saved, the next run
restores that site and skips bundle acquisition, source checkout, projection,
topology and Library building. It verifies Library/Atlas bindings and requires
the cached history and receipts to preserve the current deployed prefixes before
running the original deployment freshness check again. Corrupt or stale
checkpoints fail closed.

GitHub caches are evictable. An interrupted build without a complete checkpoint,
an evicted checkpoint, or an intentional Pages code revision may require
recomputation. The deployed history and receipts remain the durable source of
truth for deduplication; the cache is a recovery optimization. HTTP errors never
reset that state, and state-index reads use a cache-busting query to avoid reusing
an older CDN response during queued runs.

## Verification

```bash
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_reconcile_releases.py'
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_repair_history.py'
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_rebuild_current.py'
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Tests cover metadata pagination and anonymous reads, missing sets, ancestor
ordering, limits, history skips, receipt append/idempotency and rebinding,
interrupted writes, checkpoint corruption and stale history, the existing
verifier's rejection of damaged bundle bytes, and workflow bounds/reuse. Repair
tests cover duplicate coordinates and receipts, stable first-entry retention,
byte/mtime idempotency, timeline observation indexes, resumed ingestion through
the real bundle verifier and existing Library builder, damaged snapshots,
unrelated orphan receipts, interrupted replacement, local/CDN precedence, CLI
artifacts and deployment ordering.
Real API counts must be obtained with the live dry-run command; failed network
access must never be reported as zero missing releases.
