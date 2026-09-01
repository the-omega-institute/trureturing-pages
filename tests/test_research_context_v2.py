import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ResearchContextV2Tests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_assets_load_before_research_console(self):
        page = self.read("site/dag.html")
        self.assertIn("assets/research-context-v2.css", page)
        self.assertIn("assets/research-context-v2-core.js", page)
        self.assertIn("assets/research-context-v2.js", page)
        self.assertLess(
            page.index("assets/research-context-v2.js"),
            page.index("assets/research-console.js"),
        )

    def test_context_is_bounded_and_excludes_presentation_state(self):
        core = self.read("site/assets/research-context-v2-core.js")
        self.assertIn("selectedNodes: 16", core)
        self.assertIn("selectedClusters: 8", core)
        self.assertIn("neighborhood: 64", core)
        self.assertIn("affinities: 32", core)
        self.assertIn("pages_coordinates_included: false", core)
        self.assertIn("local_exploration_offsets_included: false", core)
        for forbidden in (
            "camera_position",
            "drag_offsets",
            "cluster_offsets",
            "human_note:",
            "prompt:",
        ):
            self.assertNotIn(forbidden, core)

    def test_runtime_only_injects_when_endpoint_advertises_v2(self):
        runtime = self.read("site/assets/research-context-v2.js")
        self.assertIn("state.agent.research_context_schema !== Core.SCHEMA", runtime)
        self.assertIn("payload.research_context_v2 = await build()", runtime)
        self.assertIn("comparableUrl(url) === comparableUrl(state.endpoint)", runtime)
        self.assertIn("originalFetch", runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("history.replaceState", runtime)

    def test_context_keeps_relation_authority_distinct(self):
        core = self.read("site/assets/research-context-v2-core.js")
        self.assertIn('certified_dependency: "truth"', core)
        self.assertIn('topology_structure: "deterministic-derived"', core)
        self.assertIn('affinity_witness: "deterministic-derived"', core)
        self.assertIn('counterfactual_preview: "advisory"', core)

    def test_node_syntax_and_behavior(self):
        for source in (
            "site/assets/research-context-v2-core.js",
            "site/assets/research-context-v2.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/research-context-v2.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_status_styles_cover_ready_disabled_and_error(self):
        styles = self.read("site/assets/research-context-v2.css")
        self.assertIn('data-tone="ready"', styles)
        self.assertIn('data-tone="disabled"', styles)
        self.assertIn('data-tone="error"', styles)
        self.assertIn("prefers-reduced-motion", styles)


if __name__ == "__main__":
    unittest.main()
