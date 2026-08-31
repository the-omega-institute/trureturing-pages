"use strict";

const assert = require("node:assert/strict");
const Lens = require("../../site/assets/concept-lens.js");

const graph = {
  source_snapshot: {
    source_repo: "the-omega-institute/trureturing",
    source_commit: "1".repeat(40),
    source_tree: "2".repeat(40),
    truth_release_digest: `sha256:${"a".repeat(64)}`,
    certified_topology_digest: `sha256:${"b".repeat(64)}`,
    algorithm_profile_digest: `sha256:${"c".repeat(64)}`,
    topology_producer_commit: "3".repeat(40)
  },
  nodes: [
    {
      id: "A",
      gid: "D5/S0/Foundation/A",
      repo_path: "D5/S0/Foundation/A.lean",
      kind: "truth",
      state: "closed",
      status: "Closed",
      human_title: "Foundation A",
      descendant_count: 4,
      descendant_cost: 12,
      dependency_betweenness: "0",
      structure_source: "certified-topology.v1",
      knowledge_page: "knowledge/node/a/",
      release_page: "release/x/node/a/"
    },
    {
      id: "B",
      repo_path: "D5/S1/Bridge/B.lean",
      kind: "truth",
      state: "closed",
      status: "Closed",
      domain: "Bridge",
      human_title: "Bridge B",
      human_abstract: "B combines the two foundation routes into a reusable intermediate construction.",
      human_theorem: "Bridge combination",
      exposition_authority: "blueprint-authored",
      blueprint_path: "Blueprint/D5/S1/Bridge/B.md",
      descendant_count: 2,
      descendant_cost: 8,
      dependency_betweenness: "9/10",
      structure_source: "certified-topology.v1",
      knowledge_page: "knowledge/node/b/",
      release_page: "release/x/node/b/"
    },
    {
      id: "C",
      repo_path: "D5/S1/Bridge/C.lean",
      kind: "truth",
      state: "closed",
      status: "Closed",
      human_title: "Bridge C",
      descendant_count: 2,
      descendant_cost: 7,
      dependency_betweenness: { numerator: 1, denominator: 10 },
      structure_source: "certified-topology.v1"
    },
    {
      id: "D",
      repo_path: "D5/S3/Target/D.lean",
      kind: "truth",
      state: "closed",
      status: "Closed",
      human_title: "Target D",
      descendant_count: 1,
      descendant_cost: 3,
      dependency_betweenness: "1/5",
      structure_source: "certified-topology.v1"
    },
    {
      id: "E",
      repo_path: "D5/X_Frontier/E.lean",
      kind: "truth",
      state: "open",
      status: "Open",
      human_title: "Frontier E",
      descendant_count: 0,
      descendant_cost: 1,
      dependency_betweenness: "0",
      structure_source: "certified-topology.v1"
    },
    {
      id: "Doc",
      repo_path: "Blueprint/D5/S1/Bridge/B.md",
      kind: "blueprint",
      state: "semantic",
      status: "Semantic",
      human_title: "Bridge B exposition"
    }
  ],
  edges: [
    { source: "A", target: "B", layer: "truth-dependency" },
    { source: "A", target: "C", layer: "truth-dependency" },
    { source: "B", target: "D", layer: "truth-dependency" },
    { source: "C", target: "D", layer: "truth-dependency" },
    { source: "D", target: "E", layer: "truth-dependency" },
    { source: "Doc", target: "B", layer: "blueprint-truth-anchor" },
    { source: "B", target: "C", layer: "structural-affinity" },
    { source: "C", target: "B", layer: "intuition-candidate" }
  ]
};

assert.equal(Lens.humanTitle(graph.nodes[1]), "Bridge B");
assert.equal(Lens.relationClass(graph.edges[0]), "certified");
assert.equal(Lens.relationClass(graph.edges[5]), "authored-anchor");
assert.equal(Lens.relationClass(graph.edges[6]), "derived");
assert.equal(Lens.relationClass(graph.edges[7]), "advisory");
assert.equal(Lens.parseRational("9/10"), 0.9);
assert.equal(Lens.parseRational({ numerator: 1, denominator: 4 }), 0.25);

const index = Lens.createIndex(graph);
assert.deepEqual(index.parents.get("D"), ["B", "C"]);
assert.deepEqual(index.children.get("D"), ["E"]);
assert.equal(index.certifiedEdges.length, 5);

const oneHop = Lens.createModel(graph, "D", 1, index);
assert.equal(oneHop.title, "Target D");
assert.deepEqual(oneHop.relations.parents.map((node) => node.id), ["B", "C"]);
assert.deepEqual(oneHop.relations.children.map((node) => node.id), ["E"]);
assert.deepEqual(
  oneHop.relations.local.nodes.map((node) => [node.id, node.level]),
  [["B", -1], ["C", -1], ["D", 0], ["E", 1]]
);
assert.ok(oneHop.facts.some((fact) => fact.kind === "frontier-adjacency"));
assert.equal(oneHop.relations.derived.length, 0);

const twoHop = Lens.createModel(graph, "D", 2, index);
assert.ok(twoHop.relations.local.nodes.some((node) => node.id === "A" && node.level === -2));
assert.equal(twoHop.relations.local.edges.length, 5);

const frontier = Lens.createModel(graph, "E", 1, index);
assert.equal(frontier.role.label, "Frontier");

const bridge = Lens.createModel(graph, "B", 1, index);
assert.equal(bridge.exposition.authority, "blueprint-authored");
assert.equal(bridge.exposition.theorem, "Bridge combination");
assert.ok(bridge.facts.some((fact) => fact.kind === "bridge-load"));
assert.equal(bridge.relations.authored.length, 1);
assert.equal(bridge.relations.derived.length, 1);
assert.equal(bridge.relations.advisory.length, 1);
assert.ok(bridge.documents.some((document) =>
  document.kind === "blueprint-source"
  && document.href.includes(`/blob/${"1".repeat(40)}/Blueprint/D5/S1/Bridge/B.md`)));
assert.ok(bridge.documents.some((document) => document.kind === "concept-page"));
assert.equal(bridge.audit.repository_path, "D5/S1/Bridge/B.lean");

const layout = Lens.localLayout(twoHop.relations.local, 760);
assert.ok(layout.height > 0);
assert.equal(layout.nodes.find((node) => node.id === "D").selected, true);
assert.equal(layout.edges.length, 5);
assert.ok(layout.edges.every((edge) => edge.y1 <= edge.y2));

console.log("concept-lens tests passed");
