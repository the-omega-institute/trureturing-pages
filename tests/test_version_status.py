import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

from lib import living_library, reconcile_releases as reconcile
from lib import version_status as status
from tools.validate import check_schema, validate, ValidationError


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/reconciliation"
NOW = "2026-09-13T03:00:00Z"
EMPTY = {"schema_version": reconcile.RECEIPTS_SCHEMA, "entries": []}


def digest(letter):
    return "sha256:" + letter * 64


def history(letters="ab"):
    original = json.loads((FIXTURE / "library-history.v1.json").read_text())
    rows = []
    for letter in letters:
        row = {**original["entries"][0], "truth_release_digest": digest(letter),
               "source_commit": letter * 40, "digest": digest(letter),
               "path": f"data/library/{letter * 64}.json.gz", "quarantined_problems": []}
        rows.append(row)
    return {**original, "entries": rows, "current_truth_release_digest": rows[-1]["truth_release_digest"]}


def receipts(letters="a", deployed=True):
    return {**EMPTY, "entries": [{"release_digest": digest(c), "library_entry_digest": digest(c),
             "ingested_at": NOW, "recorded_at": NOW, "deployed": deployed} for c in letters]}


class VersionStatusTests(unittest.TestCase):
    def setUp(self):
        self.releases = json.loads((FIXTURE / "releases.json").read_text())
        for release in self.releases:
            release["assets"] = [{"name": release["tag_name"] + ".tar.gz", "state": "uploaded", "size": 100}]
        self.ancestry = reconcile.RecordedAncestry(json.loads((FIXTURE / "ancestry.json").read_text()))

    def build(self, **kwargs):
        args = dict(releases=self.releases, history=history(), receipts=receipts("ab", False),
                    live_history=history("a"), live_receipts=receipts(),
                    is_ancestor=self.ancestry.is_ancestor, dev_head=self.ancestry.head, now=NOW)
        args.update(kwargs)
        return status.build_status(**args)

    def test_five_stage_counts_and_live_lag_use_ancestry_not_publication_date(self):
        value = self.build()
        self.assertEqual(value["counts"], {"published": 3, "received": 2, "verified": 2,
                         "generated": 2, "deployed": 1, "pending": 1, "blocked": 0, "quarantined": 0})
        self.assertEqual(value["head"]["current_truth_release_digest"], digest("a"))
        self.assertEqual(value["head"]["upstream_latest_digest"], digest("c"))
        self.assertEqual(value["head"]["behind"], 2)
        self.assertEqual(value["upstream"]["latest_published_at"], "2026-09-11T01:00:00Z")
        self.assertEqual([r["furthest_stage"] for r in value["releases"]], ["deployed", "generated", "published"])

    def test_missing_bundle_is_published_and_suspected_upstream_assembly_failure(self):
        self.releases[0]["assets"] = []
        row = self.build()["releases"][-1]
        self.assertEqual(row["furthest_stage"], "published")
        self.assertEqual(row["halt"]["reason"], "bundle-missing")
        self.assertEqual(row["halt"]["stage"], "received")
        self.assertTrue(row["halt"]["suspected_upstream_failure"])

    def test_absent_asset_metadata_is_unknown_not_claimed_missing_or_verified(self):
        del self.releases[0]["assets"]
        row = self.build()["releases"][-1]
        self.assertEqual(row["bundle_asset"], "unknown")
        self.assertEqual(row["halt"]["reason"], "awaiting-ingestion")
        self.assertEqual(row["stages"], dict(published=True, received=False, verified=False, generated=False, deployed=False))

    def test_history_atomically_confirms_three_stages_but_not_deployment(self):
        row = self.build()["releases"][1]
        self.assertEqual(row["furthest_stage"], "generated")
        self.assertEqual(row["halt"]["reason"], "generated-not-deployed")
        self.assertTrue(all(row["stages"][k] for k in ("received", "verified", "generated")))

    def test_staged_true_receipts_are_not_live_confirmation(self):
        value = self.build(receipts=receipts("ab"))
        self.assertEqual(value["counts"]["deployed"], 1)
        self.assertEqual(value["head"]["current_truth_release_digest"], digest("a"))

    def test_pre_tip_blocked_requires_replay_and_is_in_pending(self):
        value = self.build(history=history("b"), receipts=receipts("b", False), live_history=None, live_receipts=EMPTY)
        row = value["releases"][0]
        self.assertEqual(row["furthest_stage"], "published")
        self.assertEqual(row["halt"]["reason"], "pre-tip-replay-required")
        self.assertEqual((value["counts"]["blocked"], value["counts"]["pending"]), (1, 2))

    def test_quarantine_counts_release_problem_occurrences_and_legacy_absence(self):
        value = history()
        del value["entries"][0]["quarantined_problems"]
        value["entries"][1]["quarantined_problems"] = [
            {"slug": "bad", "path": "Problems/bad.md", "reason": "invalid frontmatter"},
            {"slug": "other", "path": "Problems/other.md", "reason": "missing title"}]
        result = self.build(history=value)
        self.assertEqual(result["counts"]["quarantined"], 2)
        self.assertEqual(result["releases"][1]["quarantined_count"], 2)
        self.assertEqual(result["releases"][1]["furthest_stage"], "generated")

    def test_reuses_reader_and_planner_offline(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(reconcile.GitHub, "releases", return_value=self.releases) as reader, \
                 patch.object(reconcile.GitHub, "dev_head", return_value=self.ancestry.head), \
                 patch.object(reconcile.GitHub, "is_ancestor", side_effect=self.ancestry.is_ancestor), \
                 patch.object(reconcile, "plan_releases", wraps=reconcile.plan_releases) as planner:
                value = status.refresh_status(Path(temp), now=NOW)
            reader.assert_called_once()
            self.assertGreaterEqual(planner.call_count, 1)
            self.assertEqual(value["counts"]["published"], 3)
            self.assertTrue((Path(temp) / status.STATUS_PATH).exists())

    def test_refresh_failure_keeps_last_good_counts_and_embeds_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = self.build()
            status.write_status(root, original)
            with patch.object(reconcile.GitHub, "releases", side_effect=OSError("offline")):
                result = status.refresh_status(root, now=NOW)
            self.assertEqual(result["counts"], original["counts"])
            self.assertEqual(result["head"], original["head"])
            self.assertEqual(result["observed_at"], original["observed_at"])
            self.assertEqual(result["observation"]["state"], "last-good")
            self.assertEqual(result["observation"]["halt_stage"], "published")
            html = (root / "version-status.html").read_text()
            self.assertIn('id="version-status-snapshot"', html)
            self.assertIn(digest("a"), html)

    def test_first_failure_is_unknown_not_zero_and_missing_explicit_input_fails_soft(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(reconcile.GitHub, "releases", side_effect=OSError("offline")):
                result = status.refresh_status(Path(temp), now=NOW)
            self.assertIsNone(result["counts"]["published"])
            self.assertIsNone(result["head"]["behind"])
            self.assertEqual(result["observation"]["state"], "unavailable")

    def test_failed_refresh_never_uses_unpublished_candidate_as_last_good(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            candidate = self.build(receipts=receipts("ab"), for_deployment=True)
            status.write_status(root, candidate)
            live = self.build()
            def remote(base, path, optional=False):
                if path.startswith(status.STATUS_PATH):
                    return json.dumps(live).encode()
                raise OSError("offline")
            with patch.object(living_library, "read_remote", side_effect=remote), \
                 patch.object(reconcile.GitHub, "releases", side_effect=OSError("offline")):
                result = status.refresh_status(root, previous_url="https://example.test/", now=NOW)
            self.assertEqual(result["head"]["current_truth_release_digest"], digest("a"))
            self.assertEqual(result["counts"]["deployed"], 1)

    def test_missing_explicit_fixture_falls_back_without_network(self):
        with tempfile.TemporaryDirectory() as temp:
            status.write_status(Path(temp), self.build())
            with patch.object(reconcile.GitHub, "releases", side_effect=AssertionError("network")):
                value = status.refresh_status(Path(temp), releases_file=Path(temp) / "missing.json", now=NOW)
            self.assertEqual(value["observation"]["state"], "last-good")
            self.assertEqual(value["counts"]["published"], 3)

    def test_remote_outage_still_uses_local_observed_last_good(self):
        with tempfile.TemporaryDirectory() as temp:
            status.write_status(Path(temp), self.build())
            with patch.object(living_library, "read_remote", side_effect=OSError("offline")), \
                 patch.object(reconcile.GitHub, "releases", side_effect=OSError("offline")):
                value = status.refresh_status(Path(temp), previous_url="https://example.test/", now=NOW)
            self.assertEqual(value["observation"]["state"], "last-good")
            self.assertEqual(value["counts"]["published"], 3)

    def test_recorded_download_failure_preserves_last_live_and_atomic_evidence(self):
        value = self.build(failure={"release_digest": digest("c"), "stage": "received", "reason": "bundle-download-failed"})
        self.assertEqual(value["head"]["current_truth_release_digest"], digest("a"))
        self.assertEqual(value["releases"][-1]["furthest_stage"], "published")
        self.assertEqual(value["releases"][-1]["halt"]["reason"], "bundle-download-failed")

    def test_invalid_receipt_binding_is_not_promoted_to_deployed(self):
        broken = receipts()
        broken["entries"][0]["library_entry_digest"] = digest("f")
        with self.assertRaises(ValueError):
            self.build(live_receipts=broken)

    def test_production_reader_uses_empty_directory_for_live_receipt_confirmation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            living_library.write_bytes(root / reconcile.HISTORY_PATH, json.dumps(history()).encode())
            living_library.write_bytes(root / reconcile.RECEIPTS_PATH, json.dumps(receipts("ab")).encode())
            def remote(base, path, optional=False):
                if path.startswith(status.STATUS_PATH):
                    return None
                if path.startswith(reconcile.HISTORY_PATH):
                    return json.dumps(history("a")).encode()
                if path.startswith(reconcile.RECEIPTS_PATH):
                    return json.dumps(receipts()).encode()
                raise AssertionError(path)
            with patch.object(living_library, "read_remote", side_effect=remote):
                result = status.refresh_status(root, releases_file=FIXTURE / "releases.json",
                    ancestry_file=FIXTURE / "ancestry.json", previous_url="https://example.test/", now=NOW)
            self.assertEqual(result["counts"]["generated"], 2)
            self.assertEqual(result["counts"]["deployed"], 1)
            self.assertEqual(result["head"]["current_truth_release_digest"], digest("a"))

    def test_observed_verify_failure_does_not_invent_received_entry(self):
        value = self.build(failure={"release_digest": digest("c"), "stage": "verified", "reason": "bundle-invalid"})
        row = value["releases"][-1]
        self.assertEqual(row["furthest_stage"], "published")
        self.assertFalse(row["stages"]["received"])
        self.assertEqual(row["halt"]["stage"], "verified")

    def test_staleness_is_a_signal_not_proof_of_upstream_failure(self):
        value = self.build(now="2026-09-25T03:00:00Z")
        self.assertTrue(value["upstream"]["stale"])
        self.assertEqual(value["upstream"]["stale_after_seconds"], 7 * 86400)

    def test_contract_rejects_invalid_stage_and_missing_counts(self):
        schema = json.loads((ROOT / "contracts/pages-version-status.v1.schema.json").read_text())
        check_schema(schema)
        value = self.build()
        validate(schema, value)
        for mutate in [lambda x: x["releases"][0].update(furthest_stage="downloaded"),
                       lambda x: x["counts"].pop("verified")]:
            broken = copy.deepcopy(value)
            mutate(broken)
            with self.assertRaises(ValidationError):
                validate(schema, broken)

    def test_page_navigation_and_workflow_publish_status_inside_same_artifact(self):
        from lib.knowledge_pages import site_header
        self.assertIn('href="../../version-status.html"', site_header("../../"))
        for path in ["site/index.html", "site/evolution.html", "site/atlas.html"]:
            self.assertIn('href="version-status.html"', (ROOT / path).read_text())
        workflow = yaml.load((ROOT / ".github/workflows/pages.yml").read_text(), Loader=yaml.BaseLoader)
        steps = workflow["jobs"]["deploy"]["steps"]
        build = next(i for i, s in enumerate(steps) if "lib.version_status" in s.get("run", "") and "--for-deployment" in s["run"])
        upload = next(i for i, s in enumerate(steps) if s.get("uses") == "actions/upload-pages-artifact@v3")
        ingest = next(i for i, s in enumerate(steps) if "lib.reconcile_releases ingest" in s.get("run", ""))
        self.assertLess(ingest, build)
        self.assertLess(build, upload)
        self.assertNotIn("continue-on-error", steps[ingest])
        self.assertIn("--output _site", steps[build]["run"])


if __name__ == "__main__":
    unittest.main()
