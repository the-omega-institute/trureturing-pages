import unittest
import copy
import subprocess
import tempfile
from pathlib import Path

from lib.problem_resolutions import bind_resolutions, index_truth_export, verify_resolutions
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


class FormalizationGateTests(unittest.TestCase):
    """The published truth-release is the sole authority: a resolution renders as solved
    only when its exact declaration is a kernel-verified frozen/proven node in that bundle."""

    def node(self, **overrides):
        base = {
            "repo_path": "D5/S1/Example.lean",
            "freeze_status": "frozen",
            "frozen_node_id": "sha256:abc",
            "node_axiom_closure": ["propext", "Classical.choice", "Quot.sound"],
            "declarations": [{"declaration_name_key": "ns(ns(n0,2:D5),6:result)",
                              "kind": "theorem", "statement_id": "sha256:def"}],
        }
        base.update(overrides)
        return base

    def export(self, nodes):
        return {"schema_version": 2, "dialect": "stratalint.truth-export.v2", "nodes": nodes}

    def problems(self):
        return [{"slug": "sample", "resolution": {"kind": "proved",
                 "declaration_gid": "D5/S1/Example.result", "source_path": "Blueprint/D5/S1/Example.md"}}]

    def test_verified_frozen_declaration_passes_and_records_node_identity(self):
        index = index_truth_export(self.export([self.node()]))
        out = verify_resolutions(self.problems(), index)
        self.assertEqual(out[0]["resolution"]["kernel_verified"],
                         {"frozen_node_id": "sha256:abc", "freeze_status": "frozen"})

    def test_proven_not_yet_frozen_declaration_also_passes(self):
        index = index_truth_export(self.export([self.node(freeze_status="proven-not-yet-frozen")]))
        out = verify_resolutions(self.problems(), index)
        self.assertEqual(out[0]["resolution"]["kernel_verified"]["freeze_status"], "proven-not-yet-frozen")

    def test_problem_without_resolution_is_untouched(self):
        index = index_truth_export(self.export([self.node()]))
        self.assertEqual(verify_resolutions([{"slug": "open"}], index), [{"slug": "open"}])

    def test_missing_node_fails_closed(self):
        index = index_truth_export(self.export([self.node(repo_path="D5/S1/Other.lean")]))
        with self.assertRaises(ValueError):
            verify_resolutions(self.problems(), index)

    def test_axiom_closure_escaping_the_kernel_allowlist_fails_closed(self):
        index = index_truth_export(self.export([self.node(node_axiom_closure=["propext", "sorryAx"])]))
        with self.assertRaises(ValueError):
            verify_resolutions(self.problems(), index)

    def test_empty_axiom_closure_is_valid_because_it_is_the_strongest_subset(self):
        # A proof that uses none of the three kernel axioms is the cleanest possible result.
        index = index_truth_export(self.export([self.node(node_axiom_closure=[])]))
        out = verify_resolutions(self.problems(), index)
        self.assertEqual(out[0]["resolution"]["kernel_verified"]["freeze_status"], "frozen")

    def test_missing_axiom_evidence_fails_closed_and_is_not_read_as_empty(self):
        node = self.node()
        del node["node_axiom_closure"]
        with self.assertRaises(ValueError):
            verify_resolutions(self.problems(), index_truth_export(self.export([node])))

    def test_declaration_not_among_verified_declarations_fails_closed(self):
        node = self.node(declarations=[{"declaration_name_key": "ns(ns(n0,2:D5),9:different)"}])
        with self.assertRaises(ValueError):
            verify_resolutions(self.problems(), index_truth_export(self.export([node])))

    def test_wrong_wire_contract_refuses_to_gate(self):
        with self.assertRaises(ValueError):
            index_truth_export({"schema_version": 1, "dialect": "stratalint.truth-export.v1", "nodes": []})
