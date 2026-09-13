# Claim double-check (open-problems verify/review)

An independent re-check of every claimed-solved open problem. It exists so that
"we solved it" is never a single boolean: each claim carries four states that are
recorded separately.

| state | question it answers | how it is checked |
| --- | --- | --- |
| `formal_verification` | Does Lean actually prove the cited declaration, with a clean axiom closure? | An **independent Lean run** (`#print axioms <decl>`) over the fixed source commit; the closure must lie within `{propext, Classical.choice, Quot.sound}` with no `sorryAx` / native axioms. Not read back from the release marker. |
| `literature_source` | Does the cited source resolve? | Fetch the `source_url` and record the HTTP status and final URL. |
| `statement_fidelity` | Does the Lean statement faithfully cover the cited problem (no domain narrowing, no assumption-smuggling, no degenerate definitions)? | Adversarial `sshx` review. Machine-unverified until a verdict is recorded. |
| `in_truth_release` | Is the resolution in the deployed truth release? | The frozen-node attestation carried by the resolution. |

Output: `site/assets/claim-audit.v1.json` (schema `pages-claim-audit.v1`).

## Why the Lean run is independent

The frozen state pins (`Golden/Frozen/state/<module>.lean.json`) store only a
`statement_id`; they do **not** store the axiom closure. Re-running `#print axioms`
therefore recomputes the closure from the proof term rather than trusting a marker,
which is what makes this a double-check.

## Running it

### 1. `formal_verification` — independent Lean re-run (on the Lean host)

The catalog gives, per resolution, the module path, declaration name and the
`source_commit` it was verified against. Frozen modules are byte-immutable, so any
base checkout that contains them reproduces the same closure.

Generate an aggregate verifier that imports every module and prints axioms for
every declaration:

```
# from research-catalog.json families: for each, FQN is usually
#   <module-with-slashes-as-dots>.<decl>
# but some modules namespace only to the parent directory — the assembler tries
# both, so emit `#print axioms <FQN>` for the module-path form and correct any
# `unknown constant` by dropping the final module segment.
```

Build the declarations' closure and run the verifier in the base tree on the Lean
host (Lean runs on mstudio1, not locally):

```
nyxid ssh exec --principal mstudio1 omega-m3-ssh '
  cd ~/Desktop/omega/trureturing && export PATH="$HOME/.elan/bin:$PATH"
  lake build $(sed "s#/#.#g" mods.txt)           # module targets; deps are cached
  lake env lean VerifyAudit.lean > print-axioms.txt 2>&1
'
```

`lake env lean` only elaborates the single verifier file against the prebuilt
oleans, so it is fast once the targets are built.

### 2. `literature_source`

Resolve each `source_url` and record status into a `lit-review.json` list of
`{id, resolves, http_status, final_url}`.

### 3. Assemble

```
make claim-audit AXIOMS=print-axioms.txt LITERATURE=lit-review.json PYTHON=/path/to/python
```

### 4. `statement_fidelity` (optional, adversarial)

Record `sshx` verdicts as a JSON list of `{id, status, reviewer, note}` and pass
`REVIEWS=verdicts.json`. Without it, fidelity stays `machine-unverified`.

## Scope

`formal_verification` and `literature_source` run without a human. The independent
full Lean re-run is a periodic deep check on the Lean host (the release's own
canonical Lean report is the authoritative per-freeze run). `statement_fidelity`
is the adversarial layer and is not automated.
