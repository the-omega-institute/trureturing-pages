import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createPublicModel,
  computeLayout,
  searchNodes,
  verifyGraph,
  viewFor,
} from "../../site/assets/atlas-public-core.mjs";

const graph = {
  source_snapshot: { truth_release_digest: "sha256:release" },
  nodes: [
    {
      id: "A",
      kind: "truth",
      domain: "Quantum",
      human_title: "Quantum states",
      state: "closed",
    },
    {
      id: "B",
      kind: "truth",
      domain: "Observer",
      human_title: "Observation",
      state: "open",
    },
    {
      id: "C",
      kind: "truth",
      domain: "Quantum",
      human_title: "Quantum channels",
      state: "closed",
    },
    { id: "doc", kind: "blueprint", domain: "Document" },
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency" },
    { source: "A", target: "C", layer: "structural-affinity" },
    { source: "doc", target: "A", layer: "blueprint-truth-anchor" },
  ],
};
const digest = async (text) =>
  "sha256:" + createHash("sha256").update(text).digest("hex");

test("public map keeps mathematical nodes and only certified dependency edges", () => {
  const model = createPublicModel(graph);
  assert.deepEqual(
    model.nodes.map((n) => n.id),
    ["A", "B", "C"],
  );
  assert.equal(model.edges.length, 1);
  assert.deepEqual([...model.parents.get("B")], ["A"]);
  assert.deepEqual([...model.children.get("A")], ["B"]);
  assert.equal(
    model.families.reduce((count, f) => count + f.nodes.length, 0),
    3,
  );
  assert.equal(graph.nodes[0].family, undefined);
});
test("focus retains proof lineage, affinities and documents across a family filter", () => {
  const model = createPublicModel(graph);
  const view = viewFor(model, { family: "observers", selected: "B" });
  assert.deepEqual(
    view.nodes.map((n) => n.id),
    ["A", "B", "C", "doc"],
  );
  assert.equal(view.edges[0].source, "A");
  assert.equal(view.edges[0].target, "B");
});
test("open questions include their support and empty frontiers remain empty", () => {
  const model = createPublicModel(graph);
  assert.deepEqual(
    viewFor(model, { mode: "frontier" }).nodes.map((n) => n.id),
    ["A", "B"],
  );
  const closed = createPublicModel({
    ...graph,
    nodes: graph.nodes.map((n) => ({ ...n, state: "closed" })),
  });
  assert.equal(viewFor(closed, { mode: "frontier" }).nodes.length, 0);
});
test("search can find concepts absent from the current family and exact ids rank first", () => {
  const model = createPublicModel(graph);
  assert.equal(searchNodes(model, "b")[0].id, "B");
  assert.equal(searchNodes(model, "quantum").length, 2);
  assert.equal(searchNodes(model, "no such concept").length, 0);
});
test("layout is finite, deterministic, and does not mutate proof data", () => {
  const model = createPublicModel(graph);
  const before = JSON.stringify(graph);
  const first = computeLayout(model);
  const second = computeLayout(model);
  assert.deepEqual(first, second);
  assert.equal(Object.keys(first).length, 4);
  assert.ok(
    Object.values(first).every((p) => Object.values(p).every(Number.isFinite)),
  );
  assert.equal(JSON.stringify(graph), before);
});

test("selection preserves surrounding context and allows explicit isolation", () => {
  const model = createPublicModel({
    ...graph,
    nodes: [
      ...graph.nodes,
      { id: "unrelated", kind: "truth", domain: "Other" },
    ],
  });
  assert.ok(
    viewFor(model, { selected: "A" }).nodes.some((n) => n.id === "unrelated"),
  );
  assert.ok(
    !viewFor(model, { selected: "A", context: false }).nodes.some(
      (n) => n.id === "unrelated",
    ),
  );
  const proofOnly = viewFor(model, {
    selected: "A",
    context: false,
    types: ["proof"],
  });
  assert.deepEqual(
    proofOnly.nodes.map((n) => n.id),
    ["A", "B"],
  );
  assert.ok(proofOnly.edges.every((e) => e.category === "proof"));
});

test("full lineage includes every ancestor and consequence without hop or count truncation", () => {
  const nodes = Array.from({ length: 130 }, (_, i) => ({
    id: `n${i}`,
    kind: "truth",
    domain: "Quantum",
  }));
  const edges = nodes
    .slice(1)
    .map((n, i) => ({
      source: `n${i}`,
      target: n.id,
      layer: "truth-dependency",
    }));
  const model = createPublicModel({ nodes, edges });
  const full = viewFor(model, { selected: "n65", context: false });
  assert.equal(full.nodes.length, 130);
  assert.equal(full.edges.length, 129);
  const direct = viewFor(model, {
    selected: "n65",
    context: false,
    depth: "1",
  });
  assert.equal(direct.nodes.length, 3);
  const two = viewFor(model, { selected: "n65", context: false, depth: "2" });
  assert.equal(two.nodes.length, 5);
});

test("document and affinity edges never become proof prerequisites, even if mislabeled certified", () => {
  const model = createPublicModel({
    ...graph,
    edges: graph.edges.map((e) => ({ ...e, status: "certified" })),
  });
  assert.deepEqual([...model.parents.get("A")], []);
  assert.deepEqual([...model.parents.get("C")], []);
});
test("published graph bytes, release binding, and edge closure are verified", async () => {
  const text = JSON.stringify(graph);
  const manifest = {
    schema_version: "pages-atlas-manifest.v1",
    truth_release_digest: "sha256:release",
    atlas_graph_digest: await digest(text),
  };
  assert.deepEqual(await verifyGraph(text, manifest, digest), graph);
  await assert.rejects(verifyGraph(text + " ", manifest, digest), /digest/);
  await assert.rejects(
    verifyGraph(text, { ...manifest, truth_release_digest: "other" }, digest),
    /different releases/,
  );
  const broken = JSON.stringify({
    ...graph,
    edges: [{ source: "A", target: "missing" }],
  });
  await assert.rejects(
    verifyGraph(
      broken,
      { ...manifest, atlas_graph_digest: await digest(broken) },
      digest,
    ),
    /missing concept/,
  );
});
