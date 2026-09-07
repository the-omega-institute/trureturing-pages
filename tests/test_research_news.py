import json
import tempfile
import unittest
from pathlib import Path

from lib.living_library import parse_problem, render_research
from lib.research_news import CATALOG, result_records
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
            self.assertEqual(bank.count('class="resolved-question"'), 4)
            self.assertIn('id="resolved-bosma-conjecture-17"', bank)
            self.assertNotIn('data-problem-slug=', bank)
            self.assertIn("Reviewed result / pinned upstream proof", bank)
            self.assertNotIn("release binding not recorded", bank)
            self.assertIn("trureturing-mdbook/open-problems.html", bank)
            self.assertIn('href="conjectures.html#resolved-bosma-conjecture-17"', news)
            self.assertIn("Team-reported", news)
            self.assertIn("Official results have not been announced", news)
            self.assertEqual(news.count("Upstream Frozen / not in current Truth release"), 4)
            self.assertIn('id="thue-morse-reduced-abelian-odd"', news)
            self.assertIn("This does not settle the full recursion", news)
            self.assertIn("0 &lt; a &lt;= 1/24", news)
            self.assertIn("Proof explanation", news)
            self.assertIn("/blob/b9afa2151caf868e9018c02df14489bc7e409da8/Blueprint/", news)
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

    def test_manual_thue_morse_result_merges_with_future_release_binding(self):
        problem = parse_problem(problem_source(), "test-question.md")
        problem["slug"] = "thue-morse-reduced-abelian-odd"
        problem["resolution"] = {"kind": "proved",
            "declaration_gid": "D5/S1/Words/Complexity/ThueMorseReducedAbelianOdd.reducedAbelianComplexity_odd",
            "source_path": "Blueprint/D5/S1/Words/Complexity/ThueMorseReducedAbelianOdd.md",
            "evidence": "source-recorded-markdown"}
        records = result_records({"graph": graph(), "problems": [problem]})
        self.assertEqual(len(records), 4)
        result = next(item for item in records if item["id"] == problem["slug"])
        self.assertEqual(result["pr"], 5816)
        self.assertEqual(result["resolution_record"], problem["resolution"])
        self.assertIn("This does not settle the full recursion", result["scope"])

    def test_new_release_resolution_is_discovered_without_editorial_entry(self):
        problem = parse_problem(problem_source(), "test-question.md")
        problem["resolution"] = {"kind": "refuted", "declaration_gid": "D5/S1/Example.result",
                                 "source_path": "Blueprint/D5/S1/Example.md", "evidence": "source-recorded-markdown"}
        snapshot = {"graph": graph(), "problems": [problem], "truth_release_digest": "sha256:" + "a" * 64}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            news = (output / "research.html").read_text()
            bank = (output / "conjectures.html").read_text()
            dossier = (output / "research/test-question/index.html").read_text()
            self.assertIn('id="test-question"', news)
            self.assertIn("Refuted / source record", news)
            self.assertIn('id="resolved-test-question"', bank)
            self.assertIn('data-problem-slug="test-question" data-resolution-kind="refuted"', bank)
            self.assertIn("Repository record: refuted", dossier)
            self.assertNotIn("Our route: proposed", dossier)
            self.assertIn("D5/S1/Example.result", dossier)
