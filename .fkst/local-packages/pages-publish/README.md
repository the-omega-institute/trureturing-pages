# pages-publish

`pages-publish` is the repository-local FKST lifecycle for the pages organ. It keeps
`site/data/truth-graph.v1.json` aligned with the local blessed input through an
`observe → act` event chain. It never authors upstream truth.

## Boundary

```text
fkst-ops / FKST engine
    generic events, delivery, execution, files, and locks

pages-publish Lua
    pages-local event routing, paths, dedup, and publication receipt

Trureturing.Pages.Core / Cli
    pages-local projection semantics and atomic output installation
```

Lua does not parse or validate the truth-graph projection schema. The repository-local
C# CLI owns input dialects, duplicate-member rejection, raw/blessing/trigger digest
binding, deterministic projection, DAG count closure, input-race revalidation, and
atomic install.

## Event chain

```text
raisers/blessed_input.lua
    pages_snapshot_seen { path }
        ↓
departments/observe
    compare local blessed digest with the local published artifact
        ↓
departments/act
    exec_argv → local Trureturing.Pages.Cli project
    confirm a non-empty local output
    append an idempotent local publication receipt
```

`act` is terminal. It rechecks the local blessing before and after the C# call and
again inside the receipt lock, so a superseded event is never recorded as current.
The C# CLI independently rechecks both input files before installing the projection.

## Facts and recovery

- input: `content/source/source-snapshot.v1.blessed.json`;
- raw graph: `content/source/truth-graph.raw.v1.json`;
- output: `site/data/truth-graph.v1.json`;
- publication history: `site/data/publications.jsonl`;
- local CLI project: `src/Trureturing.Pages.Cli`.

The runtime root contains no authoritative business state. A wiped runtime can recover
by rereading these local files and replaying the event.

## Gates

Repository CI covers:

- strict C# Release build and projector tests;
- repository-local FKST architecture tests;
- the existing Python projector, contract, and fail-closed tests as migration oracles.

The previous FKST package measurements were taken before the Lua cutover. Before this
cutover merges, rerun the exact engine's package `test`, `conformance`, and a real
`run` smoke. Until those measurements are attached, this PR should remain Draft and
must not claim deployment readiness.
