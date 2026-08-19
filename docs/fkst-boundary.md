# FKST boundary for trureturing-pages

The FKST framework is generic infrastructure. `fkst-ops` and the engine may know
about deployments, packages, events, delivery, locks, roots, and process execution.
They do not know what a theorem, formalization, truth graph, paper, or web page is.

The business boundary begins inside this repository:

```text
.fkst/local-packages/pages-publish/
    pages-specific Lua orchestration
        -> repository-local input files
        -> repository-local projector/CLI
        -> repository-local site output and publication receipt
```

The package must not read a sibling checkout, inspect the base frozen ledger, load a
base skill, call GitHub/network tooling, or teach `fkst-ops` a pages-specific action.
Cross-organ information arrives only as an explicit content-addressed input file. The
current input is the blessed snapshot plus its pinned raw truth graph; the intended
successor is the generic shared truth-release intake.

`Trureturing.Pages.ArchitectureTests` enforces the repository-local part of this
boundary. The existing Python projector remains only as the current behavior and
migration oracle. New production logic should be C#; Lua remains the thin local
lifecycle/orchestration layer.
