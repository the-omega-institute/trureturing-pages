# trureturing-pages

`trureturing-pages` is the read-only static presentation organ for trureturing. Its first version presents:

- DAG status
- the theory volume
- selected important conclusions

The public site remains plain HTML, CSS, and client-side JavaScript.

## Truth boundary

The site consumes an explicit, content-addressed upstream input and never becomes a second source of mathematical truth. The currently pinned input is `source-snapshot.v1` plus its raw truth graph. The intended successor is the shared `truth-release.v1` intake.

`site/data/truth-graph.v1.json` currently presents the real projected DAG for the blessed `trureturing@90059eb` snapshot. Projection is deterministic and read-only. The production implementation is repository-local C#:

```text
src/Trureturing.Pages.Core
    strict input parsing, digest binding, projection, atomic install

src/Trureturing.Pages.Cli
    local project command

.fkst/local-packages/pages-publish
    local observe → act lifecycle and publication receipt
```

The former Python projector remains temporarily as a migration oracle. It is no longer the intended production path after the C# cutover.

## FKST boundary

`fkst-ops` and the FKST engine know only generic deployment, package, event, delivery, lock, and process mechanics. Pages-specific event names, paths, CLI invocation, output, and publication history are owned by this repository's local package. Cross-organ information arrives only through explicit content-addressed files.

## Publication lifecycle

The repository-local package [`.fkst/local-packages/pages-publish`](.fkst/local-packages/pages-publish/README.md) is an `observe → act` chain:

1. observe reads the local blessing and current local projection to decide whether work is needed;
2. act invokes `Trureturing.Pages.Cli project` through shell-free `exec_argv`;
3. the C# CLI validates the input dialects and digests, projects deterministically, rechecks that inputs did not move, and atomically installs the output;
4. Lua records the publication idempotently in `site/data/publications.jsonl`.

## Site layout

```text
site/
|-- index.html
|-- dag.html
|-- conclusions.html
|-- theory/
|   |-- index.html
|   `-- render.html
|-- assets/
|   `-- style.css
`-- data/
    |-- truth-graph.v1.json
    `-- theory/
        `-- _example.md
```

## Deferred decisions

- migrate the pinned old snapshot to a fresh shared truth release;
- define the `highlights.v1` conclusions contract;
- deliver the large theory documents efficiently;
- select and vendor a production Markdown library;
- choose the static hosting target;
- finalize visual design and branding.

The previous L2 reasoning substrate is retained temporarily for reversibility. See [`DEPRECATED.md`](DEPRECATED.md); it is outside the current site architecture.
