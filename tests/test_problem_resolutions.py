import unittest
import copy
import subprocess
import tempfile
from pathlib import Path

from lib.problem_resolutions import bind_resolutions
from lib.living_library import source_material, content_timeline
from tests.test_living_library import problem_source


class ProblemResolutionTests(unittest.TestCase):
    def setUp(self):
        self.problem = {"slug": "sample", "route_status": "proposed"}
        self.path = "Blueprint/D5/S1/Example.md"
        self.objects = {self.path: "blob", "Golden/Frozen/state/D5/S1/Example.lean.json": "state"}
        self.marker = '<!-- scribe-open-problem-resolution-v1 {"problem_slug":"sample","declaration_gid":"D5/S1/Example.result","resolution_kind":"proved"} -->'

    def bind(self, marker):
        return bind_resolutions([self.problem], {self.path: marker}, self.objects)

    def test_absence_preserves_old_snapshot_and_does_not_claim_open(self):
        self.assertEqual(self.bind("# Example"), [self.problem])
        self.assertNotIn("resolution", self.problem)

    def test_record_is_bound_to_problem_and_host_without_promoting_literature_status(self):
        item = self.bind(self.marker)[0]
        self.assertEqual(item["resolution"], {
            "kind": "proved", "declaration_gid": "D5/S1/Example.result",
            "source_path": self.path, "evidence": "source-recorded-markdown",
        })
        self.assertEqual(item["route_status"], "proposed")
        self.assertNotIn("resolution", self.problem)
        self.assertEqual(self.bind(self.marker.replace('"proved"', '"refuted"'))[0]["resolution"]["kind"], "refuted")

    def test_fenced_example_is_not_a_resolution(self):
        self.assertEqual(self.bind("```html\n" + self.marker + "\n```"), [self.problem])

    def test_bad_or_ambiguous_bindings_fail(self):
        for marker in [
            self.marker.replace('"sample"', '"missing"'),
            self.marker.replace("Example.result", "Different.result"),
            self.marker.replace('"proved"', '"partial"'),
            self.marker.replace("-v1", "-v2"),
            self.marker.replace('"proved"', '"proved","resolution_kind":"refuted"'),
            self.marker + "\n\n" + self.marker,
        ]:
            with self.subTest(marker=marker), self.assertRaises(ValueError):
                self.bind(marker)
        with self.assertRaises(ValueError):
            bind_resolutions([self.problem], {self.path: self.marker}, {self.path: "blob"})

    def test_captured_git_source_imports_binding_and_ignores_uncommitted_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            def git(*args):
                return subprocess.check_output(["git", "-C", temp, *args], stderr=subprocess.DEVNULL).decode().strip()
            git("init")
            for path, content in {
                "Problems/test-question.md": problem_source(),
                self.path: self.marker.replace('"sample"', '"test-question"'),
                "Golden/Frozen/state/D5/S1/Example.lean.json": '{"statement_id":"fixture"}',
            }.items():
                target = repo / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            git("add", ".")
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture")
            commit = git("rev-parse", "HEAD")
            (repo / self.path).write_text("# Changed after commit")
            problems, _ = source_material(repo, commit)
            self.assertEqual(problems[0]["resolution"]["kind"], "proved")

    def test_resolution_only_change_enters_history_even_when_dossier_bytes_do_not_change(self):
        a = {"graph": {"nodes": []}, "problems": [{"slug": "sample", "source_digest": "same", "motivation_gids": []}]}
        b = copy.deepcopy(a)
        b["problems"][0]["resolution"] = {"kind": "proved"}
        events = content_timeline([(None, a, None), (None, b, None), (None, a, None)])["problems"]["sample"]
        self.assertEqual([event["event"] for event in events], ["Baseline", "Resolution changed", "Resolution changed"])
        self.assertEqual(events[1]["review"], "Source-recorded proved")
        self.assertEqual(events[2]["review"], "Reassessment needed")
