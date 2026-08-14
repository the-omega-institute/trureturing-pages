import os
import tempfile
import unittest
from pathlib import Path

from lib.roots import OutOfTreeWriteError, assert_write_allowed


class RootsSecurityTests(unittest.TestCase):
    def test_write_inside_explicit_allowed_root(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "allowed"
            target = root / "nested" / "artifact.json"

            self.assertEqual(assert_write_allowed(target, [root]), target)

    def test_arbitrary_paths_outside_allowed_roots_are_rejected(self):
        allowed = [Path(tempfile.gettempdir()) / "fkst-explicit-allowed-root"]

        for target in (Path(tempfile.gettempdir()) / "outside-x", Path("/opt/nonexistent/x")):
            with self.subTest(target=target):
                with self.assertRaises(OutOfTreeWriteError):
                    assert_write_allowed(target, allowed)

    def test_empty_allowed_roots_rejects_all_writes(self):
        with self.assertRaises(OutOfTreeWriteError):
            assert_write_allowed(Path(tempfile.gettempdir()) / "x", [])

    def test_symlink_path_component_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            allowed = base / "allowed"
            allowed.mkdir()
            real_directory = allowed / "real"
            real_directory.mkdir()
            (allowed / "link").symlink_to(real_directory, target_is_directory=True)

            with self.assertRaises(OutOfTreeWriteError):
                assert_write_allowed(allowed / "link" / "artifact.json", [allowed])

    def test_lib_sources_do_not_contain_local_home_paths(self):
        home = os.path.expanduser("~")
        lib_root = Path(__file__).resolve().parents[2] / "lib"
        leaked = [
            str(path.relative_to(lib_root))
            for path in lib_root.rglob("*.py")
            if home in path.read_text(encoding="utf-8")
        ]

        self.assertEqual(leaked, [])


if __name__ == "__main__":
    unittest.main()
