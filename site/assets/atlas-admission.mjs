// Pages read model of publication evidence, not declaration-use dependencies.
export const ADMISSION_SCHEMA = "pages-atlas-admission.v1";
export const EVIDENCE_SCHEMA = "pages-atlas-lean-evidence.v1";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const AXIOMS = new Set(["propext", "Classical.choice", "Quot.sound"]);
export function supportedLean(node) {
  const e = node.lean;
  return node.kind === "truth" && e?.eligible === true &&
    ["frozen", "proven-not-yet-frozen"].includes(e.freeze_status) &&
    DIGEST.test(e.source_sha256) && DIGEST.test(e.frozen_node_id) &&
    Number.isInteger(e.declaration_count) && e.declaration_count > 0 &&
    Number.isInteger(e.theorem_count) && e.theorem_count >= 0 && e.theorem_count <= e.declaration_count &&
    Array.isArray(e.node_axiom_closure) && e.node_axiom_closure.every(a => AXIOMS.has(a));
}
export function admissionFromEvidence(graph, manifest, evidence) {
  const source = graph.source_snapshot;
  if (evidence && (evidence.schema_version !== EVIDENCE_SCHEMA ||
      evidence.truth_release_digest !== source.truth_release_digest ||
      evidence.source_commit !== source.source_commit || evidence.source_tree !== source.source_tree ||
      evidence.truth_graph_sha256 !== source.truth_graph_sha256 ||
      ![evidence.truth_graph_sha256, evidence.truth_export_sha256, evidence.raw_lean_report_sha256].every(d => DIGEST.test(d))))
    throw new Error("Lean evidence does not bind this publication.");
  const byPath = new Map();
  for (const node of evidence?.nodes || []) {
    if (byPath.has(node.repo_path)) throw new Error("Duplicate Lean evidence path.");
    byPath.set(node.repo_path, node);
  }
  const nodes = graph.nodes.filter(n => n.kind === "truth").map(node => {
    const receipt = byPath.get(node.repo_path);
    const lean = receipt ? Object.fromEntries(Object.entries(receipt).filter(([key]) => !["repo_path", "declarations"].includes(key)))
      : { eligible: false, reason: evidence?.coverage === "available" ? "absent-from-proven-catalog" : "missing-declaration-evidence" };
    if (lean.eligible && !supportedLean({ ...node, lean })) throw new Error("Incomplete Lean admission receipt.");
    return { id: node.id, repo_path: node.repo_path, lean };
  });
  return {
    schema_version: ADMISSION_SCHEMA, atlas_graph_digest: manifest.atlas_graph_digest,
    truth_release_digest: source.truth_release_digest, source_commit: source.source_commit,
    source_tree: source.source_tree, coverage: evidence?.coverage || "unavailable",
    evidence: evidence ? Object.fromEntries(["truth_graph_sha256", "truth_export_sha256", "raw_lean_report_sha256"].map(k => [k, evidence[k]])) : null,
    nodes,
  };
}
export function applyAdmission(graph, manifest, admission, evidence = null) {
  if (admission?.schema_version !== ADMISSION_SCHEMA || admission.atlas_graph_digest !== manifest.atlas_graph_digest ||
      admission.truth_release_digest !== manifest.truth_release_digest ||
      ["source_commit", "source_tree"].some(k => manifest[k] && admission[k] !== manifest[k]) ||
      admission.source_commit !== graph.source_snapshot?.source_commit || admission.source_tree !== graph.source_snapshot?.source_tree ||
      !Array.isArray(admission.nodes)) throw new Error("Admission does not bind this Atlas.");
  if (!["available", "unavailable"].includes(admission.coverage) ||
      (admission.coverage === "available" && (!admission.evidence ||
        admission.evidence.truth_graph_sha256 !== graph.source_snapshot?.truth_graph_sha256 ||
        ![admission.evidence.truth_graph_sha256, admission.evidence.truth_export_sha256, admission.evidence.raw_lean_report_sha256].every(d => DIGEST.test(d)))))
    throw new Error("Admission has no compatible source evidence.");
  const byId = new Map();
  for (const row of admission.nodes) {
    if (byId.has(row.id) || !row.lean || typeof row.lean.eligible !== "boolean" ||
        (row.lean.eligible && (admission.coverage !== "available" || !supportedLean({ ...row, kind: "truth" }))))
      throw new Error("Invalid Lean admission identity.");
    byId.set(row.id, row);
  }
  if (byId.size !== graph.nodes.filter(n => n.kind === "truth").length)
    throw new Error("Incomplete Atlas admission coverage.");
  const receipts = new Map((evidence?.nodes || []).map(n => [n.repo_path, n.declarations]));
  const nodes = graph.nodes.map(node => {
    if (node.kind !== "truth") return node;
    const row = byId.get(node.id);
    if (!row || row.repo_path !== node.repo_path) throw new Error("Lean admission path mismatch.");
    return { ...node, lean: row.lean, ...(receipts.has(node.repo_path) ? { lean_declarations: receipts.get(node.repo_path) } : {}) };
  });
  const admitted = nodes.filter(supportedLean).length;
  return { ...graph, nodes, math_admission: { ...Object.fromEntries(Object.entries(admission).filter(([k]) => k !== "nodes")),
    source_truth_nodes: byId.size, admitted, excluded: byId.size - admitted } };
}
