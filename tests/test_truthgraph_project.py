"""Tests for lib/truthgraph_project.py — the pages consume logic that projects a real
trureturing truth-graph into the static DAG display schema. Guards determinism,
semantic-noise filtering, frontier-first ordering, provenance passthrough, count closure
(no node silently lost), and fail-closed behaviour on malformed input."""
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
            # a real CLOSED math node with no gid (the umbrella root module) — must be filtered but accounted for
            {"depth": 9, "gid": None, "module_name": "Root", "repo_path": "Root.lean", "state": "closed"},
            # a semantic repo-file node — must be filtered as display noise
            {"depth": 0, "gid": None, "module_name": None, "repo_path": ".github/CODEOWNERS", "state": "semantic"},
        ],
        "edges": [{"dependency": "A/Closed", "dependent": "A/Open"}],
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

    def test_filters_semantic_and_rootless_and_capitalizes_status(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertFalse(r["synthetic"])
        # only the 3 gid-carrying math nodes are shown; semantic + gid-less-closed are filtered
        self.assertEqual(len(r["nodes"]), 3)
        self.assertEqual({n["status"] for n in r["nodes"]}, {"Closed", "Open", "Tail"})
        self.assertNotIn(None, [n["id"] for n in r["nodes"]])

    def test_frontier_sorted_first(self):
        r = project(SYNTHETIC_TG, SNAP)
        self.assertEqual([n["status"] for n in r["nodes"]], ["Open", "Tail", "Closed"])

    def test_counts_close(self):
        # regression for the 682-vs-681 bug: nothing is silently lost.
        c = project(SYNTHETIC_TG, SNAP)["counts"]
        self.assertEqual(c["shown"], c["shown_closed"] + c["shown_open"] + c["shown_tail"])
        self.assertEqual(c["dag_closed"] + c["dag_open"] + c["dag_tail"], c["shown"] + c["filtered_no_gid"])
        self.assertEqual(c["filtered_no_gid"], 1)          # the gid-less closed root
        self.assertEqual(c["shown_closed"], 1)             # the one closed node WITH a gid
        self.assertEqual(c["dag_closed"], 2)               # authoritative closed total
        self.assertEqual(c["edges"], 1)

    def test_provenance(self):
        s = project(SYNTHETIC_TG, SNAP)["source_snapshot"]
        self.assertEqual(s["source_commit"], "abc123")
        self.assertEqual(s["blessed_by"], "AlyciaBHZ")
        self.assertEqual(s["approved_at"], "2026-08-15T00:00:00Z")

    def test_fail_closed_on_malformed(self):
        with self.assertRaises((KeyError, TypeError)):
            project({"no_truth_key": True}, SNAP)


if __name__ == "__main__":
    unittest.main()
