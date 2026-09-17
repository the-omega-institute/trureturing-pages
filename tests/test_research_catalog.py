import gzip
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from lib.discovery import build_index
from lib.living_library import render_research
from lib.research_news import append_verified
from lib.research_catalog import build_catalog, write_catalog


FIXTURE = Path(__file__).parent / "fixtures/current-snapshot.json.gz"
ASSETS = Path(__file__).parents[1] / "site/assets"


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
