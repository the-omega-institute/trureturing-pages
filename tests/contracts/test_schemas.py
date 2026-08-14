import json
import hashlib
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "tools" / "validate.py"
FIXTURES = ROOT / "tests" / "contracts" / "fixtures"

SCHEMAS = [
    "source-snapshot.v1.schema.json",
    "work-item.v1.schema.json",
    "candidate.v1.schema.json",
    "machine-verdict.v1.schema.json",
    "review.v1.schema.json",
    "decision.v1.schema.json",
    "run-receipt.v1.schema.json",
]

NEGATIVE_PATHS = {
    "source-snapshot.v1.missing.json": "$.repo_identity",
    "source-snapshot.v1.enum.json": "$.repo_identity",
    "source-snapshot.v1.extra.json": "$.extra",
    "work-item.v1.missing.json": "$.work_id",
    "work-item.v1.enum.json": "$.eligibility.state",
    "work-item.v1.extra.json": "$.extra",
    "candidate.v1.missing.json": "$.attempt",
    "candidate.v1.enum.json": "$.schema",
    "candidate.v1.extra.json": "$.extra",
    "machine-verdict.v1.missing.json": "$.attempt",
    "machine-verdict.v1.enum.json": "$.schema",
    "machine-verdict.v1.extra.json": "$.extra",
    "review.v1.missing.json": "$.work_id",
    "review.v1.enum.json": "$.role",
    "review.v1.extra.json": "$.extra",
    "decision.v1.missing.json": "$.attempt",
    "decision.v1.enum.json": "$.schema",
    "decision.v1.extra.json": "$.extra",
    "run-receipt.v1.missing.json": "$.work_id",
    "run-receipt.v1.enum.json": "$.outcome",
    "run-receipt.v1.extra.json": "$.extra",
}


class SchemaContractTests(unittest.TestCase):
    def validate(self, schema_name, fixture_name):
        result = subprocess.run(
            [sys.executable, str(VALIDATOR), str(ROOT / "schemas" / schema_name),
             str(FIXTURES / fixture_name)],
            text=True, capture_output=True,
        )
        return result

    def test_valid_fixtures(self):
        for schema in SCHEMAS:
            with self.subTest(schema=schema):
                result = self.validate(schema, schema.replace(".schema.json", ".valid.json"))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_required_fields_rejected(self):
        for schema in SCHEMAS:
            with self.subTest(schema=schema):
                result = self.validate(schema, schema.replace(".schema.json", ".missing.json"))
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("$", result.stdout + result.stderr)

    def test_wrong_enum_rejected(self):
        for schema in SCHEMAS:
            with self.subTest(schema=schema):
                result = self.validate(schema, schema.replace(".schema.json", ".enum.json"))
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

    def test_additional_properties_rejected(self):
        for schema in SCHEMAS:
            with self.subTest(schema=schema):
                result = self.validate(schema, schema.replace(".schema.json", ".extra.json"))
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

    def test_negative_fixtures_report_expected_paths(self):
        self.assertEqual(len(NEGATIVE_PATHS), 21)
        for fixture, path in NEGATIVE_PATHS.items():
            schema = fixture.replace(".missing.json", ".schema.json").replace(".enum.json", ".schema.json").replace(".extra.json", ".schema.json")
            result = self.validate(schema, fixture)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn(path, result.stdout + result.stderr)

    def test_candidate_paths_are_relative_and_traversal_free(self):
        valid = json.loads((FIXTURES / "candidate.v1.valid.json").read_text())
        for path in ("../x", "/abs/x", "a/../b", "..\\outside.txt", "C:\\absolute.txt", "a\\..\\b", "a\x00b"):
            with self.subTest(path=path):
                instance = dict(valid)
                instance["files"] = [dict(valid["files"][0], path=path)]
                result = self.validate_temp("candidate.v1.schema.json", instance)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("$.files[0].path", result.stdout + result.stderr)
        result = self.validate_temp("candidate.v1.schema.json", valid)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_receipt_outcome_artifact_constraints(self):
        valid = json.loads((FIXTURES / "run-receipt.v1.valid.json").read_text())
        accepted_null = dict(valid, artifact=None)
        result = self.validate_temp("run-receipt.v1.schema.json", accepted_null)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        dead_path = dict(valid, outcome="dead-letter", artifact=None, published_path="out/path")
        result = self.validate_temp("run-receipt.v1.schema.json", dead_path)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

        for instance in (
            dict(valid, artifact=dict(valid["artifact"], path="")),
            dict(valid, published_path=""),
            dict(valid, chain=dict(valid["chain"], candidates=[])),
            dict(valid, chain=dict(valid["chain"], verdicts=[])),
        ):
            result = self.validate_temp("run-receipt.v1.schema.json", instance)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

        empty_chain = {name: ([] if isinstance(value, list) else value)
                       for name, value in valid["chain"].items()}
        dead_letter = dict(valid, outcome="dead-letter", artifact=None,
                           published_path=None, chain=empty_chain)
        result = self.validate_temp("run-receipt.v1.schema.json", dead_letter)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_receipt_review_seats_are_unique_and_outcome_sensitive(self):
        valid = json.loads((FIXTURES / "run-receipt.v1.valid.json").read_text())
        review = {
            "digest": "c" * 64,
            "attempt": 1,
        }
        three_correctness = dict(
            valid,
            chain=dict(
                valid["chain"],
                reviews=[dict(review, role="correctness") for _ in range(3)],
            ),
        )
        result = self.validate_temp("run-receipt.v1.schema.json", three_correctness)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

        accepted_missing_seat = dict(
            valid,
            chain=dict(
                valid["chain"],
                reviews={"correctness": review, "value": review},
            ),
        )
        result = self.validate_temp("run-receipt.v1.schema.json", accepted_missing_seat)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

        dead_letter_partial = dict(
            valid,
            outcome="dead-letter",
            artifact=None,
            published_path=None,
            chain=dict(valid["chain"], reviews={"correctness": review}),
        )
        result = self.validate_temp("run-receipt.v1.schema.json", dead_letter_partial)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_accepted_receipt_requires_distinct_review_digests(self):
        valid = json.loads((FIXTURES / "run-receipt.v1.valid.json").read_text())
        same_digest = {
            seat: dict(review, digest="c" * 64)
            for seat, review in valid["chain"]["reviews"].items()
        }
        duplicate = dict(
            valid,
            chain=dict(valid["chain"], reviews=same_digest),
        )
        result = self.validate_temp("run-receipt.v1.schema.json", duplicate)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(
            "$.chain.reviews: duplicate review digest across seats",
            result.stdout + result.stderr,
        )

        distinct = {
            seat: dict(review, digest=digest * 64)
            for (seat, review), digest in zip(
                valid["chain"]["reviews"].items(), ("1", "2", "3"),
            )
        }
        accepted = dict(valid, chain=dict(valid["chain"], reviews=distinct))
        result = self.validate_temp("run-receipt.v1.schema.json", accepted)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_instance_files_reject_duplicate_object_members_at_any_depth(self):
        schema = json.loads((ROOT / "schemas" / "candidate.v1.schema.json").read_text())
        instance_text = (
            '{"schema":"candidate.v1","work_id":"' + "a" * 64
            + '","attempt":1,"content_digest":"' + "b" * 64
            + '","files":[{"path":"a","path":"b","sha256":"' + "c" * 64
            + '"}],"produced_by":{"carrier":"c","session_ref":"s"},'
              '"produced_at":"2026-01-01T00:00:00Z"}'
        )
        result = self.validate_schema_text(schema, instance_text)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("$: duplicate object member path", result.stdout + result.stderr)

    def test_receipt_paths_are_relative_and_traversal_free(self):
        valid = json.loads((FIXTURES / "run-receipt.v1.valid.json").read_text())
        for field, path in (
            ("artifact", "a\x00b"),
            ("artifact", "../x"),
            ("artifact", "/abs"),
            ("published_path", "a\x00b"),
            ("published_path", "../x"),
            ("published_path", "/abs"),
        ):
            with self.subTest(field=field, path=path):
                if field == "artifact":
                    instance = dict(valid, artifact=dict(valid["artifact"], path=path))
                    expected_path = "$.artifact.path"
                else:
                    instance = dict(valid, published_path=path)
                    expected_path = "$.published_path"
                result = self.validate_temp("run-receipt.v1.schema.json", instance)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn(
                    "$.artifact" if field == "artifact" else expected_path,
                    result.stdout + result.stderr,
                )

    def test_const_and_enum_are_type_strict(self):
        const_schema = {"const": True}
        enum_schema = {"enum": [True]}
        for schema in (const_schema, enum_schema):
            with self.subTest(schema=schema):
                self.assertEqual(self.validate_schema_temp(schema, 1).returncode, 1)
                self.assertEqual(self.validate_schema_temp(schema, True).returncode, 0)

    def test_datetime_format_is_parsed(self):
        valid = json.loads((FIXTURES / "candidate.v1.valid.json").read_text())
        for value in ("2026-99-99Tnot-a-dateZ", "2026-02-30T00:00:00Z",
                      "2026-01-01T00:00Z", "2026-08-14T013000Z",
                      "2026-08-14T24:00:00Z"):
            result = self.validate_temp("candidate.v1.schema.json", dict(valid, produced_at=value))
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        for value in ("2026-08-14T01:30:00.5Z", "2026-08-14T23:59:59Z"):
            result = self.validate_temp(
                "candidate.v1.schema.json", dict(valid, produced_at=value),
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_datetime_regex_clamps_clock_fields(self):
        spec = importlib.util.spec_from_file_location("validator", VALIDATOR)
        validator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(validator)
        self.assertIsNone(validator.RFC3339_UTC.fullmatch("2026-08-14T24:00:00Z"))
        self.assertIsNotNone(validator.RFC3339_UTC.fullmatch("2026-08-14T23:59:59Z"))

    def test_unknown_schema_keyword_fails_closed(self):
        result = self.validate_schema_temp({"oneOf": [{"const": 1}]}, 1)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("unsupported schema keyword", result.stdout + result.stderr)

    def test_additional_properties_only_accepts_false(self):
        for value in (True, {"oneOf": [{"const": 1}]}):
            with self.subTest(value=value):
                result = self.validate_schema_temp(
                    {"type": "object", "additionalProperties": value}, {},
                )
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn("unsupported schema keyword value", result.stdout + result.stderr)

    def test_schema_files_have_no_duplicate_members(self):
        def reject_duplicate_members(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError(f"duplicate JSON member: {key}")
                result[key] = value
            return result

        for schema_name in SCHEMAS:
            with self.subTest(schema=schema_name):
                json.loads(
                    (ROOT / "schemas" / schema_name).read_text(),
                    object_pairs_hook=reject_duplicate_members,
                )

    def test_schema_keyword_whitelist_is_complete(self):
        spec = importlib.util.spec_from_file_location("validator", VALIDATOR)
        validator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(validator)
        keywords = set()

        def collect(schema):
            keywords.update(schema)
            for subschema in schema.get("properties", {}).values():
                collect(subschema)
            if isinstance(schema.get("items"), dict):
                collect(schema["items"])
            for subschema in schema.get("anyOf", []):
                collect(subschema)

        for schema_name in SCHEMAS:
            collect(json.loads((ROOT / "schemas" / schema_name).read_text()))
        self.assertLessEqual(keywords, validator.ALLOWED | validator.META)

    def validate_temp(self, schema_name, instance):
        schema = json.loads((ROOT / "schemas" / schema_name).read_text())
        return self.validate_schema_temp(schema, instance)

    def validate_schema_temp(self, schema, instance):
        return self.validate_schema_text(schema, json.dumps(instance))

    def validate_schema_text(self, schema, instance_text):
        with tempfile.TemporaryDirectory() as tmp:
            schema_path = Path(tmp) / "schema.json"
            instance_path = Path(tmp) / "instance.json"
            schema_path.write_text(json.dumps(schema))
            instance_path.write_text(instance_text)
            return subprocess.run([sys.executable, str(VALIDATOR), str(schema_path), str(instance_path)], text=True, capture_output=True)

    def test_canonical_known_answer(self):
        from tools.canonical import canonical_bytes, digest
        value = {"a": 1, "b": [True, None, "s"]}
        self.assertEqual(canonical_bytes(value), b'{"a":1,"b":[true,null,"s"]}')
        self.assertEqual(
            digest(value),
            "f7573f068b8297987c4ce2b3449a7cbb4ed1d2b543cf15617d97f617381838fe",
        )

    def test_canonical_snapshot_digest_and_tamper(self):
        from tools.canonical import canonical_bytes, digest
        snapshot = json.loads((FIXTURES / "source-snapshot.v1.valid.json").read_text())
        receipt = json.loads((FIXTURES / "run-receipt.v1.valid.json").read_text())
        receipt["chain"]["snapshot_digest"] = digest(snapshot)
        self.assertEqual(receipt["chain"]["snapshot_digest"], hashlib.sha256(canonical_bytes(snapshot)).hexdigest())
        tampered = dict(snapshot, source_tree="c" * 40)
        self.assertNotEqual(receipt["chain"]["snapshot_digest"], digest(tampered))

    def test_work_id_derivation(self):
        from tools.canonical import canonical_bytes
        from tools.workid import derive_work_id
        source, node, pipeline = "a" * 40, "n1", "v1"
        expected = hashlib.sha256(canonical_bytes({
            "source_commit": source,
            "node_gid": node,
            "pipeline_version": pipeline,
        })).hexdigest()
        self.assertEqual(derive_work_id(source, node, pipeline), expected)
        self.assertNotEqual(derive_work_id(source, "n2", pipeline), expected)

    def test_work_id_separator_collision_is_eliminated(self):
        from tools.workid import derive_work_id
        source = "a" * 40
        first = derive_work_id(source, "n1:p1", "x")
        second = derive_work_id(source, "n1", "p1:x")
        self.assertNotEqual(first, second)

        valid = json.loads((FIXTURES / "work-item.v1.valid.json").read_text())
        for node_gid, pipeline_version, work_id in (
            ("n1:p1", "x", first),
            ("n1", "p1:x", second),
        ):
            instance = dict(
                valid,
                source_commit=source,
                node_gid=node_gid,
                pipeline_version=pipeline_version,
                work_id=work_id,
            )
            result = self.validate_temp("work-item.v1.schema.json", instance)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_work_item_enforces_derived_work_id(self):
        from tools.workid import derive_work_id
        valid = json.loads((FIXTURES / "work-item.v1.valid.json").read_text())
        valid["work_id"] = derive_work_id(
            valid["source_commit"], valid["node_gid"], valid["pipeline_version"],
        )
        result = self.validate_temp("work-item.v1.schema.json", valid)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        replacement = "0" if valid["work_id"][-1] != "0" else "1"
        tampered = dict(valid, work_id=valid["work_id"][:-1] + replacement)
        result = self.validate_temp("work-item.v1.schema.json", tampered)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("$.work_id", result.stdout + result.stderr)
        self.assertIn("derived mismatch", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
