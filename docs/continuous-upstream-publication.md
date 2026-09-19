# Continuous publication from upstream CI

Pages follows successful **push CI runs on upstream `dev`**. It does not run Lean,
install a Lean toolchain, require a self-hosted runner, or independently review
whether a formal theorem settles an informal mathematical question. Those are
upstream responsibilities.

`sync-upstream.yml` polls hourly (minute 7) on GitHub-hosted Ubuntu ARM. It queries
upstream's active `ci-push.yml`, considers successful dev pushes in original run
creation order (a rerun does not become a newer push), and verifies that each
selected source still belongs to protected dev. The upstream publication checks
are `engineering` and `current`, for the exact run attempt and source commit.

A successful push may only check documentation or engineering inputs. The
run-bound `ci-current-diagnostics-<run>-<attempt>` receipt identifies whether its
execution plan requires `lean-report`. Sources without that step are recorded and
skipped. Missing receipts, expired report artifacts, and incompatible contracts
fail visibly; they never count as a successful synchronization of old data.
The selection summary records the observed dev head, newest successful CI source,
selected report source, and skipped sources. An already published report is
reported explicitly as `latest-report-already-published`.

The selected `ci-current-<run>-<attempt>` artifact is downloaded by ID and GitHub
SHA-256 digest. Its exact `ci-current.tar.gz` wrapper is restored with the selected
upstream commit's existing transport helper. The native verifier checks the
source, run attempt, retained plan and material hashes. Only after verification
and confirmation of a complete `.lake/build/stratalint/raw-lean-report.json` does
the bundled CLI convert that report into the seven-file website contract. No
exporter rebuild is needed. The exporter performs its existing source, Frozen
ledger and Scribe consistency checks; it does not regenerate the Lean report.

The bundle is published in **the Pages repository**, under `pages-source-<source
commit>`. Structured release notes retain the upstream CI run, attempt, artifact
ID/digest, source commit/tree and exported bundle digest. This is a downstream
data publication, not an assertion that upstream published a GitHub truth release.
A draft is made public only after its bundle is uploaded. A retry can finish a
draft; a public source publication is never overwritten.

Pages consumes these publications alongside historical upstream truth releases.
The existing digest, source binding, ancestry, Library history and atomic
publication checks remain. Bundles are durable GitHub release assets, so a
presentation rebuild does not depend on seven-day CI artifact retention. The
hourly reconciliation also retries already-published bundles after a failed deploy.
If the latest successful report has expired before a bundle was made, publication
fails visibly and the current site stays live; there is no Lean rebuild fallback.

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
