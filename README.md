# trureturing-pages

`trureturing-pages` is the public, read-only static presentation site for trureturing. Its first version presents three views:

- DAG status
- the theory volume
- selected important conclusions

The site is plain HTML, CSS, and client-side JavaScript. It has no build step in this repository skeleton.

## Truth boundary

The site only consumes manually approved, frozen truth from trureturing, represented by a `source-snapshot.v1` input. It must not become a second source of truth: prose, node state, conclusions, and provenance stay owned by the frozen upstream snapshot. Any files under `site/data/` in this skeleton are synthetic fixtures or injection targets, not authoritative research content.

Real snapshot selection, content synchronization, validation, and injection are TBD. They should happen as a read-only publication step without editing or re-authoring upstream truth in this repository.

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
    |-- truth-graph.v1.json     # synthetic DAG fixture
    `-- theory/
        `-- _example.md         # renderer smoke fixture only
```

Open `site/index.html` to inspect the navigation and static skeleton. Pages that fetch data, such as the DAG and Markdown renderer, should be served by any simple local static HTTP server because browsers commonly restrict `fetch()` from `file://` pages.

## Deferred decisions

- The real `source-snapshot.v1` selection and content-injection workflow is TBD.
- The final `truth-graph.v1` and `highlights.v1` contracts are TBD.
- Large theory-document delivery, including chunking or lazy loading for `PZG_BEDC.md`, is TBD.
- The production Markdown library and vendoring policy are TBD.
- Deployment to GitHub Pages or another static host is TBD.
- Exact visual design and branding are TBD.

The previous L2 reasoning substrate is retained temporarily for reversibility. See [`DEPRECATED.md`](DEPRECATED.md); it is not part of the new site architecture.
