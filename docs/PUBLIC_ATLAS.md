# Public Mathematical Atlas

`site/atlas.html` is the public 3D module-import DAG and concept Wiki. It opens
in **Full DAG**, showing every admitted module and every published import between
admitted endpoints, including cross-parent and shortcut imports. Admission uses
source-bound declaration and axiom evidence from the existing verified export and
report, as described in [Truth consumption](TRUTH_RELEASE_CONSUMPTION.md).
Proven-but-not-yet-frozen modules and verified definitions are eligible. Closed
labels and Lean filenames alone are insufficient.

The layout uses weak connected components and actual directed imports. Arrows
point from prerequisite to dependent, with dependency depth compressed vertically.
The opening camera frames the largest connected structure; **Fit entire graph**
includes the smaller components and unconnected modules. All admitted nodes and
imports are rendered throughout, including those outside the opening camera.
Component names combine their leading domains and a representative module; names
are editorial descriptions of real components, not additional graph connections.
Readers can inspect modules with multiple direct prerequisites and follow genuine
directed import paths through Architecture. These are module-level dependencies;
the publication does not establish declaration-to-declaration theorem use.

The sidebar reports statistics for the admitted induced view and states how many
source modules are excluded. The complete source graph, its digest and certified
Topology counters remain intact and are checked before filtered metrics are
recomputed. Search, selection, direct links, family, frontier, component and theory
views share the same admission rule. Selection exposes explanatory Blueprint prose
and revision-pinned Lean sources in the Wiki without inserting documents,
affinities or unfinished records into the mathematical DAG.

**Dependencies** inspects the admitted graph and its support metrics.
**Structure** groups admitted modules into editorial concept families;
**Open questions** adds source-authored research associations separately.
`atlas-explorer.html` remains an alias. `site/dag.html` retains the advanced
source workspace. Branding, same-domain `/visualize/`, navigation, English/Chinese
localization and mobile selection continue to use the existing site interfaces.

Node inspection exposes domain-specific dependency paths and verified release
observations. `site/evolution.html` is the full evolution workspace. See
[Architecture evolution](ARCHITECTURE_EVOLUTION.md) for metric definitions,
archive preservation, and comparison boundaries.

## Why the previous overview was difficult to read

Measured against the public release downloaded on 2026-09-06:

- 5,555 total records: 2,890 mathematical nodes and 2,665 Blueprint documents.
- 20,830 relations, including 2,830 proof dependencies and 10,298 structural
  affinities.
- 1,849 level-2 topology communities, of which 1,823 contain only one node.
- The original far view selects 2,170 nodes and 1,161 relations. It hides
  community outlines and labels at that distance.

The existing partition is not a useful public topic hierarchy. Enlarging spheres
or stretching the coordinate axes cannot resolve that information problem.

## Presentation decisions

The Structure view groups mathematical nodes into nine editorial concept families.
The mapping uses the existing `domain` field. Within a family, repository
subtopics provide anchors and real dependency edges pull connected concepts
together using vendored `d3-force-3d`. The deterministic simulation runs in a Web
Worker and stops before rendering. Family positions are editorial composition,
not a metric of inter-family similarity. The About dialog states this boundary.

The `atlas-branched-dag-v5` dependency layout spaces early import depths more
widely and keeps long chains visible using a logarithmic vertical scale. A
deterministic primary parent (chosen by downstream reuse, with identity ties)
organizes drawing basins around large import trees. Multi-source graph distance
assigns the remaining connected modules. Colors identify these drawing basins,
not new mathematical subjects or inferred theorem relations. All secondary
parents, joins, shortcut imports and cross-branch edges remain intact. Node size
shows downstream reuse; brighter lines highlight real primary imports with shared
downstream support. Landmark rings, readable counts and collision-avoiding labels
with leaders identify important modules. Hover highlights incoming and outgoing
imports; clicking an import opens its dependent module. Reduced motion disables
flow particles and camera transitions.

The startup builder publishes this deterministic layout under the existing digest
contract. A verified v4 startup can still supply graph and Structure coordinates;
the DAG worker refreshes its dependency positions. A v5 startup requires no client
layout worker.

The `atlas-dependency-scaffold-v2` layout selects a deterministic primary parent
from existing same-family proof dependencies, weighted by actual reuse and
downstream support. Depth and curved local targets give each family an internal
skeleton. Secondary parents and all original relations remain available; the
display skeleton does not change mathematical provenance.

The mathematical views show only admitted modules and module imports. The
source archive still distinguishes proof, affinity, document, advisory and authored
relations for advanced tools and explanation. The mathematical selection controls
provide direct, two-hop or full import lineage and optional surrounding admitted
context. Full lineage follows ancestors and descendants without adding non-import
relations. Scope, range and context remain shareable through URLs.

The right-hand Wiki reuses the existing Concept Lens core for authored summaries,
theorems, facts, documents, and provenance. Connections distinguish prerequisites
from consequences and support continuous navigation. Mobile selection reduces
the graph viewport and opens the Wiki in a bottom sheet. There is no CMA write
path in the public experience; each concept links to related Research dossiers.
The advanced console remains available at `dag.html`. See
[Living knowledge](LIVING_KNOWLEDGE.md) for the four-view information architecture.

Selection colors distinguish the selected module, its imported prerequisites and
downstream modules. The camera fits the complete direct
neighborhood of the selected concept; the relationship controls can expand the
view to full lineage. Previous view restores the exact camera and exploration state,
including on mobile. Adaptive landmark labels prioritize selected concepts and
avoid controls and other labels.

In Structure at overview distance, directed cross-family proof dependencies are aggregated
into curved bundles with exact counts. Selecting a bundle exposes every original
source/target pair. Close zoom expands the individual dependencies, and the bundle
toggle exposes them at any distance. Lighting, restrained distance fog and node
resolution adapt to the camera. Semantic overlays load after graph readiness and
share the existing renderer. They do not add another canvas or layout simulation.

The Connections tab embeds an interactive relationship map. Generated Wiki pages
provide All relations, Proof paths, Structural affinity, and Documents views,
with zoom, fit, selected-node focus, expansion, and node navigation. Dagre lays out
proof-only diagrams; mixed relations use D3 force layout so affinity edges do not
imply a proof hierarchy. Layouts run in disposable workers. Relationship lists
and no-JavaScript fallback diagrams are not truncated.

`site-theme.css` is shared by the Atlas, release overview, Library, research view,
release history, authentication callback, and both current and immutable Wiki
pages. `lib.knowledge_pages` generates a compact, hash-bound relationship artifact
per release. The Pages workflow regenerates Wiki pages after the final Atlas is
enriched, preserving structural affinities and manifest-bound source graph bytes.
Desktop headers use a shared three-column grid: brand left, navigation centered
in the viewport and status right. Mobile uses a fixed two-row arrangement with
centered navigation in the second row, across current and immutable pages.

## Research questions and module state

The Atlas `frontier` mode reads the same digest-verified Library snapshot as
Research, bound to the exact Atlas graph, Truth release and source commit.
`Problems/*.md` supplies question titles, triage and `motivation_gids`; these
authored links identify released foundations, not new proof dependencies.
All source dossiers remain listed, including those with missing graph anchors.
Selecting a question scopes the map to its released anchors and transitive proof
prerequisites. Selecting a concept still exposes its complete relationships.

Module `state=open` means an unfinished module. It does not establish a
mathematical open problem: the release also contains engineering frontier
modules such as PaperGenerator and ValuesProducer. These remain in the source archive and advanced workspace; they are excluded
from the mathematical Atlas unless supported by the published proven catalog.
Gold nodes denote research anchors; a closed foundation can support an open
research question. A missing, corrupt or mismatched catalog reports unavailable
research and never falls back to guessing from module status.

Wireframe question markers and dashed authored associations form a separate
research overlay. Selecting a marker opens its released foundations and links to
the dossier's missing bridges and proposed approach. Neither a marker nor its
dashed connections represent a certified proof or an inferred solution.

No Topology contract extension is required for this source-backed view. Topology
continues to supply proof structure; authored research classification comes from
the release's source catalog and must not be inferred by topology metrics.

## Startup performance

`tools/build_atlas_startup.mjs` precomputes Structure and admitted DAG positions.
The current profile is `atlas-branched-dag-v5`. A v3 compact startup view carries
all source node identities, relation tuples and certified topology counters,
together with bounded admission summaries. It groups the exact source/frozen hash
bytes and stores node fields in rows; no admission field is replaced by a label.
Nonmathematical explanatory prose stays in the lazy details. Coordinates use
integer thousandths indexed by a digest of the complete source node order, checked
before the usual layout coverage and import-direction validation. The preceding
evidenced v2 view and object-based layouts remain readable. Full node records and
exact declaration receipts load from digest-addressed shards on selection. Failed shards are retryable
and successful shards are reused. No full graph, export or report download delays
first paint. The original graph bytes remain in the immutable canonical archive.

The mutable manifest and startup index revalidate; compressed artifacts use
content-addressed cache URLs. Compact and full startup both validate the complete
source topology before deriving the admitted view. Full startup applies the same
admission summary. Layout coordinates cover the complete source identity set while
downward direction is checked for imports actually rendered by the new profile.

Changed entry, model, architecture, layout, startup, compact-view, locale and style
interfaces use the coordinated `?v=lean-admission-v2` cache coordinate. The cache
upgrade browser check supplies stale preceding-release modules and requires current
admission and counts. The legacy archive path remains available; absent declaration
evidence reports an unavailable mathematical view rather than claiming an empty DAG
is a successful projection.

The v5 spatial renderer, dependency worker, startup loader, locale and stylesheet
use `?v=spatial-v1` so a warm browser refreshes this presentation together.
Admission and source-consumption interfaces retain their existing cache coordinate.

Research and history load after the graph becomes interactive. Research has an
explicit pending state; slow or failed research cannot delay the main Atlas.
An older deployment without the startup index retains the verified graph and
worker-layout path. A legacy scaffold v2 layout also computes the complete connected DAG
in `atlas-dag-worker.mjs`, keeping simulation off the main browser thread. Invalid artifacts do not silently use unverified positions.
Changes to public layout semantics must increment `LAYOUT_PROFILE` in
`site/assets/atlas-startup.mjs`; the deploy step regenerates artifacts for every
release and Pages build. The original certified Topology conformation remains
separate from these editorial display coordinates.

Release-change highlights compare verified architecture snapshots and, when
available, release-bound Library history. New concepts are green, content updates
amber, and new proof edges carry directional emphasis. The changes panel also
records removals. A single real release is explicitly a baseline: its change
toggle is disabled, and no growth is invented. Incompatible analysis profiles
cannot produce comparable architecture changes; absent edge history is unknown,
not a zero count. Daily source activity remains distinct from Truth releases.
The optional short emphasis runs once per release per browser session and respects
reduced-motion preferences.

Run `node tools/benchmark_atlas.cjs` with Playwright available through `NODE_PATH`.
`ATLAS_URL` selects a local or public Atlas. The benchmark reports cold/repeat
navigation readiness, layout-worker duration and resource transfer sizes.

## Local preview

```bash
python3 tools/serve_atlas.py --port 8765 --cache artifacts/atlas-preview-current --bundle /path/to/verified-bundle
```

Open `http://127.0.0.1:8765/atlas.html`. The server caches the current public
release under the ignored `artifacts/atlas-preview/data/` directory and verifies
its hashes. It serves current local source without changing committed truth
data. The server also generates the Library and current/immutable Wiki pages from
the verified release, so concept navigation stays on the local preview. The original view is available at
`http://127.0.0.1:8765/dag.html` for comparison.

Use a separate `--cache` directory for another release; existing previews and
caches remain untouched. `--bundle` must match the cached Atlas source and release
identity. `--prepared` serves an already verified prepared cache. If port 8765 is
occupied, pass another `--port`. Without compatible declaration evidence the
preview explicitly reports the missing capability.

## Verification

`NODE_PATH=/path/to/node_modules ATLAS_URL=http://127.0.0.1:8765/atlas.html node tests/browser/atlas-spatial-clarity.cjs`
checks complete graph identity, camera scope and restoration, label collisions,
complete direct-neighborhood framing, actual import tooltips/clicks, responsive
English/Chinese views, and the absence of a layout worker with published v5 data.


```bash
node --test tests/js/*.test.js tests/js/*.test.mjs
```

Browser verification requires `playwright`, `pngjs`, and a local Chrome binary.
With those packages available to Node and the preview server running:

```bash
node tests/browser/atlas-theory.cjs
node tests/browser/atlas-public.cjs
node tests/browser/atlas-research.cjs
node tests/browser/atlas-startup.cjs
node tests/browser/atlas-visual.cjs
node tests/browser/atlas-release-changes.cjs
node tests/browser/header-alignment.cjs
node tests/browser/pages-theme.cjs
node tests/browser/architecture.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

`ATLAS_URL` can override the preview URL. Screenshots are written to
`artifacts/atlas-preview/screenshots/`. Browser checks exercise real release
data, canvas pixels, search, Wiki navigation, stable coordinates, dragging,
camera motion, view modes, and responsive layouts.
The shared-page suite also verifies complete relationships, category filters,
retained context, interactive 2D graphs, current/immutable navigation, Library
search/pagination, no-JavaScript fallbacks, and the theme on every owned page type.
The visual suite checks real dependency bundles, camera restoration, research
markers and responsive label collisions. The release-change browser suite uses
an isolated two-release test fixture; that fixture is never deployed as history.

The additional Three.js exports are pinned in `tools/three-atlas-entry.mjs` and
`site/assets/vendor/README.md`. With `three@0.184.0` and `esbuild@0.25.5` installed
in the build toolchain, rebuild the vendor module with:

```bash
esbuild tools/three-atlas-entry.mjs --bundle --format=esm --minify \
  --outfile=site/assets/vendor/three-atlas.mjs --legal-comments=inline
```

## Remaining design work

This is a first public presentation, not a replacement for upstream topology.
The nine families and fallback classification should be reviewed by a domain
expert before being treated as a lasting navigation taxonomy. Cross-family
screen distance is currently editorial, while within-family placement combines
topic anchors with proof connectivity. A future similarity map needs an explicit
definition and evaluation of semantic distance.

The Wiki currently uses the authored Blueprint. Much of that prose assumes a
mathematical reader. Truly introductory explanations, examples, and prerequisites
need a reviewed exposition layer; a rendering change alone cannot supply them.
The current display emphasizes topic groups and readable navigation. More
protein-like folds should be evaluated against whether users can locate a topic
and correctly identify its dependencies, rather than against visual novelty.

## Verified publication coverage (2026-10-30)

This implementation was checked against the actual published Pages bundle for
source `3e7dac4c8cd1a8d96a48fd980f353ef96bf83239`, tree
`6a6a3d2fc9e8ae4f0c30b290b76ac6a2d9adbdcb`, release
`sha256:b4cd607f016d82772da6566c086286493f33e19defa96e6eab84fd015554bd2c`.
The archived canonical Atlas digest remains
`sha256:c3010a84326c983dc836284a89f9f760204132d6716e8b7a52296389b262525b`.

- The complete source topology has 11,237 truth modules and 14,799 import edges.
- The admitted view has 11,218 modules and 14,723 induced import edges, with
  1,679 weak components, 1,306 isolated modules and maximum depth 69.
- It retains 10,810 frozen and 408 proven-but-not-yet-frozen modules, including
  198 modules with verified declarations but no theorem declarations.
- It carries 230,545 exact declaration receipts, including 121,550 theorems.
- Eleven Open frontier records lack proven-catalog membership. Eight catalog
  entries have no published declarations (including the `Trureturing` umbrella).
  Their excluded identities remain recorded; no transitive replacement edges
  are invented when a module is excluded.
- First-paint compressed graph plus layout total 2,084,486 bytes. Declaration
  details remain lazy; the 7,562,043-byte canonical archive stays off startup.

These are measurements for this publication, not claims about newer research
revisions or a deployment of this implementation. Exact theorem-use edges and
source line spans are absent from the published contract. Revision-pinned file
links, full declaration identities, statement IDs, source hashes and axiom receipts
are available and are presented at their actual granularity.

A controlled Chrome comparison rebuilt `fb950db` and the candidate from these
same publication bytes. Text used gzip delivery and content-addressed gzip
artifacts were sent unchanged. Each link profile had three cold runs per variant,
in alternating order, with fresh browser contexts, a 1512 × 982 viewport and no CPU
throttling. The baseline graph/layout total was 2,151,778 compressed bytes; the
first evidenced implementation was 3,127,375 bytes. The current encoding is
2,084,486 bytes, preserving the admitted records, relations and rounded coordinates.

| Link / implementation | Data ready (s) | Renderer ready (s) | Search results usable (s) | Selected article loaded (s) |
| --- | ---: | ---: | ---: | ---: |
| 10 Mbps, 80 ms / baseline | 2.02 | 3.00 | 6.34 | 12.29 |
| 10 Mbps, 80 ms / current | 2.12 | 3.13 | 6.69 | 13.32 |
| 4 Mbps, 150 ms / baseline | 4.76 | 6.70 | 10.16 | 16.39 |
| 4 Mbps, 150 ms / current | 4.78 | 6.69 | 10.06 | 16.03 |

Values are medians. Data readiness starts at the loader call; the other columns
start at navigation. Renderer readiness means the application has constructed its
scene, with no layout worker; it does not measure GPU completion. The interaction
checks search for `TailBounds`, select the exact published module and wait for its
lazy article. They include browser automation and WebGL scheduling costs.
One warm observation per profile transferred zero immutable artifact bytes;
current renderer readiness was 1.42–1.56 seconds, versus 1.15–1.20 seconds for the
baseline. Evidence decoding and full source-topology validation still have a CPU
cost. These local emulated-link results do not establish production latency or
performance on a mobile CPU; separate narrow-viewport checks cover mobile behavior.
