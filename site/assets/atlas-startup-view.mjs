// A presentation read model of the verified release. Every node and relation
// retains its identity and order; full node records are fetched only on demand.
export const VIEW_SCHEMA = "pages-atlas-startup-view.v1";
export const DETAIL_SCHEMA = "pages-atlas-node-details.v1";
export const DETAIL_SHARDS = 64;
const FIELDS = [
  "id", "kind", "title", "human_title", "human_abstract", "domain",
  "status", "state", "repo_path", "structure_source", "structural_role",
  "out_degree", "true_depth", "descendant_count", "descendant_cost",
  "dependency_betweenness",
];
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
    nodes: graph.nodes.map(node => Object.fromEntries(FIELDS.filter(k => Object.hasOwn(node, k)).map(k => [k, node[k]]))),
    edges: graph.edges.map(edge => [endpoint(edge.source), endpoint(edge.target), edge.layer || "dependency", edge.status ?? null]),
  };
}
export function validateView(view, manifest) {
  if (view.schema_version !== VIEW_SCHEMA ||
      view.atlas_graph_digest !== manifest.atlas_graph_digest ||
      view.truth_release_digest !== manifest.truth_release_digest ||
      view.source_snapshot?.truth_release_digest !== manifest.truth_release_digest ||
      (manifest.source_commit && view.source_snapshot.source_commit !== manifest.source_commit) ||
      !Array.isArray(view.nodes) || !Array.isArray(view.edges) ||
      (manifest.counts && (view.nodes.length !== manifest.counts.nodes || view.edges.length !== manifest.counts.edges ||
        (manifest.counts.truth_nodes !== undefined && view.nodes.filter(n => n.kind === "truth").length !== manifest.counts.truth_nodes))))
    throw new Error("Startup view does not bind the published Atlas.");
  const ids = new Set();
  for (const node of view.nodes) {
    if (typeof node.id !== "string" || !node.id || ids.has(node.id))
      throw new Error("Invalid startup concept identity.");
    ids.add(node.id);
  }
  const edges = view.edges.map(row => {
    if (!Array.isArray(row) || row.length !== 4 ||
        !Number.isInteger(row[0]) || !view.nodes[row[0]] ||
        !Number.isInteger(row[1]) || !view.nodes[row[1]] ||
        typeof row[2] !== "string" || (row[3] !== null && typeof row[3] !== "string"))
      throw new Error("Invalid startup relation identity.");
    return { source: view.nodes[row[0]].id, target: view.nodes[row[1]].id,
      layer: row[2], ...(row[3] === null ? {} : { status: row[3] }) };
  });
  return { source_snapshot: view.source_snapshot, nodes: view.nodes, edges };
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
    if (!original || result.has(node.id) || FIELDS.some(key => Object.hasOwn(original, key) && node[key] !== original[key]))
      throw new Error("Concept details disagree with the startup view.");
    result.set(node.id, node);
  }
  return result;
}
