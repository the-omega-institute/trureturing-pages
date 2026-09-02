import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CmaFormalizationGatewayTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_page_loads_gateway_after_research_console(self):
        page = self.read("site/dag.html")
        self.assertIn("assets/cma-formalization-gateway.css", page)
        self.assertIn("assets/cma-formalization-gateway-core.js", page)
        self.assertIn("assets/cma-formalization-gateway.js", page)
        self.assertLess(
            page.index("assets/cma-formalization-gateway-core.js"),
            page.index("assets/cma-formalization-gateway.js"),
        )
        self.assertLess(
            page.index("assets/research-console.js"),
            page.index("assets/cma-formalization-gateway.js"),
        )

    def test_config_is_fail_closed_and_keeps_credentials_server_side(self):
        config = json.loads(self.read("site/data/cma-formalization-gateway.v1.json"))
        self.assertEqual(config["schema"], "pages-cma-formalization-gateway.v1")
        self.assertIs(config["enabled"], False)
        self.assertEqual(config["gateway_origin"], "")
        self.assertEqual(
            config["contribution_routes"]["github_user"]["credential_location"],
            "server-session",
        )
        self.assertEqual(
            config["contribution_routes"]["anonymous_service"]["credential_location"],
            "service-custody",
        )

    def test_runtime_requires_gate_and_explicit_approval(self):
        core = self.read("site/assets/cma-formalization-gateway-core.js")
        runtime = self.read("site/assets/cma-formalization-gateway.js")
        self.assertIn("submission requires an accepted gate result", core)
        self.assertIn("I approve one bounded formalization attempt", runtime)
        self.assertIn("github_connected !== true", runtime)
        self.assertIn('credentials: "include"', runtime)
        self.assertIn('"Idempotency-Key"', runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("github_token", runtime.lower())
        self.assertNotIn("personal_access_token", runtime.lower())

    def test_contracts_are_closed_and_vector_valued(self):
        names = (
            "pages-cma-formalization-gateway.v1.schema.json",
            "pages-formalization-gate-request.v1.schema.json",
            "pages-formalization-gate-result.v1.schema.json",
            "pages-formalization-submission.v1.schema.json",
        )
        for name in names:
            schema = json.loads(self.read(f"contracts/{name}"))
            self.assertIs(schema["additionalProperties"], False)
        gate = json.loads(
            self.read("contracts/pages-formalization-gate-result.v1.schema.json")
        )
        vector = gate["properties"]["gate_content"]["properties"]["value_vector"]
        self.assertIs(vector["additionalProperties"], False)
        self.assertNotIn("scalar_score", json.dumps(gate))

    def test_node_behavior_suite(self):
        for source in (
            "site/assets/cma-formalization-gateway-core.js",
            "site/assets/cma-formalization-gateway.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/cma-formalization-gateway.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
