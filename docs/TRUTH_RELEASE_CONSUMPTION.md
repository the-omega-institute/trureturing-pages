# Truth-release consumption boundary

`trureturing-pages` consumes existing publications and owns their presentation.
`lib.upstream_publication` selects an upstream report whose existing verification
gates succeeded, runs the existing read-only exporter at that source revision,
and preserves a digest-addressed Pages report projection. Native release bundles
remain supported. Pages does not change upstream report, publication, release,
CI, required-check or artifact contracts.

`lib.vertical_smoke.verify_bundle` checks the exact artifact set, SHA256SUMS,
release digest, manifest/publication/source identities and artifact bytes. Report
projections additionally bind report provenance, source commit/tree and the
existing verification gates. `project_basic_dag` retains every source truth node,
document and relation. C# projection validates the complete certified Topology
before enriching that graph. Source graph bytes, release digests and certified
full-topology counters are never rewritten to fit a filtered presentation.

## Mathematical Atlas admission

`lib.atlas_admission` derives a Pages-only evidence file from the verified bundle.
The current supported contracts are `stratalint.truth-export.v2` and
`stratalint-raw-lean-report-v3`. A mathematical module must have:

- membership in the published proven catalog, with status `frozen` or
  `proven-not-yet-frozen`;
- at least one published declaration, including verified definitions;
- an explicit node axiom closure contained in `propext`, `Classical.choice`,
  `Quot.sound` (the empty closure is valid);
- exact export/report agreement on every full declaration name key, declaration
  kind and statement ID, with complete included-declaration membership;
- per-declaration axiom and type-hash receipts, a module source hash, and a node
  axiom union matching **all** reported declarations, including auxiliaries.

Missing evidence excludes a module with an explicit reason. Contradictory source,
statement, membership or axiom evidence rejects projection. Neither `Closed` nor
a `.lean` filename establishes admission. Freezing is recorded independently of
proof status. Definition-only modules remain visible without being called
verified theorems. Empty export nodes are excluded as having no published
statement content, with their identities preserved in the evidence inventory.

The gate is uniform in initial load, search, selection, family, frontier, theory,
component and direct-node navigation. The mathematical graph is the induced
module-import graph on admitted nodes. Blueprint prose and document links remain
available as explanations in the Wiki; they do not expand the mathematical DAG.
Advisory, affinity, document and arbitrary `certified` labels cannot create an
import edge. Node prerequisite content addresses arise from module adjacency;
they do not establish declaration-to-declaration proof use.

## Declaration measurements

Both native bundles and Pages report projections can carry optional `libraries`
and `axioms` arrays on each `stratalint.truth-export.v2` declaration row. Pages
binds them to the same name key, kind and statement ID used for admission and
retains them in the declaration's `measurement` object in the lazy Atlas
details. Empty arrays are explicit measurements. Missing arrays are unknown.
The separate Lean report axioms remain available as report evidence.

The Atlas shows **Omega only · zero axioms** for a declaration with a nonempty
library list containing only `OmegaInit` or `OmegaMath` and an explicitly empty
axiom list. The arrays determine the badge, even when the producer's optional
`omega_only_axiom_free` marker is absent. The measurements describe the statement
at the last frozen statement pin and can differ across release snapshots.

A frozen declaration may also include `strict_omega`, paired with the official
measurement. The six fields are `declaration_name_key`, `kind`,
`statement_type_address`, `official_statement_type_address`, `libraries`, and
`axioms`. Both type addresses are canonical SHA-256 statement digests, and the
official address must match the verified Lean report receipt. The two arrays
are always present on a measured strict reading, including empty arrays and
mixed dependencies. The graph carries the same complete paired rows in
`strict_omega_declarations`. The release validator checks their correspondence
with the export and the Atlas validates each pair against the report before
publishing its declaration-detail shard. The Atlas labels the official and
strict Omega backend libraries and axioms independently. An absent strict
reading displays as unknown, and an empty measured array displays as ∅. The
strict backend receives its own measured zero-axiom badge only when its axiom
array is explicitly empty.

## Startup and statistics

`build_basic_site` writes `data/atlas-lean-evidence.v1.json` as a build input.
`tools/build_atlas_startup.mjs` verifies full source topology, binds this evidence
to the Atlas source snapshot, and publishes digest-addressed compact summaries
and lazy declaration-detail shards. It preserves the exact canonical graph
archive. The browser downloads the compact graph and layout for first paint;
no full graph, truth export, raw report or declaration shard is added to startup.
Full-archive startup applies the same content-addressed admission summary and
uses the same detail shards. The index-less compatibility path uses the bounded
admission summary; missing evidence is reported explicitly without guessing from
state labels.

The public Atlas computes filtered-view counts, depths, reach and components
separately from certified full-publication counters. Full-source consistency
checks run before this recomputation in both compact and archive startup. These
view statistics are not new certified upstream topology measurements. Release
history and advanced source views retain their full-publication scope.

The source-bound coverage audit for the publication inspected on 2026-10-30 is
recorded in [Public Atlas](PUBLIC_ATLAS.md#verified-publication-coverage-2026-10-30).
Exact declaration-use dependency edges remain unavailable in these contracts;
Pages makes no theorem-use claims and creates no substitute edges.
