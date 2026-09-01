import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from lib.topology_history import TopologyHistoryError, build_manifest


ROOT = Path(__file__).resolve().parents[1]


def digest(value: str) -> str:
    return "sha256:" + value * 64


def cluster(value: str) -> str:
    return "cluster:sha256:" + value * 64


def delta(
    from_release: str,
    to_release: str,
    from_atlas: str,
    to_atlas: str,
) -> dict:
    return {
        "schema_version": "topology-atlas-delta.v1",
        "from_truth_release_digest": from_release,
        "to_truth_release_digest": to_release,
        "from_topology_atlas_digest": from_atlas,
        "to_topology_atlas_digest": to_atlas,
        "from_evidence_digest": digest("7"),
        "to_evidence_digest": digest("8"),
        "algorithm_profile_digest": digest("9"),
        "producer_commit": "a" * 40,
        "node_transitions": [
            {
                "stable_node_id": "gid:A",
                "relation": "retained",
                "from_node_id": "OldA.lean",
                "to_node_id": "NewA.lean",
                "source_path_changed": True,
                "from_primary_role": "internal",
                "to_primary_role": "bridge",
                "added_traits": ["bridge"],
                "removed_traits": ["internal"],
            }
        ],
        "edge_transitions": [],
        "cluster_lineage": [
            {
                "level": 2,
                "relation": "continuation",
                "source_cluster_id": cluster("1"),
                "target_cluster_id": cluster("2"),
                "source_member_count": 1,
                "target_member_count": 1,
                "overlap_count": 1,
                "member_jaccard": {"numerator": 1, "denominator": 1},
                "shared_stable_node_ids": ["gid:A"],
            }
        ],
        "frontier_delta": {
            "entered_frontier": [],
            "left_frontier": [],
        },
        "summary": {
            "nodes_added": 0,
            "nodes_retired": 0,
            "nodes_retained": 1,
            "edges_added": 0,
            "edges_removed": 0,
            "edges_retained": 0,
            "cluster_continuations": 1,
            "cluster_splits": 0,
            "cluster_merges": 0,
            "cluster_reorganizations": 0,
            "clusters_new": 0,
            "clusters_retired": 0,
        },
    }


class TopologyHistoryTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_builds_content_addressed_continuous_history(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "first.json"
            second = root / "second.json"
            first.write_text(
                json.dumps(
                    delta(digest("1"), digest("2"), digest("3"), digest("4")),
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n",
                encoding="utf-8",
            )
            second.write_text(
                json.dumps(
                    delta(digest("2"), digest("5"), digest("4"), digest("6")),
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n",
                encoding="utf-8",
            )
            output = root / "site" / "data" / "pages-topology-history.v1.json"
            manifest = build_manifest(
                digest("5"),
                [second, first],
                output,
            )
            self.assertEqual(
                [entry["from_truth_release_digest"] for entry in manifest["entries"]],
                [digest("1"), digest("2")],
            )
            self.assertEqual(
                manifest["entries"][-1]["to_truth_release_digest"],
                digest("5"),
            )
            for entry in manifest["entries"]:
                path = root / "site" / entry["delta_path"]
                self.assertTrue(path.is_file(), path)
                self.assertNotIn("..", entry["delta_path"])

    def test_rejects_history_forks_and_summary_mismatch(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "first.json"
            second = root / "second.json"
            value = delta(digest("1"), digest("2"), digest("3"), digest("4"))
            first.write_text(json.dumps(value) + "\n", encoding="utf-8")
            hostile = delta(digest("1"), digest("5"), digest("3"), digest("6"))
            second.write_text(json.dumps(hostile) + "\n", encoding="utf-8")
            with self.assertRaises(TopologyHistoryError):
                build_manifest(
                    digest("5"),
                    [first, second],
                    root / "site" / "data" / "pages-topology-history.v1.json",
                )

            value["summary"]["nodes_retained"] = 2
            first.write_text(json.dumps(value) + "\n", encoding="utf-8")
            with self.assertRaises(TopologyHistoryError):
                build_manifest(
                    digest("2"),
                    [first],
                    root / "site" / "data" / "pages-topology-history.v1.json",
                )

    def test_history_assets_are_loaded_only_on_history_page(self):
        page = self.read("site/conclusions.html")
        self.assertIn("assets/topology-history.css", page)
        self.assertIn("assets/topology-history-core.js", page)
        self.assertIn("assets/topology-history.js", page)
        atlas = self.read("site/dag.html")
        self.assertNotIn("assets/topology-history.js", atlas)

    def test_history_is_stable_identity_based_and_excludes_conformation(self):
        core = self.read("site/assets/topology-history-core.js")
        runtime = self.read("site/assets/topology-history.js")
        self.assertIn("stable_node_id", core)
        self.assertIn("stable_dependency_id", core)
        self.assertIn("cluster_lineage", core)
        self.assertIn("frontier_delta", core)
        self.assertIn("Page layout movement is excluded", runtime)
        self.assertNotIn("pages-conformation.v1.json", runtime)
        self.assertNotIn("graph2ScreenCoords", runtime)
        self.assertNotIn("ForceGraph3D", runtime)

    def test_javascript_syntax_and_behavior(self):
        for source in (
            "site/assets/topology-history-core.js",
            "site/assets/topology-history.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/topology-history.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_history_styles_are_accessible_and_responsive(self):
        styles = self.read("site/assets/topology-history.css")
        self.assertIn(".topology-history-filters", styles)
        self.assertIn('[aria-pressed="true"]', styles)
        self.assertIn("@media (max-width: 54rem)", styles)
        self.assertIn("prefers-reduced-motion", styles)


if __name__ == "__main__":
    unittest.main()
