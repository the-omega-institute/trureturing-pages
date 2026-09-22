import gzip
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from lib.discovery import build_index
from lib.living_library import MARKDOWN, render_research
from lib.research_news import _result_statement, append_verified
from lib.research_catalog import build_catalog, write_catalog


FIXTURE = Path(__file__).parent / "fixtures/current-snapshot.json.gz"
ASSETS = Path(__file__).parents[1] / "site/assets"
SUMMARY_CASES = {
    "oeis-a122399-": "a(n) = Sum_{k=0..n} k^n * k! * Stirling2(n,k).",
    "oeis-a163617-": "a(2*n) = 2*a(n), a(2*n + 1) = 2*a(n) + 2 + (-1)^n, for all n in Z.",
    "oeis-a338636-": "G.f. A(x) satisfies: 1 = A(x) - x/(A(x) - 3^2*x/(A(x) - 5^2*x/(A(x) - 7^2*x/(A(x) - 9^2*x/(A(x) - ...))))), a continued fraction relation.",
    "oeis-a396793-": "G.f. A(x) satisfies A(x) * A(A(x)) = x^2 + 9*x^3.",
    "oeis-a396803-": "E.g.f. satisfies A(x) = x*exp( A^3(x) ).",
    "fiebig-mbirika-spilker-even-period-exception": "... when `p = 0 (mod 4)`, then it appears that the corollary holds for all even values `m > 2` except for the single value of `m = 4`.",
}


class ResearchCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = json.loads(gzip.decompress(FIXTURE.read_bytes()))
        cls.verified = {p["slug"] for p in cls.snapshot["problems"]
                        if p.get("resolution", {}).get("kernel_verified")}

    def test_all_and_only_verified_resolutions_have_schema_valid_families(self):
        catalog = build_catalog(self.snapshot)
        self.assertEqual(len(self.verified), 164)
        self.assertEqual({f["id"] for f in catalog["families"]}, self.verified)
        self.assertEqual(catalog["schema_version"], "pages-research-catalog.v1")
        self.assertEqual(catalog["source_commit"], self.snapshot["graph"]["source_snapshot"]["source_commit"])
        self.assertTrue(all(f["kind"] in ("proved", "refuted") and
                            f["kernel_verified"] == next(p["resolution"]["kernel_verified"]
                            for p in self.snapshot["problems"] if p["slug"] == f["id"])
                            for f in catalog["families"]))
        self.assertNotIn("human review", catalog["review_scope"].lower())

    def test_unverified_resolution_is_excluded(self):
        snapshot = {**self.snapshot, "problems": [dict(self.snapshot["problems"][0], slug="unverified",
                     resolution={"kind": "proved", "declaration_gid": "Example.theorem"})]}
        self.assertEqual(build_catalog(snapshot)["families"], [])

    def test_actual_source_summaries_preserve_math_and_full_scope(self):
        families = {f['id']: f for f in build_catalog(self.snapshot)['families']}
        with tempfile.TemporaryDirectory() as temp:
            news = Path(temp) / 'news.json'
            news.write_bytes((ASSETS / 'research-news.json').read_bytes())
            records = {r['id']: r for r in append_verified(self.snapshot, news)['results']}
            for prefix, expected in SUMMARY_CASES.items():
                problem = next(p for p in self.snapshot['problems'] if p['slug'].startswith(prefix))
                with self.subTest(source=problem['slug']):
                    record = records[problem['slug']]
                    scope = problem['sections']['Problem']
                    self.assertEqual(record['summary'], expected)
                    self.assertEqual(families[problem['slug']]['summary'], expected)
                    self.assertEqual(record['scope'], scope)
                    html = _result_statement(record)
                    self.assertTrue(html.startswith('<div class="result-statement prose">'))
                    self.assertIn(MARKDOWN.render(scope.rsplit('\n\n', 1)[-1]).strip(), html)
                    if prefix.startswith('oeis-'):
                        self.assertIn(expected, html)
                        self.assertEqual(html.count('*'), scope.count('*'))

    def test_actual_generated_and_edited_summaries_across_source_update(self):
        old = {r['id']: r for r in json.loads((ASSETS / 'research-news.json').read_text())['results']}
        new_scope = 'OEIS source, quoted verbatim:\n\n> Updated equation: a(n) = 3*n.\n\nNew scope boundary.'
        with tempfile.TemporaryDirectory() as temp:
            news = Path(temp) / 'news.json'
            for prefix, expected in SUMMARY_CASES.items():
                problem = next(p for p in self.snapshot['problems'] if p['slug'].startswith(prefix))
                prior = {**old[problem['slug']], 'scope': problem['sections']['Problem']}
                editorial = expected + ' Editorial: this is the selected mathematical connection.'
                summaries = [prior['summary'], expected, editorial]
                if prefix.startswith('fiebig-'):
                    summaries.append('...')  # The candidate's former sentence truncation.
                for summary in summaries:
                    with self.subTest(source=problem['slug'], summary=summary):
                        news.write_text(json.dumps({'results': [{**prior, 'summary': summary}]}))
                        updated = {**problem, 'sections': {**problem['sections'], 'Problem': new_scope}}
                        snapshot = {**self.snapshot, 'problems': [updated]}
                        record = append_verified(snapshot, news)['results'][0]
                        self.assertEqual(record['summary'], editorial if summary == editorial else 'Updated equation: a(n) = 3*n.')
                        self.assertEqual(record['scope'], new_scope)
                        html = _result_statement(record)
                        self.assertEqual(html.count('Updated equation: a(n) = 3*n.'), 1)
                        self.assertEqual('Editorial:' in html, summary == editorial)
                        first = news.read_bytes()
                        append_verified(snapshot, news)
                        self.assertEqual(news.read_bytes(), first)

    def test_news_discovery_and_catalog_use_same_verified_set_and_are_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            assets = Path(temp)
            for filename in ("result-stories.json", "discovery-curation.json", "research-directions.json"):
                (assets / filename).write_bytes((ASSETS / filename).read_bytes())
            shutil.copytree(ASSETS / "proofs", assets / "proofs")
            news = assets / "research-news.json"
            news.write_bytes((ASSETS / "research-news.json").read_bytes())
            append_verified(self.snapshot, news)
            catalog = assets / "research-catalog.json"
            write_catalog(self.snapshot, catalog)
            first = catalog.read_bytes()
            write_catalog(self.snapshot, catalog)
            self.assertEqual(first, catalog.read_bytes())
            data = json.loads(news.read_text())
            self.assertEqual({r["id"] for r in data["results"] if r.get("kernel_verified")}, self.verified)
            index = build_index(self.snapshot, assets)
            self.assertEqual({r["id"].removeprefix("result:") for r in index["records"]
                              if r["kind"] == "result"}, self.verified)

    def test_release_renderer_projects_the_same_164_resolutions_into_pages(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "site"
            shutil.copytree(ASSETS.parent, out)
            render_research(self.snapshot, out, {"path": "data/library/current.json.gz",
                                                  "digest": "sha256:" + "a" * 64})
            research = (out / "research.html").read_text()
            index = json.loads((out / "api/v1/index.json").read_text())
            self.assertEqual(research.count('class="news-result"'), 164)
            self.assertEqual({r["id"].removeprefix("result:") for r in index["records"]
                              if r["kind"] == "result"}, self.verified)
            self.assertEqual({f["id"] for f in json.loads((out / "assets/research-catalog.json").read_text())["families"]}, self.verified)
