import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import yaml

from lib import living_library, reconcile_releases as reconcile, vertical_smoke


ROOT = Path(__file__).resolve().parents[1]
NOW = "2026-09-11T03:00:00Z"
OLD_TIME = "2026-09-09T01:00:00Z"


class HistoryRepairTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.output = self.root / "site"
        self.history_path = self.output / reconcile.HISTORY_PATH
        self.receipts_path = self.output / reconcile.RECEIPTS_PATH
        self.archived = [self.snapshot(letter, title) for letter, title in (
            ("a", "Original A"), ("a", "Repeated A"),
            ("b", "Original B"), ("b", "Repeated B"),
        )]
        self.history = {
            "schema_version": living_library.SCHEMA,
            "current_truth_release_digest": "sha256:" + "b" * 64,
            "entries": [entry for entry, _, _ in self.archived],
            "timeline": self.artifact(living_library.content_timeline(self.archived)),
        }
        self.write_json(self.history_path, self.history)

    def write_json(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n")

    def artifact(self, value):
        raw = living_library.compress((json.dumps(value, sort_keys=True) + "\n").encode())
        digest = living_library.digest(raw)
        path = "data/library/" + digest[7:] + ".json.gz"
        target = self.output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        return {"digest": digest, "path": path}

    def snapshot(self, letter, title):
        graph = {"source_snapshot": {"truth_release_digest": "sha256:" + letter * 64,
                                     "source_commit": letter * 40},
                 "nodes": [{"id": "A", "title": title, "kind": "truth", "state": "closed"}],
                 "edges": []}
        graph_digest = living_library.digest(json.dumps(graph).encode())
        snapshot = living_library.create_snapshot(graph, graph_digest, [], {})
        entry = {**self.artifact(snapshot), "truth_release_digest": snapshot["truth_release_digest"],
                 "atlas_graph_digest": graph_digest, "source_commit": letter * 40,
                 "node_count": 1, "problem_count": 0}
        return entry, snapshot, (self.output / entry["path"]).read_bytes()

    def receipt(self, entry):
        return {"release_digest": entry["truth_release_digest"], "library_entry_digest": entry["digest"],
                "ingested_at": OLD_TIME, "recorded_at": OLD_TIME, "deployed": True}

    def receipts(self, entries):
        value = {"schema_version": reconcile.RECEIPTS_SCHEMA,
                 "entries": [self.receipt(entry) for entry in entries]}
        self.write_json(self.receipts_path, value)
        return value

    def repair(self, **kwargs):
        return reconcile.repair_history(self.output, now=NOW, **kwargs)

    def state_bytes(self):
        return {str(path.relative_to(self.output)): (path.read_bytes(), path.stat().st_mtime_ns)
                for path in self.output.rglob("*") if path.is_file() and path.suffix != ".lock"}

    def test_duplicate_coordinates_keep_first_in_original_release_order(self):
        result = self.repair()
        clean = json.loads(self.history_path.read_bytes())
        self.assertTrue(result["changed"])
        self.assertEqual((result["before_count"], result["after_count"]), (4, 2))
        self.assertEqual(result["removed_entries"], self.history["entries"][1::2])
        self.assertEqual(clean["entries"], self.history["entries"][::2])
        self.assertEqual(clean["current_truth_release_digest"], clean["entries"][-1]["truth_release_digest"])
        self.assertEqual(len({entry["truth_release_digest"] for entry in clean["entries"]}), 2)
        living_library.validate_index(clean)
        # Content addressed snapshots remain available for reversal and old links.
        for entry, _, raw in self.archived:
            self.assertEqual((self.output / entry["path"]).read_bytes(), raw)

    def test_repair_is_a_byte_and_mtime_preserving_noop_on_retry(self):
        self.repair()
        before = self.state_bytes()
        with patch.object(living_library, "write_bytes", side_effect=AssertionError("repeat write")), \
             patch.object(living_library, "read_remote", side_effect=AssertionError("repeat download")):
            result = self.repair()
        self.assertFalse(result["changed"])
        self.assertEqual(result["removed_entries"], [])
        self.assertEqual(result["removed_receipts"], [])
        self.assertEqual(self.state_bytes(), before)

    def test_already_clean_history_and_no_history_are_noops(self):
        clean = dict(self.history, entries=self.history["entries"][::2])
        self.write_json(self.history_path, clean)
        before = self.state_bytes()
        self.assertFalse(self.repair()["changed"])
        self.assertEqual(self.state_bytes(), before)
        empty = self.root / "empty"
        self.assertFalse(reconcile.repair_history(empty)["changed"])
        self.assertFalse((empty / reconcile.HISTORY_PATH).exists())
        self.assertFalse((empty / reconcile.RECEIPTS_PATH).exists())

    def test_removed_entry_receipt_is_pruned_and_surviving_receipts_align(self):
        before = self.receipts(self.history["entries"][1:3])
        result = self.repair(deployed=True)
        clean, receipts = reconcile.read_state(self.output)
        reconcile.validate_receipt_history(clean, receipts)
        self.assertEqual(result["removed_receipts"], before["entries"][:1])
        kept = {r["release_digest"]: r for r in receipts["entries"]}
        a, b = clean["entries"]
        self.assertEqual(kept[b["truth_release_digest"]], before["entries"][1])
        self.assertEqual(kept[a["truth_release_digest"]]["library_entry_digest"], a["digest"])
        self.assertIsNone(kept[a["truth_release_digest"]]["ingested_at"])
        self.assertEqual(kept[a["truth_release_digest"]]["recorded_at"], NOW)
        self.assertIs(kept[a["truth_release_digest"]]["deployed"], True)
        self.assertEqual(len(receipts["entries"]), len(clean["entries"]))
        self.assertFalse(self.repair()["changed"])

    def test_legacy_receipts_for_both_duplicate_entries_can_be_cleaned(self):
        before = self.receipts(self.history["entries"])
        # Normal ingestion continues rejecting an ambiguous ledger.
        with self.assertRaisesRegex(ValueError, "duplicate"):
            reconcile.read_state(self.output)
        result = self.repair()
        history, receipts = reconcile.read_state(self.output)
        self.assertEqual(receipts["entries"], before["entries"][::2])
        self.assertEqual(result["removed_receipts"], before["entries"][1::2])
        reconcile.validate_receipt_history(history, receipts)

    def test_timeline_is_rebuilt_for_surviving_observations(self):
        self.repair()
        history = json.loads(self.history_path.read_bytes())
        entry = history["timeline"]
        raw = (self.output / entry["path"]).read_bytes()
        self.assertEqual(living_library.digest(raw), entry["digest"])
        timeline = living_library.archive_json(entry, raw)
        self.assertEqual([event["observation"] for event in timeline["nodes"]["A"]], [0, 1])
        self.assertEqual([event["title"] for event in timeline["nodes"]["A"]], ["Original A", "Original B"])

    def test_repair_then_ingest_new_verified_release_uses_existing_library(self):
        bundle = ROOT / "tests/fixtures/truth-release"
        verified = vertical_smoke.verify_bundle(bundle)
        graph = vertical_smoke.project_basic_dag(bundle, verified)
        graph["synthetic"] = True
        graph_path, manifest_path = self.root / "graph.json", self.root / "manifest.json"
        self.write_json(graph_path, graph)
        self.write_json(manifest_path, {
            "schema_version": "pages-atlas-manifest.v1",
            "atlas_graph_digest": living_library.digest(graph_path.read_bytes()),
            "truth_release_digest": verified["release_digest"],
        })
        with self.assertRaisesRegex(ValueError, "duplicate truth release"):
            reconcile.ingest_release(bundle, graph_path, manifest_path, self.output,
                                     expected_digest=verified["release_digest"], now=NOW)
        self.repair()
        with patch.object(living_library, "build_library", wraps=living_library.build_library) as build:
            receipts = reconcile.ingest_release(bundle, graph_path, manifest_path, self.output,
                                                expected_digest=verified["release_digest"], now=NOW)
        build.assert_called_once()
        history = json.loads(self.history_path.read_bytes())
        self.assertEqual(history["entries"][:2], self.history["entries"][::2])
        self.assertEqual(history["current_truth_release_digest"], verified["release_digest"])
        self.assertEqual(len(history["entries"]), 3)
        self.assertEqual(len(receipts["entries"]), 3)
        reconcile.validate_receipt_history(history, receipts)
        before = self.state_bytes()
        reconcile.ingest_release(bundle, graph_path, manifest_path, self.output,
                                 expected_digest=verified["release_digest"], now=NOW)
        self.assertEqual(self.state_bytes(), before)

    def test_bad_surviving_archive_fails_before_state_is_rewritten(self):
        self.receipts(self.history["entries"][1:3])
        (self.output / self.history["entries"][0]["path"]).write_bytes(b"corrupt")
        before = self.state_bytes()
        with self.assertRaisesRegex(ValueError, "verification"):
            self.repair()
        self.assertEqual(self.state_bytes(), before)

    def test_unrelated_orphan_receipt_is_not_deleted_as_a_duplicate(self):
        orphan = dict(self.history["entries"][0], truth_release_digest="sha256:" + "f" * 64)
        self.receipts([orphan])
        before = self.state_bytes()
        with self.assertRaisesRegex(ValueError, "receipt.*history"):
            self.repair()
        self.assertEqual(self.state_bytes(), before)

    def test_interruption_before_history_replacement_can_be_retried(self):
        self.receipts(self.history["entries"][1:3])
        original_history = self.history_path.read_bytes()
        write = living_library.write_bytes
        def interrupted(path, content):
            if path == self.history_path:
                raise OSError("interrupted history repair")
            return write(path, content)
        with patch.object(living_library, "write_bytes", side_effect=interrupted):
            with self.assertRaisesRegex(OSError, "interrupted"):
                self.repair()
        self.assertEqual(self.history_path.read_bytes(), original_history)
        receipts = json.loads(self.receipts_path.read_bytes())
        reconcile.validate_receipt_history(self.history, receipts)
        self.assertTrue(self.repair()["changed"])
        history, final_receipts = reconcile.read_state(self.output)
        self.assertEqual(final_receipts, receipts)
        reconcile.validate_receipt_history(history, final_receipts)
        self.assertFalse(self.repair()["changed"])

    def test_remote_history_is_staged_locally_and_retry_uses_local_state(self):
        self.receipts(self.history["entries"][1:3])
        remote = {path: raw for path, (raw, _) in self.state_bytes().items()}
        fresh = self.root / "fresh"
        def read_remote(_url, path, optional=False):
            return remote[path.split("?")[0]]
        with patch.object(living_library, "read_remote", side_effect=read_remote):
            result = reconcile.repair_history(fresh, "https://example.test/", deployed=True, now=NOW)
        self.assertTrue(result["changed"])
        history, receipts = reconcile.read_state(fresh)
        reconcile.validate_receipt_history(history, receipts)
        for entry in history["entries"] + [history["timeline"]]:
            self.assertEqual(living_library.digest((fresh / entry["path"]).read_bytes()), entry["digest"])
        with patch.object(living_library, "read_remote", side_effect=AssertionError("stale CDN")):
            self.assertFalse(reconcile.repair_history(fresh, "https://example.test/")["changed"])

    def test_repair_cli_produces_local_artifacts_and_reports_noop_on_retry(self):
        command = [sys.executable, "-m", "lib.reconcile_releases", "repair-history",
                   "--output", str(self.output), "--for-deployment"]
        first = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertTrue(json.loads(first.stdout)["changed"])
        second = subprocess.run(command, capture_output=True, text=True, check=True)
        self.assertFalse(json.loads(second.stdout)["changed"])
        history, receipts = reconcile.read_state(self.output)
        reconcile.validate_receipt_history(history, receipts)


class HistoryRepairWorkflowTests(unittest.TestCase):
    def test_deployment_repairs_before_ingestion_and_cache_save(self):
        workflow = yaml.load((ROOT / ".github/workflows/pages.yml").read_text(), Loader=yaml.BaseLoader)
        steps = workflow["jobs"]["deploy"]["steps"]
        repair = next((i for i, step in enumerate(steps)
                       if "lib.reconcile_releases repair-history" in step.get("run", "")), None)
        self.assertIsNotNone(repair, "deployment must invoke the projection repair before ingestion")
        ingest = next(i for i, step in enumerate(steps) if "lib.reconcile_releases ingest" in step.get("run", ""))
        save = next(i for i, step in enumerate(steps) if step.get("uses") == "actions/cache/save@v4")
        self.assertLess(repair, ingest)
        self.assertLess(ingest, save)
        self.assertIn("cache-hit != 'true'", steps[repair]["if"])
        for argument in ("--output _site", "--previous-url", "--for-deployment"):
            self.assertIn(argument, steps[repair]["run"])


if __name__ == "__main__":
    unittest.main()
