import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AtlasObservationTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_assets_are_loaded_in_dependency_order(self):
        page = self.read("site/dag.html")
        for asset in (
            "assets/atlas-exploration-core.js",
            "assets/atlas-compare-core.js",
            "assets/atlas-observation-core.js",
            "assets/atlas-exploration-runtime.js",
            "assets/atlas-compare-runtime.js",
        ):
            self.assertIn(asset, page)
            self.assertLess(page.index(asset), page.index("assets/dag.js"))
        self.assertIn("assets/atlas-observation-runtime.js", page)
        self.assertGreater(
            page.index("assets/atlas-observation-runtime.js"),
            page.index("assets/research-writeback.js"),
        )
        self.assertIn("assets/atlas-observation.css", page)

    def test_observation_requires_one_explicit_form_submission(self):
        runtime = self.read("site/assets/atlas-observation-runtime.js")
        self.assertIn('form.addEventListener("submit", submitObservation)', runtime)
        self.assertIn("ui.confirm.checked", runtime)
        self.assertIn("explicitly_saved: true", runtime)
        self.assertEqual(
            runtime.count('"register-human-structure-observation"'),
            1,
        )
        self.assertNotIn("onNodeDrag", runtime)
        self.assertNotIn("onNodeHover", runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("sessionStorage", runtime)
        self.assertNotIn("setInterval", runtime)

    def test_only_explicit_structural_gestures_enter_the_capture(self):
        runtime = self.read("site/assets/atlas-observation-runtime.js")
        for seam in (
            'target.id === "compare-concept"',
            'target.id === "compare-community"',
            'target.id === "atlas-peel"',
            'target.id === "reset-exploration"',
            "comparisonForNodes",
            "comparisonForClusters",
            "deriveCapture",
        ):
            self.assertIn(seam, runtime)
        core = self.read("site/assets/atlas-observation-core.js")
        for gesture in (
            "selection",
            "compare",
            "bring-together",
            "cluster-peel",
            "path-inspection",
            "frontier-mark",
        ):
            self.assertIn(f'"{gesture}"', core)
        self.assertIn("edgeAuthority(edge) !==", core)
        self.assertIn("selection contains a relation that is not certified", core)

    def test_release_coordinates_and_intuition_contract_are_exact(self):
        core = self.read("site/assets/atlas-observation-core.js")
        for field in (
            "truth_release_digest",
            "certified_topology_digest",
            "topology_atlas_digest",
            "pages_conformation_digest",
            "source_commit",
            "source_tree",
            "topology_atlas_input_receipt_ref",
        ):
            self.assertIn(field, core)
        config = json.loads(self.read("site/data/research-agent.v1.json"))
        self.assertFalse(config["structure_observation_submit_enabled"])
        self.assertIsNone(config["topology_atlas_input_receipt_ref"])
        self.assertEqual(
            config["topology_atlas_input_receipt_provider"],
            "trureturingTopologyAtlasInputReceipt",
        )
        contract = config["contracts"]["human_structure_observation"]
        self.assertEqual(
            contract["repository"],
            "the-omega-institute/trureturing-intuition",
        )
        self.assertEqual(
            contract["ref"],
            "5df43cb710255b0ba52e82b89312605e9f13fa0e",
        )
        self.assertEqual(
            contract["path"],
            "contracts/human-structure-observation.v1.schema.json",
        )
        self.assertRegex(contract["git_blob_sha"], r"^[0-9a-f]{40}$")

    def test_preparation_is_session_memory_only_when_submission_is_disabled(self):
        runtime = self.read("site/assets/atlas-observation-runtime.js")
        self.assertIn("state.prepared = observation", runtime)
        self.assertIn("No network submission occurred", runtime)
        self.assertIn("structure_observation_submit_enabled", runtime)
        self.assertIn("state.config.enabled", runtime)
        self.assertNotIn("indexedDB", runtime)
        self.assertNotIn("history.replaceState", runtime)

    def test_unicode_canonicalization_matches_server_security_boundary(self):
        core = self.read("site/assets/atlas-observation-core.js")
        self.assertIn("code >= 0x7f", core)
        for code_point in (
            "0x22",
            "0x26",
            "0x27",
            "0x2b",
            "0x2f",
            "0x3c",
            "0x3e",
            "0x60",
        ):
            self.assertIn(code_point, core)
        self.assertIn("canonicalText", core)
        self.assertIn("sha256Reference(content", core)

    def test_styles_are_responsive_and_accessible(self):
        styles = self.read("site/assets/atlas-observation.css")
        self.assertIn(".atlas-observation-panel", styles)
        self.assertIn(".atlas-observation-action:disabled", styles)
        self.assertIn("prefers-reduced-motion", styles)
        runtime = self.read("site/assets/atlas-observation-runtime.js")
        self.assertIn('panel.setAttribute("role", "dialog")', runtime)
        self.assertIn('status.setAttribute("aria-live", "polite")', runtime)

    def test_javascript_syntax_and_behavior(self):
        for source in (
            "site/assets/atlas-observation-core.js",
            "site/assets/atlas-observation-runtime.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/atlas-observation.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
