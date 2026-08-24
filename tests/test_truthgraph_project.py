"""Tests for lib/truthgraph_project.py — the pages consume logic that projects a real
trureturing truth-graph into the static DAG display schema. Guards determinism,
semantic-noise filtering, edge retention, structural grouping, frontier-first ordering,
provenance passthrough, count closure, and fail-closed behaviour on malformed input."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib.truthgraph_project import project  # noqa: E402

SYNTHETIC_TG = {
    "schema": "stratalint.truth-graph.v1",
    "schema_version": 1,
    "truth": {
        "nodes": [
            {"depth": 0, "gid": "D5/S0/Closed", "module_name": "D5.S0.Closed", "repo_path": "D5/S0/Closed.lean", "state": "closed"},
            {"depth": 2, "gid": "D5/S1/Open", "module_name": "D5.S1.Open", "repo_path": "D5/S1/Open.lean", "state": "open"},
            {"depth": 1, "gid": "D5/X_Frontier/Tail", "module_name": "D5.X_Frontier.Tail", "repo_path": "D5/X_Frontier/Tail.lean", "state": "tail"},
            # a real CLOSED Lean node with no gid (the umbrella root module) — it must remain linkable
            {"depth": 9, "gid": None, "module_name": "Root", "repo_path": "Root.lean", "state": "closed"},
            # a semantic repo-file node — must be filtered as display noise
            {"depth": 0, "gid": None, "module_name": None, "repo_path": ".github/CODEOWNERS", "state": "semantic"},
        ],
        "edges": [
            {"dependency": "D5/S0/Closed.lean", "dependent": "D5/S1/Open.lean"},
            {"dependency": "D5/S1/Open.lean", "dependent": "Root.lean"},
            {"dependency": "D5/S0/Closed.lean", "dependent": ".github/CODEOWNERS"},
        ],
        "state_counts": {"closed": 2, "open": 1, "tail": 1, "semantic": 1},
        "open_blockers": [],
    },
    "documents": {},
    "joins": {},
    "provenance": {},
    "deferred_layers": [],
}
SNAP = {
    "source_repo": "the-omega-institute/trureturing",
    "source_commit": "abc123",
    "truth_graph_sha256": "deadbeef",
    "blessed_by": "AlyciaBHZ",
    "derived_at": "2026-08-15T00:00:00Z",
}


class TruthGraphProjectTests(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(json.dumps(project(SYNTHETIC_TG, SNAP)), json.dumps(project(SYNTHETIC_TG, SNAP)))

    def test_filters_semantic_but_keeps_gidless_lean_node(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertFalse(r["synthetic"])
        self.assertEqual(len(r["nodes"]), 4)
        self.assertEqual({n["status"] for n in r["nodes"]}, {"Closed", "Open", "Tail"})
        self.assertIn("Root", [n["id"] for n in r["nodes"]])

    def test_frontier_sorted_first(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertEqual([n["status"] for n in r["nodes"]], ["Open", "Tail", "Closed", "Closed"])

    def test_emits_resolved_edges_and_filters_non_truth_endpoints(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertEqual(
            [(e["source"], e["target"]) for e in r["edges"]],
            [("D5/S0/Closed", "D5/S1/Open"), ("D5/S1/Open", "Root")],
        )
        self.assertEqual(r["counts"]["source_edges"], 3)
        self.assertEqual(r["counts"]["edges"], 2)
        self.assertEqual(r["counts"]["filtered_edges"], 1)

    def test_adds_layer_and_domain_grouping(self):
        r = project(SYNTHETIC_TG, SNAP)
        closed = next(node for node in r["nodes"] if node["id"] == "D5/S0/Closed")
        root = next(node for node in r["nodes"] if node["id"] == "Root")
        self.assertEqual((closed["layer"], closed["domain"]), ("D5/S0", "Closed"))
        self.assertEqual((root["layer"], root["domain"]), ("Root", "Root"))

    def test_counts_close(self):
        # Regression for the 682-vs-681 bug: the GID-less Lean root remains visible.
        c = project(SYNTHETIC_TG, SNAP)["counts"]
        self.assertEqual(c["shown"], c["shown_closed"] + c["shown_open"] + c["shown_tail"])
        self.assertEqual(c["dag_closed"] + c["dag_open"] + c["dag_tail"], c["shown"])
        self.assertEqual(c["nodes_without_gid"], 1)
        self.assertEqual(c["shown_closed"], 2)
        self.assertEqual(c["dag_closed"], 2)               # authoritative closed total
        self.assertEqual(c["edges"], 2)

    def test_provenance(self):
        s = project(SYNTHETIC_TG, SNAP)["source_snapshot"]
        self.assertEqual(s["source_commit"], "abc123")
        self.assertEqual(s["blessed_by"], "AlyciaBHZ")
        self.assertEqual(s["approved_at"], "2026-08-15T00:00:00Z")

    def test_checked_in_data_is_the_complete_real_dag(self):
        graph = json.loads((ROOT / "site/data/truth-graph.v1.json").read_text())
        node_ids = {node["id"] for node in graph["nodes"]}
        self.assertEqual(len(graph["nodes"]), 682)
        self.assertEqual(len(graph["edges"]), 669)
        self.assertEqual(graph["counts"]["shown_closed"], 670)
        self.assertEqual(graph["counts"]["shown_open"], 12)
        self.assertEqual(graph["counts"]["filtered_edges"], 0)
        self.assertEqual(
            {"D5/S0", "D5/S1", "D5/S3", "D5/X_Frontier", "Root"},
            {node["layer"] for node in graph["nodes"]},
        )
        self.assertTrue(all(node["repo_path"].endswith(".lean") for node in graph["nodes"]))
        self.assertTrue(all(edge["source"] in node_ids and edge["target"] in node_ids for edge in graph["edges"]))

    def test_fail_closed_on_malformed(self):
        with self.assertRaises((KeyError, TypeError)):
            project({"no_truth_key": True}, SNAP)


if __name__ == "__main__":
    unittest.main()
