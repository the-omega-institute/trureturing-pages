import test from "node:test";
import assert from "node:assert/strict";
import { researchIndex, researchScope } from "../../site/assets/atlas-research-core.mjs";

test("recorded resolutions leave the open frontier but retain their released anchors", () => {
  const model = { byId: new Map([["A", { kind: "truth" }], ["B", { kind: "truth" }]]), parents: new Map() };
  const source = { truth_release_digest: "sha256:fixture", source_commit: "commit" };
  const snapshot = { schema_version: "pages-library-snapshot.v1", atlas_graph_digest: "digest", truth_release_digest: source.truth_release_digest,
    graph: { source_snapshot: source }, problems: [
      { slug: "active", title: "Active", triage: "theorem", motivation_gids: ["A"] },
      { slug: "resolved", title: "Resolved", triage: "theorem", motivation_gids: ["B"],
        resolution: { kind: "refuted", declaration_gid: "D5/S1/Example.result", source_path: "Blueprint/D5/S1/Example.md", evidence: "source-recorded-markdown" } },
    ] };
  const index = researchIndex(model, snapshot, "digest", source);
  assert.deepEqual([...index.problems.keys()], ["active"]);
  assert.deepEqual(index.resolved.get("resolved").anchors, ["B"]);
  assert.deepEqual([...researchScope(model, index)], ["A"]);
  snapshot.problems[1].resolution.kind = "unknown";
  assert.throws(() => researchIndex(model, snapshot, "digest", source), /Invalid source resolution/);
});
