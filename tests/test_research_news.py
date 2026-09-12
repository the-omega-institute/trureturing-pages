import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lib.living_library import parse_problem, render_research
from lib.research_news import CATALOG, result_records
from lib.research_results import ASSETS, STORIES, proof_source, render_followups
from tests.test_living_library import graph, problem_source


class ResearchNewsTests(unittest.TestCase):
    def test_a_future_resolution_leaves_the_followup_overview(self):
        problem = {"slug": "thue-morse-reduced-abelian-even", "resolution": {"kind": "proved"}}
        html = render_followups({"problems": [problem]})
        self.assertEqual(html.count('class="result-followup"'), 2)
        self.assertNotIn('href="#rp=thue-morse-reduced-abelian-even"', html)
        self.assertIn('href="#rp=pochhammer-higher-even-intervals"', html)

    def test_news_and_bank_have_distinct_routes_and_preserve_dossiers(self):
        snapshot = {"graph": graph(), "problems": [parse_problem(problem_source(), "test-question.md")], "truth_release_digest": "sha256:" + "a" * 64}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            news = (output / "research.html").read_text()
            bank = (output / "conjectures.html").read_text()
            self.assertNotIn('class="site-main research-home"', news)
            self.assertIn('class="site-main research-home"', bank)
            self.assertIn('aria-current="page">Conjectures</a>', bank)
            self.assertNotIn('aria-current="page">Research</a>', bank)
            self.assertIn('aria-current="page">Research</a>', news)
            self.assertEqual(news.count('class="resolved-question"'), 4)
            self.assertIn('id="resolved-bosma-conjecture-17"', news)
            self.assertNotIn('data-problem-slug=', bank)
            self.assertIn("Reviewed result / pinned upstream proof", news)
            self.assertNotIn("release binding not recorded", bank)
            self.assertEqual(bank.count('class="result-followup"'), 3)
            self.assertIn('href="#rp=thue-morse-even-difference"', bank)
            self.assertIn('class="site-themed living-page research-editorial"', news)
            self.assertIn('class="site-themed living-page research-editorial"', bank)
            self.assertIn("trureturing-mdbook/open-problems.html", bank)
            self.assertIn('href="research.html#resolved-bosma-conjecture-17"', news)
            self.assertIn("Team-reported", news)
            self.assertIn("Official results have not been announced", news)
            self.assertEqual(news.count("Upstream Frozen / not in current Truth release"), 4)
            self.assertIn('id="thue-morse-reduced-abelian-odd"', news)
            self.assertIn("This does not settle the full recursion", news)
            self.assertIn("0 &lt; a &lt;= 1/24", news)
            self.assertEqual(news.count('>Read result <'), 4)
            self.assertEqual(news.count('>Lean theorem <'), 4)
            self.assertIn('href="results/bosma-conjecture-17/"', bank)
            self.assertIn('https://cs.uwaterloo.ca/journals/JIS/VOL28/Fokkink/fokkink9.pdf', news)
            self.assertTrue((output / "research/test-question/index.html").exists())
            dossier = (output / "research/test-question/index.html").read_text()
            self.assertIn('aria-current="page">Conjectures</a>', dossier)
            self.assertIn('href="../../conjectures.html"', (output / "research/test-question/index.html").read_text())
            for item in json.loads(CATALOG.read_text())["publications"]:
                self.assertIn(item["url"], news)
                if item.get("image"):
                    self.assertTrue((CATALOG.parent.parent / item["image"]).is_file())

    def test_information_architecture_gives_each_page_one_primary_job(self):
        snapshot = {"graph": graph(), "problems": [parse_problem(problem_source(), "test-question.md")], "truth_release_digest": "sha256:" + "a" * 64}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            research = (output / "research.html").read_text()
            conjectures = (output / "conjectures.html").read_text()
            self.assertIn("Unresolved targets in this release", research)
            self.assertIn('id="frontier"', research)
            self.assertIn('id="results"', research)
            self.assertIn('id="open-problems"', conjectures)
            self.assertNotIn('class="resolved-question"', conjectures)
            self.assertIn('href="research.html#results"', conjectures)
            self.assertIn('href="discover.html"', research)

    def test_result_pages_include_exact_pinned_code_and_local_downloads(self):
        snapshot = {"graph": graph(), "problems": [], "truth_release_digest": "sha256:" + "a" * 64}
        stories = json.loads(STORIES.read_text())
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            for item in json.loads(CATALOG.read_text())["results"]:
                with self.subTest(result=item["id"]):
                    html = (output / "results" / item["id"] / "index.html").read_text()
                    source, theorem, _ = proof_source(item, stories[item["id"]])
                    self.assertIn('aria-current="page">Research', html)
                    self.assertIn('href="../../research.html#results"', html)
                    self.assertIn('id="result-theorem"', html)
                    from lib.knowledge_pages import esc
                    self.assertIn(esc(theorem), html)
                    self.assertIn(esc(stories[item["id"]]["boundary"]), html)
                    self.assertNotIn("resolution-audit", html)
                    self.assertEqual((output / "assets/proofs" / (item["id"] + ".lean")).read_bytes(), source.encode())
                    self.assertIn('summary>Repository &amp; verification record', html)
                    self.assertIn(f'Development PR #{item["pr"]}', html)
                    self.assertIn('class="site-themed living-page research-editorial"', html)
                    if item['id'] != 'chamberland-dilcher-conjecture-2-1':
                        self.assertIn('What comes next', html)
                        self.assertIn('../../conjectures.html#rp=', html)

    def test_edited_source_and_truncated_theorem_fail_build(self):
        item = json.loads(CATALOG.read_text())["results"][0]
        story = json.loads(STORIES.read_text())[item["id"]]
        truncated = {**story, "theorem_lines": [251, 269]}
        with self.assertRaisesRegex(ValueError, "ends inside"):
            proof_source(item, truncated)
        with tempfile.TemporaryDirectory() as temp:
            assets = Path(temp)
            (assets / "proofs").mkdir()
            path = Path("proofs") / (item["id"] + ".lean")
            (assets / path).write_bytes((ASSETS / path).read_bytes() + b"\n-- edited\n")
            with patch("lib.research_results.ASSETS", assets):
                with self.assertRaisesRegex(ValueError, "digest mismatch"):
                    proof_source(item, story)

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
            self.assertIn('id="resolved-test-question"', news)
            self.assertIn('data-problem-slug="test-question" data-resolution-kind="refuted"', news)
            self.assertIn("Repository record: refuted", dossier)
            self.assertNotIn("Our route: proposed", dossier)
            self.assertIn("D5/S1/Example.result", dossier)
