import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ResearchWritebackTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_dag_loads_writeback_assets_after_research_console(self):
        html = self.read("site/dag.html")
        for asset in (
            "assets/research-writeback.css",
            "assets/research-writeback.js",
            "assets/research-writeback-ui.js",
        ):
            self.assertIn(asset, html)
        self.assertLess(
            html.index("assets/research-console.js"),
            html.index("assets/research-writeback.js"),
        )
        self.assertLess(
            html.index("assets/research-writeback.js"),
            html.index("assets/research-writeback-ui.js"),
        )

    def test_runtime_config_pins_both_writeback_contracts(self):
        config = json.loads(self.read("site/data/research-agent.v1.json"))
        self.assertIs(config["intuition_submit_enabled"], False)
        self.assertIs(config["formalize_submit_enabled"], False)
        self.assertEqual(
            config["human_actor_provider"],
            "trureturingResearchActor",
        )
        self.assertEqual(
            config["topology_artifact_path"],
            "data/certified-topology.v1.json",
        )
        self.assertEqual(
            config["topology_publication_path"],
            "data/topology-publication.v1.json",
        )
        intuition = config["contracts"]["human_intuition_candidate"]
        self.assertEqual(
            intuition["repository"],
            "the-omega-institute/trureturing-intuition",
        )
        self.assertEqual(
            intuition["path"],
            "contracts/human-intuition-candidate.v1.schema.json",
        )
        self.assertEqual(
            intuition["git_blob_sha"],
            "ea9fa69eaa328b3e3f49b0e9bc55f8d7801ea002",
        )
        formalize = config["contracts"]["formalization_request"]
        self.assertEqual(
            formalize["repository"],
            "the-omega-institute/trureturing-formalize",
        )
        self.assertEqual(
            formalize["path"],
            "contracts/formalization-request.v1.schema.json",
        )
        self.assertEqual(
            formalize["git_blob_sha"],
            "90c44950c9b6863deaa15e3b8b53a0b934f81809",
        )

    def test_writeback_is_typed_and_keeps_certification_out_of_browser(self):
        builder = self.read("site/assets/research-writeback.js")
        runtime = self.read("site/assets/research-writeback-ui.js")
        self.assertIn('schema: "human-intuition-candidate.v1"', builder)
        self.assertIn('schema_version: "formalization-request.v1"', builder)
        self.assertIn("candidate_id: await sha256Reference", builder)
        self.assertIn("topology_publication_digest", builder)
        self.assertIn("Register candidate once", runtime)
        self.assertIn("I approve one submission", runtime)
        self.assertIn("Certification still requires protected Base admission", runtime)
        self.assertNotIn('status: "certified"', builder)
        self.assertNotIn("github_token", builder.lower())
        self.assertNotIn("innerHTML", runtime)
        self.assertNotIn("eval(", runtime)

    def test_agent_config_schema_requires_contract_coordinates(self):
        schema = json.loads(
            self.read("contracts/pages-research-agent.v1.schema.json")
        )
        self.assertIs(schema["additionalProperties"], False)
        for field in (
            "human_actor_provider",
            "topology_artifact_path",
            "topology_publication_path",
            "contracts",
            "intuition_submit_enabled",
            "formalize_submit_enabled",
        ):
            self.assertIn(field, schema["required"])
        coordinate = schema["$defs"]["contractCoordinate"]
        self.assertIs(coordinate["additionalProperties"], False)
        self.assertEqual(
            coordinate["properties"]["ref"]["pattern"],
            "^[0-9a-f]{40}$",
        )


if __name__ == "__main__":
    unittest.main()
