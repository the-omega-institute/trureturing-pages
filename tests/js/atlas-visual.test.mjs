import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublicModel,
  viewFor,
} from "../../site/assets/atlas-public-core.mjs";
import { analyzeArchitecture } from "../../site/assets/architecture-core.mjs";
import {
  structuralScaffold,
  relationBundles,
  focusRole,
  researchMarkers,
} from "../../site/assets/atlas-visual-core.mjs";

const graph = {
  nodes: [
    { id: "A", kind: "truth", domain: "Quantum" },
    { id: "B", kind: "truth", domain: "Quantum" },
    { id: "C", kind: "truth", domain: "Quantum" },
    { id: "D", kind: "truth", domain: "Observer" },
    { id: "E", kind: "truth", domain: "Observer" },
    { id: "F", kind: "truth", domain: "Observer" },
    { id: "doc", kind: "blueprint" },
  ],
  edges: [
    ...[
      ["A", "B"],
      ["A", "C"],
      ["B", "C"],
      ["C", "D"],
      ["A", "E"],
    ].map(([source, target]) => ({
      source,
      target,
      layer: "truth-dependency",
    })),
    { source: "A", target: "F", layer: "structural-affinity" },
    { source: "doc", target: "A", layer: "blueprint-truth-anchor" },
  ],
};
test("cluster skeleton only selects existing proof dependencies and preserves secondary parents", () => {
  const model = createPublicModel(graph);
  const scaffold = structuralScaffold(model, analyzeArchitecture(graph));
  assert.equal(scaffold.parent.get("C").source, "A");
  assert.equal(
    scaffold.parent.has("D"),
    false,
    "Cross-family dependencies are not mistaken for an internal branch",
  );
  assert.ok(
    [...scaffold.spine].every((id) =>
      model.edges.some((e) => e.relationId === id),
    ),
  );
  assert.ok(model.edges.some((e) => e.source === "B" && e.target === "C"));
});
test("connection bundles preserve exact directed membership and never aggregate affinity as proof", () => {
  const model = createPublicModel(graph);
  const bundles = relationBundles(model);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].source, "quantum");
  assert.equal(bundles[0].target, "observers");
  assert.deepEqual(
    bundles[0].edges.map((e) => [e.source, e.target]),
    [
      ["C", "D"],
      ["A", "E"],
    ],
  );
  assert.equal(bundles[0].ids.has("F"), false);
});
test("local focus distinguishes prerequisite, consequence, document and affinity without mutating coordinates or facts", () => {
  const model = createPublicModel(graph);
  const related = viewFor(model, { selected: "B" }).related;
  assert.equal(focusRole("A", "B", related, model), "upstream");
  assert.equal(focusRole("D", "B", related, model), "downstream");
  assert.equal(focusRole("doc", "B", related, model), "document");
  assert.equal(focusRole("F", "B", related, model), "affinity");
  assert.equal(focusRole("B", "B", related, model), "selected");
});
test("research targets remain a separate authored overlay and keep their stable positions when scoped", () => {
  const research = {
    problems: new Map([
      ["one", { slug: "one", title: "First question", anchors: ["A"] }],
      ["two", { slug: "two", title: "Second question", anchors: ["B"] }],
      ["missing", { slug: "missing", title: "Unreleased", anchors: [] }],
    ]),
  };
  const positions = { A: { x: 0, y: 0, z: 0 }, B: { x: 50, y: 10, z: 0 } };
  const before = JSON.stringify(positions);
  const all = researchMarkers(research, positions);
  assert.equal(all.length, 2);
  assert.deepEqual(
    researchMarkers(research, positions, "two")[0],
    all.find((m) => m.key === "two"),
  );
  assert.equal(JSON.stringify(positions), before);
  assert.ok(
    all.every(
      (m) =>
        m.type === "research" && Object.values(m.point).every(Number.isFinite),
    ),
  );
});
