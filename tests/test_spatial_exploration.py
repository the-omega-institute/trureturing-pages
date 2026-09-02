import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SpatialExplorationTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_exploration_assets_load_before_the_atlas_runtime(self):
        page = self.read("site/dag.html")
        for asset in (
            "assets/atlas-exploration-core.js",
            "assets/atlas-exploration-runtime.js",
        ):
            self.assertIn(asset, page)
            self.assertLess(page.index(asset), page.index("assets/dag.js"))
        self.assertIn("temporary local exploration offset", page)

    def test_runtime_wraps_graph_data_without_changing_canonical_conformation(self):
        runtime = self.read("site/assets/atlas-exploration-runtime.js")
        self.assertIn("const originalFactory = window.ForceGraph3D", runtime)
        self.assertIn("state.originalGraphData", runtime)
        self.assertIn("Exploration.composePositions", runtime)
        self.assertIn("state.canonicalById", runtime)
        self.assertIn("fx: position.x", runtime)
        self.assertIn("fy: position.y", runtime)
        self.assertIn("fz: position.z", runtime)
        self.assertNotIn("pages-conformation.v1.json\", { method:", runtime)
        self.assertNotIn("localStorage", runtime)
        self.assertNotIn("history.replaceState", runtime)

    def test_drag_peel_expand_and_reset_are_explicit(self):
        runtime = self.read("site/assets/atlas-exploration-runtime.js")
        for seam in (
            "enableNodeDrag(true)",
            "onNodeDragEnd",
            "nodeOffsetFromDrag",
            "peelOffset",
            "renderExpandedFocus",
            "resetExploration",
            'button("expand-foundations"',
            'button("expand-consequences"',
            'button("expand-related"',
            'button("atlas-peel"',
            'button("return-node"',
            'button("reset-exploration"',
        ):
            self.assertIn(seam, runtime)
        self.assertIn("sessionStorage", runtime)
        self.assertIn("manifest.conformation_digest", runtime)

    def test_focus_expansion_remains_bounded_and_relation_typed(self):
        core = self.read("site/assets/atlas-exploration-core.js")
        self.assertIn("const MAX_LOCAL_OFFSETS = 64", core)
        self.assertIn("const MAX_HOPS = 6", core)
        self.assertIn("const MAX_FOCUS_NODES = 120", core)
        self.assertIn('edge.authority !== "derived"', core)
        self.assertIn('edge.authority === "certified"', core)
        self.assertIn("return edge.source === options.selectedId", core)
        self.assertIn('schema: "pages-local-exploration.v1"', core)
        self.assertIn("release_key", core)

    def test_exploration_state_is_session_only_and_excludes_research_content(self):
        core = self.read("site/assets/atlas-exploration-core.js")
        runtime = self.read("site/assets/atlas-exploration-runtime.js")
        combined = core + runtime
        for forbidden in (
            "human_prompt",
            "agent_response",
            "candidate_statement",
            "bearer",
            "authorization",
        ):
            self.assertNotIn(forbidden, combined)
        self.assertNotIn("localStorage", combined)
        self.assertNotIn("indexedDB", combined)

    def test_exploration_css_is_loaded_and_responsive(self):
        semantic = self.read("site/assets/atlas-semantic-zoom.css")
        styles = self.read("site/assets/atlas-exploration.css")
        self.assertTrue(semantic.startswith('@import url("atlas-exploration.css");'))
        self.assertIn(".atlas-exploration-actions", styles)
        self.assertIn(".atlas-exploration-action:disabled", styles)
        self.assertIn("prefers-reduced-motion", styles)

    def test_node_behavior_and_syntax(self):
        for source in (
            "site/assets/atlas-exploration-core.js",
            "site/assets/atlas-exploration-runtime.js",
        ):
            subprocess.run(
                ["node", "--check", source],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(
            ["node", "tests/js/atlas-exploration.test.js"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
