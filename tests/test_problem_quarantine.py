"""Only dossier parsing is quarantined; release and resolution gates stay closed."""
import copy
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lib import living_library, problem_resolutions, reconcile_releases, vertical_smoke
from lib.discovery import build_index
from lib.knowledge_pages import stable_file_name
from lib.research_news import result_records
from tests.test_living_library import problem_source


FIXTURES = Path(__file__).parent / "fixtures"
BAD_SLUG = "oeis-a385590-alternating-binomial"
BAD_PATH = f"Problems/{BAD_SLUG}.md"
BAD_SOURCE = (FIXTURES / "problems" / Path(BAD_PATH).name).read_text()
BAD_REASON = f"Problem sections differ from catalog contract: {BAD_SLUG}"
OEIS_FILE = FIXTURES / "problems/oeis-a068012-correction-recurrence.md"
HOST = "D5/S1/Example"
BLUEPRINT = f"Blueprint/{HOST}.md"
FROZEN = f"Golden/Frozen/state/{HOST}.lean.json"


def marker(slug, **overrides):
    record = {"problem_slug": slug, "declaration_gid": HOST + ".result", "resolution_kind": "proved"}
    return "<!-- scribe-open-problem-resolution-v1 " + json.dumps({**record, **overrides}) + " -->"


class ProblemQuarantineTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.output = self.root / "site"
        self.source_repo = self.root / "source"
        self.bundle = self.root / "bundle"
        shutil.copytree(FIXTURES / "truth-release", self.bundle)
        self.graph_path, self.manifest_path = self.root / "graph.json", self.root / "manifest.json"
        self.history_path = self.output / reconcile_releases.HISTORY_PATH
        self.receipts_path = self.output / reconcile_releases.RECEIPTS_PATH
        self.sources = {
            "Problems/test-question.md": problem_source().encode(),
            "Problems/" + OEIS_FILE.name: OEIS_FILE.read_bytes(),
            BAD_PATH: BAD_SOURCE.encode(),
        }
        self.truth_export = {
            "schema_version": 2, "dialect": "stratalint.truth-export.v2",
            "nodes": [{"repo_path": HOST + ".lean", "freeze_status": "frozen",
                       "frozen_node_id": "sha256:" + "a" * 64, "node_axiom_closure": [],
                       "declarations": [{"declaration_name_key": "ns(n0,6:result)"}]}],
        }
        self.bind_bundle(self.truth_export)

    def bind_bundle(self, truth_export):
        """Keep the test export inside a digest-verified bundle, including gate failures."""
        raw = json.dumps(truth_export).encode()
        (self.bundle / "truth-export.v1.json").write_bytes(raw)
        (self.root / "truth-export.v1.json").write_bytes(raw)
        manifest_path = self.bundle / "release-manifest.v1.json"
        manifest = json.loads(manifest_path.read_bytes())
        for artifact in manifest["artifacts"].values():
            artifact["sha256"] = living_library.digest((self.bundle / artifact["file"]).read_bytes())
        sums = "".join(f"{a['sha256'][7:]}  {a['file']}\n"
                       for a in sorted(manifest["artifacts"].values(), key=lambda a: a["file"]))
        (self.bundle / "SHA256SUMS").write_text(sums)
        self.release = living_library.digest(sums.encode())
        manifest["sha256sums_digest"] = self.release
        manifest_path.write_text(json.dumps(manifest))
        publication_path = self.bundle / "truth-release-publication.v1.json"
        publication = json.loads(publication_path.read_bytes())
        publication.update(release_digest=self.release, bundle_ref=self.release)
        publication_path.write_text(json.dumps(publication))
        verified = vertical_smoke.verify_bundle(self.bundle, self.release)
        self.commit = verified["source_commit"]
        self.graph = vertical_smoke.project_basic_dag(self.bundle, verified)
        self.graph["synthetic"] = False
        raw = json.dumps(self.graph).encode()
        self.graph_path.write_bytes(raw)
        self.manifest_path.write_text(json.dumps({
            "schema_version": "pages-atlas-manifest.v1",
            "atlas_graph_digest": living_library.digest(raw), "truth_release_digest": self.release,
        }))

    def captured_git(self, repo, *args):
        # Substitute only immutable Git reads. Parsing, binding, all gates and publication run.
        self.assertEqual(repo, self.source_repo)
        if args == ("ls-tree", "-rz", self.commit):
            return b"".join(f"100644 blob {'1' * 40}\t{path}\0".encode() for path in self.sources)
        if args[0] == "show":
            self.assertTrue(args[1].startswith(self.commit + ":"))
            return self.sources[args[1][41:]]
        self.assertEqual(args, ("grep", "-l", "-z", "-F", "scribe-open-problem-resolution-v",
                                self.commit, "--", "Blueprint/*.md"))
        return b"".join(f"{self.commit}:{path}\0".encode() for path, text in self.sources.items()
                        if path.startswith("Blueprint/") and b"scribe-open-problem-resolution-v" in text)

    def add_resolution(self, slug):
        self.sources[BLUEPRINT] = marker(slug).encode()
        self.sources[FROZEN] = b'{"statement_id":"fixture"}'

    def ingest(self, output=None):
        with patch.object(living_library, "git", side_effect=self.captured_git):
            return reconcile_releases.ingest_release(
                self.bundle, self.graph_path, self.manifest_path, output or self.output,
                source_repo=self.source_repo, expected_digest=self.release, now="2026-09-11T04:00:00Z")

    def archived(self):
        history, receipts = reconcile_releases.read_state(self.output)
        reconcile_releases.validate_receipt_history(history, receipts)
        self.assertEqual(len(history["entries"]), 1)
        self.assertEqual(len(receipts["entries"]), 1)
        entry = history["entries"][0]
        raw = (self.output / entry["path"]).read_bytes()
        self.assertEqual(living_library.digest(raw), entry["digest"])
        self.assertEqual(entry["truth_release_digest"], self.release)
        self.assertEqual(entry["source_commit"], self.commit)
        snapshot = living_library.archive_json(entry, raw)
        self.assertEqual(snapshot["quarantined_problems"], entry["quarantined_problems"])
        return entry, snapshot

    def assert_unpublished(self):
        self.assertFalse(self.history_path.exists())
        self.assertFalse(self.receipts_path.exists())
        self.assertFalse((self.output / "research.html").exists())
        self.assertEqual(list((self.output / "data/library").glob("*")), [])

    def test_missing_h1_fixture_still_fails_the_parser_contract(self):
        with self.assertRaisesRegex(ValueError, BAD_REASON):
            living_library.parse_problem(BAD_SOURCE, Path(BAD_PATH).name)

    def test_one_bad_dossier_is_audited_while_other_problems_and_truth_ingest(self):
        self.ingest()
        entry, snapshot = self.archived()
        self.assertEqual(entry["quarantined_problems"], [
            {"slug": BAD_SLUG, "path": BAD_PATH, "reason": BAD_REASON}])
        self.assertEqual(entry["problem_count"], 2)
        self.assertEqual({p["slug"] for p in snapshot["problems"]}, {"test-question", OEIS_FILE.stem})
        self.assertEqual({n["id"]: n["state"] for n in snapshot["graph"]["nodes"]},
                         {n["id"]: n["state"] for n in self.graph["nodes"]})
        for node in snapshot["graph"]["nodes"]:
            self.assertTrue((self.output / "knowledge/node" / stable_file_name(node["id"]) / "index.html").exists())
        for slug in ("test-question", OEIS_FILE.stem):
            self.assertTrue((self.output / "research" / slug / "index.html").exists())
        self.assertFalse((self.output / "research" / BAD_SLUG).exists())
        timeline_entry = json.loads(self.history_path.read_bytes())["timeline"]
        timeline = living_library.archive_json(timeline_entry, (self.output / timeline_entry["path"]).read_bytes())
        self.assertNotIn(BAD_SLUG, timeline["problems"])

    def test_clean_catalog_has_explicit_empty_quarantine_and_unchanged_dossiers(self):
        del self.sources[BAD_PATH]
        self.add_resolution("test-question")
        self.ingest()
        entry, snapshot = self.archived()
        self.assertEqual(entry["quarantined_problems"], [])
        self.assertEqual(entry["problem_count"], 2)
        for problem in snapshot["problems"]:
            filename = problem["slug"] + ".md"
            expected = living_library.parse_problem(self.sources["Problems/" + filename].decode(), filename)
            self.assertEqual({k: v for k, v in problem.items() if k != "resolution"}, expected)
        resolved = next(p for p in snapshot["problems"] if p["slug"] == "test-question")
        self.assertEqual(resolved["resolution"]["kernel_verified"]["freeze_status"], "frozen")
        self.assertIn('href="research/test-question/"', (self.output / "conjectures.html").read_text())

    def test_multiple_failures_keep_exact_reasons_and_deterministic_archives(self):
        self.sources["Problems/aaa-invalid.md"] = b"Missing frontmatter"
        self.ingest()
        entry, _ = self.archived()
        self.assertEqual(entry["quarantined_problems"], [
            {"slug": "aaa-invalid", "path": "Problems/aaa-invalid.md",
             "reason": "Missing problem frontmatter: aaa-invalid.md"},
            {"slug": BAD_SLUG, "path": BAD_PATH, "reason": BAD_REASON},
        ])
        self.assertEqual(entry["problem_count"], 2)
        self.sources = dict(reversed(list(self.sources.items())))
        other_output = self.root / "replayed-site"
        self.ingest(other_output)
        self.assertEqual((other_output / reconcile_releases.HISTORY_PATH).read_bytes(), self.history_path.read_bytes())
        self.assertEqual((other_output / entry["path"]).read_bytes(), (self.output / entry["path"]).read_bytes())

    def test_yaml_parser_exception_is_also_recorded_verbatim(self):
        source = BAD_SOURCE.replace("slug: " + BAD_SLUG, "slug: [unfinished")
        self.sources[BAD_PATH] = source.encode()
        with self.assertRaises(Exception) as failure:
            living_library.parse_problem(source, Path(BAD_PATH).name)
        self.ingest()
        entry, _ = self.archived()
        self.assertEqual(entry["quarantined_problems"][0]["reason"], str(failure.exception))

    def test_quarantined_resolution_is_gated_but_absent_from_all_problem_views(self):
        self.add_resolution(BAD_SLUG)
        with patch.object(problem_resolutions, "verify_resolutions", wraps=problem_resolutions.verify_resolutions) as gate:
            self.ingest()
        gate.assert_called_once()
        self.assertIn(BAD_SLUG, {p["slug"] for p in gate.call_args.args[0] if p.get("resolution")})
        _, snapshot = self.archived()
        self.assertNotIn("resolution", snapshot["quarantined_problems"][0])
        self.assertNotIn(BAD_SLUG, {p["slug"] for p in snapshot["problems"]})
        self.assertNotIn(BAD_SLUG, {item["id"] for item in result_records(snapshot)})
        self.assertNotIn("dossier:" + BAD_SLUG, {item["id"] for item in build_index(snapshot)["records"]})
        for page in ("conjectures.html", "research.html", "api/v1/index.json"):
            self.assertNotIn(BAD_SLUG, (self.output / page).read_text())
        self.assertFalse((self.output / "research" / BAD_SLUG).exists())

    def test_bundle_digest_failures_remain_hard_failures_before_problem_parsing(self):
        for name in ("truth-graph.v1.json", "truth-export.v1.json", "raw-lean-report.json",
                     "frozen-ledger-head.json", "release-manifest.v1.json", "SHA256SUMS"):
            with self.subTest(artifact=name):
                path = self.bundle / name
                original = path.read_bytes()
                path.write_bytes(b"{}")
                with patch.object(living_library, "parse_problem") as parser:
                    with self.assertRaises(vertical_smoke.ReleaseContractError):
                        self.ingest()
                parser.assert_not_called()
                self.assert_unpublished()
                path.write_bytes(original)

    def test_truth_export_contract_and_duplicate_nodes_still_fail_with_quarantine(self):
        for slug in ("test-question", BAD_SLUG):
            for export, reason in (
                ({"schema_version": 1, "dialect": "stratalint.truth-export.v1", "nodes": []}, "wire contract"),
                ({**self.truth_export, "nodes": self.truth_export["nodes"] * 2}, "Duplicate truth-export"),
            ):
                with self.subTest(resolution=slug, reason=reason):
                    self.add_resolution(slug)
                    self.bind_bundle(export)
                    with self.assertRaisesRegex(ValueError, reason):
                        self.ingest()
                    self.assert_unpublished()

    def test_formalization_and_freeze_failures_are_never_quarantined(self):
        for slug in ("test-question", BAD_SLUG):
            for changes, reason in (
                ({"repo_path": "Other.lean"}, "no published truth-release node"),
                ({"freeze_status": "open"}, "not kernel-verified"),
                ({"node_axiom_closure": ["sorryAx"]}, "kernel allowlist"),
                ({"node_axiom_closure": None}, "missing axiom-closure"),
                ({"declarations": []}, "not among the node's verified declarations"),
            ):
                with self.subTest(resolution=slug, reason=reason):
                    export = copy.deepcopy(self.truth_export)
                    export["nodes"][0].update(changes)
                    if changes.get("node_axiom_closure", []) is None:
                        del export["nodes"][0]["node_axiom_closure"]
                    self.bind_bundle(export)
                    self.add_resolution(slug)
                    with self.assertRaisesRegex(ValueError, reason):
                        self.ingest()
                    self.assert_unpublished()

    def test_resolution_binding_errors_still_fail_for_valid_and_quarantined_slugs(self):
        for slug in ("test-question", BAD_SLUG):
            for text, reason in (
                (marker(slug).replace("-v1", "-v2"), "Malformed resolution marker"),
                (marker("missing"), "Dangling or duplicate"),
                (marker(slug) + "\n\n" + marker(slug), "Dangling or duplicate"),
                (marker(slug, declaration_gid="Other.result"), "does not match host"),
                (marker(slug, resolution_kind="partial"), "does not match host"),
            ):
                with self.subTest(resolution=slug, reason=reason):
                    self.add_resolution(slug)
                    self.sources[BLUEPRINT] = text.encode()
                    with self.assertRaisesRegex(ValueError, reason):
                        self.ingest()
                    self.assert_unpublished()
            self.add_resolution(slug)
            del self.sources[FROZEN]
            with self.subTest(resolution=slug, reason="Frozen"):
                with self.assertRaisesRegex(ValueError, "lacks a Frozen record"):
                    self.ingest()
                self.assert_unpublished()

    def test_git_read_and_decode_errors_are_outside_quarantine(self):
        for command in ("ls-tree", "show", "grep"):
            def fail_read(repo, *args):
                if args[0] == command:
                    raise subprocess.CalledProcessError(128, ["git", *args])
                return self.captured_git(repo, *args)
            with self.subTest(command=command), patch.object(living_library, "git", side_effect=fail_read):
                with self.assertRaises(subprocess.CalledProcessError):
                    reconcile_releases.ingest_release(self.bundle, self.graph_path, self.manifest_path,
                        self.output, self.source_repo, expected_digest=self.release)
                self.assert_unpublished()
        self.sources[BAD_PATH] = b"\xff"
        with self.assertRaises(UnicodeDecodeError):
            self.ingest()
        self.assert_unpublished()

    def test_atlas_manifest_mismatch_is_not_quarantined(self):
        original = self.manifest_path.read_bytes()
        for field, value in (("schema_version", "wrong"), ("atlas_graph_digest", "sha256:" + "f" * 64),
                             ("truth_release_digest", "sha256:" + "f" * 64)):
            with self.subTest(field=field):
                manifest = json.loads(original)
                manifest[field] = value
                self.manifest_path.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, "verified Atlas manifest"):
                    self.ingest()
                self.assert_unpublished()

    def test_quarantine_preserves_idempotence_receipt_recovery_and_repair_noop(self):
        receipts = self.ingest()
        entry, _ = self.archived()
        before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.output.rglob("*")
                  if p.is_file() and p.suffix != ".lock"}
        with patch.object(living_library, "build_library", side_effect=AssertionError("duplicate build")):
            self.assertEqual(self.ingest(), receipts)
            self.assertFalse(reconcile_releases.repair_history(self.output)["changed"])
            after = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in before}
            self.assertEqual(after, before)
            self.receipts_path.unlink()
            recovered = self.ingest()
        self.assertEqual(recovered["entries"][0]["library_entry_digest"], entry["digest"])
        self.assertIsNone(recovered["entries"][0]["ingested_at"])
        self.assertEqual(self.history_path.read_bytes(), before[self.history_path][0])
        self.assertEqual((self.output / entry["path"]).read_bytes(), before[self.output / entry["path"]][0])

    def test_archive_corruption_and_duplicate_history_still_fail_closed(self):
        self.ingest()
        history_bytes = self.history_path.read_bytes()
        receipts_bytes = self.receipts_path.read_bytes()
        entry, _ = self.archived()
        archive_path = self.output / entry["path"]
        archive_bytes = archive_path.read_bytes()
        archive_path.write_bytes(b"corrupt")
        with patch.object(living_library, "git", side_effect=self.captured_git):
            with self.assertRaisesRegex(ValueError, "Archived Library snapshot failed verification"):
                living_library.build_library(self.graph_path, self.manifest_path, self.output, self.source_repo)
        self.assertEqual(self.history_path.read_bytes(), history_bytes)
        self.assertEqual(self.receipts_path.read_bytes(), receipts_bytes)
        archive_path.write_bytes(archive_bytes)
        history = json.loads(history_bytes)
        duplicate = {**entry, "digest": "sha256:" + "f" * 64, "path": "data/library/" + "f" * 64 + ".json.gz"}
        history["entries"].append(duplicate)
        self.history_path.write_text(json.dumps(history))
        with self.assertRaisesRegex(ValueError, "duplicate truth release digest"):
            living_library.build_library(self.graph_path, self.manifest_path, self.output, self.source_repo)
        result = reconcile_releases.repair_history(self.output)
        self.assertTrue(result["changed"])
        self.assertEqual(json.loads(self.history_path.read_bytes())["entries"], [entry])
        self.assertEqual(archive_path.read_bytes(), archive_bytes)


if __name__ == "__main__":
    unittest.main()
