# Continuous publication from upstream CI

Pages follows successful **push CI runs on upstream `dev`**. It does not run Lean,
install a Lean toolchain, require a self-hosted runner, or independently review
whether a formal theorem settles an informal mathematical question. Those are
upstream responsibilities.

`sync-upstream.yml` polls hourly (minute 7) on GitHub-hosted Ubuntu ARM.
It selects the newest **CI-admitted** protected-dev source by ancestry from
upstream's existing `lean-cache-v2-*` and `lean-cache-verify-v1-*` publications.
Both carry the same checked-report `lean-release-seed-v3` contract. The former
requires a successful scheduled `lean-cache-publish.yml` producer on `dev`; the
latter requires a successful `ci-publication-verify.yml` push producer on `dev`
or an `integration-*` branch, with the manifest source ref matching that branch.
In either case the exact report commit must be a protected-dev ancestor and its
canonical `ci-current.yml` dev push run's `required` aggregate must have
succeeded. A verification seed supplies transport, not a replacement CI verdict.
Removed workflow files
cannot borrow a historical green workflow record.

A newer report whose exact CI is pending, absent, or failed does not starve an
older successful report. Selection keeps the newer report's source and exact CI
diagnostic, then tries the next report in source order. If none has successful
canonical CI, it records `awaiting-upstream-ci` or `upstream-ci-failed` without
claiming a publication. API and identity errors still fail closed.

The consumer verifies the cache manifest, asset inventory, per-part and whole
archive SHA-256, then extracts only the checked report and its four sidecars.
It checks out the exact source/tree and builds that source's .NET exporter with
locked dependencies. It never runs Lean or reconstructs formal evidence.

New exporters require a published `scribe-resources-*` pack. Pages checks the
exporter contract at the selected immutable source before downloading the cache.
A usable pack must declare an immutable protected-dev source as its release
target and its Git tag must resolve to that source. The archive SHA-256 is
transport evidence; the tag's
64-hex suffix is the distinct logical resource digest supplied as
`--scribe-pack-digest`. The source's native `resources verify` checks every entry
before `truth-release` consumes it via `--scribe-pack`. The current executable is
`StrataLint.Scribe`; older sources retain the `StrataLint.Scribe.Documents` path.

The existing resource contract identifies definition bytes by logical digest;
it does not require the pack publication and checked report to share a commit.
Pages prefers an exact-source pack. Otherwise, it verifies the original pack
natively, compares each published definition's `.scribe.cs` Git blob between
the resource source and report source, and copies only unchanged definitions
into a content-addressed subset. Changed and absent scripts are excluded. A
document is excluded if it references another excluded document; exclusions
propagate until the subset's document references are closed. Entire original
definition bytes are copied or omitted, never edited. No Scribe scripts or Lean
tools run. The subset passes native `resources verify`
and the unchanged `truth-release` Scribe, Frozen ledger, report and frontier
checks. Those native interfaces support absent document definitions; Pages does
not invent descriptions for unpublished scripts. Metadata retains the original
release/source/digest, consumed digest, copied count and excluded/unpublished
GIDs. A zero-resource adaptation is rejected.

When no resource publication is available, selection reports
`awaiting-scribe-publication` and skips downloading and building. This is a
successful polling attempt with a **blocked publication**, not a synchronized
source. Pages records the report source and reason on its diagnostic branch;
the version-status page displays the wait even when the workflow is green.
Changed script content is never substituted by a published older definition.

The native exporter retains its source, Frozen ledger, Scribe and residual
frontier checks. An exit-2 diagnostic beginning
`TRUTH_RELEASE_INVALID residual frontier evaluation failed:`, the exact
`TRUTH_RELEASE_INVALID frozen ledger does not form a closed dependency DAG`, or
`TRUTH_RELEASE_INVALID Scribe emission verification failed: describe red code=`, records
`content-validation-rejected`. No bundle is published. The next poll suppresses
only a rejection with the same source/tree, report archive, Scribe resource
identity and Pages adapter commit. Rejection history survives successful polls;
known rejected inputs do not starve the next older eligible report. Changing
any of those inputs retries the export. Explicit Scribe content findings retain
their `describe red code=` detail lines; host errors are not content rejections.
Network, restore, build, process termination and unknown export errors
remain retryable failures. The diagnostic page links the original rejection run.

Successful bundles are published in **the Pages repository**, under
`pages-source-<source commit>`. Structured release notes retain exact source/tree,
CI and report-producer run attempts, report manifest, Scribe asset and logical
identity, and bundle digest. A draft becomes public only after upload; a public
source publication is never overwritten. These durable bundles are consumed
alongside historical upstream truth releases through the existing source,
ancestry, Library history and atomic ingestion checks.

For a stalled publication, inspect the Pages selection summary first:

- `awaiting-scribe-publication`: no published resource input is available.
  Upstream already has `scribe-release-publish.yml` with a `ref`
  input; the upstream publication owner can publish the displayed report commit
  using that existing operation. This downstream task does not dispatch it or
  change upstream CI. Once matching inputs exist, the next Pages poll retries.
- `awaiting-upstream-ci` / `upstream-ci-failed`: inspect the exact report CI run,
  rather than the newest moving-dev run. An older verified report can still be
  published; the newer unresolved source remains visible after that update.
- `content-validation-rejected`: read the linked native diagnostic. Upstream must
  publish corrected content through its normal process. Do not relabel ledger
  states downstream, reuse an incompatible pack, or bypass native checks.
- `publication-failed`: inspect the failing acquisition/build/validation/upload
  step and retry the downstream workflow after resolving that measured failure.

Reconciliation continues to serve the last verified bundle while inputs wait or
are rejected. Published-data lag and upstream source distance are shown
separately; zero published-data lag does not confirm that latest source is live.

`research-news.json` and `research-catalog.json` are generated in the deployed site
from the same current Library snapshot. New upstream-verified resolutions appear
automatically without committing an editorial row, a result story, or a claim audit.
The generated result set follows the current snapshot, so withdrawn results are
removed from current listings while historical snapshots remain archived.
Matching editorial title/category/summary/PR links may enrich a result, but its
kind, declaration, source version and exact scope follow upstream. A PR link alone
is not evidence of Lean verification. `publications` remain editorial records.

Manual refresh: run `sync-upstream.yml` on `dev`. Presentation-only refresh: run
`pages.yml` with `rebuild_current=true`. Plain `pages.yml` dispatch defaults to real
publication reconciliation; the fixture requires an explicit `mock` input.

Dossier presentation accepts multiple valid source identifiers (for example, a
DOI plus an arXiv URL), preserving each value and validating every supplied field.
The existing primary-link preference is DOI, then arXiv, then URL. A missing H1
uses the validated dossier slug as its display title; required sections, source
hashes, declaration binding and the verified-resolution gate still apply.

GitHub metadata reads carry a unique observation parameter and request cache
revalidation. Moving dev references and run/release lists must not reuse a stale
intermediary response across polling runs: an old dev head would otherwise reject
new successful CI sources as non-ancestors. Immutable artifact digests and source
identity checks remain the admission evidence.

The projection subprocess does not inherit the Pages workflow's GitHub event,
SHA, run ID, output files, API token, or CI planning variables. The checked
upstream source, report and explicit export arguments supply provenance. The
source repository identity remains explicit.
