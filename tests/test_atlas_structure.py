import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AtlasStructureSurfaceTests(unittest.TestCase):
    def read(self, relative):
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_atlas_exposes_structure_dependency_and_frontier_modes(self):
        page = self.read("site/dag.html")
        for mode in ("structure", "dependency", "frontier"):
            self.assertIn(f'data-atlas-mode="{mode}"', page)
        self.assertIn('id="cluster-filter"', page)
        self.assertIn('id="cluster-overlay"', page)
        self.assertIn('assets/atlas-structure-core.js', page)
        self.assertIn('assets/atlas-structure.css', page)
        self.assertLess(
            page.index('assets/atlas-structure-core.js'),
            page.index('assets/dag.js'),
        )
        self.assertNotIn('id="layer-filter"', page)

    def test_default_surface_prioritizes_structure_over_engineering_metadata(self):
        page = self.read("site/dag.html")
        for text in (
            "Communities",
            "Cut bridges",
            "Open frontier",
            "Topology community",
            "Selected structural affinity",
        ):
            self.assertIn(text, page)
        for field in (
            "Repository path",
            "Node ID",
            "Source commit",
            "Topology producer",
        ):
            self.assertNotIn(field, page)

    def test_renderer_consumes_fixed_coordinates_and_selection_gates_affinity(self):
        runtime = self.read("site/assets/dag.js")
        core = self.read("site/assets/atlas-structure-core.js")
        self.assertIn('fetchText("data/pages-conformation.v1.json")', runtime)
        self.assertIn('layout.structure_source !== "topology-atlas.v1"', runtime)
        self.assertIn("fx: position.x", runtime)
        self.assertIn("warmupTicks(0)", runtime)
        self.assertIn("cooldownTicks(0)", runtime)
        self.assertIn('edge.authority === "derived"', core)
        self.assertIn("return Boolean(incident)", core)
        self.assertIn('edge.cluster_relation === "inter-cluster"', core)
        self.assertIn("edge.is_cut_bridge", core)
        for legacy in (
            "function hash(",
            "LAYER_Y",
            "rankById",
            "d3AlphaDecay",
            "d3VelocityDecay",
        ):
            self.assertNotIn(legacy, runtime)

    def test_cluster_hulls_are_dom_overlays_and_keep_graph_controls_accessible(self):
        runtime = self.read("site/assets/dag.js")
        styles = self.read("site/assets/atlas-structure.css")
        self.assertIn('document.createElement("div")', runtime)
        self.assertIn('document.createElement("button")', runtime)
        self.assertIn("graph2ScreenCoords", runtime)
        self.assertIn("atlas-cluster-hull", styles)
        self.assertIn("pointer-events: none", styles)
        self.assertIn("pointer-events: auto", styles)
        self.assertNotIn("eval(", runtime)

    def test_ci_and_deployment_pin_one_topology_atlas_producer_coordinate(self):
        expected = "53c77bbea42cc3a9baf7ca44f2888cf9850876ff"
        ci = self.read(".github/workflows/ci.yml")
        deploy = self.read(".github/workflows/pages.yml")
        for workflow in (ci, deploy):
            self.assertIn(expected, workflow)
            self.assertIn("trureturing-fkst-packages", workflow)
            self.assertIn("topology-atlas.v1.json", workflow)
            self.assertIn("config/topology-atlas-profile.v1.json", workflow)
            self.assertIn("pages-topology-atlas-fixed-point-v1", workflow)
        self.assertEqual(ci.count("TOPOLOGY_ATLAS_SOURCE_COMMIT:"), 1)
        self.assertEqual(deploy.count("TOPOLOGY_ATLAS_SOURCE_COMMIT:"), 1)

    def test_vendored_contracts_and_profile_are_present(self):
        for relative in (
            "contracts/topology-atlas.v1.schema.json",
            "contracts/topology-atlas-profile.v1.schema.json",
            "config/topology-atlas-profile.v1.json",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)


if __name__ == "__main__":
    unittest.main()
