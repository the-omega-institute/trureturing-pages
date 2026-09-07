# trureturing-pages

`trureturing-pages` presents a living, release-bound mathematical knowledge system:

- Explore: the spatial Atlas and concept-family structure.
- Library: concept Wiki, authored content, and immutable release versions.
- Evolution: dependency lineage and changes across verified releases.
- Research: source-backed questions, missing bridges, proposed routes, and development activity.

The site is plain HTML, CSS, and client-side JavaScript. It has no frontend build step.

## Public Atlas preview

`site/atlas.html` is the public concept-family view with a 3D graph and concept
Wiki. `site/dag.html` retains the advanced analysis console. To preview against a
verified copy of the current published release, run:

```bash
python3 -m venv /tmp/pages-venv
/tmp/pages-venv/bin/pip install -r requirements.txt
/tmp/pages-venv/bin/python tools/serve_atlas.py --port 8765
```

Open `http://127.0.0.1:8765/atlas.html`. See [Public Atlas](docs/PUBLIC_ATLAS.md)
for the visualization decisions, local-data boundary, and verification commands.
The preview generates the Library and all concept Wiki pages locally, including
complete relationship maps and the shared site theme. Open
`http://127.0.0.1:8765/knowledge/` to browse them.
The Dependencies mode ranks architectural support and cross-domain reuse.
`http://127.0.0.1:8765/evolution.html` tracks verified release observations; the
publication workflow preserves historical snapshots across deployments. See
[Architecture evolution](docs/ARCHITECTURE_EVOLUTION.md) for metric scope and
the distinction between module imports and theorem-use counts. Preview startup
requires Python 3, Node.js 20 or later, and the sibling `trureturing` checkout
containing the published source commit. Research is generated at `research.html`;
content history is at `library-history.html`. See [Living knowledge](docs/LIVING_KNOWLEDGE.md)
for the two update clocks, archive format, research evidence boundaries, and tests.

## Truth boundary

The site only consumes manually approved, frozen truth from trureturing, represented by a `source-snapshot.v1` input. It must not become a second source of truth: prose, node state, conclusions, and provenance stay owned by the frozen upstream snapshot.

**Real truth is now injected.** `site/data/truth-graph.v1.json` holds the real projected DAG (670 kernel-frozen / 12 open nodes / 669 dependency edges) for the blessed `source-snapshot.v1` at `trureturing@90059eb` (`synthetic: false`, real provenance). Every real closed/open/tail Lean node and every edge between those nodes is retained. Nodes carry tower layer and domain grouping derived from their GID path. The projection is a deterministic, read-only step in [`lib/truthgraph_project.py`](lib/truthgraph_project.py) — it does not edit or re-author upstream truth. (The `theory/` renderer still uses smoke-test fixtures.)

## Publication lifecycle (fkst host package)

The projection is driven by a real fkst host package, [`.fkst/local-packages/pages-publish`](.fkst/local-packages/pages-publish/README.md): an `observe → act` chain that watches the pinned blessed input (`content/source/source-snapshot.v1.blessed.json` + `content/source/truth-graph.raw.v1.json`), reprojects `site/data/` only when the blessed `truth_graph_sha256` differs from what the site already publishes, verifies the output read-only, and appends a receipt to the append-only host-file ledger `site/data/publications.jsonl` — publish and record are one atomic step. The chain is written for at-least-once delivery: act fails loud on projector/verify failure (so it retries, never silent-acks), acks and drops a trigger superseded by a newer blessing, refuses to publish a stale projection (the projector is bound to the event digest), and records idempotently. It passes `fkst-framework conformance` (7/7) and `test` (32 unit tests over the pure logic). This replaces the earlier `trureturing-reasoning` stub.

## Site layout

```text
site/
|-- index.html                  # overview and live snapshot metadata
|-- dag.html                    # interactive 3D dependency DAG
|-- conclusions.html            # curated conclusion slots
|-- theory/
|   |-- index.html              # index of the 11 upstream theory documents
|   `-- render.html             # client-side Markdown rendering shell
|-- assets/
|   |-- dag.js                  # graph loading, layout, filtering, and focus controls
|   `-- style.css               # shared presentation and graph workspace styles
`-- data/
    |-- truth-graph.v1.json     # real projected DAG (682 nodes / 669 edges @90059eb)
    `-- theory/
        `-- _example.md         # renderer smoke fixture only
```

Serve `site/` with any simple local static HTTP server to inspect the site because browsers commonly restrict `fetch()` from `file://` pages. The DAG is rendered by a dependency-free SVG view, so it has no runtime CDN dependency. Nodes are enriched during the Pages workflow by joining `trureturing/Blueprint` at `dev`: Blueprint H1/Abstract/theorem fields are copied when present and all other nodes receive a domain-prefixed path label.

Until the upstream publication exists, the exact `certified-topology.v1` consumer is exercised
against `tests/fixtures/certified-topology.v1.json`. The fail-closed adapter validates the input
against the vendored upstream schema, preserves integers and gcd-reduced rationals, and enriches
the existing DAG rather than reconstructing metrics:

```bash
python -m lib.certified_topology site/data/truth-graph.v1.json \
  certified-topology.v1.json site/data/certified-topology-view.v1.json
```

The renderer prefers that generated view when present and otherwise keeps serving the current
truth-graph projection.

## Vertical deployment smoke

`Deploy truth-release DAG to GitHub Pages` accepts a `truth_release_digest` dispatch input.
Use `mock` (the default) for the committed seven-artifact fixture. A real digest resolves
the immutable release mirror produced by base PR #3346. The workflow verifies the bundle,
renders the basic DAG, runs the exact `Trureturing.Topology` `0.2.0-alpha.1` NuGet package,
renders the enriched DAG through the Python consumer, enforces monotonic freshness, writes
the deployment manifest, and deploys the unified site artifact.

See [`docs/VERTICAL_SMOKE.md`](docs/VERTICAL_SMOKE.md) for the package invocation choice,
security bounds, freshness rule, package authorization gate, and measurement procedure.

On an explicit dispatch, `.github/workflows/pages.yml` builds and uploads the unified site
state and deploys it with the official GitHub Pages actions. Repository Pages settings must
select GitHub Actions as the source before the deployment can publish at
`https://the-omega-institute.github.io/trureturing-pages/`.

## Deferred decisions

- Real `source-snapshot.v1` projection + injection is **done** (`lib/truthgraph_project.py`, deterministic, tested); a newly delivered blessed upstream snapshot is the remaining data input.
- The `highlights.v1` (conclusions) contract is TBD.
- Large theory-document delivery, including chunking or lazy loading for `PZG_BEDC.md`, is TBD.
- The production Markdown library and vendoring policy are TBD.

The previous L2 reasoning substrate is retained temporarily for reversibility. See [`DEPRECATED.md`](DEPRECATED.md); it is not part of the new site architecture.


## Verified release DAG consumer

The next-generation C# consumer is intentionally separated from the upstream wire. An
upstream adapter, which is still pending and is not wired in this repository, will verify a
`truth-release.v1` bundle and emit the Pages-owned
`pages-truth-release-port.v1`. The Pages core then builds:

- a repository/module topology layer;
- an exact frozen-proof prerequisite layer;
- bounded per-node neighborhood artifacts;
- release-to-release learning deltas;
- an optional, visibly advisory Intuition overlay.

The port and projector live under `src/Trureturing.Pages.Core`; the CLI lives under
`src/Trureturing.Pages.Cli`. See [`docs/TRUTH_RELEASE_CONSUMPTION.md`](docs/TRUTH_RELEASE_CONSUMPTION.md).
The legacy Python projection remains a migration oracle until the upstream adapter is
wired, and it does not own the new consumption contract.
