# pages-publish

The `pages-publish` host package is the pages organ's fkst lifecycle: it keeps
the public DAG view (`site/data/truth-graph.v1.json`) in sync with the blessed
`source-snapshot.v1` the repo pins, as a minimal `observe → act → record`
event chain. It is a read-and-project consumer — it never authors upstream
truth.

## Event chain

```
raisers/blessed_input.lua   file_watch content/source/source-snapshot.v1.blessed.json
      │  pages_snapshot_seen { path }
      ▼
departments/observe         compare blessed truth_graph_sha256 vs the digest the
      │                     published site/data already records; raise only on a
      │  pages_reproject     difference (dispatch folded in — one action/snapshot)
      ▼
departments/act             run lib/truthgraph_project.py (deterministic) to
      │                     rewrite site/data/truth-graph.v1.json, then verify the
      │  pages_published      output read-only (digest + non-synthetic + counts closed)
      ▼
departments/record          append a receipt line to site/data/publications.jsonl
```

## Fact-source discipline (engine §6)

Durable truth is only ever a git-committed host file, never `<RT>/marks` or
`cache` (those are scratch). Concretely:

- **Inputs** are committed host facts: `content/source/source-snapshot.v1.blessed.json`
  (the pinned blessing) and `content/source/truth-graph.raw.v1.json` (the raw
  `dag-render` output it blesses, digest `truth_graph_sha256`).
- **Dedup key** is the source-derived `truth_graph_sha256`, re-read and re-compared
  every observe — so a wiped runtime root loses nothing and re-firing on an
  unchanged snapshot is a no-op.
- **The publication ledger** `site/data/publications.jsonl` is an append-only,
  git-committed host fact — the durable receipt, not a runtime marker.

`persistence_class = "stateless_adapter"`: no cross-tick agent state; each
`pipeline(event)` is an independent call whose only durable effects are the
committed output and ledger.

## Pure logic

`core.lua` holds the pure functions (path derivation, dedup comparison,
read-only verification, receipt formatting) with no host-authority calls; the
departments are thin glue over it. `tests/core_test.lua` unit-tests `core.lua`;
graph structure is covered by `fkst-framework conformance`.

## Gates

```sh
FW=<fkst-substrate>/target/debug/fkst-framework
FKST_RUNTIME_ROOT="$(mktemp -d)" "$FW" test       --project-root . --package-root .fkst/local-packages/pages-publish
FKST_RUNTIME_ROOT="$(mktemp -d)" "$FW" conformance --project-root . --package-root .fkst/local-packages/pages-publish
```

Both are green as committed (14 unit tests; 7/7 conformance checks). The chain
was also smoke-run end-to-end with `fkst-framework run` against the real
committed inputs: observe correctly no-ops on the already-published snapshot,
act reprojects `site/data` byte-identically and raises, record writes a receipt.
