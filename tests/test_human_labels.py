import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.human_labels import enrich_graph, humanize_identifier, parse_blueprint  # noqa: E402


class HumanLabelsTests(unittest.TestCase):
    def test_humanizes_pascal_case(self):
        self.assertEqual(humanize_identifier("DagCompletion"), "Dag Completion")
        self.assertEqual(humanize_identifier("APIResponse2"), "API Response2")

    def test_extracts_requested_blueprint_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Example.md"
            path.write_text(
                "# Example Title\n\n## Abstract\n\nA one-line summary.\n\n"
                "**Theorem 1.1 (The named result).**\n",
                encoding="utf-8",
            )
            self.assertEqual(
                parse_blueprint(path),
                {
                    "human_title": "Example Title",
                    "human_abstract": "A one-line summary.",
                    "human_theorem": "The named result",
                },
            )

    def test_joins_blueprint_and_humanizes_missing_documents(self):
        graph = {
            "nodes": [
                {
                    "id": "D5/S3/ConceptDynamics/DagCompletion/ConsequenceClosure",
                    "repo_path": "D5/S3/ConceptDynamics/DagCompletion/ConsequenceClosure.lean",
                    "domain": "ConceptDynamics",
                },
                {
                    "id": "D5/S1/Depth/Finite",
                    "repo_path": "D5/S1/Depth/Finite.lean",
                    "domain": "Depth",
                },
            ],
            "edges": [],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            blueprint = root / "D5/S3/ConceptDynamics/DagCompletion/ConsequenceClosure.md"
            blueprint.parent.mkdir(parents=True)
            blueprint.write_text(
                "# Consequence Closure\n\n## Abstract\n\nReachability summary.\n\n"
                "**Theorem 1.1 (Least successor-closed superset).**\n",
                encoding="utf-8",
            )
            enriched = enrich_graph(graph, root)
        formal, fallback = enriched["nodes"]
        self.assertEqual(formal["human_title"], "Consequence Closure")
        self.assertEqual(formal["human_abstract"], "Reachability summary.")
        self.assertEqual(formal["human_theorem"], "Least successor-closed superset")
        self.assertEqual(fallback["human_title"], "Depth: Finite")
        self.assertIsNone(fallback["human_abstract"])
        self.assertEqual(enriched["human_labels"]["formalized_nodes"], 1)

    def test_checked_in_graph_has_labels_for_formalized_and_open_nodes(self):
        graph = json.loads((ROOT / "site/data/truth-graph.v1.json").read_text(encoding="utf-8"))
        self.assertEqual(len(graph["nodes"]), 682)
        self.assertTrue(all(node.get("human_title") for node in graph["nodes"]))
        formal = next(node for node in graph["nodes"] if node["id"].endswith("DensePhaseEscapeIdentity"))
        self.assertEqual(formal["human_title"], "Dense Phase Escape Identity")
        self.assertTrue(formal["human_abstract"])
        open_node = next(node for node in graph["nodes"] if node["status"] == "Open")
        self.assertIn(": ", open_node["human_title"])


if __name__ == "__main__":
    unittest.main()
