# Visualize publication consumed by Pages

`site/` is the exact existing `github-pages` artifact from
[`trureturing-visualize`, run 40727663780](https://github.com/the-omega-institute/trureturing-visualize/actions/runs/40727663780),
at commit `2b4c5bd09b2df77533dc1886f1339b5fe24f06ea`.
It contains 30 live visualizations. `publication.v1.json` records the artifact,
source commit and per-file SHA-256 hashes. `LICENSE` is copied from that revision.

Pages owns hosting and adaptation under `/visualize/`. The original collection
owns the interactive content and its releases. The assembly helper validates
this input, copies it into the site, and injects `visualize-bridge.js` to support
Pages' `lang=zh-CN` links, preserve language between visualizations, and add the
return link to Atlas. Visualizations keep their own controls and visual design.

To refresh, download the `github-pages` artifact of a successful deployment from
the original repository with `gh run download RUN --repo
the-omega-institute/trureturing-visualize --name github-pages --dir DESTINATION`.
Check that the deployment succeeded at the selected source commit, safely unpack
the artifact's `artifact.tar` into a fresh `site/`, copy the license from that
commit, and update the source coordinates and hashes in `publication.v1.json`.
Run the downstream publication and browser checks before merging. No upstream
code or workflow changes are required. The vendored publication participates in
the existing build fingerprint, so a refreshed collection invalidates cached
site generation.
