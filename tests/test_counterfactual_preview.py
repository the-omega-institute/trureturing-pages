import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CounterfactualPreviewTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_preview_assets_load_before_atlas_runtime(self):
        page = self.read("site/dag.html")
        self.assertIn("assets/counterfactual-preview.css", page)
        self.assertIn("assets/counterfactual-preview-core.js", page)
        self.assertIn("assets/counterfactual-preview-runtime.js", page)
        self.assertLess(
            page.index("assets/counterfactual-preview-runtime.js"),
            page.index("assets/dag.js"),
        )

    def test_runtime_uses_svg_overlay_and_never_rewrites_graph_data(self):
        runtime = self.read("site/assets/counterfactual-preview-runtime.js")
        self.assertIn("graph2ScreenCoords", runtime)
        self.assertIn('document.createElementNS("http://www.w3.org/2000/svg"', runtime)
        self.assertIn("counterfactual-preview-overlay", runtime)
        self.assertNotIn("renderer.graphData(", runtime)
        self.assertNotIn("positionById.set", runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("history.replaceState", runtime)

    def test_preview_is_advisory_and_release_bound(self):
        core = self.read("site/assets/counterfactual-preview-core.js")
        runtime = self.read("site/assets/counterfactual-preview-runtime.js")
        self.assertIn('value.authority !== "advisory"', core)
        self.assertIn("different release coordinates", core)
        self.assertIn("Accepted preview cannot carry cycle risk", core)
        self.assertIn("Ghost geometry and predicted deltas", runtime)
        self.assertIn("do not change the release conformation", runtime)
        self.assertNotIn("formalize", core.lower())

    def test_preview_contract_forbids_coordinates(self):
        core = self.read("site/assets/counterfactual-preview-core.js")
        for value in ("x", "y", "z", "fx", "fy", "fz", "camera"):
            self.assertIn(f'"{value}"', core)
        self.assertIn("cannot carry", core)

    def test_node_syntax_and_projection(self):
        for source in (
            "site/assets/counterfactual-preview-core.js",
            "site/assets/counterfactual-preview-runtime.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/counterfactual-preview.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_accessible_panel_and_reduced_motion_styles(self):
        styles = self.read("site/assets/counterfactual-preview.css")
        self.assertIn(".counterfactual-preview-panel", styles)
        self.assertIn("pointer-events: none", styles)
        self.assertIn("prefers-reduced-motion", styles)
        self.assertIn('data-classification="rejected-cycle"', styles)


if __name__ == "__main__":
    unittest.main()
