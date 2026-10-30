// A presentation read model of the verified release. Every node and relation
// retains its identity and order; full node records are fetched only on demand.
import { applyAdmission } from "./atlas-admission.mjs?v=lean-admission-v2";
export const VIEW_SCHEMA = "pages-atlas-startup-view.v3";
const LEGACY_VIEW_SCHEMA = "pages-atlas-startup-view.v2";
export const DETAIL_SCHEMA = "pages-atlas-node-details.v1";
export const DETAIL_SHARDS = 64;
const FIELDS = [
  "id", "kind", "title", "human_title", "human_abstract", "domain",
  "status", "state", "repo_path", "structure_source", "structural_role",
  "out_degree", "true_depth", "descendant_count", "descendant_cost",
  "dependency_betweenness",
  "lean",
];
const PROSE = new Set(["title", "human_title", "human_abstract", "domain", "status", "state", "repo_path"]);
const HASH_FIELDS = ["frozen_node_id", "source_sha256"];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, "0"));

// Keep every admission field. Grouping the digest bytes avoids interleaving
// high-entropy hex with the text dictionary in the gzip stream.
function packNodes(nodes) {
  const hashes = [];
  const rows = nodes.map(node => {
    let present = 0;
    const row = FIELDS.map((key, index) => {
      if ((node.kind !== "truth" && PROSE.has(key)) || !Object.hasOwn(node, key) || node[key] === undefined) return null;
      present |= 1 << index;
      const value = node[key];
      if (typeof value === "string" && ((key === "title" && value === node.id.replaceAll("/", ".")) ||
          (key === "repo_path" && value === node.id + ".lean") ||
          (key === "state" && value === node.status?.toLowerCase()))) return 0;
      if (key !== "lean" || !value) return value ?? null;
      const lean = { ...value };
      for (const field of HASH_FIELDS) if (DIGEST.test(lean[field])) {
        for (let offset = 7; offset < 71; offset += 2) hashes.push(parseInt(lean[field].slice(offset, offset + 2), 16));
        lean[field] = 0;
      }
      return lean;
    });
    return [...row, present];
  });
  const chunks = [];
  for (let offset = 0; offset < hashes.length; offset += 32768)
    chunks.push(String.fromCharCode(...hashes.slice(offset, offset + 32768)));
  return { nodes: rows, lean_hashes: btoa(chunks.join("")) };
}

function unpackNodes(view) {
  if (view.schema_version === LEGACY_VIEW_SCHEMA) return view.nodes;
  if (typeof view.lean_hashes !== "string" || view.lean_hashes.length % 4 || /[^A-Za-z0-9+/=]/.test(view.lean_hashes))
    throw new Error("Invalid startup Lean identities.");
  let hashes;
  try { hashes = atob(view.lean_hashes); }
  catch { throw new Error("Invalid startup Lean identities."); }
  if (btoa(hashes) !== view.lean_hashes) throw new Error("Invalid startup Lean identities.");
  let offset = 0;
  const nodes = view.nodes.map(row => {
    const present = row?.[FIELDS.length];
    if (!Array.isArray(row) || row.length !== FIELDS.length + 1 || !Number.isInteger(present) || present < 0 || present >= 2 ** FIELDS.length)
      throw new Error("Invalid startup concept identity.");
    const node = Object.fromEntries(FIELDS.flatMap((key, i) => present & (1 << i) ? [[key, row[i]]] : []));
    if (typeof node.id !== "string") throw new Error("Invalid startup concept identity.");
    if (node.title === 0) node.title = node.id.replaceAll("/", ".");
    if (node.repo_path === 0) node.repo_path = node.id + ".lean";
    if (node.state === 0 && typeof node.status === "string") node.state = node.status.toLowerCase();
    if (node.lean) {
      node.lean = { ...node.lean };
      for (const field of HASH_FIELDS) if (node.lean[field] === 0) {
        if (offset + 32 > hashes.length) throw new Error("Incomplete startup Lean identities.");
        let digest = "sha256:";
        for (let i = 0; i < 32; i++) digest += HEX[hashes.charCodeAt(offset++)];
        node.lean[field] = digest;
      }
    }
    return node;
  });
  if (offset !== hashes.length) throw new Error("Unexpected startup Lean identities.");
  return nodes;
}
export function detailShard(id) {
  let value = 2166136261;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0) % DETAIL_SHARDS;
}
export function startupView(graph, manifest) {
  const ids = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const endpoint = value => ids.get(typeof value === "object" ? value.id : value);
  return {
    schema_version: VIEW_SCHEMA,
    atlas_graph_digest: manifest.atlas_graph_digest,
    truth_release_digest: manifest.truth_release_digest,
    source_snapshot: graph.source_snapshot,
    math_admission: graph.math_admission,
    ...packNodes(graph.nodes),
    edges: graph.edges.map(edge => [endpoint(edge.source), endpoint(edge.target), edge.layer || "dependency", edge.status ?? null]),
  };
}
export function validateView(view, manifest) {
  if (![VIEW_SCHEMA, LEGACY_VIEW_SCHEMA].includes(view.schema_version) ||
      view.atlas_graph_digest !== manifest.atlas_graph_digest ||
      view.truth_release_digest !== manifest.truth_release_digest ||
      view.source_snapshot?.truth_release_digest !== manifest.truth_release_digest ||
      (manifest.source_commit && view.source_snapshot.source_commit !== manifest.source_commit) ||
      (manifest.source_tree && view.source_snapshot.source_tree !== manifest.source_tree) ||
      !Array.isArray(view.nodes) || !Array.isArray(view.edges))
    throw new Error("Startup view does not bind the published Atlas.");
  const nodes = unpackNodes(view);
  if (
      (manifest.counts && (view.nodes.length !== manifest.counts.nodes || view.edges.length !== manifest.counts.edges ||
        (manifest.counts.truth_nodes !== undefined && nodes.filter(n => n.kind === "truth").length !== manifest.counts.truth_nodes))))
    throw new Error("Startup view does not bind the published Atlas.");
  const ids = new Set();
  for (const node of nodes) {
    if (typeof node.id !== "string" || !node.id || ids.has(node.id))
      throw new Error("Invalid startup concept identity.");
    ids.add(node.id);
  }
  const edges = view.edges.map(row => {
    if (!Array.isArray(row) || row.length !== 4 ||
        !Number.isInteger(row[0]) || !nodes[row[0]] ||
        !Number.isInteger(row[1]) || !nodes[row[1]] ||
        typeof row[2] !== "string" || (row[3] !== null && typeof row[3] !== "string"))
      throw new Error("Invalid startup relation identity.");
    return { source: nodes[row[0]].id, target: nodes[row[1]].id,
      layer: row[2], ...(row[3] === null ? {} : { status: row[3] }) };
  });
  const graph = { source_snapshot: view.source_snapshot, nodes, edges };
  const admitted = applyAdmission(graph, manifest, { ...view.math_admission,
    nodes: nodes.filter(n => n.kind === "truth").map(n => ({ id: n.id, repo_path: n.repo_path, lean: n.lean })) });
  if (["admitted", "excluded", "source_truth_nodes"].some(k => admitted.math_admission[k] !== view.math_admission[k]))
    throw new Error("Startup admission counts disagree with its records.");
  return admitted;
}
export function validateDetails(details, manifest, graph, shard) {
  if (details.schema_version !== DETAIL_SCHEMA ||
      details.atlas_graph_digest !== manifest.atlas_graph_digest ||
      details.truth_release_digest !== manifest.truth_release_digest || !Array.isArray(details.nodes))
    throw new Error("Concept details do not bind the published Atlas.");
  const expected = new Map(graph.nodes.filter(n => detailShard(n.id) === shard).map(n => [n.id, n]));
  if (details.nodes.length !== expected.size) throw new Error("Incomplete concept details.");
  const result = new Map();
  for (const node of details.nodes) {
    const original = expected.get(node.id);
    if (!original || result.has(node.id) || FIELDS.some(key => Object.hasOwn(original, key) && JSON.stringify(node[key]) !== JSON.stringify(original[key])))
      throw new Error("Concept details disagree with the startup view.");
    result.set(node.id, node);
  }
  return result;
}
