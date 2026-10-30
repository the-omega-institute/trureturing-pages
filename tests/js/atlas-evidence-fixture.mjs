import { admissionFromEvidence, applyAdmission } from "../../site/assets/atlas-admission.mjs";
export const fixtureDigest = "sha256:" + "1".repeat(64);
export function fixtureEvidence(graph) {
  return {
    schema_version: "pages-atlas-lean-evidence.v1", coverage: "available",
    source_commit: graph.source_snapshot?.source_commit, source_tree: graph.source_snapshot?.source_tree,
    truth_release_digest: graph.source_snapshot?.truth_release_digest,
    truth_graph_sha256: graph.source_snapshot?.truth_graph_sha256 || fixtureDigest,
    truth_export_sha256: fixtureDigest, raw_lean_report_sha256: fixtureDigest,
    nodes: graph.nodes.filter(n => n.kind === "truth").map(n => ({
      repo_path: n.repo_path, eligible: true, freeze_status: "frozen",
      source_sha256: fixtureDigest, frozen_node_id: fixtureDigest,
      node_axiom_closure: [], declaration_count: 1, theorem_count: 1,
    })),
  };
}
// Explicit synthetic evidence for layout/navigation unit fixtures. Production
// admission is exercised separately against actual export/report bytes.
export function withEvidence(graph) {
  graph = { ...graph, source_snapshot: { truth_graph_sha256: fixtureDigest, ...graph.source_snapshot },
    nodes: graph.nodes.map(n => ({ ...n, repo_path: n.repo_path || `${n.id}.lean` })) };
  const manifest = { atlas_graph_digest: fixtureDigest, truth_release_digest: graph.source_snapshot.truth_release_digest };
  return applyAdmission(graph, manifest, admissionFromEvidence(graph, manifest, fixtureEvidence(graph)));
}
