import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.human_labels import (  # noqa: E402
    enrich_file,
    enrich_graph,
    humanize_identifier,
    parse_blueprint,
)
from lib.knowledge_pages import stable_file_name  # noqa: E402


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
                    "id": (
                        "D5/S3/ConceptDynamics/DagCompletion/"
                        "ConsequenceClosure"
                    ),
                    "repo_path": (
                        "D5/S3/ConceptDynamics/DagCompletion/"
                        "ConsequenceClosure.lean"
                    ),
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
            blueprint = (
                root
                / "D5/S3/ConceptDynamics/DagCompletion/"
                "ConsequenceClosure.md"
            )
            blueprint.parent.mkdir(parents=True)
            blueprint.write_text(
                "# Consequence Closure\n\n## Abstract\n\n"
                "Reachability summary.\n\n"
                "**Theorem 1.1 (Least successor-closed superset).**\n",
                encoding="utf-8",
            )
            enriched = enrich_graph(graph, root, blueprint_ref="a" * 40)
        formal, fallback = enriched["nodes"]
        self.assertEqual(formal["human_title"], "Consequence Closure")
        self.assertEqual(
            formal["human_abstract"],
            "Reachability summary.",
        )
        self.assertEqual(
            formal["human_theorem"],
            "Least successor-closed superset",
        )
        self.assertEqual(
            formal["blueprint_path"],
            (
                "Blueprint/D5/S3/ConceptDynamics/DagCompletion/"
                "ConsequenceClosure.md"
            ),
        )
        self.assertEqual(
            formal["exposition_authority"],
            "blueprint-authored",
        )
        self.assertEqual(fallback["human_title"], "Depth: Finite")
        self.assertIsNone(fallback["human_abstract"])
        self.assertEqual(
            fallback["exposition_authority"],
            "path-derived-fallback",
        )
        self.assertEqual(
            enriched["human_labels"]["formalized_nodes"],
            1,
        )
        self.assertEqual(
            enriched["human_labels"]["blueprint_ref"],
            "a" * 40,
        )

    def test_renders_release_bound_static_concept_pages(self):
        graph = {
            "source_snapshot": {
                "source_repo": "the-omega-institute/trureturing",
                "source_commit": "a" * 40,
                "source_tree": "b" * 40,
                "truth_release_digest": "sha256:" + "c" * 64,
                "truth_graph_sha256": "sha256:" + "d" * 64,
            },
            "nodes": [
                {
                    "id": "D5/S0/Foundation",
                    "repo_path": "D5/S0/Foundation.lean",
                    "domain": "Foundation",
                    "layer": "D5/S0",
                    "status": "Closed",
                    "state": "closed",
                    "depth": 0,
                },
                {
                    "id": "D5/S1/Bridge",
                    "repo_path": "D5/S1/Bridge.lean",
                    "domain": "Bridge",
                    "layer": "D5/S1",
                    "status": "Open",
                    "state": "open",
                    "depth": 1,
                },
                {
                    "id": "D5/S3/Result",
                    "repo_path": "D5/S3/Result.lean",
                    "domain": "Result",
                    "layer": "D5/S3",
                    "status": "Closed",
                    "state": "closed",
                    "depth": 2,
                },
            ],
            "edges": [
                {
                    "source": "D5/S0/Foundation",
                    "target": "D5/S1/Bridge",
                    "layer": "truth-dependency",
                },
                {
                    "source": "D5/S1/Bridge",
                    "target": "D5/S3/Result",
                    "layer": "truth-dependency",
                },
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            blueprint_root = root / "upstream/Blueprint"
            blueprint = blueprint_root / "D5/S1/Bridge.md"
            blueprint.parent.mkdir(parents=True)
            blueprint.write_text(
                "# Human Bridge\n\n## Abstract\n\n"
                "Connects the foundation to the result.\n\n"
                "**Theorem 1.1 (Bridge closure).**\n",
                encoding="utf-8",
            )
            site = root / "site"
            data = site / "data"
            data.mkdir(parents=True)
            input_path = root / "graph.json"
            output_path = data / "truth-graph.v1.json"
            input_path.write_text(json.dumps(graph), encoding="utf-8")
            enriched = enrich_file(
                input_path,
                output_path,
                blueprint_root,
                blueprint_ref="a" * 40,
            )

            bridge_hash = stable_file_name("D5/S1/Bridge")
            current = site / "knowledge/node" / bridge_hash / "index.html"
            immutable = (
                site
                / "release"
                / ("c" * 64)
                / "node"
                / bridge_hash
                / "index.html"
            )
            index = site / "knowledge/index.v1.json"

            self.assertTrue(current.is_file())
            self.assertTrue(immutable.is_file())
            self.assertTrue(index.is_file())
            current_text = current.read_text(encoding="utf-8")
            immutable_text = immutable.read_text(encoding="utf-8")
            self.assertIn("Human Bridge", current_text)
            self.assertIn("Foundation", current_text)
            self.assertIn("Result", current_text)
            self.assertIn("Certified topology", current_text)
            self.assertIn("Authored exposition", current_text)
            self.assertIn("Immutable release view", immutable_text)
            self.assertEqual(
                enriched["nodes"][1]["knowledge_page"],
                f"knowledge/node/{bridge_hash}/",
            )
            self.assertEqual(
                enriched["nodes"][1]["release_page"],
                f"release/{'c' * 64}/node/{bridge_hash}/",
            )
            parsed_index = json.loads(index.read_text(encoding="utf-8"))
            self.assertEqual(
                parsed_index["release_digest"],
                "sha256:" + "c" * 64,
            )
            self.assertEqual(len(parsed_index["nodes"]), 3)

    def test_checked_in_graph_has_labels_for_formalized_and_open_nodes(self):
        graph = json.loads(
            (ROOT / "site/data/truth-graph.v1.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(len(graph["nodes"]), 682)
        self.assertTrue(
            all(node.get("human_title") for node in graph["nodes"])
        )
        formal = next(
            node
            for node in graph["nodes"]
            if node["id"].endswith("DensePhaseEscapeIdentity")
        )
        self.assertEqual(
            formal["human_title"],
            "Dense Phase Escape Identity",
        )
        self.assertTrue(formal["human_abstract"])
        open_node = next(
            node for node in graph["nodes"] if node["status"] == "Open"
        )
        self.assertIn(": ", open_node["human_title"])


if __name__ == "__main__":
    unittest.main()
