# pages-publish

The `pages-publish` host package is the pages organ's fkst lifecycle: it keeps
the public DAG view (`site/data/truth-graph.v1.json`) in sync with the blessed
`source-snapshot.v1` the repo pins, as an `observe → act` event chain. It is a
read-and-project consumer — it never authors upstream truth.

## Event chain

```
raisers/blessed_input.lua   file_watch content/source/source-snapshot.v1.blessed.json
      │  pages_snapshot_seen { path }
      ▼
departments/observe         compare blessed truth_graph_sha256 vs the digest the
      │                     published site/data already records; raise only on a
      │  pages_reproject     difference (dispatch folded in — one action/snapshot)
      ▼
departments/act (terminal)  regenerate site/data/truth-graph.v1.json, verify it
                            read-only, and append a publication receipt — the
                            publish and its durable record are one atomic step
```

`act` is terminal: the publication **and** its receipt happen in one department,
so the receipt is created atomically with the publication rather than by a
downstream lane re-reading mutable state (which would lose a receipt when a later
blessing supersedes the output before the lane runs).

## Fact-source discipline (engine §6)

Durable truth is only ever an explicit host filesystem file, never `<RT>/marks`
or `cache` (those are scratch). Concretely:

- **Inputs** are host facts: `content/source/source-snapshot.v1.blessed.json`
  (the pinned blessing) and `content/source/truth-graph.raw.v1.json` (the raw
  `dag-render` output it blesses). The projector binds the two — and the trigger:
  it recomputes `sha256(raw bytes)` and refuses to write unless it equals both the
  blessing's `truth_graph_sha256` and the event digest act passes in.
- **Dedup key** is the source-derived `truth_graph_sha256`, re-read and re-compared
  every observe — so a wiped runtime root loses nothing and re-firing on an
  unchanged snapshot is a no-op.
- **The publication ledger** `site/data/publications.jsonl` is an append-only host
  filesystem fact — publication *history*, not current state. `file.write` does not
  itself create a git commit; committing the ledger is a separate step.

`persistence_class = "stateless_adapter"`: no cross-tick agent state; each
`pipeline(event)` is an independent call whose only durable effects are the
regenerated output and the ledger.

## Reliability under at-least-once delivery

Reliable delivery is at-least-once, so act is written to fail loud, be idempotent,
and never mutate the live output under a stale trigger:

- **Fail loud.** A nonzero projector exit or a failed read-only verify raises, so the
  child exits nonzero and reliable delivery retries / dead-letters it — never a
  logged return that would ack (and silently discard) a failed publication.
- **Obsolete trigger → ack-drop.** If the blessing has already advanced past the
  event digest, act drops the trigger (the current blessing has its own trigger);
  retrying could not help, so this acks rather than dead-letters.
- **No phantom publish.** The projector is given the event digest and refuses to
  write unless the current raw bytes hash to it, so a mid-run input change cannot
  leave a superseding projection published under a stale trigger.
- **Idempotent, atomic receipt.** The ledger append is dedup'd by digest under
  `with_lock`, so a replay or concurrent act writes at most one receipt per digest,
  and a superseding publication keeps the earlier receipt (append-only history).
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
inputs, asserting the failure, idempotency, and race paths as well as the happy
path: act publishes and records atomically (one receipt), a double delivery yields
exactly one receipt, an obsolete trigger (digest ≠ current blessing) acks without
writing a receipt, the projector rejects a wrong expected digest and a tampered raw,
and act exits nonzero (writing no receipt) when the projector fails.
