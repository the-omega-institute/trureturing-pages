# Release ingestion reconciliation (Step 1c)

`lib.reconcile_releases` finds published Base releases missing from the Library.
It uses the existing `pages.yml` projection/deployment pipeline and
`living_library.build_library` archive implementation. It does not run the Base
producer, Lean, or topology while planning.

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
Safe successors can still be selected. Such older gaps require a separately
reviewed historical replay from a suitable baseline; this tool does not rewrite
the append-only archive or pretend those gaps were ingested.

An explicit `--requested-digest` is admitted only if already ingested (a no-op)
or the oldest eligible missing release. It cannot jump over the queue.

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
3. Calls `reconcile_releases ingest` on the final Atlas. It reuses bundle
   verification, calls `build_library`, then appends the receipt. The optional
   `previous_index` argument pins the already inspected index; historical
   snapshots still use `build_library`'s original digest/contract verification.
4. Finalizes and caches the complete `_site` before attempting deployment.
5. Runs the original freshness check and deploys the site atomically.

Only the planner exposes `--limit N`; the scheduled worker deliberately consumes
one selection per run. To catch up faster, repeat bounded runs after completion.
The scheduler does not fan out a list of heavyweight builds.

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
Changing an existing receipt's Library binding is rejected.

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
/tmp/pagesvenv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Tests cover metadata pagination and anonymous reads, missing sets, ancestor
ordering, limits, history skips, receipt append/idempotency and rebinding,
interrupted writes, checkpoint corruption and stale history, the existing
verifier's rejection of damaged bundle bytes, and workflow bounds/reuse.
Real API counts must be obtained with the live dry-run command; failed network
access must never be reported as zero missing releases.
