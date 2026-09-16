# Continuous publication from upstream CI

Pages follows successful **push CI runs on upstream `dev`**. It does not run Lean,
install a Lean toolchain, require a self-hosted runner, or independently review
whether a formal theorem settles an informal mathematical question. Those are
upstream responsibilities.

`sync-upstream.yml` polls hourly on GitHub-hosted Ubuntu ARM. It selects the newest
source by ancestry (not rerun completion time), checks all three canonical jobs
for that exact commit, and downloads `raw-lean-reports` by artifact ID and digest.
The upstream CLI at the same commit converts the existing Inspector report into
the seven-file website contract. This exporter also performs its existing source,
Frozen ledger and Scribe consistency checks; it does not regenerate the report.

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
