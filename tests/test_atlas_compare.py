import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AtlasCompareIntegrationTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_compare_assets_load_before_the_atlas_runtime(self):
        page = self.read("site/dag.html")
        for asset in (
            "assets/atlas-compare-core.js",
            "assets/atlas-compare-runtime.js",
        ):
            self.assertIn(asset, page)
            self.assertLess(page.index(asset), page.index("assets/dag.js"))
        self.assertIn("Shift while choosing a second concept", page)
        self.assertIn("certified paths", page)

    def test_core_uses_certified_adjacency_for_paths(self):
        core = self.read("site/assets/atlas-compare-core.js")
        self.assertIn('edge.authority === "certified"', core)
        self.assertIn("model.children.get(current)", core)
        self.assertIn("shortestCertifiedPath", core)
        self.assertIn("pathBetween", core)
        self.assertIn("sharedPrerequisites", core)
        self.assertIn("leftOnlyPrerequisites", core)
        self.assertIn("rightOnlyPrerequisites", core)
        self.assertIn("sharedDependents", core)
        self.assertIn("certifiedInterfacePresent", core)
        self.assertIn('authority: "derived"', core)

    def test_runtime_exposes_explicit_node_and_cluster_compare(self):
        runtime = self.read("site/assets/atlas-compare-runtime.js")
        for seam in (
            'createButton("compare-concept"',
            'createButton("compare-community"',
            'createButton("compare-path-only"',
            'createButton("clear-comparison"',
            "beginNodeComparison",
            "beginClusterComparison",
            "compareNodes",
            "compareClusters",
            "renderPath",
            "renderNodeComparison",
            "renderClusterComparison",
        ):
            self.assertIn(seam, runtime)
        self.assertIn('event.key !== "Shift"', runtime)
        self.assertIn("MutationObserver", runtime)

    def test_comparison_view_keeps_relation_authority_visible(self):
        runtime = self.read("site/assets/atlas-compare-runtime.js")
        self.assertIn('link.authority === "derived"', runtime)
        self.assertIn('link.authority === "certified"', runtime)
        self.assertIn('link.cluster_relation === "inter-cluster"', runtime)
        self.assertIn("pathEdges.has(key)", runtime)
        self.assertIn("No directed certified dependency path", runtime)
        self.assertIn("derived proximity and is not a proof dependency", runtime)
        self.assertIn("No certified interface edge is present", runtime)

    def test_comparison_does_not_persist_or_submit_research(self):
        combined = self.read("site/assets/atlas-compare-core.js") + self.read(
            "site/assets/atlas-compare-runtime.js"
        )
        for forbidden in (
            "localStorage",
            "sessionStorage",
            "formalize",
            "human_prompt",
            "candidate_statement",
            "authorization",
            "fetch(\"/api",
        ):
            self.assertNotIn(forbidden, combined.lower())
        self.assertNotIn("history.replaceState", combined)

    def test_compare_styles_are_loaded_and_accessible(self):
        exploration = self.read("site/assets/atlas-exploration.css")
        styles = self.read("site/assets/atlas-compare.css")
        self.assertTrue(exploration.startswith('@import url("atlas-compare.css");'))
        self.assertIn(".atlas-compare-panel", styles)
        self.assertIn(".atlas-path-steps", styles)
        self.assertIn(".atlas-compare-action:disabled", styles)
        self.assertIn("prefers-reduced-motion", styles)

    def test_javascript_syntax_and_behavior(self):
        for source in (
            "site/assets/atlas-compare-core.js",
            "site/assets/atlas-compare-runtime.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/atlas-compare.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
