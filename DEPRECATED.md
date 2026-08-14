# Deprecated L2 substrate

This repository was previously created as an L2 reasoning substrate. That was the wrong responsibility for `trureturing-pages`: the repository is now the public static presentation site and must only read frozen trureturing truth.

The following paths belong to the superseded substrate and are deprecated:

- `lib/`
- `schemas/`
- `tools/`
- `tests/`
- `docs/HASHING.md`
- `docs/RUNBOOK.md`
- `content/`
- `artifacts/`
- `results/`
- `staging/`
- `.fkst/local-packages/trureturing-reasoning/`

Do not extend these paths as part of the pages architecture. They remain in place in this change so the transition is reversible.

Actual deletion is TBD. Treatment of the pages host package in the deployments repository is also TBD and must be decided separately; this repository change does not modify deployments.
