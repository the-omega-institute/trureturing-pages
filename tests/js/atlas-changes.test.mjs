import test from "node:test";
import assert from "node:assert/strict";
import { addedTopics, releaseHighlights } from "../../site/assets/atlas-changes.mjs";

const before = {
  truth_release_digest: "old",
  atlas_graph_digest: "old-graph",
  nodes: [{ id: "A" }, { id: "B" }],
  dependency_edges: [["A", "B"]],
};
const after = {
  truth_release_digest: "new",
  atlas_graph_digest: "new-graph",
  nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
  dependency_edges: [
    ["A", "B"],
    ["B", "C"],
  ],
};
const index = { entries: [before, after] };
const timeline = {
  nodes: {
    A: [{ observation: 1, present: true, event: "Content changed" }],
    B: [{ observation: 0, present: true, event: "Baseline" }],
    C: [{ observation: 1, present: true, event: "Appeared" }],
  },
};
test("living highlights distinguish actual new nodes, new edges and authored content changes", () => {
  const result = releaseHighlights([before, after], index, timeline);
  assert.equal(result.kind, "comparable");
  assert.deepEqual([...result.added], ["C"]);
  assert.deepEqual([...result.changed], ["A"]);
  assert.deepEqual([...result.edgesAdded], ['["B","C"]']);
  assert.equal(result.contentKnown, true);
});
test("a single baseline or a changed analysis profile never invents growth", () => {
  assert.equal(releaseHighlights([after], index, timeline).kind, "baseline");
  assert.equal(releaseHighlights([after], index, timeline).added.size, 0);
  const incompatible = releaseHighlights(
    [before, { ...after, algorithm_profile_digest: "different" }],
    index,
    timeline,
  );
  assert.equal(incompatible.kind, "analysis-changed");
  assert.equal(incompatible.changed.size, 0);
  assert.equal(incompatible.edgesAdded.size, 0);
});
test("missing edge archives and mismatched content coordinates are unknown, not zero-change claims", () => {
  const result = releaseHighlights(
    [{ ...before, dependency_edges: undefined }, after],
    { entries: [{ ...before, atlas_graph_digest: "other" }, after] },
    timeline,
  );
  assert.equal(result.edgesKnown, false);
  assert.equal(result.contentKnown, false);
  assert.equal(result.changed.size, 0);
  assert.equal(result.added.size, 1);
});
test("new release topics match Atlas families and contain only current mathematical nodes", () => {
  const changes = { added: new Set(["new-1", "missing", "new-2", "new-3", "doc"]) };
  const model = { byId: new Map([
    ["new-1", { id: "new-1", kind: "truth", domain: "PrimeGaps", family: "numbers" }],
    ["new-2", { id: "new-2", kind: "truth", domain: "Constants", family: "numbers" }],
    ["new-3", { id: "new-3", kind: "truth", domain: "Words", family: "discrete" }],
    ["doc", { id: "doc", kind: "blueprint", domain: "Document" }],
  ]), families: [
    { id: "numbers", name: "Numbers & arithmetic", color: "#edc66d" },
    { id: "discrete", name: "Discrete mathematics", color: "#e4ac8c" },
  ] };
  assert.deepEqual(addedTopics(changes, model).map(({ name, nodes }) => [
    name, nodes.map((node) => node.id),
  ]), [["Numbers & arithmetic", ["new-1", "new-2"]], ["Discrete mathematics", ["new-3"]]]);
});
