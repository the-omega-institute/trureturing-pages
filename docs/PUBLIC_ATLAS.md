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

The sidebar introduces the project as a growing knowledge graph of Lean-verified
mathematics. Its visible research loop follows human questions, AI-assisted
exploration and formalization checked by Lean, then human understanding and new
questions. An inline SVG draws the directed Human → AI → Lean → Human cycle;
its arrows run outside the three labeled cards. Graph explanations focus on
reading and using this knowledge. The
complete source graph, its digest and certified
Topology counters remain intact and are checked before filtered metrics are
recomputed. Search, selection, direct links, family, component and theory
views share the same admission rule. Selection exposes explanatory Blueprint prose
and revision-pinned Lean sources in the Wiki without inserting documents,
affinities or unfinished records into the mathematical DAG.

The three graph tabs are ordered **Full DAG → Connection → Dependency**.
**Connection** preserves the original nine editorial concept families and their
published positions. **Dependency** restores the independent family/depth layout
and family colors used before PR #125, with selectable support metrics. Open questions are available
on the standalone Conjectures and research dossier pages, without a graph mode.
Legacy `mode=frontier` links redirect there before loading the graph.
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

The Connection view (internal legacy mode `structure`) groups mathematical nodes
into nine editorial concept families.
The mapping uses the existing `domain` field. Within a family, repository
subtopics provide anchors and real dependency edges pull connected concepts
together using vendored `d3-force-3d`. The deterministic simulation runs in a Web
Worker and stops before rendering. Family positions are editorial composition,
not a metric of inter-family similarity.

The published `atlas-branched-dag-v5` read model remains the source contract.
The current local preview uses a downstream presentation layout,
`atlas-connected-flow-preview-v1`, in Full DAG. Dependency uses the existing
`architectureLayout(model, structurePositions, architecture)`, as in commit
`29d8b9362206f4293e1e1e21b9caa0c3a472baa5` (PR #117), before PR #125 replaced
it with the main DAG coordinates. The stable layout retains the original family
x coordinate, places modules at `y = 420 - depth * 24`, and derives z from the
family-relative published positions. Nodes and within-family imports use family
colors; cross-family imports are gray. Node size follows the selected reach,
direct reuse or coverage metric. Straight imports retain their original arrows,
and the camera faces the depth layers directly. Ranked labels use the original
12 candidates with collision avoidance. Current admission and release verification
still govern the complete mathematical graph.

In Full DAG, all imports
attract their endpoints without fixed branch centers. The primary predecessor is
the deepest actual prerequisite, with reuse and stable identity as tie breakers.
Rank spacing reflects the number of modules at adjacent ranks while preserving
space along long sparse chains. Coordinates are deterministic and stay fixed
during selection. Separate connected components and isolated records retain
separate locations. All parents, joins, shortcut imports and cross connections
remain intact.

Three entry points identify actual directed lineages. Each contains its anchor
and every reachable dependent; lineages can overlap at real joins. Their sets
are also used for branch dimming, camera focus and legend counts.

Full DAG colors encode distinct dependent modules, including indirect
dependencies. Zero is separate, and positive counts are split at their median, 90th and 99th
percentiles, keeping ties together and omitting empty ranges. For the pinned
11,958-module release this gives 0 / 1–5 / 6–45 / 46–216 / 217–865, containing
4,287 / 4,075 / 2,832 / 687 / 77 modules. The highest range is gold, then mint,
blue, muted blue and dark blue. A legend inside the graph shows these actual
ranges and counts. Clicking highlights a range's modules and incident imports;
repeating the click or choosing Show all restores the overview without changing
topology, coordinates or camera.

Imports have their own quadratic geometry: primary chains use shallow spatial
curves and cross connections use broader arcs. Bend is bounded so curves retain
directed depth. Overview batches and native hover/selection links use the same
path, so arrows and particles follow the displayed connection. Every sampled
curve segment maps back to its exact original directed import for picking. Chain
opacity is 0.253 for reused targets and 0.1104 for terminal/low-reuse targets;
secondary connections use 0.018. The overview has no decorative branch rings.
Full DAG node size shows downstream reuse. Collision-avoiding labels
with leaders identify important modules. Hover highlights incoming and outgoing
imports; clicking an import opens its dependent module. Reduced motion disables
flow particles and camera transitions.

Curved overview links share a few drawing batches. Hidden native placeholders
stay straight and have zero width; only hovered or selected native connections
construct their matching curve geometry. This avoids building a duplicate tube
for every invisible import during mode switches. Full graphs keep node resolution
at seven segments; a selected small neighborhood can use twelve without rebuilding
all overview spheres as the camera crosses a distance threshold.

Selecting a module replaces the reuse legend with a compact key for the selected
module, its prerequisites and the knowledge built on it. Connection retains its
existing family colors and family navigation. The legend avoids label placement
and remains within the graph on mobile.

The preview's coordinate cache binds the existing Atlas graph digest and is
checked for exact node membership, finite coordinates and directed rank. It is a
Pages presentation artifact, generated with `tools/build_atlas_flow_preview.mjs`
from the verified startup cache. A mismatched or missing cache falls back to an
isolated layout worker. The published graph, digest contract, startup builder and
source release remain intact. Connection keeps the published family positions.

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
relations. Exploration state stays in memory so the home address remains clean
while switching views, selecting modules or changing relationship depth. Legacy
links still restore their initial selection and range before the address is
normalized to the home route; direct source and research links retain their
existing destinations.

Above 900 px, the graph and reading panel use a 70:30 split. In dependency
overviews the camera fits the existing coordinates into the usable canvas using
perspective bounds and the space occupied by the controls. This reduces empty
space without changing the published layout or module positions.

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

In Connection at overview distance, directed cross-family proof dependencies are aggregated
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

The standalone Conjectures and research dossier pages present open questions.
They use the digest-verified Library snapshot bound to the Atlas graph, Truth
release and source commit.
`Problems/*.md` supplies question titles, triage and `motivation_gids`; these
authored links identify released foundations, not new proof dependencies.
All source dossiers remain listed, including those with missing graph anchors.
Legacy Atlas question links open the corresponding standalone dossier when they
contain a valid problem slug, or Conjectures otherwise. The homepage exposes
exactly three mathematical graph views.

Module `state=open` means an unfinished module. It does not establish a
mathematical open problem: the release also contains engineering frontier
modules such as PaperGenerator and ValuesProducer. These remain in the source archive and advanced workspace; they are excluded
from the mathematical Atlas unless supported by the published proven catalog.
Closed foundations can support an open research question. A missing, corrupt or
mismatched catalog reports unavailable research and never falls back to guessing from module status.

No question markers or authored research associations are drawn in the three
homepage graph views. Dossiers retain their released foundations, missing bridges
and proposed approaches.

No Topology contract extension is required. Topology
continues to supply proof structure; authored research classification comes from
the release's source catalog and must not be inferred by topology metrics.

## Startup performance

`tools/build_atlas_startup.mjs` precomputes Connection and admitted DAG positions.
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
