# trureturing-pages

`trureturing-pages` is the public, read-only static presentation site for trureturing. Its first version presents three views:

- DAG status
- the theory volume
- selected important conclusions

The site is plain HTML, CSS, and client-side JavaScript. It has no build step in this repository skeleton.

## Truth boundary

The site only consumes manually approved, frozen truth from trureturing, represented by a `source-snapshot.v1` input. It must not become a second source of truth: prose, node state, conclusions, and provenance stay owned by the frozen upstream snapshot.

**Real truth is now injected.** `site/data/truth-graph.v1.json` holds the real projected DAG (670 kernel-frozen / 12 open nodes) for the blessed `source-snapshot.v1` at `trureturing@90059eb` (`synthetic: false`, real provenance). The projection is a deterministic, read-only step in [`lib/truthgraph_project.py`](lib/truthgraph_project.py) — it does not edit or re-author upstream truth. (The `theory/` renderer still uses smoke-test fixtures.)

## Site layout

```text
site/
|-- index.html                  # overview and snapshot metadata placeholders
|-- dag.html                    # filterable DAG status view
|-- conclusions.html            # curated conclusion slots
|-- theory/
|   |-- index.html              # index of the 11 upstream theory documents
|   `-- render.html             # client-side Markdown rendering shell
|-- assets/
|   `-- style.css               # minimal shared presentation styles
`-- data/
    |-- truth-graph.v1.json     # real projected DAG (670 closed / 12 open @90059eb)
    `-- theory/
        `-- _example.md         # renderer smoke fixture only
```

Open `site/index.html` to inspect the navigation and static skeleton. Pages that fetch data, such as the DAG and Markdown renderer, should be served by any simple local static HTTP server because browsers commonly restrict `fetch()` from `file://` pages.

## Deferred decisions

- Real `source-snapshot.v1` projection + injection is **done** (`lib/truthgraph_project.py`, deterministic, tested); automated re-selection when a new snapshot is blessed is not yet scripted.
- The `highlights.v1` (conclusions) contract is TBD.
- Large theory-document delivery, including chunking or lazy loading for `PZG_BEDC.md`, is TBD.
- The production Markdown library and vendoring policy are TBD.
- Deployment to GitHub Pages or another static host is TBD.
- Exact visual design and branding are TBD.

The previous L2 reasoning substrate is retained temporarily for reversibility. See [`DEPRECATED.md`](DEPRECATED.md); it is not part of the new site architecture.
