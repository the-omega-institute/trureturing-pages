"""Acceptance test: the typed C# projector preserves the current Python view bytes."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRUTH_GRAPH = ROOT / "content/source/truth-graph.raw.v1.json"
SOURCE_SNAPSHOT = ROOT / "content/source/source-snapshot.v1.blessed.json"
CSPROJ = ROOT / "tools/Trureturing.Pages.Projector/Trureturing.Pages.Projector.csproj"


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
