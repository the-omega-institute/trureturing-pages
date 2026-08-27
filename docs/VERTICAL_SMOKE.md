# Truth-release to Pages vertical smoke

The Pages deployment is one serialized, fail-closed state machine:

1. Acquire a digest-addressed release, or copy the committed `mock` fixture.
2. Reject unsafe archives, unexpected files, excessive sizes/counts, digest mismatches,
   publication/manifest rebinding, and malformed graph cardinalities.
3. Render `basic-truth-graph.v1.json` with Closed, Open, Tail, Semantic, Blueprint,
   dependency, narrative-reference, and truth-anchor data.
4. Run the tiny Pages-owned C# runner against the exact
   `Trureturing.Topology` `[0.1.0-alpha.1]` NuGet package and pinned algorithm profile.
5. Pass `certified-topology.v1.json` through the existing Python contract consumer to
   produce `certified-topology-view.v1.json`.
6. Bind both views in `deployment-manifest.v1.json`, compare it to the live manifest,
   upload one complete site artifact, and invoke the GitHub Pages deployment actuator.

The browser prefers the enriched view and falls back to the basic view only when the
enriched file is absent. CI and deployment never upload a partially enriched build: any
runner or consumer failure stops the single job before `upload-pages-artifact`.

## Topology invocation

The upstream CLI at tag `v0.1.0-alpha.1` is intentionally non-packable. Pages therefore
owns a small API adapter in `tools/Trureturing.Topology.Runner` rather than requiring a
second repository PR and a later package tag. The adapter calls the published library API:

`StrataLintTruthGraphReader -> TopologyBindings.FromAlgorithmProfile -> TopologyCalculator.Compute -> CertifiedTopologySerializer`

The package version is an exact NuGet range, `[0.1.0-alpha.1]`. Its producer commit is
`28375f4a25fec6fd4777da1d7a7b1b8a9e0d8f3b`. No topology source is vendored here.

## Monotonic deployment

The workflow's `github-pages-truth-release` concurrency group does not cancel in-progress
runs, so every freshness check immediately precedes its own deployment. The guard first
compares `release_digest`:

- the same digest and source identity is idempotent;
- a different digest for the same source commit is rejected;
- a different source must be a strict descendant of the deployed source commit according
  to the GitHub compare API;
- a lower topology version is always rejected.

The deployment manifest records `release_digest`, truth `source_commit`, truth
`source_tree`, `topology_version`, topology producer and algorithm-profile bindings, the
Pages commit/tree, both view paths, and the topology time/RSS measurement.

## Mock result and measurement

The committed release contains the exact seven artifact roles from base PR #3346 plus
`SHA256SUMS`, `release-manifest.v1.json`, and `truth-release-publication.v1.json`. Its
release digest is:

`sha256:6263c6c313abc29ca5b27309f30012c643794d07916d5d9ea0cf01b0ce7d8d20`

Local verification and the basic site projection pass with 4 truth nodes (one per state),
2 Blueprint nodes, 3 truth dependencies, and 3 Blueprint links. The package-backed step
is currently blocked locally by the expected GitHub Packages `403 Forbidden` access gate,
so no honest local time/RSS value is available yet. The deploy workflow measures the
prebuilt runner with GNU `time`, emits `elapsed_seconds` and `max_rss_kib`, and embeds both
in the deployed manifest. Record the first authorized CI values here before merge.

The mock is intentionally tiny. Re-measure runtime and peak RSS on the first real release;
the production graph and raw report may be orders of magnitude larger.

## Auth and real-data gates

The organization must grant `trureturing-pages` read access to the topology package.
`GITHUB_TOKEN` then supplies the least-privilege `packages:read` credential referenced by
`nuget.config`. A `401` or `403` is an authorization failure and must not be bypassed with
vendored source or an alternate feed.

Non-mock acquisition resolves the immutable GitHub Release mirror introduced by base PR
#3346. Until #3346 merges and publishes its first release, only the committed mock path is
expected to work.
