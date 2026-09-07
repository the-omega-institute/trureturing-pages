# Architecture and release evolution

The Dependencies mode in `atlas.html` exposes the architecture of the published
module dependency DAG. `evolution.html` tracks the same node identities across
verified release observations. Both use the shared dark Pages theme and real
release data. The Wiki links each concept to its evolution workspace.

## Ownership and metrics

Truth owns the graph and its identities. The current exporter declares
`dependency_granularity: module-import`: one node is a released module, not an
individual Lean theorem application. External Mathlib foundations are not nodes
in the current Pages graph. Counts therefore measure recorded module reuse,
not mathematical importance or theorem-use frequency.

Topology already supplies `out_degree`, `descendant_count`, and `true_depth`.
`architecture-core.mjs` validates these counters against the directed graph when
present, and summarizes the released descendant sets by their source `domain`.
This domain summary is Pages-derived, not an additional certified Topology field.
No upstream contract, package version, source graph bytes, or proof edge changes.

| Metric | Definition |
| --- | --- |
| Direct reuse | Number of distinct immediate dependent modules |
| Downstream support | Number of distinct reachable dependents, excluding self |
| Domain coverage | Number of different source domains among those dependents |
| Dependency depth | Longest path from an in-graph root |
| Support share | Downstream support divided by all other modules in that observation |

Diamonds and duplicate imports do not double-count descendants. Affinity,
Blueprint, narrative, and proposed edges do not enter these metrics. Cyclic input
and disagreements with published counters fail closed. Source domains are used
directly; the eight editorial display families do not change the measurements.

The default node weight is logarithmically compressed downstream support. Users
can switch to direct reuse or domain coverage. Each metric preserves the same
coordinates. The architecture layout retains family color and horizontal anchors,
with an exact depth axis (roots above dependent layers). Display drag offsets are
kept separately for Structure and Dependencies and never enter the archive.

The selected node's Architecture tab provides domain distribution, explicit
shortest dependency paths to downstream modules, and evolution observations.
The ranking retains all modules in an expandable list.

## Release archive

After the final Atlas is verified, the Pages workflow runs:

```bash
node tools/build_architecture_history.mjs \
  _site/data/pages-atlas-view.v1.json \
  _site/data/pages-atlas-manifest.v1.json _site \
  https://the-omega-institute.github.io/trureturing-pages/
```

The builder checks the exact source graph hash and truth-release binding. It
retrieves the previously deployed `data/architecture-history.v1.json`, verifies
each referenced snapshot, copies those immutable bytes into the next deployment,
and appends the new observation. Snapshot paths are content-addressed:
`data/architecture/<sha256>.json`. The index is written atomically last.

Identical rebuilds do not append another observation. Reverting to an earlier
archived snapshot is rejected. HTTP errors other than a missing initial manifest,
missing snapshot files, hash mismatches, unsafe paths, and invalid metrics stop
the build rather than resetting history. The existing deployment freshness and
source ancestry gate still governs publication. A first deployment without this
archive starts a baseline; previous, unarchived metrics are not reconstructed
from current data or inferred from commit dates.

Without a previous-deployment URL, the builder preserves the archive already in
the output directory. `tools/serve_atlas.py` uses this mode, so local restarts are
idempotent. Generated snapshots live in ignored preview/build output, not source.

The index and snapshots use `pages-architecture-history.v1` and
`pages-architecture-snapshot.v1`. Each snapshot includes:

- Truth release, source commit, and exact Atlas graph digest.
- Metric profile `module-architecture-v1` and `module-import` granularity.
- Topology algorithm and algorithm/Atlas profile digests.
- Node identity, title, source domain, state, role, and architectural metrics.
- Full domain distribution and the release domain count.

Observation order is publication order, not wall-clock time. A reanalysis of the
same truth release may be a new observation; the UI reports both observations
and distinct truth releases. No synthetic timestamps are assigned.

## Reading evolution

Evolution now opens the dependency lineage canvas, with a separate across-release
view, domain expansion, release playback and a module inspector. The curves and
rankings below remain inspector details. Content revisions live in Library and
source-backed questions live in Research. See [Living knowledge](LIVING_KNOWLEDGE.md)
for continuity, compression, old-link compatibility and evidence boundaries.

The evolution workspace searches the union of all archived node IDs, including
retired nodes. It offers direct reuse, downstream support, and domain coverage
curves, a release scrubber, exact observation details, and an accessible table.
Release-share mode normalizes reuse/support by other modules and domain coverage
by that release's total domain count.

Missing nodes are gaps, never zero-valued measurements. Appearance and retirement
are explicit events. A metric profile, dependency granularity, Topology algorithm,
or analysis-profile change breaks the curve and suppresses cross-boundary deltas.
Baseline observations have no invented previous value. A single snapshot is one
point with a disabled scrubber. Hash/release failures show an error instead of a
plausible but unverified trajectory.

Identity currently follows the exact release node ID. Renames without an explicit
upstream stable-identity mapping appear as retirement and addition; titles never
silently merge nodes. Fourier, golden-ratio and Zeckendorf concept-group membership
must eventually come from a reviewed upstream mapping, not keyword matching.
Group reach will require a union of descendant sets, not a sum of module counts.

Persistence, mathematical fixed points and semantic identity are distinct. These
plots expose candidates for stable foundations; they do not establish a theorem
about invariance or assign a universal importance score. Future declaration-level
dependencies belong in Truth, and new canonical structural metrics belong in
Topology before Pages presents them.

## Verification

```bash
node --test tests/js/architecture.test.mjs
node tests/browser/architecture.cjs
```

The browser suite uses the actual release for 3D rendering, rankings, Zeckendorf
metrics, dependency paths, deep links, and desktop/mobile canvas-pixel checks.
Multi-release fixtures are intercepted inside the test browser only; they test
growth, normalization, profile boundaries and corrupted-history rejection and
are never written into the published archive.
