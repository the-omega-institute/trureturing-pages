# trureturing-pages

One repo, one concern: pages. Research bundles produced by the fkst reasoning pipeline belong in `content/research/<work_id>/`. Evidence chains belong in `artifacts/runs/<source_commit>/<node_gid>/<attempt>/`. `staging/` is for unaccepted drafts and is ignored by Git. `results/<work_id>.json` is the completion ledger.

## Contract map

The seven versioned JSON contracts live in `schemas/`: source snapshots, work items, candidates, machine verdicts, reviews, decisions, and run receipts. `tools/validate.py` is a dependency-free Python 3 validator for the schema subset used here.

## Tests

Run contract tests with `python3 -m unittest discover -s tests/contracts`. The Phase B behavior red skeleton is independent: `python3 -m unittest discover -s tests/red`.
