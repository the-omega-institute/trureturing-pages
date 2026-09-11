"""DOI, arXiv and URL problem sources share the release ingestion pipeline."""
import copy
import itertools
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lib import living_library, reconcile_releases, vertical_smoke
from lib.discovery import build_index
from lib.knowledge_pages import esc
from lib.research_news import result_records
from tests.test_living_library import graph, problem_source


FIXTURES = Path(__file__).parent / "fixtures"
OEIS_FILE = FIXTURES / "problems/oeis-a068012-correction-recurrence.md"
SOURCE_KEYS = ("doi", "arxiv_id", "url")


def source_fields(problem):
    return {key: problem[key] for key in SOURCE_KEYS if key in problem}


def parse_source(metadata):
    text = problem_source().replace("arxiv_id: 2405.02727\n", metadata)
    return living_library.parse_problem(text, "test-question.md")


def url_problem(url="https://oeis.org/A068012"):
    # Exercise consumers independently of frontmatter parsing.
    problem = living_library.parse_problem(problem_source(), "test-question.md")
    del problem["arxiv_id"]
    problem["url"] = url
    return problem


class ProblemSourceTests(unittest.TestCase):
    def test_established_oeis_frontmatter_accepts_null_doi_and_keeps_url_source(self):
        text = OEIS_FILE.read_text()
        problem = living_library.parse_problem(text, OEIS_FILE.name)
        self.assertEqual(source_fields(problem), {"url": "https://oeis.org/A068012"})
        self.assertEqual(problem["bibkey"], "oeis2025a068012")
        self.assertEqual(problem["source_digest"], living_library.digest(text.encode()))
        self.assertEqual(problem["route_status"], "proposed")
        self.assertEqual(problem["literature_status"], "not-rechecked")

    def test_url_sources_accept_missing_doi_and_general_http_urls(self):
        for url in ("https://example.org/question", "http://example.org/question",
                    "https://example.org:8443/questions?q=a%20b&lang=en#evidence",
                    "https://[2001:db8::1]/question"):
            with self.subTest(url=url):
                problem = parse_source("url: " + json.dumps(url) + "\n")
                self.assertEqual(source_fields(problem), {"url": url})

    def test_yaml_null_sources_are_absent_but_identifiers_remain_strings(self):
        for null in ("null", "Null", "NULL", "~", "", "!!null null"):
            for key, value in (("url", "https://oeis.org/A068012"), ("arxiv_id", "2405.02727")):
                with self.subTest(null=null, key=key):
                    problem = parse_source(f"doi: {null}\n{key}: {value}\n")
                    self.assertEqual(source_fields(problem), {key: value})

    def test_missing_or_only_null_sources_fail_closed(self):
        for metadata in ("", "doi: null\n", "url: null\n", "arxiv_id: null\n",
                         "doi: null\narxiv_id: null\nurl: null\n"):
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                parse_source(metadata)

    def test_malformed_urls_fail_closed(self):
        for url in (None, "", "not-a-url", "oeis.org/A068012", "/A068012",
                    "javascript:alert(1)", "ftp://oeis.org/A068012", "//oeis.org/A068012",
                    "https://", "https:///oeis.org/A068012", "https://?q=A068012",
                    "https://oeis.org:invalid/A068012", "https://oeis.org:70000/A068012",
                    "https://[invalid]/question", "https://bad host.org/question",
                    "https://./question", "https://-bad.example/question", "https://bad-.example/question",
                    "https://oeis.org/A 068012", "https://oeis.org/\nA068012",
                    "https://oeis.org/\tA068012", "https://oeis.org/\u0000A068012",
                    'https://oeis.org/"A068012', "https://oeis.org/<A068012>",
                    "https://oeis.org/\\A068012", "https://oeis.org/%ZZ",
                    "https://user:password@oeis.org/A068012", [], {}):
            with self.subTest(url=url), self.assertRaises(ValueError):
                parse_source("url: " + json.dumps(url) + "\n")

    def test_valid_doi_and_arxiv_sources_keep_their_existing_shape(self):
        for key, value in (("doi", "10.1051/ita/2026032"), ("arxiv_id", "2405.02727"),
                           ("arxiv_id", "2509.16034v2")):
            with self.subTest(key=key, value=value):
                self.assertEqual(source_fields(parse_source(f"{key}: {value}\n")), {key: value})

    def test_invalid_doi_and_arxiv_sources_do_not_fall_back(self):
        for key, value, message in (("doi", "not-a-doi", "DOI"),
                                    ("doi", "https://doi.org/10.1051/ita/2026032", "DOI"),
                                    ("doi", "javascript:alert(1)", "DOI"),
                                    ("doi", "", "DOI"), ("doi", "null", "DOI"),
                                    ("doi", [], "DOI"), ("doi", {}, "DOI"),
                                    ("arxiv_id", "2405.02727junk", "arXiv")):
            metadata = f"{key}: {json.dumps(value)}\n"
            with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, message):
                parse_source(metadata)
            with self.subTest(key=key, value=value, fallback=True), self.assertRaises(ValueError):
                parse_source(metadata + "url: https://oeis.org/A068012\n")

    def test_multiple_non_null_sources_fail_closed(self):
        candidates = ("doi: 10.1051/ita/2026032\n", "arxiv_id: 2405.02727\n",
                      "url: https://oeis.org/A068012\n")
        for count in (2, 3):
            for sources in itertools.combinations(candidates, count):
                with self.subTest(sources=sources), self.assertRaises(ValueError):
                    parse_source("".join(sources))

    def test_snapshot_preserves_url_metadata_through_json(self):
        problem = url_problem()
        snapshot = living_library.create_snapshot(graph(), "sha256:" + "1" * 64, [problem], {})
        archived = json.loads(json.dumps(snapshot))
        self.assertEqual(archived["problems"], [problem])
        self.assertEqual(source_fields(archived["problems"][0]), {"url": problem["url"]})

    def test_dossier_and_search_render_url_source_with_html_escaping(self):
        for url in ("https://oeis.org/A068012", "https://example.org/question?a=1&b=2#evidence"):
            with self.subTest(url=url), tempfile.TemporaryDirectory() as temp:
                snapshot = living_library.create_snapshot(graph(), "sha256:" + "1" * 64, [url_problem(url)], {})
                output = Path(temp)
                living_library.render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
                dossier = (output / "research/test-question/index.html").read_text()
                self.assertIn(f'<a href="{esc(url)}">{esc(url)}</a>', dossier)
                self.assertIn(esc(url.lower()), (output / "conjectures.html").read_text())

    def test_discovery_links_url_source_without_promoting_a_resolution(self):
        problem = url_problem()
        snapshot = living_library.create_snapshot(graph(), "sha256:" + "1" * 64, [problem], {})
        index = build_index(snapshot)
        record_id = "literature:url:" + problem["url"]
        record = next(item for item in index["records"] if item["id"] == record_id)
        self.assertEqual(record["identifiers"], {"url": problem["url"]})
        self.assertEqual(record["status"], "external-literature")
        edge = next(item for item in index["relations"] if item["source"] == "dossier:test-question" and item["kind"] == "question_source")
        self.assertEqual(edge["target"], record_id)
        self.assertEqual(edge["evidence_url"], problem["url"])
        self.assertNotIn("result:test-question", {item["id"] for item in index["records"]})

    def test_url_resolution_retains_original_question_in_news(self):
        problem = url_problem()
        problem["resolution"] = {"kind": "proved", "declaration_gid": "D5/S1/Example.result",
                                 "source_path": "Blueprint/D5/S1/Example.md"}
        snapshot = living_library.create_snapshot(graph(), "sha256:" + "1" * 64, [problem], {})
        result = next(item for item in result_records(snapshot) if item["id"] == problem["slug"])
        self.assertEqual(result["source_url"], problem["url"])
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            living_library.render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            self.assertIn(f'<a href="{problem["url"]}">Original question</a>', (output / "research.html").read_text())

    def test_generic_url_at_doi_host_does_not_claim_a_doi_identifier(self):
        url = "https://doi.org/about"
        problem = parse_source(f"doi: null\nurl: {url}\n")
        snapshot = living_library.create_snapshot(graph(), "sha256:" + "1" * 64, [problem], {})
        index = build_index(snapshot)
        record = next(item for item in index["records"] if item["id"] == "literature:url:" + url)
        self.assertEqual(record["identifiers"], {"url": url})
        self.assertEqual(record["evidence"]["source_url"], url)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            living_library.render_research(snapshot, output, {"path": "data/example.json", "digest": "sha256:" + "b" * 64})
            self.assertIn(f'<a href="{url}">{url}</a>', (output / "research/test-question/index.html").read_text())

    def test_verified_ingestion_preserves_url_and_reuses_receipts_idempotence_and_repair(self):
        bundle = FIXTURES / "truth-release"
        verified = vertical_smoke.verify_bundle(bundle)
        value = vertical_smoke.project_basic_dag(bundle, verified)
        value["synthetic"] = False
        source = OEIS_FILE.read_bytes()
        tree = f"100644 blob {'1' * 40}\tProblems/{OEIS_FILE.name}\0".encode()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            graph_path, manifest_path, output = root / "graph.json", root / "manifest.json", root / "site"
            raw = json.dumps(value).encode()
            graph_path.write_bytes(raw)
            manifest_path.write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1",
                "atlas_graph_digest": living_library.digest(raw), "truth_release_digest": verified["release_digest"]}))
            # Only substitute the pinned Git read; parse, build, archive, render and reconcile are real.
            with patch.object(living_library, "git", side_effect=[tree, source, b""]) as git:
                receipts = reconcile_releases.ingest_release(bundle, graph_path, manifest_path, output,
                    source_repo=root, expected_digest=verified["release_digest"], now="2026-09-11T03:00:00Z")
            self.assertEqual(git.call_args_list[1].args[2],
                             value["source_snapshot"]["source_commit"] + ":Problems/" + OEIS_FILE.name)
            history, recorded = reconcile_releases.read_state(output)
            self.assertEqual(recorded, receipts)
            reconcile_releases.validate_receipt_history(history, receipts)
            entry = history["entries"][0]
            archived_raw = (output / entry["path"]).read_bytes()
            self.assertEqual(living_library.digest(archived_raw), entry["digest"])
            archived = living_library.archive_json(entry, archived_raw)
            self.assertEqual(source_fields(archived["problems"][0]), {"url": "https://oeis.org/A068012"})
            self.assertEqual(entry["problem_count"], 1)
            self.assertIn('href="https://oeis.org/A068012"', (output / "research" / OEIS_FILE.stem / "index.html").read_text())
            before = {path: (path.read_bytes(), path.stat().st_mtime_ns)
                      for path in output.rglob("*") if path.is_file() and path.suffix != ".lock"}
            with patch.object(living_library, "build_library", side_effect=AssertionError("duplicate build")):
                self.assertEqual(reconcile_releases.ingest_release(bundle, graph_path, manifest_path, output,
                    source_repo=root, expected_digest=verified["release_digest"]), receipts)
            self.assertFalse(reconcile_releases.repair_history(output)["changed"])
            after = {path: (path.read_bytes(), path.stat().st_mtime_ns)
                     for path in output.rglob("*") if path.is_file() and path.suffix != ".lock"}
            self.assertEqual(after, before)

    def test_url_resolutions_still_require_the_existing_formalization_gate(self):
        problem = url_problem()
        problem["resolution"] = {"kind": "proved", "declaration_gid": "D5/S1/Example.result",
                                 "source_path": "Blueprint/D5/S1/Example.md"}
        node = {"repo_path": "D5/S1/Example.lean", "freeze_status": "frozen",
                "frozen_node_id": "sha256:abc", "node_axiom_closure": [],
                "declarations": [{"declaration_name_key": "ns(ns(n0,2:D5),6:result)", "kind": "theorem"}]}
        for nodes, passes in (([], False), ([node], True)):
            with self.subTest(verified=passes), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                raw = json.dumps(graph()).encode()
                (root / "graph.json").write_bytes(raw)
                (root / "manifest.json").write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1",
                    "atlas_graph_digest": living_library.digest(raw), "truth_release_digest": graph()["source_snapshot"]["truth_release_digest"]}))
                (root / "truth-export.v1.json").write_text(json.dumps({"schema_version": 2,
                    "dialect": "stratalint.truth-export.v2", "nodes": nodes}))
                with patch.object(living_library, "source_material", return_value=([copy.deepcopy(problem)], {}, [])):
                    if passes:
                        history = living_library.build_library(root / "graph.json", root / "manifest.json", root / "site", root)
                        entry = history["entries"][0]
                        archived = living_library.archive_json(entry, (root / "site" / entry["path"]).read_bytes())
                        self.assertEqual(archived["problems"][0]["resolution"]["kernel_verified"]["frozen_node_id"], "sha256:abc")
                    else:
                        with self.assertRaisesRegex(ValueError, "no published truth-release node"):
                            living_library.build_library(root / "graph.json", root / "manifest.json", root / "site", root)
                        self.assertFalse((root / "site/data/library-history.v1.json").exists())
                        self.assertFalse((root / "site/research.html").exists())
