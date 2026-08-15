"""Tests for lib/truthgraph_project.py — the pages consume logic that projects a real
trureturing truth-graph into the static DAG display schema. Guards determinism,
semantic-noise filtering, frontier-first ordering, provenance passthrough, and fail-closed
behaviour on malformed input."""
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
            {"depth": 0, "gid": "A/Closed", "module_name": "A.Closed", "repo_path": "A/Closed.lean", "state": "closed"},
            {"depth": 2, "gid": "A/Open", "module_name": "A.Open", "repo_path": "A/Open.lean", "state": "open"},
            {"depth": 1, "gid": "A/Tail", "module_name": "A.Tail", "repo_path": "A/Tail.lean", "state": "tail"},
            {"depth": 0, "gid": None, "module_name": None, "repo_path": ".github/CODEOWNERS", "state": "semantic"},
        ],
        "edges": [{"dependency": "A/Closed", "dependent": "A/Open"}],
        "state_counts": {"closed": 1, "open": 1, "tail": 1, "semantic": 1},
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
    "blessed_by": "AlyicaBHZ",
    "derived_at": "2026-08-15T00:00:00Z",
}


class TruthGraphProjectTests(unittest.TestCase):
    def test_deterministic(self):
        a = json.dumps(project(SYNTHETIC_TG, SNAP))
        b = json.dumps(project(SYNTHETIC_TG, SNAP))
        self.assertEqual(a, b)

    def test_filters_semantic_and_capitalizes_status(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertFalse(r["synthetic"])
        self.assertEqual(len(r["nodes"]), 3)  # the semantic repo-file node is dropped
        self.assertEqual({n["status"] for n in r["nodes"]}, {"Closed", "Open", "Tail"})
        self.assertNotIn(None, [n["id"] for n in r["nodes"]])

    def test_frontier_sorted_first(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertEqual([n["status"] for n in r["nodes"]], ["Open", "Tail", "Closed"])

    def test_counts_and_provenance(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertEqual(r["counts"]["closed"], 1)
        self.assertEqual(r["counts"]["shown"], 3)
        self.assertEqual(r["counts"]["edges"], 1)
        self.assertEqual(r["source_snapshot"]["source_commit"], "abc123")
        self.assertEqual(r["source_snapshot"]["blessed_by"], "AlyicaBHZ")
        self.assertEqual(r["source_snapshot"]["approved_at"], "2026-08-15T00:00:00Z")

    def test_fail_closed_on_malformed(self):
        with self.assertRaises((KeyError, TypeError)):
            project({"no_truth_key": True}, SNAP)


if __name__ == "__main__":
    unittest.main()
