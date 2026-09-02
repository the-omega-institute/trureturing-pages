import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class NyxIdResearchAuthenticationTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_atlas_loads_auth_before_research_transport(self):
        html = self.read("site/dag.html")
        for asset in (
            "assets/nyxid-auth.css",
            "assets/nyxid-auth-core.js",
            "assets/nyxid-auth.js",
            "assets/research-console.js",
        ):
            self.assertIn(asset, html)
        self.assertLess(
            html.index("assets/nyxid-auth-core.js"),
            html.index("assets/nyxid-auth.js"),
        )
        self.assertLess(
            html.index("assets/nyxid-auth.js"),
            html.index("assets/research-console.js"),
        )
        for element_id in (
            'id="nyxid-auth-control"',
            'id="nyxid-auth-status"',
            'id="nyxid-auth-user"',
            'id="nyxid-auth-sign-in"',
            'id="nyxid-auth-disconnect"',
            'id="research-auth-gate"',
        ):
            self.assertIn(element_id, html)
        self.assertRegex(html, r'id="research-auth-gate"[^>]+disabled')

    def test_public_client_config_is_fail_closed(self):
        config = json.loads(self.read("site/data/nyxid-auth.v1.json"))
        self.assertEqual(config["schema"], "pages-nyxid-auth.v1")
        self.assertIs(config["enabled"], False)
        self.assertEqual(config["issuer"], "https://nyx-api.chrono-ai.fun")
        self.assertEqual(config["client_id"], "")
        self.assertEqual(config["redirect_path"], "auth/callback.html")
        self.assertEqual(config["scopes"], ["openid", "profile"])
        self.assertEqual(
            config["discovery_path"],
            "/.well-known/openid-configuration",
        )
        self.assertEqual(config["token_storage"], "session-only-access-token")
        self.assertIs(config["refresh_tokens"], False)
        self.assertNotIn("client_secret", config)

    def test_contract_requires_public_pkce_configuration(self):
        schema = json.loads(
            self.read("contracts/pages-nyxid-auth.v1.schema.json")
        )
        self.assertEqual(schema["$id"], "pages-nyxid-auth.v1")
        self.assertIs(schema["additionalProperties"], False)
        self.assertEqual(
            schema["properties"]["redirect_path"]["const"],
            "auth/callback.html",
        )
        self.assertEqual(
            schema["properties"]["token_storage"]["const"],
            "session-only-access-token",
        )
        self.assertIs(schema["properties"]["refresh_tokens"]["const"], False)
        self.assertEqual(
            schema["allOf"][0]["then"]["properties"]["client_id"]["minLength"],
            1,
        )

    def test_auth_runtime_exposes_existing_research_providers(self):
        source = self.read("site/assets/nyxid-auth.js")
        self.assertIn("window.trureturingResearchCredential = credential", source)
        self.assertIn("window.trureturingResearchActor = actor", source)
        self.assertIn("Core.AUTH_EVENT", source)
        self.assertIn("sessionStorage", source)
        self.assertIn("Core.clearResearchThreads", source)
        self.assertNotIn("localStorage.setItem", source)
        self.assertNotIn("client_secret", source)
        self.assertNotIn("refresh_token", source)
        self.assertNotIn("document.cookie", source)
        self.assertNotIn("innerHTML", source)
        self.assertNotIn("eval(", source)

    def test_callback_verifies_identity_and_persists_only_sanitized_session(self):
        callback = self.read("site/assets/nyxid-auth-callback.js")
        page = self.read("site/auth/callback.html")
        self.assertIn("Core.exchangeAuthorizationCode", callback)
        self.assertIn("Core.verifyIdToken", callback)
        self.assertIn("Core.createStoredSession", callback)
        self.assertIn("sessionStorage.setItem", callback)
        self.assertIn("window.history.replaceState", callback)
        self.assertIn("window.location.replace(transaction.return_to)", callback)
        self.assertNotIn("refresh_token", callback)
        self.assertNotIn("localStorage.setItem", callback)
        self.assertIn("Content-Security-Policy", page)
        self.assertIn("https://nyx-api.chrono-ai.fun", page)
        self.assertIn("../assets/nyxid-auth-core.js", page)
        self.assertIn("../assets/nyxid-auth-callback.js", page)

    def test_core_requires_s256_public_client_and_signed_id_token(self):
        source = self.read("site/assets/nyxid-auth-core.js")
        for phrase in (
            'includes("S256")',
            'includes("none")',
            'parsed.header.alg !== "RS256"',
            "ID token signature verification failed",
            "ID token issuer mismatch",
            "ID token audience mismatch",
            "ID token nonce mismatch",
            "ID token access-token hash mismatch",
            "browser refresh-token custody must remain disabled",
        ):
            self.assertIn(phrase, source)
        self.assertNotIn("localStorage", source)
        self.assertNotIn("document.cookie", source)

    def test_node_contract_and_browser_syntax(self):
        for source in (
            "site/assets/nyxid-auth-core.js",
            "site/assets/nyxid-auth.js",
            "site/assets/nyxid-auth-callback.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/nyxid-auth.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_handoff_document_keeps_activation_external(self):
        document = self.read("docs/NYXID_RESEARCH_AUTH.md")
        for phrase in (
            "Authorization Code with PKCE S256",
            "token_endpoint_auth_method=none",
            "https://nyx-api.chrono-ai.fun",
            "trureturingResearchCredential",
            "trureturingResearchActor",
            "CMA CORS grant",
            "trureturing-research",
            "read-only truth-release checkout",
        ):
            self.assertIn(phrase, document)


if __name__ == "__main__":
    unittest.main()
