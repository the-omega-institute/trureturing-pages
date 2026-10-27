# Shared mathematical foundations

The default `atlas.html` view reveals which mathematical modules support other
work across fields. Domain categories remain descriptive metadata. They do not
determine positions or create dependencies. The complete 3D Atlas remains at
`atlas-explorer.html`; old Atlas module, mode, family, and scope links redirect
there with their query and hash state preserved.

## Reading the map

- **Shared foundations** ranks distinct downstream modules reachable through
  recorded dependency paths, then downstream source-domain coverage.
- **Starting points** includes reused modules with no parents inside this release.
  External prerequisites, including Mathlib, are outside the published graph.
- **Direct reuse** ranks immediate dependent modules.

The overview selects the top 12 ranked modules, with actual shortest paths
connecting them. Starting points instead include up to two immediate dependents
per root. Every displayed arrow is a recorded direct dependency; no collapsed,
similarity, topic-membership, or proposed relation becomes a proof edge.

Selecting any module shows all immediate prerequisites and up to 12 immediate
dependents. The adjacent inspector searches and paginates **all** reachable
upstream or downstream modules. Selecting a destination shows every direct step
of a shortest path. Global search covers every released module, including isolated
modules. The overview is a navigation selection, not a claim to show every root.
Foundation selection, perspective, path destination, and direction survive reload
and can be shared in the URL. Authored titles and summaries remain unchanged;
interface controls support English and Chinese.

These are module-import relationships and counts, not theorem application counts
or an absolute ranking of mathematical importance. Broadly imported modules can
include aggregation modules. A graph root is relative to the current publication,
not a claim of ultimate mathematical primitiveness.

## Data and verification

The existing Pages startup builder derives `pages-foundations.v1` from the final,
manifest-bound Atlas. It reuses `analyzeArchitecture` to verify exact architecture
metrics and derive the module DAG. It retains every mathematical module ID,
authored title and summary, domain, direct reuse, distinct downstream reach,
domain coverage, depth, and every direct dependency edge. Blueprint documents and
nondependency relations remain available in the full Atlas.

The gzip artifact is content-addressed and referenced by `foundations` in the
existing `pages-atlas-startup.v1` index. A cold homepage makes three data requests:
the manifest, the startup index, and this one immutable artifact. The browser
checks index/manifest release and graph bindings, compressed-byte SHA-256, schema,
unique module IDs and edges, edge closure, acyclicity, direct degree, and depth.
Reach and coverage are checked by the builder against the full source graph and
are protected in transit by the artifact digest. A deployment racing the two
mutable pointer reads triggers one paired retry; corrupt data fails visibly and
can be retried. No unverified fallback graph is displayed.

Source paths are omitted only when exactly recoverable as `<module ID>.lean`;
Wiki paths only when exactly recoverable as `knowledge/node/<sha256(ID)>/`.
Nonstandard or absent coordinates remain explicit. Lean links pin the released
source commit. This is a Pages-owned projection of existing upstream publications,
with no changes to upstream publication contracts.

The full explorer also defers research and history work: Open questions requests
the research catalog; a module-history button requests verified history;
Show release changes requests the last two architecture snapshots and the
release-bound Library data. Startup no longer downloads all those archives.

## Measured startup

Matched local previews used source commit
`e7eb21e5dc7e10676463074ab67cbc09ddc874ae`, release
`sha256:f0e96b66772f7481bf62cc1f9168b6cc612028a1b9df4c94170dccee0cdd056c`,
and 10,993 modules with 14,452 dependency edges. The previous frontend was
`850ed02794c9144c7acc78bdbce1184986605e6f`. Measurements on 2026-10-27 used fresh
headless Chromium contexts, the same local HTTP server, and the same release.

| Measure | Previous homepage | Foundations homepage |
| --- | ---: | ---: |
| Compressed graph data required at startup | 8,053,121 bytes (graph + layout) | 825,984 bytes |
| Median ready time, 3 unthrottled cold contexts | 1,479.5 ms | 134.1 ms |
| Ready time, 5 Mbps download / 100 ms latency, 1 cold context | 18,163.6 ms | 2,100.8 ms |

The compressed graph payload is 89.7% smaller. These are controlled local
measurements, not production latency guarantees. The two views have different
rendering scopes: the homepage offers all-module search and selected exact paths;
the full graph is a separate destination. The comparison includes both transfer
and rendering effects and does not isolate network compression alone.

## Validation

The startup and architecture unit suites test compact artifact binding, exact
diamond reachability, cross-field coverage, roots, path direction, corrupt-byte
rejection, and the bounded history window. The real-release browser check covers
three-request startup, selection, source links, path reload, search, Chinese,
mobile overflow, legacy redirects, deferred archive loading, and corruption/retry.

```bash
node --test tests/js/atlas-startup.test.mjs tests/js/architecture.test.mjs
python tests/browser/foundations.py --origin http://127.0.0.1:8765/ \
  --output artifacts/foundations-checks
```

Install the repository Python requirements, `playwright==1.57.0`, and Chromium.
The origin must serve frontend files and startup artifacts generated by
`tools/build_atlas_startup.mjs` from a verified real release. Pass
`--before-origin` for the matched previous-frontend benchmark. The check writes
screenshots and a machine-readable `browser-report.json` with resource timings.
