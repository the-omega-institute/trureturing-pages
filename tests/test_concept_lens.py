import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ConceptLensSurfaceTests(unittest.TestCase):
    def test_atlas_places_concept_lens_beside_the_graph(self):
        page = (ROOT / "site" / "dag.html").read_text(encoding="utf-8")
        self.assertIn('class="atlas-layout"', page)
        self.assertIn('id="node-detail" class="node-detail concept-lens"', page)
        self.assertIn('assets/concept-lens.js', page)
        self.assertIn('assets/concept-lens.css', page)
        self.assertNotIn('assets/dag-knowledge-link.js', page)
        self.assertIn('aria-label="Concept Lens"', page)

    def test_research_console_is_an_intentional_hidden_drawer(self):
        page = (ROOT / "site" / "dag.html").read_text(encoding="utf-8")
        self.assertIn('id="research-backdrop"', page)
        self.assertIn('class="research-console research-drawer"', page)
        self.assertIn('aria-modal="true"', page)
        self.assertIn('id="research-close"', page)
        self.assertRegex(
            page,
            r'id="research-console"[^>]+hidden',
        )

    def test_engineering_coordinates_are_absent_from_default_atlas_html(self):
        page = (ROOT / "site" / "dag.html").read_text(encoding="utf-8")
        for field in (
            "Node ID",
            "Repository path",
            "Source commit",
            "Source tree",
            "Topology producer",
        ):
            self.assertNotIn(field, page)
        self.assertIn("Audit details", (ROOT / "site" / "assets" / "concept-lens.js").read_text())

    def test_concept_lens_uses_safe_dom_construction(self):
        source = (ROOT / "site" / "assets" / "concept-lens.js").read_text(encoding="utf-8")
        self.assertNotIn(".innerHTML", source)
        self.assertIn('document.createElementNS("http://www.w3.org/2000/svg"', source)
        self.assertIn('data-panel', source)
        self.assertIn('Certified proof dependency', source)
        self.assertIn('Derived structural affinity', source)
        self.assertIn('Advisory candidate', source)


if __name__ == "__main__":
    unittest.main()
