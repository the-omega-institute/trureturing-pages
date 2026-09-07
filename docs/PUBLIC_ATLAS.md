# Public Mathematical Atlas

`site/atlas.html` is the public exploration surface. `site/dag.html` remains the
research workspace, including the original Topology Atlas, comparison, and CMA
integrations. The overview page now links to the public Atlas.

Dependencies now provides an architecture view weighted by downstream support,
direct reuse, or source-domain coverage. Node inspection exposes domain-specific
dependency paths and verified release observations. `site/evolution.html` is the
full evolution workspace. See [Architecture evolution](ARCHITECTURE_EVOLUTION.md)
for metric definitions, archive preservation, and comparison boundaries.

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

The public view groups mathematical nodes into eight editorial concept families.
The mapping uses the existing `domain` field. Within a family, repository
subtopics provide anchors and real dependency edges pull connected concepts
together using vendored `d3-force-3d`. The deterministic simulation runs in a Web
Worker and stops before rendering. Family positions are editorial composition,
not a metric of inter-family similarity. The About dialog states this boundary.

The overview shows mathematical nodes and certified dependencies. Selecting a
concept adds its documents and structural connections. Proof, affinity, document,
advisory, and authored relationships remain separately classified; topic membership
never creates a proof edge. Source graph bytes and the release binding are checked
against `pages-atlas-manifest.v1` before display.

Three.js, through `3d-force-graph`, renders the structure. The user can orbit,
zoom, drag nodes, search across families, enter a family, and inspect the full
proof lineage and its associated concepts/documents. The default retains surrounding
context. Direct, two-hop, and full-lineage ranges and relationship-type filters
allow focused exploration without a fixed node-count cap. Full lineage traverses
all proof ancestors and descendants, then adds non-proof relations incident to
that lineage; it does not recursively expand similarity across the entire corpus.
Scope, types, and context are retained in shareable URLs.
Dragging records a temporary display offset. Filtering and
selection preserve the other coordinates. No simulation runs on node selection.

The right-hand Wiki reuses the existing Concept Lens core for authored summaries,
theorems, facts, documents, and provenance. Connections distinguish prerequisites
from consequences and support continuous navigation. Mobile selection reduces
the graph viewport and opens the Wiki in a bottom sheet. There is no CMA write
path in the public experience; each concept links to related Research dossiers.
The advanced console remains available at `dag.html`. See
[Living knowledge](LIVING_KNOWLEDGE.md) for the four-view information architecture.

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

## Local preview

```bash
python3 tools/serve_atlas.py --port 8765
```

Open `http://127.0.0.1:8765/atlas.html`. The server caches the current public
release under the ignored `artifacts/atlas-preview/data/` directory and verifies
its hashes. It serves current local source without changing committed truth
data. The server also generates the Library and current/immutable Wiki pages from
the verified release, so concept navigation stays on the local preview. The original view is available at
`http://127.0.0.1:8765/dag.html` for comparison.

To refresh the preview release, remove only the cached
`artifacts/atlas-preview/data/` directory and restart the server. If port 8765 is
occupied, pass a different `--port`.

## Verification

```bash
node --test tests/js/*.test.js tests/js/*.test.mjs
```

Browser verification requires `playwright`, `pngjs`, and a local Chrome binary.
With those packages available to Node and the preview server running:

```bash
node tests/browser/atlas-public.cjs
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

## Remaining design work

This is a first public presentation, not a replacement for upstream topology.
The eight families and fallback classification should be reviewed by a domain
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
