import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StructureObservationTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_observation_assets_are_release_loaded(self):
        page = self.read("site/dag.html")
        self.assertIn("assets/structure-observation.css", page)
        self.assertIn("assets/structure-observation-core.js", page)
        self.assertIn("assets/structure-observation-runtime.js", page)
        self.assertLess(
            page.index("assets/dag.js"),
            page.index("assets/structure-observation-runtime.js"),
        )

    def test_save_is_explicit_and_selection_bound(self):
        runtime = self.read("site/assets/structure-observation-runtime.js")
        self.assertIn('button.textContent = "Save observation"', runtime)
        self.assertIn('form.addEventListener("submit"', runtime)
        self.assertIn("Observation.buildRequest", runtime)
        self.assertIn("explicit observation", runtime)
        self.assertIn("fetch(state.endpoint", runtime)
        self.assertNotIn("onNodeDragEnd", runtime)
        self.assertNotIn("onNodeHover", runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("cameraPosition", runtime)

    def test_contract_excludes_presentation_telemetry(self):
        core = self.read("site/assets/structure-observation-core.js")
        self.assertIn('explicitly_saved: true', core)
        self.assertIn('source_surface: "trureturing-pages"', core)
        self.assertIn("topology_atlas_input_receipt_ref", core)
        self.assertIn("pages_conformation_digest", core)
        self.assertNotIn("drag_offsets:", core)
        self.assertNotIn("camera:", core)
        self.assertNotIn("hover", core.lower())

    def test_runtime_requires_published_intuition_coordinates(self):
        runtime = self.read("site/assets/structure-observation-runtime.js")
        self.assertIn("agent.structure_observation_endpoint", runtime)
        self.assertIn("agent.topology_atlas_input_receipt_ref", runtime)
        self.assertIn("state.atlasReceiptRef", runtime)
        self.assertIn("state.endpoint", runtime)

    def test_node_contract_and_syntax(self):
        for source in (
            "site/assets/structure-observation-core.js",
            "site/assets/structure-observation-runtime.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/structure-observation.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_accessible_dialog_styles_exist(self):
        styles = self.read("site/assets/structure-observation.css")
        self.assertIn(".structure-observation-dialog", styles)
        self.assertIn(".structure-observation-dialog::backdrop", styles)
        self.assertIn(".structure-observation-status[data-tone=\"error\"]", styles)
        self.assertIn("prefers-reduced-motion", styles)


if __name__ == "__main__":
    unittest.main()
