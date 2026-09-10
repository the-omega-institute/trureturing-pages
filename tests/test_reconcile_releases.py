import copy
from io import BytesIO
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import yaml

from lib import reconcile_releases as reconcile
from lib import living_library, vertical_smoke


FIXTURES = Path(__file__).parent / "fixtures"
RELEASES = json.loads((FIXTURES / "reconciliation/releases.json").read_text())
HISTORY = json.loads((FIXTURES / "reconciliation/library-history.v1.json").read_text())
EMPTY_RECEIPTS = {"schema_version": "pages-ingestion-receipts.v1", "entries": []}
NOW = "2026-09-11T03:00:00Z"


def digest(letter):
    return "sha256:" + letter * 64


def linear_ancestry(older, newer):
    return "abc".index(older[0]) <= "abc".index(newer[0])


class ReconciliationPlanTests(unittest.TestCase):
    def plan(self, history=HISTORY, receipts=EMPTY_RECEIPTS, **kwargs):
        return reconcile.plan_releases(
            RELEASES, history, receipts, linear_ancestry, "c" * 40, **kwargs
        )

    def test_missing_set_excludes_history_drafts_and_other_tags(self):
        plan = self.plan(limit=10)
        self.assertEqual(plan["published_count"], 3)
        self.assertEqual(plan["missing_count"], 2)
        self.assertEqual([r["digest"] for r in plan["pending"]], [digest("b"), digest("c")])

    def test_ancestor_order_ignores_release_list_and_publication_dates(self):
        plan = self.plan(history=None, limit=3)
        self.assertEqual([r["source_commit"] for r in plan["selected"]], [c * 40 for c in "abc"])

    def test_default_limit_one_and_explicit_limit_bound_selection(self):
        self.assertEqual(len(self.plan()["selected"]), 1)
        self.assertEqual(len(self.plan(limit=2)["selected"]), 2)
        self.assertEqual(len(self.plan(limit=0)["selected"]), 0)
        with self.assertRaisesRegex(ValueError, "limit"):
            self.plan(limit=-1)

    def test_already_ingested_releases_need_no_ancestry_lookup(self):
        check = Mock(side_effect=AssertionError("already ingested"))
        plan = reconcile.plan_releases([RELEASES[2]], HISTORY, EMPTY_RECEIPTS, check, "c" * 40)
        self.assertEqual(plan["selected"], [])
        check.assert_not_called()

    def test_receipt_without_history_fails_before_any_heavy_work(self):
        receipts = {"schema_version": EMPTY_RECEIPTS["schema_version"], "entries": [{
            "release_digest": digest("b"), "library_entry_digest": digest("1"),
            "ingested_at": NOW, "recorded_at": NOW, "deployed": False,
        }]}
        with self.assertRaisesRegex(ValueError, "receipt.*history"):
            self.plan(receipts=receipts)

    def test_missing_release_before_tip_is_reported_and_never_appended(self):
        history = copy.deepcopy(HISTORY)
        history["current_truth_release_digest"] = digest("b")
        history["entries"][0].update(truth_release_digest=digest("b"), source_commit="b" * 40)
        plan = self.plan(history=history, limit=3)
        self.assertEqual(plan["missing_count"], 2)
        self.assertEqual(plan["blocked"][0]["digest"], digest("a"))
        self.assertEqual([r["digest"] for r in plan["selected"]], [digest("c")])

    def test_off_dev_and_divergent_sources_fail_closed(self):
        for ancestry in [lambda a, b: False, lambda a, b: a == b or b == "f" * 40]:
            with self.subTest(ancestry=ancestry), self.assertRaisesRegex(ValueError, "ancestor|diverg"):
                reconcile.plan_releases(RELEASES, None, EMPTY_RECEIPTS, ancestry, "f" * 40)

    def test_same_source_with_different_digests_is_ambiguous(self):
        releases = copy.deepcopy([RELEASES[0], RELEASES[3]])
        releases[1]["target_commitish"] = releases[0]["target_commitish"]
        with self.assertRaisesRegex(ValueError, "same source"):
            reconcile.plan_releases(releases, None, EMPTY_RECEIPTS, linear_ancestry, "c" * 40)

    def test_branch_target_or_conflicting_duplicate_metadata_is_rejected(self):
        for value in [dict(RELEASES[0], target_commitish="dev"), dict(RELEASES[0], target_commitish="b" * 40)]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                reconcile.plan_releases(RELEASES + [value], None, EMPTY_RECEIPTS, linear_ancestry, "c" * 40)

    def test_public_api_paginates_and_pins_dev_without_a_token(self):
        client = reconcile.GitHub("the-omega-institute/trureturing", token="")
        with patch.object(client, "get_json", side_effect=[[RELEASES[0]] * 100, [RELEASES[3]], {"sha": "c" * 40}]) as get:
            self.assertEqual(len(client.releases()), 101)
            self.assertEqual(client.dev_head(), "c" * 40)
        self.assertIn("page=1", get.call_args_list[0].args[0])
        self.assertIn("page=2", get.call_args_list[1].args[0])

    def test_anonymous_api_read_has_no_authorization_header(self):
        client = reconcile.GitHub(token="")
        with patch.object(reconcile, "urlopen", return_value=BytesIO(b"[]")) as request:
            self.assertEqual(client.get_json("releases?per_page=100&page=1"), [])
        self.assertFalse(request.call_args.args[0].has_header("Authorization"))

    def test_http_failure_is_not_an_empty_history(self):
        from urllib.error import HTTPError
        with patch.object(living_library, "urlopen", side_effect=HTTPError("https://example.test/", 503, "Unavailable", {}, None)):
            with self.assertRaises(HTTPError):
                reconcile.read_state(Path("unused"), "https://example.test/")


class IngestionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "site"
        self.bundle = self.root / "bundle"
        shutil.copytree(FIXTURES / "truth-release", self.bundle)
        self.verified = vertical_smoke.verify_bundle(self.bundle)
        self.release = self.verified["release_digest"]
        self.graph_path, self.manifest_path = self.root / "graph.json", self.root / "manifest.json"
        graph = vertical_smoke.project_basic_dag(self.bundle, self.verified)
        graph["synthetic"] = True
        raw = json.dumps(graph).encode()
        self.graph_path.write_bytes(raw)
        self.manifest_path.write_text(json.dumps({
            "schema_version": "pages-atlas-manifest.v1",
            "atlas_graph_digest": living_library.digest(raw), "truth_release_digest": self.release,
        }))
        self.history_path = self.output / "data/library-history.v1.json"
        self.receipts_path = self.output / "data/ingestion-receipts.v1.json"

    def ingest(self, **kwargs):
        return reconcile.ingest_release(
            self.bundle, self.graph_path, self.manifest_path, self.output,
            expected_digest=self.release, now=NOW, **kwargs
        )

    def test_ingestion_reuses_library_and_receipt_is_append_only(self):
        with patch.object(living_library, "build_library", wraps=living_library.build_library) as build:
            first = self.ingest()
        build.assert_called_once()
        receipt = first["entries"][0]
        self.assertEqual(receipt["release_digest"], self.release)
        self.assertEqual(receipt["library_entry_digest"], json.loads(self.history_path.read_text())["entries"][0]["digest"])
        self.assertEqual(receipt["ingested_at"], NOW)
        self.assertIs(receipt["deployed"], False)
        original = self.receipts_path.read_bytes()
        with patch.object(living_library, "build_library", side_effect=AssertionError("duplicate build")), patch.object(vertical_smoke, "verify_bundle", side_effect=AssertionError("duplicate verify")):
            self.assertEqual(self.ingest(), first)
        self.assertEqual(self.receipts_path.read_bytes(), original)

    def test_receipt_append_preserves_existing_rows_and_rejects_rebinding(self):
        before = self.ingest()["entries"][0]
        result = reconcile.append_receipt(self.receipts_path, HISTORY["entries"][0], now=NOW)
        self.assertEqual(len(result["entries"]), 2)
        self.assertEqual(result["entries"][0], before)
        changed = dict(HISTORY["entries"][0], digest=digest("f"))
        raw = self.receipts_path.read_bytes()
        with self.assertRaisesRegex(ValueError, "rebind"):
            reconcile.append_receipt(self.receipts_path, changed, now=NOW)
        self.assertEqual(raw, self.receipts_path.read_bytes())

    def test_crash_after_history_write_repairs_receipt_without_bundle_or_rebuild(self):
        with patch.object(reconcile, "append_receipt", side_effect=OSError("interrupted")):
            with self.assertRaises(OSError):
                self.ingest()
        self.assertTrue(self.history_path.exists())
        shutil.rmtree(self.bundle)
        with patch.object(living_library, "build_library", side_effect=AssertionError("rebuild")):
            result = self.ingest()
        self.assertEqual(len(result["entries"]), 1)
        self.assertIsNone(result["entries"][0]["ingested_at"])
        self.assertEqual(result["entries"][0]["recorded_at"], NOW)
        self.assertEqual(len(json.loads(self.history_path.read_text())["entries"]), 1)

    def test_restart_with_previous_url_uses_the_already_written_local_history(self):
        with patch.object(living_library, "read_remote", return_value=None), patch.object(reconcile, "append_receipt", side_effect=OSError("interrupted")):
            with self.assertRaises(OSError):
                self.ingest(previous_url="https://example.test/")
        with patch.object(living_library, "read_remote", side_effect=AssertionError("stale remote")), patch.object(vertical_smoke, "verify_bundle", side_effect=AssertionError("repeat work")):
            self.assertEqual(len(self.ingest(previous_url="https://example.test/")["entries"]), 1)

    def test_remote_receipt_timestamps_survive_a_crash_after_library_commit(self):
        prior = copy.deepcopy(HISTORY)
        entry = prior["entries"][0]
        row = {"release_digest": entry["truth_release_digest"], "library_entry_digest": entry["digest"],
               "ingested_at": "2026-09-09T01:00:00Z", "recorded_at": "2026-09-09T01:00:00Z", "deployed": True}
        old_receipts = {"schema_version": reconcile.RECEIPTS_SCHEMA, "entries": [row]}
        remote = lambda url, path, optional=False: json.dumps(prior if path.split("?")[0] == reconcile.HISTORY_PATH else old_receipts).encode()
        build = living_library.build_library
        def commit_history(*args, **kwargs):
            index = build(*args[:4])
            index["entries"].insert(0, entry)
            self.history_path.write_text(json.dumps(index))
            raise OSError("stopped after index commit")
        with patch.object(living_library, "read_remote", side_effect=remote), patch.object(living_library, "build_library", side_effect=commit_history):
            with self.assertRaises(OSError):
                self.ingest(previous_url="https://example.test/")
        with patch.object(vertical_smoke, "verify_bundle", side_effect=AssertionError("repeat work")):
            result = self.ingest(previous_url="https://example.test/")
        self.assertEqual(result["entries"][0], row)
        self.assertEqual(len(result["entries"]), 2)

    def test_real_bundle_verify_failure_leaves_history_and_receipts_untouched(self):
        for path in [self.bundle / "truth-graph.v1.json", self.bundle / "SHA256SUMS"]:
            with self.subTest(path=path.name):
                raw = path.read_bytes()
                path.write_bytes(raw + b" ")
                with patch.object(living_library, "build_library") as build:
                    with self.assertRaises(vertical_smoke.ReleaseContractError):
                        self.ingest()
                build.assert_not_called()
                self.assertFalse(self.history_path.exists())
                self.assertFalse(self.receipts_path.exists())
                path.write_bytes(raw)

    def test_corrupt_bundle_does_not_import_remote_state_or_issue_receipt(self):
        (self.bundle / "truth-graph.v1.json").write_text("{}")
        with patch.object(living_library, "read_remote", return_value=None):
            with self.assertRaises(vertical_smoke.ReleaseContractError):
                self.ingest(previous_url="https://example.test/")
        self.assertFalse(self.history_path.exists())
        self.assertFalse(self.receipts_path.exists())

    def test_verified_bundle_source_must_match_the_projected_graph(self):
        graph = json.loads(self.graph_path.read_text())
        graph["source_snapshot"]["source_commit"] = "f" * 40
        raw = json.dumps(graph).encode()
        self.graph_path.write_bytes(raw)
        manifest = json.loads(self.manifest_path.read_text())
        manifest["atlas_graph_digest"] = living_library.digest(raw)
        self.manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "source"):
            self.ingest()
        self.assertFalse(self.history_path.exists())

    def test_acquisition_skips_history_before_downloading(self):
        self.ingest()
        download = Mock(side_effect=AssertionError("duplicate download"))
        release = {"digest": self.release, "source_commit": self.verified["source_commit"], "tag": "truth-release-" + self.release[7:]}
        result = reconcile.acquire_release(release, self.output, self.root / "acquired", download)
        self.assertIsNone(result)
        download.assert_not_called()

    def test_acquisition_verifies_download_and_checks_planned_source(self):
        import tarfile
        archive = self.root / "release.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for path in self.bundle.iterdir():
                tar.add(path, arcname=path.name)
        release = {"digest": self.release, "source_commit": "f" * 40, "tag": "truth-release-" + self.release[7:]}
        download = lambda selected, target: shutil.copyfile(archive, target)
        with self.assertRaisesRegex(ValueError, "source"):
            reconcile.acquire_release(release, self.output, self.root / "acquired", download)
        self.assertFalse(self.history_path.exists())
        self.assertFalse(self.receipts_path.exists())

    def test_checkpoint_verifies_content_and_preserves_current_remote_history(self):
        self.ingest()
        (self.output / "deployment-manifest.v1.json").write_text(json.dumps({"schema": "pages-deployment-manifest.v1", "release_digest": self.release}))
        shutil.copyfile(self.manifest_path, self.output / "data/pages-atlas-manifest.v1.json")
        shutil.copyfile(self.graph_path, self.output / "data/pages-atlas-view.v1.json")
        history = json.loads(self.history_path.read_text())
        receipts = json.loads(self.receipts_path.read_text())
        reconcile.check_checkpoint(self.output, self.release)
        with patch.object(reconcile, "read_state", side_effect=[(history, receipts), (HISTORY, EMPTY_RECEIPTS)]):
            with self.assertRaisesRegex(ValueError, "checkpoint.*history"):
                reconcile.check_checkpoint(self.output, self.release, "https://example.test/")
        archive = self.output / history["entries"][0]["path"]
        archive.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "verification"):
            reconcile.check_checkpoint(self.output, self.release)

    def test_dry_run_cli_does_not_create_output_or_download(self):
        ancestry = self.root / "ancestry.json"
        ancestry.write_text(json.dumps({"dev_head": "c" * 40, "parents": {"c" * 40: ["b" * 40], "b" * 40: ["a" * 40], "a" * 40: []}}))
        result = subprocess.run([
            __import__("sys").executable, "-m", "lib.reconcile_releases", "plan", "--dry-run",
            "--releases-file", str(FIXTURES / "reconciliation/releases.json"),
            "--history", str(FIXTURES / "reconciliation/library-history.v1.json"),
            "--ancestry-file", str(ancestry), "--output", str(self.output),
        ], capture_output=True, text=True, check=True)
        plan = json.loads(result.stdout)
        self.assertEqual(plan["missing_count"], 2)
        self.assertEqual(len(plan["selected"]), 1)
        self.assertFalse(self.output.exists())

    def test_requested_newer_digest_cannot_skip_the_oldest_pending_release(self):
        ancestry = self.root / "ancestry.json"
        ancestry.write_text(json.dumps({"dev_head": "c" * 40, "parents": {"c" * 40: ["b" * 40], "b" * 40: ["a" * 40], "a" * 40: []}}))
        output = self.root / "github-output"
        with patch("sys.stderr"):
            status = reconcile.main(["plan", "--releases-file", str(FIXTURES / "reconciliation/releases.json"),
                                     "--history", str(FIXTURES / "reconciliation/library-history.v1.json"),
                                     "--ancestry-file", str(ancestry), "--requested-digest", digest("c"),
                                     "--github-output", str(output)])
        self.assertEqual(status, 1)
        self.assertFalse(output.exists())


class ReconciliationWorkflowTests(unittest.TestCase):
    def workflow(self, name):
        path = Path(__file__).resolve().parents[1] / ".github/workflows" / name
        return yaml.load(path.read_text(), Loader=yaml.BaseLoader)

    def test_schedule_and_notification_only_request_existing_bounded_pipeline(self):
        scheduled = self.workflow("reconcile-truth-releases.yml")
        self.assertTrue(scheduled["on"]["schedule"])
        for workflow in [scheduled, self.workflow("receive-truth-release.yml")]:
            for job in workflow["jobs"].values():
                self.assertEqual(job["runs-on"], "ubuntu-latest")
                script = "\n".join(step.get("run", "") for step in job["steps"])
                self.assertIn("gh workflow run pages.yml", script)
                self.assertIn("reconcile=true", script)
                self.assertNotIn("dotnet", script)
                self.assertNotIn("release download", script)

    def test_pipeline_selects_one_before_acquisition_and_resumes_cached_site(self):
        workflow = self.workflow("pages.yml")
        self.assertEqual(workflow["concurrency"]["group"], "github-pages-truth-release")
        prepare = workflow["jobs"]["prepare"]
        script = "\n".join(step.get("run", "") for step in prepare["steps"])
        self.assertIn("lib.reconcile_releases plan", script)
        self.assertIn("--limit 1", script)
        deploy = workflow["jobs"]["deploy"]
        self.assertEqual(deploy["needs"], "prepare")
        self.assertIn("should_build == 'true'", deploy["if"])
        steps = deploy["steps"]
        cache = next(i for i, step in enumerate(steps) if step.get("uses") == "actions/cache/restore@v4")
        acquisition = next(i for i, step in enumerate(steps) if step.get("id") == "acquire")
        self.assertLess(cache, acquisition)
        for step in steps[acquisition:]:
            script = step.get("run", "")
            if any(marker in script for marker in ("lib.reconcile_releases acquire", "dotnet ", "lib.reconcile_releases ingest")):
                self.assertIn("cache-hit != 'true'", step["if"])
        ingest = next(i for i, step in enumerate(steps) if "lib.reconcile_releases ingest" in step.get("run", ""))
        save = next(i for i, step in enumerate(steps) if step.get("uses") == "actions/cache/save@v4")
        freshness = next(i for i, step in enumerate(steps) if "lib.vertical_smoke freshness" in step.get("run", ""))
        publish = next(i for i, step in enumerate(steps) if step.get("uses") == "actions/deploy-pages@v4")
        self.assertLess(ingest, save)
        self.assertLess(save, freshness)
        self.assertLess(freshness, publish)
        self.assertNotIn("cache-hit", steps[freshness].get("if", ""))


if __name__ == "__main__":
    unittest.main()
