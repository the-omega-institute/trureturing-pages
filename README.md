# trureturing-pages

`trureturing-pages` is the public, read-only static presentation site for trureturing. Its first version presents three views:

- DAG status
- the theory volume
- selected important conclusions

The site is plain HTML, CSS, and client-side JavaScript. It has no frontend build step.

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

Serve `site/` with any simple local static HTTP server to inspect the site because browsers commonly restrict `fetch()` from `file://` pages. The DAG uses the pinned `3d-force-graph` browser bundle from unpkg and degrades to a readable error state if the renderer or graph data cannot load.

After a change reaches `dev`, `.github/workflows/pages.yml` uploads `site/` and deploys it with the official GitHub Pages actions. Repository Pages settings must select GitHub Actions as the source before the deployment can publish at `https://the-omega-institute.github.io/trureturing-pages/`.

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
