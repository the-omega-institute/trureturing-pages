# Release-bound Atlas projection

## Purpose

Pages has one production projection seam between a verified truth-release view
and the browser:

```text
verified truth release
        |
        v
pages-truth-release-dag.v1
        +
certified-topology.v1
        |
        v
Trureturing.Pages.Cli project-atlas
        |
        +--> data/pages-atlas-view.v1.json
        +--> data/pages-atlas-manifest.v1.json
        +--> data/certified-topology-view.v1.json
             byte-identical projection compatibility path
```

The deployment workflow temporarily installs the canonical bytes at the older
browser path as well. That install-time alias is outside the C# view contract and
will disappear once all browser clients move to the Atlas manifest.

The C# projector is the owner of the topology-to-Pages join. The legacy Python
`lib.certified_topology` module remains temporarily as a migration oracle and is
not invoked by the production Pages workflow.

## Authority boundary

The projection preserves five distinct classes.

1. The verified truth release owns node identity, mathematical state, proof
   dependencies, source commit, and source tree.
2. `certified-topology.v1` owns exact derived graph metrics.
3. Pages owns the read model and its presentation metadata.
4. A future `topology-atlas.v1` sidecar will own deterministic multiscale
   structural interpretation.
5. A future `pages-conformation.v1` sidecar will own coordinates and layout.

The projector does not calculate replacement topology metrics, infer proof
dependencies, or treat visual proximity as mathematical truth.

## Fail-closed binding

`project-atlas` rejects:

- a graph outside `pages-truth-release-dag.v1`;
- mixed truth-release coordinates;
- cycles or dangling references reported by Topology;
- unknown or duplicate topology fields;
- duplicate node identities;
- floating-point metric lexemes;
- non-reduced rational metrics;
- topology nodes absent from the Pages graph;
- Pages truth nodes absent from certified topology.

Topology nodes are joined by the exact `repo_path` identity used by the shared
Topology producer.

## Output contract

`pages-atlas-manifest.v1` binds:

- truth release and source Git coordinates;
- the exact input Pages graph digest;
- the exact certified-topology byte digest;
- the exact output atlas graph digest;
- the certified topology algorithm profile;
- the topology producer commit;
- the Pages projection profile;
- reserved nullable coordinates for the future Topology Atlas and Pages
  conformation artifacts.

The canonical browser read model is `data/pages-atlas-view.v1.json`.

## Next slices

The next Pages PRs consume the same manifest to add:

1. an in-graph Concept Lens and local two-dimensional dependency DAG;
2. deterministic release-bound conformation;
3. multiscale cluster rendering from `topology-atlas.v1`;
4. spatial comparison and CMA research context v2.
