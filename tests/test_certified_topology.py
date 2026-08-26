import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.certified_topology import (  # noqa: E402
    TopologyContractError,
    enrich_dag,
    read_certified_topology,
)


FIXTURE = ROOT / "tests" / "fixtures" / "certified-topology.v1.json"


class CertifiedTopologyAdapterTests(unittest.TestCase):
    def test_fixture_metrics_feed_the_dag_view_exactly(self):
        topology = read_certified_topology(FIXTURE)
        metric = topology.nodes[0]
        self.assertEqual(metric.node_id, "D5/S0/Closed")
        self.assertEqual(metric.descendant_cost, 3)
        self.assertEqual(str(metric.normalized_reach), "1/2")
        self.assertEqual(str(metric.dependency_betweenness), "7/9")

        graph = {
            "schema_version": "truth-graph.v1",
            "nodes": [{"id": "D5/S0/Closed", "gid": "D5/S0/Closed"}],
            "edges": [],
        }
        enriched = enrich_dag(graph, topology)
        node = enriched["nodes"][0]
        self.assertEqual(node["true_depth"], 0)
        self.assertEqual(node["in_degree"], 0)
        self.assertEqual(node["descendant_count"], 1)
        self.assertEqual(node["dependency_betweenness"], "7/9")
        self.assertEqual(
            enriched["schema_version"],
            "pages-certified-topology-view.v1",
        )

    def test_malformed_and_unreduced_inputs_fail_closed(self):
        valid = FIXTURE.read_text(encoding="utf-8")
        mutations = (
            valid.replace('"descendant_cost": 3', '"descendant_cost": 3.0'),
            valid.replace(
                '"numerator": 7,\n        "denominator": 9',
                '"numerator": 14,\n        "denominator": 18',
            ),
            valid.replace(
                '"schema_version": "certified-topology.v1"',
                '"schema_version": "certified-topology.v1", "unknown": true',
            ),
        )
        for content in mutations:
            with self.subTest(content=content[:80]):
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory) / "bad.json"
                    path.write_text(content, encoding="utf-8")
                    with self.assertRaises(TopologyContractError):
                        read_certified_topology(path)

    def test_vendored_schema_is_pinned_to_upstream_bytes(self):
        import hashlib

        schema = ROOT / "contracts" / "certified-topology.v1.schema.json"
        self.assertEqual(
            hashlib.sha256(schema.read_bytes()).hexdigest(),
            "f6a6eabcf79b7db44eb2ec8b296345c44fa23e5057a26dc4a506529398ff2c42",
        )


if __name__ == "__main__":
    unittest.main()
