"""Run archive routing contracts in the existing Python CI gate."""
from pathlib import Path
import subprocess
import unittest


class LibraryRouteTests(unittest.TestCase):
    def test_direct_routes_and_legacy_bookmarks(self):
        result = subprocess.run(
            ['node', '--test', 'tests/js/library-routes.test.mjs'],
            cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
