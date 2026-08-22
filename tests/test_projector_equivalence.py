"""Acceptance test: the typed C# projector preserves the current Python view bytes."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRUTH_GRAPH = ROOT / "content/source/truth-graph.raw.v1.json"
SOURCE_SNAPSHOT = ROOT / "content/source/source-snapshot.v1.blessed.json"
CSPROJ = ROOT / "tools/Trureturing.Pages.Projector/Trureturing.Pages.Projector.csproj"
SNAPSHOT_SCHEMA_REQUIRED_FIELDS = (
    "schema",
    "repo_identity",
    "source_commit",
    "source_tree",
    "derived_at",
    "deriver",
    "open_set",
)
PROJECTOR_REQUIRED_SNAPSHOT_FIELDS = (
    "source_repo",
    "truth_graph_sha256",
    "blessed_by",
)


def canonical_truth_graph_bytes(graph: dict) -> bytes:
    serialized = json.dumps(graph, sort_keys=True)
    # Trureturing.Truth canonical JSON uses uppercase escapes for encoded scalars,
    # while its encoder permits U+FF21 literally.
    serialized = re.sub(
        r"\\u([0-9a-f]{4})",
        lambda match: "\\u" + match.group(1).upper(),
        serialized,
    )
    serialized = serialized.replace("\\uFF21", "\uff21")
    return (serialized + "\n").encode("utf-8")


def synthetic_non_bmp_graph() -> dict:
    return {
        "schema": "stratalint.truth-graph.v1",
        "schema_version": 1,
        "truth": {
            # The reader requires input nodes in repo_path order. The projector must
            # independently reorder these same-status GIDs by Unicode code point.
            "nodes": [
                {"depth": 0, "gid": "G/A", "module_name": r"Literal \uD83D\uDE00", "repo_path": "G/A.lean", "state": "open"},
                {"depth": 0, "gid": "G/\U0001f600", "module_name": "G.Emoji", "repo_path": "G/Emoji.lean", "state": "open"},
                {"depth": 0, "gid": "G/\uff21", "module_name": "G.Fullwidth", "repo_path": "G/Fullwidth.lean", "state": "open"},
            ],
            "edges": [],
            "state_counts": {"closed": 0, "open": 3, "semantic": 0, "tail": 0},
            "open_blockers": [],
        },
        "documents": {
            "describe_nodes": [],
            "document_edges": {"dependency": [], "narrative_reference": []},
            "document_nodes": [],
        },
        "joins": {"truth_anchors": []},
        "provenance": {
            "dependency_granularity": "module-import",
            "lean_report_digest": "sha256:8001d1e45724d516139b7fd7ee33be9e96709698547d3bd10381a99d95ff1f2d",
            "snapshot": {
                "content_digest": "sha256:2c56ffe7bd7b7f4216249a46ebf5fd3228928dc9ce44c2d0053a6fd04f126d56",
                "materializer": "repository-snapshot-v1",
            },
            "truth_root_sha256": "03f1452e11b3b578088b024ee5a1b9204b2d08309ec36c0f57f2b5fa1db5d20d",
        },
        "deferred_layers": ["digestion"],
    }


class ProjectorEquivalenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        subprocess.run(
            [
                "dotnet",
                "build",
                str(CSPROJ),
                "--configuration",
                "Release",
                "--nologo",
            ],
            cwd=ROOT,
            check=True,
        )

    def test_real_fixture_outputs_are_byte_identical(self) -> None:
        expected_digest = hashlib.sha256(TRUTH_GRAPH.read_bytes()).hexdigest()

        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            python_output = output_dir / "python.json"
            csharp_output = output_dir / "csharp.json"

            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "lib/truthgraph_project.py"),
                    str(TRUTH_GRAPH),
                    str(python_output),
                    str(SOURCE_SNAPSHOT),
                    expected_digest,
                ],
                cwd=ROOT,
                check=True,
            )
            subprocess.run(
                [
                    "dotnet",
                    "run",
                    "--project",
                    str(CSPROJ),
                    "--configuration",
                    "Release",
                    "--no-build",
                    "--",
                    str(TRUTH_GRAPH),
                    str(csharp_output),
                    str(SOURCE_SNAPSHOT),
                    expected_digest,
                ],
                cwd=ROOT,
                check=True,
            )

            self.assertEqual(python_output.read_bytes(), csharp_output.read_bytes())

    def test_non_bmp_gid_outputs_are_byte_identical(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            truth_graph = output_dir / "synthetic-truth-graph.json"
            python_output = output_dir / "python.json"
            csharp_output = output_dir / "csharp.json"
            truth_graph.write_bytes(canonical_truth_graph_bytes(synthetic_non_bmp_graph()))

            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "lib/truthgraph_project.py"),
                    str(truth_graph),
                    str(python_output),
                ],
                cwd=ROOT,
                check=True,
            )
            subprocess.run(
                [
                    "dotnet",
                    "run",
                    "--project",
                    str(CSPROJ),
                    "--configuration",
                    "Release",
                    "--no-build",
                    "--",
                    str(truth_graph),
                    str(csharp_output),
                ],
                cwd=ROOT,
                check=True,
            )

            self.assertEqual(python_output.read_bytes(), csharp_output.read_bytes())
            projected = json.loads(csharp_output.read_bytes())
            self.assertEqual(
                [node["id"] for node in projected["nodes"]],
                ["G/A", "G/\uff21", "G/\U0001f600"],
            )

    def test_digest_mismatches_fail_before_writing(self) -> None:
        expected_digest = hashlib.sha256(TRUTH_GRAPH.read_bytes()).hexdigest()
        sentinel = b"existing output must survive\n"

        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            output = output_dir / "output.json"
            bad_snapshot = output_dir / "bad-source-snapshot.json"
            snapshot = json.loads(SOURCE_SNAPSHOT.read_bytes())
            snapshot["truth_graph_sha256"] = "0" * 64
            bad_snapshot.write_text(json.dumps(snapshot), encoding="utf-8")

            cases = [
                (bad_snapshot, expected_digest, "does not match blessed truth_graph_sha256"),
                (SOURCE_SNAPSHOT, "0" * 64, "does not match expected digest"),
            ]
            for snapshot_path, caller_digest, error_fragment in cases:
                with self.subTest(error=error_fragment):
                    output.write_bytes(sentinel)
                    completed = subprocess.run(
                        [
                            "dotnet",
                            "run",
                            "--project",
                            str(CSPROJ),
                            "--configuration",
                            "Release",
                            "--no-build",
                            "--",
                            str(TRUTH_GRAPH),
                            str(output),
                            str(snapshot_path),
                            caller_digest,
                        ],
                        cwd=ROOT,
                        check=False,
                        capture_output=True,
                        text=True,
                    )
                    self.assertNotEqual(completed.returncode, 0)
                    self.assertIn(error_fragment, completed.stderr)
                    self.assertEqual(output.read_bytes(), sentinel)

    def test_malformed_source_snapshots_fail_before_writing(self) -> None:
        expected_digest = hashlib.sha256(TRUTH_GRAPH.read_bytes()).hexdigest()
        valid_snapshot = json.loads(SOURCE_SNAPSHOT.read_bytes())
        sentinel = b"existing output must survive\n"

        malformed_snapshots = []
        for field in SNAPSHOT_SCHEMA_REQUIRED_FIELDS + PROJECTOR_REQUIRED_SNAPSHOT_FIELDS:
            snapshot = dict(valid_snapshot)
            del snapshot[field]
            malformed_snapshots.append((f"missing {field}", snapshot, field))

        for field in ("tool", "ref"):
            snapshot = json.loads(json.dumps(valid_snapshot))
            del snapshot["deriver"][field]
            malformed_snapshots.append((f"missing deriver.{field}", snapshot, field))

        for field in ("gid", "deps", "deps_all_closed"):
            snapshot = json.loads(json.dumps(valid_snapshot))
            del snapshot["open_set"][0][field]
            malformed_snapshots.append((f"missing open_set.{field}", snapshot, field))

        for value in (None, "a" * 63, "A" * 64, "g" * 64):
            snapshot = dict(valid_snapshot)
            snapshot["truth_graph_sha256"] = value
            malformed_snapshots.append(
                ("invalid truth_graph_sha256", snapshot, "truth_graph_sha256")
            )

        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            output = output_dir / "output.json"
            malformed_snapshot = output_dir / "malformed-source-snapshot.json"

            for label, snapshot, error_fragment in malformed_snapshots:
                with self.subTest(case=label):
                    malformed_snapshot.write_text(json.dumps(snapshot), encoding="utf-8")
                    output.write_bytes(sentinel)
                    completed = subprocess.run(
                        [
                            "dotnet",
                            "run",
                            "--project",
                            str(CSPROJ),
                            "--configuration",
                            "Release",
                            "--no-build",
                            "--",
                            str(TRUTH_GRAPH),
                            str(output),
                            str(malformed_snapshot),
                            expected_digest,
                        ],
                        cwd=ROOT,
                        check=False,
                        capture_output=True,
                        text=True,
                    )
                    self.assertNotEqual(completed.returncode, 0)
                    self.assertIn(error_fragment, completed.stderr)
                    self.assertEqual(output.read_bytes(), sentinel)


if __name__ == "__main__":
    unittest.main(verbosity=2)
