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
    "fiebig-mbirika-spilker-even-period-exception": (
        "... when `p = 0 (mod 4)`, then it appears that the corollary holds for all even values "
        "`m > 2` except for the single value of `m = 4`. And in that case, we have `e_V(4) = 1` "
        "but `pi_U(4) = 4 != 2 = pi_V(4)` ... However, when `p = 2 (mod 4)` and `m > 2` is even, "
        "the existence of `e_V(m)` appears to always guarantee tha…"),
}
WRAPPER_CASES = {
    "oeis-a222014-": "A(x) = Sum_{n>=0} n! * x^n * A(x)^(n^2) / Product_{k=1..n} (1 + k*x*A(x)^n).",
    "oeis-a375439-": "Expansion of g.f. A(x) satisfying A(x) = x + x^2 + (2*A(x)^3 + A(x^3))/3.",
    "oeis-a376527-": "a(n) = Sum_{k=0..n*(n-1)/2} A227543(n,k)^2.",
    "oeis-a381364-": "G.f. A(x) satisfies 1/3 = Sum_{n=-oo..+oo} x^n*A(x)^n * (A(x)^n + 2*x)^(n-1) * (x^n + 2*A(x))^(n-1).",
    # Both dossiers start with the same source entry; the summary is an excerpt.
    "oeis-a381365-": "G.f. A(x) satisfies 1/3 = Sum_{n=-oo..+oo} x^n*A(x)^n * (A(x)^n + 2*x)^(n-1) * (x^n + 2*A(x))^(n-1).",
    "oeis-a389540-": "G.f. A(x) satisfies A(x)^2 = A(2*x - 2*A(x)) / 2.",
    "oeis-a391620-": "Number of integer partitions of n that are not the first sums of any composition with all parts > 1.",
    "oeis-a392525-": "G.f. satisfies: A(x) = A( x^3 + 15*x*A(x)^3 )^(1/3), with A(0)=0, A'(0)=1.",
    "oeis-a393867-prime-power-": "G.f. A(x) satisfies [x^n] A(x)^prime(n) = prime(n) * [x^(n-1)] A(x)^prime(n) for n >= 1.",
    "oeis-a396102-": "G.f. A(x) satisfies A(A(A(x))) = (1+x) * A(A(x)).",
    "oeis-a396794-": "G.f. A(x) satisfies A(x) * A(A(A(x))) = x^2 + 16*x^3.",
    "oeis-a396807-": "G.f. satisfies A(x) = x + A^5(x)*A^6(x). where A^n(x) denotes the n-th iteration (compositional power) of A(x).",
    "oeis-a396843-": "G.f. A(x) satisfies A( x*A(x) - 3*x*A(x)^2 ) = x^2.",
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
            for prefix, expected in (SUMMARY_CASES | WRAPPER_CASES).items():
                problem = next(p for p in self.snapshot['problems'] if p['slug'].startswith(prefix))
                with self.subTest(source=problem['slug']):
                    record = records[problem['slug']]
                    scope = problem['sections']['Problem']
                    self.assertEqual(record['summary'], expected)
                    self.assertEqual(families[problem['slug']]['summary'], expected)
                    self.assertEqual(record['scope'], scope)
                    html = _result_statement(record)
                    self.assertTrue(html.startswith('<div class="result-statement prose">'))
                    if '\n\n' in scope:
                        self.assertIn(MARKDOWN.render(scope.rsplit('\n\n', 1)[-1]).strip(), html)
                    if prefix.startswith('oeis-'):
                        self.assertEqual(html.count('*'), scope.count('*'))
                    if prefix.startswith('oeis-') and prefix in SUMMARY_CASES:
                        self.assertIn(expected, html)

    def test_actual_generated_and_edited_summaries_across_source_update(self):
        old = {r['id']: r for r in json.loads((ASSETS / 'research-news.json').read_text())['results']}
        new_scope = 'OEIS source, quoted verbatim:\n\n> Updated equation: a(n) = 3*n.\n\nNew scope boundary.'
        with tempfile.TemporaryDirectory() as temp:
            news = Path(temp) / 'news.json'
            for prefix, expected in (SUMMARY_CASES | WRAPPER_CASES).items():
                problem = next(p for p in self.snapshot['problems'] if p['slug'].startswith(prefix))
                prior = {**old[problem['slug']], 'scope': problem['sections']['Problem']}
                editorial = expected + ' Editorial: this is the selected mathematical connection.'
                summaries = [prior['summary'], expected, editorial]
                if prefix.startswith('fiebig-'):
                    summaries.append('...')  # The candidate's former sentence truncation.
                    summaries.append('... when `p = 0 (mod 4)`, then it appears that the corollary holds '
                                     'for all even values `m > 2` except for the single value of `m = 4`.')
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

    def test_actual_offset_summary_migrates_into_rendered_research_preview(self):
        from lib.reading_views import Fragments
        snapshot = json.loads((Path(__file__).parent / 'fixtures/research-summary-paragraphs.json').read_text())
        slug = 'oeis-a030101-yanev-binary-reversal-position-identity'
        problem = next(p for p in snapshot['problems'] if p['slug'] == slug)
        snapshot = {**snapshot, 'problems': [problem]}
        scope = problem['sections']['Problem']
        expected = ('a(n) is the number produced when n is converted to binary digits, '
                    'the binary digits are reversed and then converted back into a decimal number.')
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'site'
            shutil.copytree(ASSETS.parent, out)
            news = out / 'assets/research-news.json'
            news.write_text(json.dumps({'results': [], 'publications': []}))
            saved = append_verified(snapshot, news)
            saved['results'][0]['summary'] = '0,4'
            news.write_text(json.dumps(saved))
            render_research(snapshot, out, {'path': 'data/library/current.json.gz',
                                            'digest': 'sha256:' + 'a' * 64})
            record = json.loads(news.read_text())['results'][0]
            self.assertEqual(record['summary'], expected)
            self.assertEqual(record['scope'], scope)
            family = json.loads((out / 'assets/research-catalog.json').read_text())['families'][0]
            self.assertEqual(family['summary'], expected)
            parsed = Fragments((out / 'research.html').read_text())
            row = Fragments(parsed.raw(parsed.select(id='resolved-' + slug)[0]))
            preview = row.raw(row.select(cls='result-excerpt')[0])
            self.assertEqual(preview, '<span class="result-excerpt">' + expected + '</span>')
            statement = row.raw(row.select(cls='result-statement')[0])
            self.assertIn('<p>0,4</p>', statement)
            self.assertIn(expected, statement)
            self.assertEqual(statement, _result_statement(record))
            self.assertIn(MARKDOWN.render(scope.rsplit('\n\n', 1)[-1]).strip(), statement)
