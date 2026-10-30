import test from "node:test";
import assert from "node:assert/strict";
import { withEvidence } from "./atlas-evidence-fixture.mjs";
import { createPublicModel, viewFor, searchNodes } from "../../site/assets/atlas-public-core.mjs";
import { analyzeArchitecture, mathematicalArchitecture } from "../../site/assets/architecture-core.mjs";
import { theoryModel, directedPath } from "../../site/assets/atlas-theory-core.mjs";
import { startupView, validateView, validateDetails, detailShard, DETAIL_SCHEMA } from "../../site/assets/atlas-startup-view.mjs";
import { admissionFromEvidence, applyAdmission, supportedLean } from "../../site/assets/atlas-admission.mjs";

const graph = withEvidence({
  source_snapshot: { truth_release_digest: "sha256:" + "a".repeat(64), source_commit: "b".repeat(40), source_tree: "c".repeat(40) },
  nodes: ["base", "left", "right", "join", "definition", "unfrozen", "unfinished", "labelOnly", "unsafe", "doc"].map(id => ({
    id, kind: id === "doc" ? "blueprint" : "truth", state: id === "unfinished" ? "open" : "closed", domain: "Readouts", human_title: `${id} module`,
  })),
  edges: [["base", "left"], ["base", "right"], ["left", "join"], ["right", "join"], ["join", "definition"], ["definition", "unfrozen"], ["join", "unfinished"], ["unfinished", "labelOnly"]]
    .map(([source, target]) => ({ source, target, layer: "truth-dependency" })).concat([
      { source: "doc", target: "join", layer: "blueprint-truth-anchor" },
      { source: "join", target: "unsafe", layer: "structural-affinity", status: "certified" },
      { source: "base", target: "unfrozen", layer: "intuition-candidate", status: "certified" },
    ]),
});
for (const node of graph.nodes) {
  if (["unfinished", "labelOnly"].includes(node.id)) delete node.lean;
  if (node.id === "unsafe") node.lean.node_axiom_closure = ["sorryAx"];
  if (node.id === "unfrozen") node.lean.freeze_status = "proven-not-yet-frozen";
  if (node.id === "definition") node.lean.theorem_count = 0;
}
const expected = ["base", "definition", "join", "left", "right", "unfrozen"];

test("one admission rule governs default, selection, family, frontier, theory, search and direct identity", () => {
  const model = createPublicModel(graph), architecture = mathematicalArchitecture(model), theory = theoryModel(model, architecture);
  assert.deepEqual(model.nodes.map(n => n.id), expected);
  for (const id of ["unfinished", "labelOnly", "unsafe", "doc"]) {
    assert.equal(model.byId.has(id), false, `Direct URLs cannot select ${id}`);
    assert.deepEqual(searchNodes(model, id), []);
  }
  const research = { problems: new Map([["question", { anchors: ["join", "unfinished"] }]]), byNode: new Map([["join", ["question"]]]) };
  for (const options of [{}, {selected: "join"}, {selected: "join", context: false}, {family:"foundations",selected:"join"},
                         {mode:"theory",theory}, {mode:"frontier",research,selected:"join"}]) {
    const view = viewFor(model, options);
    assert.ok(view.nodes.every(n => expected.includes(n.id)));
    assert.ok(view.edges.every(e => e.category === "proof" && expected.includes(e.source) && expected.includes(e.target)));
  }
  assert.equal(model.edges.length, 6);
  assert.equal(theory.components.length, 1);
  assert.deepEqual(theory.components[0].joins, ["join"]);
  assert.match(theory.components[0].label, /Readouts.*base module/);
});

test("paths and joins use actual directed imports and never authored shortcuts", () => {
  const model = createPublicModel(graph), architecture = mathematicalArchitecture(model);
  const path = directedPath(architecture, "base", "unfrozen");
  assert.equal(path.length, 5);
  for (let i = 1; i < path.length; i++) assert.ok(model.edges.some(e => e.source === path[i-1] && e.target === path[i]));
  assert.equal(directedPath(architecture, "unfrozen", "base"), null);
  assert.equal(directedPath(architecture, "left", "right"), null);
  assert.equal(directedPath(architecture, "base", "doc"), null);
});

test("filtered counters are recomputed while contradictory full topology still fails validation", () => {
  const source = structuredClone(graph);
  source.nodes.find(n => n.id === "join").out_degree = 2;
  analyzeArchitecture(source);
  assert.equal(mathematicalArchitecture(createPublicModel(source)).metrics.get("join").direct, 1);
  source.nodes.find(n => n.id === "join").out_degree = 999;
  assert.throws(() => analyzeArchitecture(source), /Published Topology/);
});

test("compact and full models agree on evidence and reject lazy evidence drift", () => {
  const manifest = {atlas_graph_digest: "sha256:" + "d".repeat(64), truth_release_digest: graph.source_snapshot.truth_release_digest};
  const boundGraph = {...graph,
    nodes: graph.nodes.map(n => n.kind === "truth" && !supportedLean(n) ? {...n,lean:{eligible:false,reason:"missing-evidence"}} : n),
    math_admission: {...graph.math_admission, atlas_graph_digest: manifest.atlas_graph_digest, admitted:6,excluded:3}};
  const compact = validateView(startupView(boundGraph, manifest), manifest);
  assert.throws(() => validateView(startupView({...boundGraph, math_admission:{...boundGraph.math_admission,admitted:9}}, manifest), manifest), /counts disagree/);
  assert.throws(() => validateView(startupView({...boundGraph, math_admission:{...boundGraph.math_admission,source_commit:"other"}}, manifest), manifest), /bind/);
  assert.deepEqual(createPublicModel(compact).nodes.map(n=>n.id), expected);
  const shard = detailShard("base"), nodes = graph.nodes.filter(n => detailShard(n.id) === shard);
  const details = {schema_version:DETAIL_SCHEMA,...manifest,nodes:structuredClone(nodes)};
  details.nodes.find(n=>n.id === "base").lean.freeze_status = "proven-not-yet-frozen";
  assert.throws(() => validateDetails(details, manifest, compact, shard), /disagree/);
  assert.deepEqual(createPublicModel({...graph,math_admission:undefined}).nodes, []);
  const empty = admissionFromEvidence(graph, manifest);
  assert.equal(createPublicModel(applyAdmission(graph,manifest,empty)).nodes.length, 0);
  assert.equal(empty.coverage,"unavailable");
  assert.throws(()=>applyAdmission(graph,manifest,{...empty,source_commit:"other"}),/bind/);
  assert.throws(()=>applyAdmission(graph,manifest,{...empty,nodes:empty.nodes.slice(1)}),/coverage/);
});
