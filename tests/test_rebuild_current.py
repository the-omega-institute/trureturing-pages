"""Offline regressions for refreshing Pages without admitting a new release."""
import copy
from io import StringIO
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

import yaml

from lib import living_library, reconcile_releases as reconcile, vertical_smoke, version_status
from tests.test_living_library import problem_source


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures"
HISTORY = json.loads((FIXTURES / "reconciliation/library-history.v1.json").read_text())
EMPTY_RECEIPTS = {"schema_version": reconcile.RECEIPTS_SCHEMA, "entries": []}
PREVIOUS_URL = "https://example.test/pages/"


class RebuildPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.outputs = self.root / "github-output"

    def plan(self, history=HISTORY, extra=()):
        def remote(url, path, optional=False):
            self.assertEqual(url, PREVIOUS_URL)
            self.assertIn("?reconcile=", path)
            value = history if path.split("?")[0] == reconcile.HISTORY_PATH else EMPTY_RECEIPTS
            return json.dumps(value).encode() if value is not None else None
        stdout, stderr = StringIO(), StringIO()
        with patch.object(living_library, "read_remote", side_effect=remote), \
             patch.object(reconcile, "GitHub", side_effect=AssertionError("rebuild needs deployed metadata only")), \
             patch("sys.stdout", stdout), patch("sys.stderr", stderr):
            status = reconcile.main([
                "plan", "--rebuild-current", "--previous-url", PREVIOUS_URL,
                "--output", str(self.root / "site"), "--github-output", str(self.outputs), *extra,
            ])
        return status, stdout.getvalue(), stderr.getvalue()

    def test_admitted_current_is_selected_with_history_source_and_rebuild_marker(self):
        status, output, error = self.plan()
        self.assertEqual(status, 0, error)
        plan = json.loads(output)
        self.assertEqual(plan["mode"], "rebuild")
        self.assertIs(plan["should_build"], True)
        self.assertEqual(len(plan["selected"]), 1)
        selected = plan["selected"][0]
        self.assertEqual(selected["digest"], HISTORY["current_truth_release_digest"])
        self.assertEqual(selected["source_commit"], HISTORY["entries"][0]["source_commit"])
        self.assertIn("should_build=true\n", self.outputs.read_text())
        self.assertIn("rebuild=true\n", self.outputs.read_text())
        self.assertIn("source_commit=" + selected["source_commit"] + "\n", self.outputs.read_text())

    def test_online_current_wins_over_local_output(self):
        local = copy.deepcopy(HISTORY)
        local["current_truth_release_digest"] = "sha256:" + "b" * 64
        local["entries"][0].update(truth_release_digest=local["current_truth_release_digest"], source_commit="b" * 40)
        path = self.root / "site" / reconcile.HISTORY_PATH
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(local))
        status, output, error = self.plan()
        self.assertEqual(status, 0, error)
        self.assertEqual(json.loads(output)["selected"][0]["digest"], HISTORY["current_truth_release_digest"])

    def test_rebuild_still_selects_current_when_all_missing_releases_are_blocked(self):
        history = copy.deepcopy(HISTORY)
        history["current_truth_release_digest"] = "sha256:" + "c" * 64
        history["entries"][0].update(truth_release_digest=history["current_truth_release_digest"], source_commit="c" * 40)
        releases = json.loads((FIXTURES / "reconciliation/releases.json").read_text())
        ancestry = reconcile.RecordedAncestry(json.loads((FIXTURES / "reconciliation/ancestry.json").read_text()))
        normal = reconcile.plan_releases(releases, history, EMPTY_RECEIPTS, ancestry.is_ancestor, ancestry.head)
        self.assertEqual(normal["selected"], [])
        self.assertEqual(len(normal["blocked"]), 2)
        status, output, error = self.plan(history)
        self.assertEqual(status, 0, error)
        self.assertEqual(json.loads(output)["selected"][0]["digest"], history["current_truth_release_digest"])

    def test_remote_failure_never_falls_back_to_mock_or_empty_site(self):
        with patch.object(living_library, "read_remote", side_effect=OSError("HTTP 503 fixture")), patch("sys.stderr"):
            status = reconcile.main(["plan", "--rebuild-current", "--previous-url", PREVIOUS_URL,
                                     "--github-output", str(self.outputs)])
        self.assertEqual(status, 1)
        self.assertFalse(self.outputs.exists())

    def test_absent_or_invalid_current_fails_without_github_outputs(self):
        for history in (None, {**HISTORY, "current_truth_release_digest": None},
                        {**HISTORY, "current_truth_release_digest": "sha256:" + "f" * 64},
                        {"schema_version": living_library.SCHEMA, "entries": []}):
            with self.subTest(history=history):
                status, _, error = self.plan(history)
                self.assertEqual(status, 1)
                self.assertRegex(error, "current|history")
                self.assertFalse(self.outputs.exists())

    def test_mutable_or_missing_current_source_fails_closed(self):
        for source in (None, "dev", "A" * 40):
            history = copy.deepcopy(HISTORY)
            history["entries"][0]["source_commit"] = source
            with self.subTest(source=source):
                status, _, error = self.plan(history)
                self.assertEqual(status, 1)
                self.assertIn("source_commit", error)
                self.assertFalse(self.outputs.exists())

    def test_rebuild_requires_previous_url_or_explicit_history_fixture(self):
        with patch("sys.stderr", new_callable=StringIO) as error:
            status = reconcile.main(["plan", "--rebuild-current", "--output", str(self.root)])
        self.assertEqual(status, 1)
        self.assertIn("previous-url", error.getvalue())

    def test_requested_digest_and_rebuild_are_mutually_exclusive(self):
        with patch("sys.stderr"), self.assertRaises(SystemExit) as error:
            reconcile.main(["plan", "--rebuild-current", "--requested-digest", HISTORY["current_truth_release_digest"]])
        self.assertEqual(error.exception.code, 2)


class RebuildPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / "bundle"
        shutil.copytree(FIXTURES / "truth-release", self.bundle)
        self.verified = vertical_smoke.verify_bundle(self.bundle)
        self.release = self.verified["release_digest"]
        self.selected = {"digest": self.release, "source_commit": self.verified["source_commit"]}
        self.graph = vertical_smoke.project_basic_dag(self.bundle, self.verified)
        self.graph["synthetic"] = True
        self.graph_path, self.manifest_path = self.root / "graph.json", self.root / "manifest.json"
        self.write_graph()
        self.published, self.output = self.root / "published", self.root / "rebuilt"
        reconcile.ingest_release(self.bundle, self.graph_path, self.manifest_path, self.published,
                                 expected_digest=self.release, deployed=True, now="2026-09-11T03:00:00Z")
        self.remote_files = {p.relative_to(self.published).as_posix(): p.read_bytes()
                             for p in self.published.rglob("*") if p.is_file()}
        self.archive = self.root / "bundle.tar.gz"
        with tarfile.open(self.archive, "w:gz") as archive:
            for path in self.bundle.iterdir():
                archive.add(path, arcname=path.name)
        self.remote_patch = patch.object(living_library, "read_remote", side_effect=self.remote)
        self.remote_patch.start()
        self.addCleanup(self.remote_patch.stop)

    def write_graph(self):
        raw = json.dumps(self.graph).encode()
        self.graph_path.write_bytes(raw)
        self.manifest_path.write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1",
            "atlas_graph_digest": living_library.digest(raw), "truth_release_digest": self.release}))

    def remote(self, url, path, optional=False):
        self.assertEqual(url, PREVIOUS_URL)
        value = self.remote_files.get(path.split("?")[0])
        if value is None and not optional:
            raise OSError("missing remote fixture: " + path)
        return value

    def download(self, release, target):
        self.assertEqual(release["digest"], self.release)
        shutil.copyfile(self.archive, target)

    def rebuild(self, **kwargs):
        return reconcile.ingest_release(self.bundle, self.graph_path, self.manifest_path, self.output,
                                       expected_digest=self.release, previous_url=PREVIOUS_URL,
                                       rebuild_current=True, deployed=True, **kwargs)

    def test_reacquire_build_basic_and_rebuild_preserve_history_receipts_and_archives(self):
        acquired = self.root / "acquired"
        verified = reconcile.acquire_release(self.selected, self.output, acquired, self.download,
                                              PREVIOUS_URL, rebuild_current=True)
        self.assertEqual(verified, self.verified)
        # The source site includes a newly added page, just as a Pages code change would.
        template_root = self.root / "templates"
        shutil.copytree(ROOT / "site", template_root / "site")
        (template_root / "site/new-page.html").write_text("new Pages revision")
        with patch.object(vertical_smoke, "ROOT", template_root):
            vertical_smoke.build_basic_site(acquired, self.output)
        self.assertEqual((self.output / "new-page.html").read_text(), "new Pages revision")
        self.assertFalse(reconcile.repair_history(self.output, PREVIOUS_URL, deployed=True)["changed"])
        self.graph["nodes"][0]["human_abstract"] = "New presentation for the same truth release"
        self.write_graph()
        with patch.object(reconcile, "append_receipt", side_effect=AssertionError("rebuild must not issue receipts")):
            receipts = self.rebuild()
            self.assertEqual(self.rebuild(), receipts)
        self.assertEqual(len(receipts["entries"]), 1)
        for path, raw in self.remote_files.items():
            if path in (reconcile.HISTORY_PATH, reconcile.RECEIPTS_PATH) or path.startswith("data/library/"):
                self.assertEqual((self.output / path).read_bytes(), raw, path)
        self.assertTrue((self.output / "knowledge/index.html").exists())
        self.assertTrue((self.output / "conjectures.html").exists())
        self.assertTrue((self.output / "library-history.html").exists())
        releases_file, ancestry_file = self.root / "releases.json", self.root / "ancestry.json"
        releases_file.write_text(json.dumps([{"tag_name": "truth-release-" + self.release[7:],
            "target_commitish": self.selected["source_commit"], "published_at": "2026-09-11T00:00:00Z"}]))
        ancestry_file.write_text(json.dumps({"dev_head": self.selected["source_commit"],
            "parents": {self.selected["source_commit"]: []}}))
        status = version_status.refresh_status(self.output, previous_url=PREVIOUS_URL,
            releases_file=releases_file, ancestry_file=ancestry_file, for_deployment=True)
        self.assertEqual(status["head"]["current_truth_release_digest"], self.release)
        self.assertEqual(status["counts"]["deployed"], 1)
        self.assertTrue((self.output / "data/version-status.v1.json").is_file())
        for path in (reconcile.HISTORY_PATH, reconcile.RECEIPTS_PATH):
            self.assertEqual((self.output / path).read_bytes(), self.remote_files[path])

    def test_rebuild_acquisition_still_verifies_digest_and_planned_source(self):
        for corrupt, source in ((True, self.selected["source_commit"]), (False, "f" * 40)):
            with self.subTest(corrupt=corrupt), tempfile.TemporaryDirectory(dir=self.root) as temp:
                def download(release, target):
                    if corrupt:
                        damaged = self.root / "damaged"
                        shutil.copytree(self.bundle, damaged)
                        (damaged / "truth-graph.v1.json").write_text("{}")
                        with tarfile.open(target, "w:gz") as archive:
                            for path in damaged.iterdir():
                                archive.add(path, arcname=path.name)
                    else:
                        self.download(release, target)
                with self.assertRaises((ValueError, vertical_smoke.ReleaseContractError)):
                    reconcile.acquire_release({**self.selected, "source_commit": source}, self.output,
                                              Path(temp) / "acquired", download, PREVIOUS_URL, rebuild_current=True)
                self.assertFalse((Path(temp) / "acquired").exists())

    def test_current_change_between_selection_and_acquisition_fails_before_download(self):
        history = json.loads(self.remote_files[reconcile.HISTORY_PATH])
        history["current_truth_release_digest"] = "sha256:" + "e" * 64
        history["entries"][0].update(truth_release_digest=history["current_truth_release_digest"], source_commit="e" * 40)
        self.remote_files[reconcile.HISTORY_PATH] = json.dumps(history).encode()
        download = Mock(side_effect=AssertionError("stale selection"))
        with self.assertRaisesRegex(ValueError, "current"):
            reconcile.acquire_release(self.selected, self.output, self.root / "acquired", download,
                                      PREVIOUS_URL, rebuild_current=True)
        download.assert_not_called()

    def test_rebuild_rejects_missing_receipt_without_recovery_or_history_write(self):
        self.remote_files[reconcile.RECEIPTS_PATH] = json.dumps(EMPTY_RECEIPTS).encode()
        with self.assertRaisesRegex(ValueError, "receipt"):
            self.rebuild()
        self.assertFalse((self.output / reconcile.HISTORY_PATH).exists())
        self.assertFalse((self.output / reconcile.RECEIPTS_PATH).exists())

    def test_rebuild_rechecks_bundle_even_for_already_ingested_digest(self):
        (self.bundle / "truth-graph.v1.json").write_text("{}")
        with self.assertRaises(vertical_smoke.ReleaseContractError):
            self.rebuild()
        self.assertFalse((self.output / reconcile.HISTORY_PATH).exists())

    def test_rebuild_rejects_corrupt_prior_archive(self):
        history = json.loads(self.remote_files[reconcile.HISTORY_PATH])
        self.remote_files[history["entries"][0]["path"]] = b"corrupt"
        with self.assertRaisesRegex(ValueError, "verification"):
            self.rebuild()
        self.assertFalse((self.output / reconcile.HISTORY_PATH).exists())

    def test_rebuild_rejects_corrupt_timeline_without_replacing_history(self):
        history = json.loads(self.remote_files[reconcile.HISTORY_PATH])
        self.remote_files[history["timeline"]["path"]] = b"corrupt"
        with self.assertRaisesRegex(ValueError, "timeline.*verification"):
            self.rebuild()
        self.assertFalse((self.output / reconcile.HISTORY_PATH).exists())

    def test_rebuild_reexecutes_resolution_gate_before_materializing_history(self):
        self.graph["synthetic"] = False
        self.write_graph()
        problem = living_library.parse_problem(problem_source(), "test-question.md")
        problem["resolution"] = {"kind": "proved", "declaration_gid": "unverified.result", "source_path": "Blueprint/A.md"}
        shutil.copyfile(self.bundle / "truth-export.v1.json", self.root / "truth-export.v1.json")
        with patch.object(living_library, "source_material", return_value=([problem], {}, [])) as source:
            with self.assertRaises(ValueError):
                self.rebuild(source_repo=self.root)
        source.assert_called_once_with(self.root, self.selected["source_commit"])
        self.assertFalse((self.output / reconcile.HISTORY_PATH).exists())


class RebuildWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.workflow = yaml.load((ROOT / ".github/workflows/pages.yml").read_text(), Loader=yaml.BaseLoader)

    def test_dispatch_runs_selection_for_rebuild_reconcile_and_mock(self):
        inputs = self.workflow["on"]["workflow_dispatch"]["inputs"]
        self.assertEqual(inputs["rebuild_current"]["default"], "false")
        self.assertEqual(inputs["rebuild_current"]["type"], "boolean")
        selection = next(s for s in self.workflow["jobs"]["prepare"]["steps"] if s.get("id") == "selection")
        self.assertIn("inputs.rebuild_current", selection["env"]["REBUILD_CURRENT"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            # Execute the actual workflow shell, using a Python CLI with offline metadata.
            runner = root / "runner.py"
            runner.write_text("\n".join([
                "import sys", "from unittest.mock import patch", "from pathlib import Path",
                f"sys.path.insert(0, {str(ROOT)!r})", "from lib import reconcile_releases as r",
                f"fixture = Path({str(FIXTURES / 'reconciliation')!r})",
                "args = sys.argv[4:] + ['--releases-file', str(fixture / 'releases.json'), '--ancestry-file', str(fixture / 'ancestry.json')]",
                "def remote(url, path, optional=False):",
                "    return (fixture / 'library-history.v1.json').read_bytes() if path.split('?')[0] == r.HISTORY_PATH else None",
                "with patch.object(r.living_library, 'read_remote', side_effect=remote):",
                "    raise SystemExit(r.main(args))", "",
            ]))
            executable = root / "python"
            executable.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{runner}" "$@"\n')
            executable.chmod(0o755)
            for rebuild, normal, requested, expected in (
                ("true", "false", "mock", HISTORY["current_truth_release_digest"]),
                ("false", "true", "mock", "sha256:" + "b" * 64),
                ("false", "false", "mock", "mock"),
                ("false", "false", HISTORY["current_truth_release_digest"], ""),
            ):
                with self.subTest(rebuild=rebuild, reconcile=normal, requested=requested):
                    output = root / "outputs"
                    output.unlink(missing_ok=True)
                    env = {**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"],
                           "REBUILD_CURRENT": rebuild, "RECONCILE": normal, "REQUESTED_DIGEST": requested,
                           "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(root / "summary"),
                           "RUNNER_TEMP": str(root), "GITHUB_REPOSITORY_OWNER": "example", "GITHUB_REPOSITORY": "example/pages"}
                    run = subprocess.run(["bash", "-c", selection["run"]], cwd=root, env=env, text=True, capture_output=True)
                    self.assertEqual(run.returncode, 0, run.stderr)
                    values = dict(line.split("=", 1) for line in output.read_text().splitlines())
                    self.assertEqual(values["release_digest"], expected)
                    self.assertEqual(values["should_build"], "true" if expected else "false")
                    self.assertEqual(values.get("rebuild", "false"), rebuild)

    def test_rebuild_uses_existing_pipeline_and_never_restores_completed_site(self):
        jobs = self.workflow["jobs"]
        self.assertEqual(set(jobs), {"prepare", "deploy"})
        self.assertIn("steps.selection.outputs.rebuild", jobs["prepare"]["outputs"]["rebuild"])
        self.assertIn("should_build == 'true'", jobs["deploy"]["if"])
        steps = jobs["deploy"]["steps"]
        for step in steps:
            if step.get("uses") in ("actions/cache/restore@v4", "actions/cache/save@v4"):
                self.assertIn("needs.prepare.outputs.rebuild != 'true'", step["if"])
        scripts = [step.get("run", "") for step in steps]
        for marker in ("lib.reconcile_releases acquire", "lib.reconcile_releases ingest"):
            script = next(script for script in scripts if marker in script)
            self.assertIn("--rebuild-current", script)
        order = [next(i for i, script in enumerate(scripts) if marker in script) for marker in (
            "lib.reconcile_releases acquire", "lib.vertical_smoke verify", "lib.vertical_smoke build-basic",
            "lib.reconcile_releases repair-history", "lib.reconcile_releases ingest",
            "lib.version_status --output _site", "lib.vertical_smoke freshness",
        )]
        self.assertEqual(order, sorted(order))
        upload = next(i for i, step in enumerate(steps) if step.get("uses") == "actions/upload-pages-artifact@v3")
        self.assertLess(order[-1], upload)
        self.assertNotIn("rebuild", steps[order[-1]].get("if", ""))


if __name__ == "__main__":
    unittest.main()
