# Human Knowledge Map

## Ownership

`Trureturing.Topology` owns certified structural facts. This repository owns
their human presentation. The knowledge map does not recompute truth, infer
missing dependencies, or promote explanatory prose into mathematical
authority.

The deployed site has two complementary surfaces:

- `dag.html` is the interactive global dependency map;
- `knowledge/` is the static concept index and current per-node view;
- `release/<release-digest>/node/<node-hash>/` is an immutable per-release
  concept view.

The stable page key is `sha256(node.id)`. A title or repository path may evolve
without breaking the node URL inside one release coordinate.

## Build

`lib.human_labels` joins the exact Blueprint tree used for the release. When
the output graph lives under `<site>/data`, the same command invokes
`lib.knowledge_pages` and writes all static pages before the enriched graph is
published.

The release workflow checks out Blueprint at the truth release's exact source
commit. The graph, Blueprint exposition, and source links therefore share one
source coordinate.

## Authority layers

Every node page keeps three classes of information separate.

1. Certified structure: node status, dependency edges, topology depth, source
   commit and tree, truth-release digest, and repository path.
2. Authored exposition: Blueprint title, abstract, and theorem label.
3. Presentation fallback: a title derived mechanically from the repository
   path when no Blueprint exposition is available.

A fallback carries no additional mathematical authority. The page states this
boundary explicitly.

## Interaction

The interactive DAG keeps dependency direction top to bottom. Selecting a node:

- highlights its direct prerequisites and incoming arrows;
- lists direct prerequisites and dependents;
- updates a shareable `#node=<id>` URL;
- links to the static concept page;
- preserves search, state filters, layer filters, pan, zoom, and fit.

The static node page contains a small direct-neighborhood SVG, relation lists,
exact source links, and the immutable release coordinate. It remains useful
without JavaScript.

## Freshness

A current concept page is regenerated for every accepted deployment. The
immutable release path is generated from the same verified graph. Existing
deployment freshness checks still compare the truth release, source identity,
and topology version before publication.

Physical truth-release sharding is intentionally outside this layer. Pages
consume the current versioned dialect and can switch readers later without
changing the human URL or authority model.
