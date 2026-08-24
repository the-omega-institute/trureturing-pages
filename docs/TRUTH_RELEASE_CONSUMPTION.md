# Truth-release consumption boundary

`trureturing-pages` owns the visual read model. It does not own the upstream truth wire.

The upstream adapter is pending and is not wired in this repository. Once `Trureturing.Truth`
has a stable package coordinate, that adapter will verify a `truth-release.v1` bundle and write
`pages-truth-release-port.v1`. The Pages core consumes only that local typed port and rejects
any record that does not satisfy the complete Pages contract.

The port carries two certified graph layers:

1. repository/module topology;
2. exact frozen-proof prerequisites.

An optional `pages-intuition-overlay.v1` carries advisory candidate relations. Advisory
relations never enter certified edge counts and are rendered as a separate layer.

The projector writes a root index and one bounded neighborhood artifact per node. This
keeps browser rendering local even while the source graph grows. `release-delta` is a
rebuildable Pages projection and does not become an upstream truth artifact.

Physical upstream sharding is deliberately outside this repository. The stable boundary is
the verified logical release and this Pages-owned port, rather than any current filename
inside the upstream bundle.
