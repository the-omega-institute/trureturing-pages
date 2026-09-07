import json
import tempfile
import unittest
from pathlib import Path

from lib.living_library import parse_problem, render_research
from lib.research_news import CATALOG
from tests.test_living_library import graph, problem_source


class ResearchNewsTests(unittest.TestCase):
    def test_news_and_bank_have_distinct_routes_and_preserve_dossiers(self):
        snapshot = {"graph": graph(), "problems": [parse_problem(problem_source(), "test-question.md")], "truth_release_digest": "sha256:" + "a" * 64}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            news = (output / "research.html").read_text()
            bank = (output / "conjectures.html").read_text()
            self.assertNotIn('class="site-main research-home"', news)
            self.assertIn('class="site-main research-home"', bank)
            self.assertIn("Team-reported", news)
            self.assertIn("Official results have not been announced", news)
            self.assertEqual(news.count("Upstream Frozen / not in current Truth release"), 3)
            self.assertIn("0 &lt; a &lt;= 1/24", news)
            self.assertTrue((output / "research/test-question/index.html").exists())
            self.assertIn('href="../../conjectures.html"', (output / "research/test-question/index.html").read_text())
            for item in json.loads(CATALOG.read_text())["publications"]:
                self.assertIn(item["url"], news)
                if item.get("image"):
                    self.assertTrue((CATALOG.parent.parent / item["image"]).is_file())

    def test_doi_sources_render_without_changing_legacy_metadata(self):
        old = parse_problem(problem_source(), "test-question.md")
        self.assertNotIn("doi", old)
        source = problem_source().replace("arxiv_id: 2405.02727", "doi: 10.1051/ita/2026032")
        problem = parse_problem(source, "test-question.md")
        self.assertEqual(problem["doi"], "10.1051/ita/2026032")
        self.assertNotIn("arxiv_id", problem)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research({"graph": graph(), "problems": [problem], "truth_release_digest": "sha256:" + "a" * 64}, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            self.assertIn('href="https://doi.org/10.1051/ita/2026032"', (output / "research/test-question/index.html").read_text())
        with self.assertRaisesRegex(ValueError, "DOI"):
            parse_problem(source.replace("10.1051/ita/2026032", "javascript:alert(1)"), "test-question.md")
