"""Enroll editorial graph invariants in the existing unittest discovery gate."""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

class MillenniumTests(unittest.TestCase):
    def test_client_contracts(self):
        result = subprocess.run(
            ['node', '--test', 'tests/js/millennium.test.mjs'], cwd=ROOT,
            capture_output=True, text=True, timeout=60, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_asset_syntax_and_entrypoint(self):
        for source in ['millennium-core.mjs', 'millennium.mjs', 'living-library.js']:
            result = subprocess.run(['node', '--check', f'site/assets/{source}'], cwd=ROOT,
                                    capture_output=True, text=True, timeout=15, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
        html = (ROOT / 'site/millennium.html').read_text()
        self.assertIn('id="mm-app"', html)
        self.assertIn('assets/millennium.mjs', html)
        self.assertIn('conjectures.html', html)
        loader = (ROOT / 'site/assets/living-library.js').read_text()
        self.assertIn('mountMillenniumEntry', loader)
        self.assertIn('import "./living-library-release.js";', loader)

if __name__ == '__main__':
    unittest.main()
