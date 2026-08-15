# Deprecated L2 substrate

This repository was previously created as an L2 reasoning substrate. That was the wrong responsibility for `trureturing-pages`: the repository is now the public static presentation site and must only read frozen trureturing truth.

The following paths belong to the superseded substrate and are deprecated:

- `schemas/`
- `tools/`
- `docs/HASHING.md`
- `docs/RUNBOOK.md`
- `artifacts/`
- `results/`
- `staging/`

Do not extend these paths as part of the pages architecture. They remain in place in this change so the transition is reversible; actual deletion is TBD.

**Reclaimed by the publication lifecycle (no longer deprecated):** `lib/truthgraph_project.py` is the active projector, `content/source/` holds the committed blessed input host facts, and `.fkst/local-packages/pages-publish/` is the real fkst host package (see the top-level README). The old `.fkst/local-packages/trureturing-reasoning/` L2 stub has been **deleted** and the `trureturing-pages` deployment now references `pages-publish`. `tests/` retains active contract fixtures alongside any residual L2 tests.
