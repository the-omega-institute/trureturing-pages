import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CmaResearchRoutingTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_assets_are_wired_before_research_console(self):
        page = self.read("site/dag.html")
        for asset in (
            "assets/research-context-v2-core.js",
            "assets/research-context-v2.js",
            "assets/cma-research-routing-core.js",
            "assets/cma-research-routing.js",
            "assets/cma-research-routing.css",
        ):
            self.assertIn(asset, page)
        self.assertLess(
            page.index("assets/research-context.js"),
            page.index("assets/cma-research-routing.js"),
        )
        self.assertLess(
            page.index("assets/cma-research-routing.js"),
            page.index("assets/research-console.js"),
        )
        self.assertIn("Discuss and understand", page)
        self.assertIn("Check whether this should be formalized", page)
        self.assertIn("Send to CMA", page)

    def test_configuration_declares_two_identity_and_contribution_routes(self):
        config = json.loads(self.read("site/data/research-agent.v1.json"))
        self.assertFalse(config["enabled"])
        self.assertEqual(config["cma_origin"], "https://bot.chrono-ai.fun")
        self.assertEqual(
            config["capabilities_path"],
            "/api/v1/agui/capabilities",
        )
        self.assertEqual(
            config["research_endpoint"],
            "https://bot.chrono-ai.fun/api/v1/agui/run",
        )
        self.assertEqual(
            config["research_context_schema"],
            "pages-research-context.v2",
        )
        self.assertEqual(
            config["profile_revision"],
            "research-v3-admission-routing",
        )
        self.assertEqual(
            config["identity"]["github"]["transport"],
            "nyxid-bearer",
        )
        self.assertEqual(
            config["identity"]["anonymous"]["transport"],
            "sponsored-bearer",
        )
        self.assertEqual(
            config["contribution"]["github"]["publisher"],
            "cma-trigger-contributor-fork",
        )
        self.assertEqual(
            config["contribution"]["anonymous"]["publisher"],
            "trureturing-system-service",
        )
        self.assertEqual(
            config["admission"]["admitted_decisions"],
            ["formalization-candidate", "priority-candidate"],
        )
        self.assertFalse(config["formalize_submit_enabled"])

    def test_closed_contracts_separate_admission_from_contribution(self):
        admission = json.loads(
            self.read("contracts/pages-formalization-admission.v1.schema.json")
        )
        contribution = json.loads(
            self.read("contracts/pages-contribution-intent.v1.schema.json")
        )
        self.assertEqual(
            admission["$id"],
            "pages-formalization-admission.v1",
        )
        self.assertFalse(admission["additionalProperties"])
        decisions = admission["properties"]["admission_content"]["properties"]["decision"]["enum"]
        self.assertIn("reuse-existing", decisions)
        self.assertIn("formalization-candidate", decisions)
        self.assertIn("priority-candidate", decisions)
        routes = admission["properties"]["admission_content"]["properties"]["allowed_contribution_routes"]["items"]["enum"]
        self.assertEqual(routes, ["github-user-pr", "anonymous-system-pr"])

        self.assertEqual(
            contribution["$id"],
            "pages-contribution-intent.v1",
        )
        self.assertFalse(contribution["additionalProperties"])
        route_enum = contribution["properties"]["intent_content"]["properties"]["route"]["enum"]
        self.assertEqual(route_enum, ["github-user-pr", "anonymous-system-pr"])
        actor = contribution["properties"]["intent_content"]["properties"]["actor"]
        self.assertIn("github_connection_ref", actor["required"])
        self.assertIn("anonymous_session_ref", actor["required"])

    def test_runtime_keeps_credentials_out_of_persistent_state(self):
        runtime = self.read("site/assets/cma-research-routing.js")
        core = self.read("site/assets/cma-research-routing-core.js")
        self.assertIn("window.trureturingResearchCredential", runtime)
        self.assertIn("credential_provider", runtime)
        self.assertIn("actor_provider", runtime)
        self.assertIn("sessionStorage", runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("document.cookie", runtime)
        self.assertNotIn("access_token", runtime)
        self.assertNotIn("refresh_token", runtime)
        self.assertNotIn("client_secret", runtime)
        self.assertIn("formalizationAdmission", runtime)
        self.assertIn("response.clone()", runtime)
        self.assertIn("admissionFromEvent", core)
        self.assertIn("formalization_allowed", core)
        self.assertIn("github-user-pr", core)
        self.assertIn("anonymous-system-pr", core)

    def test_admission_is_required_before_contribution_submit(self):
        runtime = self.read("site/assets/cma-research-routing.js")
        core = self.read("site/assets/cma-research-routing-core.js")
        self.assertIn("Core.canFormalize(state.admission)", runtime)
        self.assertIn("allowed_contribution_routes.includes(route)", core)
        self.assertIn("formalization admission is absent, declined, or expired", core)
        self.assertIn("form.requestSubmit()", runtime)
        self.assertIn("Invoke the configured Formalize capability at most once", runtime)
        self.assertIn("review the generated diff", runtime)
        self.assertIn("system-owned formalization attempt", runtime)

    def test_scripts_pass_node_syntax_and_behavior(self):
        for source in (
            "site/assets/cma-research-routing-core.js",
            "site/assets/cma-research-routing.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/cma-research-routing.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
