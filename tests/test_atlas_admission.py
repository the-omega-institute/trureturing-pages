import copy
import json
from pathlib import Path
import tempfile
import unittest

from lib.atlas_admission import project_evidence
from lib.vertical_smoke import ReleaseContractError

DIGEST = "sha256:" + "a" * 64


class AtlasAdmissionTests(unittest.TestCase):
    def fixture(self, directory, mutate=lambda export, report: None):
        declaration = {"name": "A.Nested.result", "name_key": "full-nested-name-key", "kind": "def",
                       "statement_id": DIGEST, "type_sha256": DIGEST, "axioms": [], "include_in_statement": True}
        export = {"schema_version": 2, "dialect": "stratalint.truth-export.v2", "source_commit": "c" * 40,
                  "source_tree": "d" * 40, "nodes": [{"repo_path": "A.lean", "frozen_node_id": DIGEST,
                  "freeze_status": "proven-not-yet-frozen", "node_axiom_closure": [], "declarations": [
                      {"declaration_name_key": declaration["name_key"], "kind": "def", "statement_id": DIGEST}]}]}
        report = {"schema": "stratalint-raw-lean-report-v3", "modules": [{"source_path": "A.lean",
                  "source_sha256": DIGEST, "declarations": [declaration]}]}
        mutate(export, report)
        for name, value in [("truth-export.v1.json", export), ("raw-lean-report.json", report),
                            ("source-snapshot.v1.json", {"truth_graph_sha256": DIGEST})]:
            (directory / name).write_text(json.dumps(value))
        verified = {"source_commit": "c" * 40, "source_tree": "d" * 40, "release_digest": DIGEST,
                    "source_snapshot": "source-snapshot.v1.json"}
        return project_evidence(directory, verified)

    def run_fixture(self, mutate=lambda export, report: None):
        with tempfile.TemporaryDirectory() as directory:
            return self.fixture(Path(directory), mutate)

    def test_retains_verified_definitions_and_proven_unfrozen_with_full_identity(self):
        evidence = self.run_fixture()
        node = evidence["nodes"][0]
        self.assertTrue(node["eligible"])
        self.assertEqual(node["freeze_status"], "proven-not-yet-frozen")
        self.assertEqual(node["theorem_count"], 0)
        self.assertEqual(node["declarations"][0]["name"], "A.Nested.result")
        self.assertEqual(node["declarations"][0]["axioms"], [])
        self.assertNotIn("measurement", node["declarations"][0])

    def test_measurements_come_from_each_matched_export_declaration(self):
        cases = [
            ({"libraries": ["OmegaMath", "OmegaInit"], "axioms": [], "omega_only_axiom_free": True}, True),
            ({"libraries": ["Mathlib"], "axioms": ["propext"], "omega_only_axiom_free": True}, False),
            ({"libraries": ["OmegaInit"], "omega_only_axiom_free": True}, False),
            ({"libraries": [], "axioms": []}, False),
            ({"axioms": []}, False),
            ({"omega_only_axiom_free": True}, False),
            ({}, False),
        ]

        def mutate(export, report):
            node = export["nodes"][0]
            module = report["modules"][0]
            node.update(libraries=["OmegaInit"], axioms=[])
            prototype = module["declarations"][0]
            node["declarations"] = []
            module["declarations"] = []
            for i, (fields, _) in enumerate(cases):
                key = f"key-{i}"
                statement_id = "sha256:" + f"{i:064x}"
                node["declarations"].append({"declaration_name_key": key, "kind": "def",
                                              "statement_id": statement_id, **fields})
                module["declarations"].append({**prototype, "name": f"A.Nested.result{i}", "name_key": key,
                                               "statement_id": statement_id, "libraries": ["OmegaInit"]})
            module["declarations"].append({**prototype, "name_key": "orphan", "include_in_statement": False,
                                           "libraries": ["OmegaInit"], "omega_only_axiom_free": True})
            module["declarations"].reverse()

        rows = self.run_fixture(mutate)["nodes"][0]["declarations"]
        self.assertEqual(len(rows), len(cases))
        for i, (row, (fields, positive)) in enumerate(zip(rows, cases)):
            with self.subTest(row=i):
                self.assertEqual(row["name_key"], f"key-{i}")
                self.assertEqual(row["statement_id"], "sha256:" + f"{i:064x}")
                self.assertEqual(row["axioms"], [])
                expected = {key: fields[key] for key in ("libraries", "axioms") if key in fields}
                if positive:
                    expected["omega_only_axiom_free"] = True
                self.assertEqual(row.get("measurement"), expected or None)

    def test_missing_and_non_kernel_axioms_are_exclusions(self):
        for mutation, reason in [(lambda e, r: e["nodes"][0].pop("node_axiom_closure"), "missing-node-axioms"),
                                 (lambda e, r: e["nodes"][0].update(node_axiom_closure=["sorryAx"]), "non-kernel-axioms")]:
            with self.subTest(reason=reason):
                node = self.run_fixture(mutation)["nodes"][0]
                self.assertFalse(node["eligible"])
                self.assertEqual(node["reason"], reason)

    def test_empty_and_unreported_modules_do_not_become_verified_nodes(self):
        for mutation in [lambda e, r: e["nodes"][0].update(declarations=[]), lambda e, r: r.update(modules=[])]:
            self.assertFalse(self.run_fixture(mutation)["nodes"][0]["eligible"])

    def test_exact_names_statement_kind_and_membership_must_match(self):
        for field, value in [("name_key", "another-namespace.result"), ("statement_id", "sha256:" + "b" * 64),
                             ("kind", "theorem"), ("include_in_statement", False)]:
            with self.subTest(field=field), self.assertRaises(ReleaseContractError):
                self.run_fixture(lambda e, r: r["modules"][0]["declarations"][0].update({field: value}))

    def test_auxiliary_axioms_cannot_be_hidden_by_export_membership(self):
        def mutate(export, report):
            auxiliary = copy.deepcopy(report["modules"][0]["declarations"][0])
            auxiliary.update(name_key="auxiliary", include_in_statement=False, axioms=["sorryAx"])
            report["modules"][0]["declarations"].append(auxiliary)
        with self.assertRaisesRegex(ReleaseContractError, "axiom union mismatch"):
            self.run_fixture(mutate)

    def test_duplicate_paths_and_mixed_sources_reject(self):
        for mutation in [lambda e, r: e.update(source_commit="f" * 40),
                         lambda e, r: e["nodes"][0]["declarations"].append(copy.deepcopy(e["nodes"][0]["declarations"][0])),
                         lambda e, r: r["modules"].append(copy.deepcopy(r["modules"][0]))]:
            with self.assertRaises((ReleaseContractError, ValueError)):
                self.run_fixture(mutation)

    def test_legacy_evidence_reports_missing_capability(self):
        evidence = self.run_fixture(lambda e, r: e.update(dialect="legacy"))
        self.assertEqual(evidence["coverage"], "unavailable")
        self.assertEqual(evidence["nodes"], [])

    def test_scoped_and_unknown_report_versions_are_unavailable(self):
        for schema in ("stratalint-scoped-lean-report-v2", "stratalint-raw-lean-report-v5"):
            with self.subTest(schema=schema):
                evidence = self.run_fixture(lambda e, r: r.update(schema=schema))
                self.assertEqual(evidence["coverage"], "unavailable")
                self.assertEqual(evidence["nodes"], [])

    def test_v4_rejects_malformed_report_receipts(self):
        for mutate, error in [
            (lambda r: r.update(modules={}), "modules must be an array"),
            (lambda r: r["modules"][0].pop("source_path"), "missing its source path"),
            (lambda r: r["modules"][0].update(declarations={}), "declarations must be an array"),
            (lambda r: r["modules"][0]["declarations"][0].update(axioms=[42]), "declaration receipt"),
        ]:
            def use_v4(export, report):
                report.update(schema="stratalint-raw-lean-report-v4")
                mutate(report)
            with self.subTest(error=error), self.assertRaisesRegex(ReleaseContractError, error):
                self.run_fixture(use_v4)
