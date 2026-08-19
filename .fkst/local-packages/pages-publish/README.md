# pages-publish

`pages-publish` is the repository-local FKST lifecycle for the pages organ. It keeps
`site/data/truth-graph.v1.json` aligned with the local blessed input through an
`observe → act` event chain. It never authors upstream truth.

## Boundary

```text
fkst-ops / FKST engine
    generic events, delivery, execution, files, and locks

CI / preflight
    builds the pages solution in Release

pages-publish Lua
    pages-local event routing, paths, dedup, and publication receipt
    invokes the prebuilt local C# DLL

Trureturing.Pages.Core / Cli
    pages-local projection semantics and atomic output installation
```

Runtime Lua never calls `dotnet run`, restore, or build. A missing prebuilt DLL is a
fail-loud deployment/preflight defect. Lua does not parse or validate the projection
schema. The C# CLI owns input dialects, duplicate-member rejection, raw/blessing/trigger
digest binding, deterministic projection, per-state count closure, duplicate-GID
rejection, input-race revalidation, and atomic install.

## Event chain

```text
raisers/blessed_input.lua
    pages_snapshot_seen { path }
        ↓
departments/observe
    compare local blessed digest with the local published artifact
        ↓
departments/act
    exec_argv → dotnet <prebuilt local Trureturing.Pages.Cli.dll> project
    confirm a non-empty local output
    append an idempotent local publication receipt
```

`act` rechecks the local blessing before and after the C# call and again inside the
receipt lock. The C# CLI independently rechecks both input files before installing the
projection.

## Facts and recovery

- input: `content/source/source-snapshot.v1.blessed.json`;
- raw graph: `content/source/truth-graph.raw.v1.json`;
- output: `site/data/truth-graph.v1.json`;
- publication history: `site/data/publications.jsonl`;
- local executable: `src/Trureturing.Pages.Cli/bin/Release/net10.0/Trureturing.Pages.Cli.dll`.

The runtime root contains no authoritative business state. A wiped runtime can recover
after preflight rebuilds the solution and the event is replayed.

## Gates

Repository CI covers the strict C# build/projector tests, repository-local architecture
tests, and existing Python migration oracles. The previous FKST package measurements
were taken before this Lua invocation change. Before this PR merges, rerun the exact
engine's package `test`, `conformance`, and a real `run` smoke. Until those receipts are
attached, keep the PR Draft and make no deployment-readiness claim.
