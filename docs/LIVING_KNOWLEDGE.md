# Living knowledge across four views

The public entry opens the existing spatial Atlas. Shared navigation is Explore,
Library, Evolution, Research. Old `dag.html` URLs continue to open the expert
analysis console; they are no longer the Research catalog.

## Two clocks

`receive-truth-release.yml` receives `truth-release-published` and starts the
verified Pages pipeline. Each deployment now runs `lib.living_library` against
the exact source commit. Daily repository activity is read separately from the
public GitHub commits API without credentials. It is labeled development activity,
never a published proof. API errors leave the source-history link available.

An hourly bounded reconciliation also catches missing notifications. It selects
one oldest missing release by source ancestry, skips existing history before
downloads, and publishes ingestion receipts with the site. See
[Release reconciliation](RELEASE_RECONCILIATION.md) for dry-run commands, recovery
semantics and resource limits.

## Research

The exporter reads `Problems/*.md` through Git at the source commit in the Atlas
manifest, including sparse checkouts. The working tree is not release evidence.
YAML and CommonMark enforce the existing catalog metadata and required sections.
Numeric-looking arXiv IDs remain strings. Duplicate keys, missing titles or
sections, unsafe slugs and invalid anchor lists still fail dossier parsing. Each
such failure quarantines only that problem: the release can archive its valid
truth nodes and remaining dossiers. Raw HTML and unsafe links are disabled.
Vendored KaTeX renders escaped TeX with trust disabled.

Every new snapshot and its `data/library-history.v1.json` entry include
`quarantined_problems`, a list of `{slug, path, reason}` records in source-path
order. `slug` is derived from the filename (the catalog's required coordinate),
`path` identifies the pinned `Problems/*.md`, and `reason` preserves the parser's
exception string. The list length is the quarantine count; `problem_count`
counts only valid dossiers. Clean releases have an explicit empty list. The
snapshot digest covers the audit records, and the entry's `source_commit`
identifies their immutable source. Legacy snapshots and entries remain readable
and are not rewritten to add retrospective audit records.

Only exceptions from the individual `parse_problem` call are caught. Git reads
and decoding, bundle verification, Atlas/manifest digests, archive verification,
and resolution checks still fail closed. Quarantined dossiers' resolution
markers go through the existing binding/Frozen checks and the same truth-export
contract and formalization gate as valid dossiers. After verification, those
resolutions are withheld from the snapshot's problem list, dossiers, research
news and discovery records. A quarantine never suppresses a resolution-gate
failure or claims that a malformed dossier has been solved.

Problem, Motivation, Gap, Route, Falsifier, Evidence, Triage and
ASSUMED-UNVERIFIED are preserved. `triage: theorem` means a focused target, not a
completed theorem. Routes remain proposed, literature status is not rechecked,
and no last-checked date is invented. Motivation GIDs link to released nodes;
missing GIDs remain absent. The graph retains recorded anchor relationships and
marks proposed bridge connections as advisory. Certified edges are unchanged.

New releases compare dossier bytes and anchor content fingerprints. Changes
request reassessment, not resolution. Fingerprints include authored title,
exposition, theorem, source blob, path and status. Clustering and metric changes
do not become content revisions. A Route does not establish active work or a
completed milestone. Mathematical review remains necessary.

## Library archive

`data/library-history.v1.json` indexes content-addressed snapshots and a compact
change timeline. Snapshots contain source/release coordinates, the original Atlas
digest, concept content, recorded edges and problem dossiers. New artifacts use
deterministic gzip; legacy JSON is readable. Readers verify compressed bytes
before decompression and validate release binding. Full snapshots load on demand;
concept/problem histories use the compact timeline, not every historical graph.

Previous-deployment snapshots are verified and preserved. Only the initial index
404 starts a baseline; errors, corruption and archived-tip rollback fail. An
identical rebuild is idempotent, including compression upgrades. The index is
published last. Exact node IDs establish continuity. Renames without an upstream
identity mapping appear as absence/addition; titles never silently unify concepts.

Current Wiki pages retain static content and full relationship maps. Historical
release URLs become small redirects to `library-version.html`, which reads the
verified snapshot and shows original exposition, sources and full relationships.
Older relation artifacts remain available. Historical reading requires JavaScript;
the current Wiki is statically readable. Normal hosting/storage monitoring remains
necessary as the archive grows.

## Evolution

The 2D dependency lineage aggregates source domain/depth groups, preserving all
recorded imports and multiple-parent convergence. Depth is logarithmically spaced
to keep long chains visible. Domain expansion exposes every member; search and
the inspector provide a named route into the canvas. Family colors match Atlas.
Domain tracks use the archived domain union to reduce layout changes.

Across releases, solid curves count exact-ID continuity between source domains.
Dashed curves show new dependencies whose source existed in the prior observation.
Dependencies entirely inside one release appear in its dependency view. These
are source-domain cohorts, not mathematical species or algorithmic cluster lineage.
Topology profile changes break comparisons. Existing Topology cluster split/merge
contracts remain in the advanced console and are not labeled as discoveries.

The slider and playback use real observations. A single observation is a baseline
with disabled playback; no earlier graphs or dates are fabricated. Archived edges
are optional for compatibility; missing old edges remain unknown. Current edges
can be hydrated from the same verified Atlas. Metrics remain module-level reuse,
not theorem-use counts or evidence of mathematical fixed points.

## Verification

```bash
python3 -m venv /tmp/pages-venv
/tmp/pages-venv/bin/pip install -r requirements.txt
/tmp/pages-venv/bin/python tools/serve_atlas.py --port 8766
/tmp/pages-venv/bin/python -m unittest discover -s tests -p 'test_*.py'
node --test tests/js/architecture.test.mjs tests/js/evolution.test.mjs
ATLAS_ORIGIN=http://127.0.0.1:8766 node tests/browser/living-library.cjs
```

The preview expects the sibling `trureturing` checkout to contain the source
commit. Browser suites need Playwright, Chrome and pngjs. Test-only releases never
enter published content. CI installs pinned parsers and runs contract tests.
