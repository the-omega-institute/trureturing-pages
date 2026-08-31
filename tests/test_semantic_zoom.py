import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SemanticZoomSurfaceTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_semantic_zoom_assets_load_before_the_atlas_runtime(self):
        page = self.read("site/dag.html")
        self.assertIn('assets/atlas-semantic-zoom-core.js', page)
        self.assertLess(
            page.index('assets/atlas-semantic-zoom-core.js'),
            page.index('assets/dag.js'),
        )
        self.assertIn('id="atlas-context-bar"', page)
        self.assertIn('id="atlas-back"', page)
        self.assertIn('id="atlas-context-label"', page)
        self.assertIn('id="atlas-lod-indicator"', page)
        self.assertIn("Far view shows structural communities", page)

    def test_four_levels_have_deterministic_camera_hysteresis(self):
        core = self.read("site/assets/atlas-semantic-zoom-core.js")
        self.assertIn('["far", "medium", "near", "focus"]', core)
        self.assertIn("function levelFromCamera", core)
        self.assertIn("ratio < 2.55", core)
        self.assertIn("ratio >= 3.05", core)
        self.assertIn("ratio < 1.28", core)
        self.assertIn("ratio >= 1.68", core)
        self.assertIn("function canonicalRadius", core)
        self.assertIn("function effectiveLevel", core)

    def test_lod_is_structural_and_keeps_authority_classes_separate(self):
        core = self.read("site/assets/atlas-semantic-zoom-core.js")
        for role in (
            '"foundation"',
            '"hub"',
            '"bridge"',
            '"interface"',
            '"frontier-adjacent"',
        ):
            self.assertIn(role, core)
        self.assertIn("representative_node_ids", core)
        self.assertIn('edge.authority !== "certified"', core)
        self.assertIn('edge.authority === "derived"', core)
        self.assertIn("return incident", core)
        self.assertIn('edge.cluster_relation === "inter-cluster"', core)
        self.assertIn("edge.is_cut_bridge", core)
        self.assertIn("for (let hop = 0; hop < 2; hop += 1)", core)

    def test_runtime_uses_fixed_positions_and_camera_only_for_lod(self):
        runtime = self.read("site/assets/dag.js")
        self.assertIn("Semantic.graphView", runtime)
        self.assertIn("Semantic.levelFromCamera", runtime)
        self.assertIn("Semantic.effectiveLevel", runtime)
        self.assertIn("Semantic.canonicalRadius", runtime)
        self.assertIn("fx: position.x", runtime)
        self.assertIn("fy: position.y", runtime)
        self.assertIn("fz: position.z", runtime)
        self.assertIn("warmupTicks(0)", runtime)
        self.assertIn("cooldownTicks(0)", runtime)
        self.assertNotIn("d3Force(", runtime)
        self.assertNotIn("d3AlphaDecay", runtime)
        self.assertNotIn("function hash(", runtime)

    def test_cluster_navigation_and_release_bound_url_state_are_explicit(self):
        runtime = self.read("site/assets/dag.js")
        self.assertIn('params.set("mode", activeMode)', runtime)
        self.assertIn('params.set("lod", automaticLod)', runtime)
        self.assertIn('params.set("cluster", activeCluster)', runtime)
        self.assertIn('params.set("node", selectedId)', runtime)
        self.assertIn("clusterHistory.push", runtime)
        self.assertIn("clusterHistory.pop", runtime)
        self.assertIn("setCluster(descriptor.cluster_id)", runtime)
        self.assertIn("activeCluster = requestedCluster", runtime)

    def test_semantic_zoom_styles_and_behavior_tests_are_present(self):
        structure_styles = self.read("site/assets/atlas-structure.css")
        semantic_styles = self.read("site/assets/atlas-semantic-zoom.css")
        self.assertTrue(
            structure_styles.startswith('@import url("atlas-semantic-zoom.css");')
        )
        self.assertIn('.atlas-context-bar[data-lod="medium"]', semantic_styles)
        self.assertIn('.atlas-cluster-overlay[data-lod="far"]', semantic_styles)
        self.assertIn('.atlas-cluster-hull.is-muted', semantic_styles)
        self.assertTrue((ROOT / "tests/js/atlas-semantic-zoom.test.js").is_file())
        atlas_test = self.read("tests/js/atlas-structure.test.js")
        self.assertIn('require("./atlas-semantic-zoom.test.js")', atlas_test)


if __name__ == "__main__":
    unittest.main()
