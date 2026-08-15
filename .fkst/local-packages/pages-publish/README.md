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
      │  pages_published      output read-only (schema + digest + counts + node count)
      ▼
departments/record          append a receipt line to site/data/publications.jsonl
```

## Fact-source discipline (engine §6)

Durable truth is only ever an explicit host filesystem file, never `<RT>/marks`
or `cache` (those are scratch). Concretely:

- **Inputs** are host facts: `content/source/source-snapshot.v1.blessed.json`
  (the pinned blessing) and `content/source/truth-graph.raw.v1.json` (the raw
  `dag-render` output it blesses). The projector binds the two: it recomputes
  `sha256(raw bytes)` and fails before writing unless it equals the blessing's
  `truth_graph_sha256`, so a wrong raw graph cannot be published under the digest.
- **Dedup key** is the source-derived `truth_graph_sha256`, re-read and re-compared
  every observe — so a wiped runtime root loses nothing and re-firing on an
  unchanged snapshot is a no-op.
- **The publication ledger** `site/data/publications.jsonl` is an append-only host
  filesystem fact (a durable receipt, not a runtime marker). `file.write` does not
  itself create a git commit — committing the ledger is a separate step — so it is
  an explicit host file, not a git-anchored fact.

`persistence_class = "stateless_adapter"`: no cross-tick agent state; each
`pipeline(event)` is an independent call whose only durable effects are the
regenerated output and the ledger.

## Reliability under at-least-once delivery

Reliable delivery is at-least-once, so every department is written to fail loud
and be idempotent (fkst never re-runs the projector to "repair" output):

- **act fails loud.** A nonzero projector exit or a failed read-only verify raises
  a Lua error, so the child exits nonzero and reliable delivery retries / dead-letters
  it. It never logs-and-returns, which would ack (and silently discard) a failed
  publication trigger.
- **record is idempotent and re-derives from host facts.** It re-reads the published
  output and requires it to still record the trigger digest (a superseded trigger is
  skipped, not recorded from the payload alone), then appends under `with_lock` only
  if the digest is not already in the ledger. A replay or concurrent record cannot
  write a duplicate receipt.
- **observe repairs corrupt output.** A corrupt/missing published projection is
  treated as absent so it is regenerated; only a corrupt *blessed input* fails closed.

## Pure logic

`core.lua` holds the pure functions (path derivation, digest validation, dedup
comparison, strict read-only verification, ledger dedup, receipt formatting) with
no host-authority calls; the departments are thin glue over it. `tests/core_test.lua`
unit-tests `core.lua`; graph structure is covered by `fkst-framework conformance`.

## Gates

```sh
FW=<fkst-substrate>/target/debug/fkst-framework
FKST_RUNTIME_ROOT="$(mktemp -d)" "$FW" test       --project-root . --package-root .fkst/local-packages/pages-publish
FKST_RUNTIME_ROOT="$(mktemp -d)" "$FW" conformance --project-root . --package-root .fkst/local-packages/pages-publish
```

Both are green as committed (32 unit tests; 7/7 conformance checks). The chain was
also smoke-run end-to-end with `fkst-framework run` against the real committed
inputs, asserting the failure and idempotency paths as well as the happy path:
the raw-vs-blessed digest bind rejects a tampered raw, act exits nonzero (and does
not raise) when the projector fails, observe no-ops on the already-published
snapshot, a double `pages_published` delivery yields exactly one receipt, and a
superseded trigger is skipped.
