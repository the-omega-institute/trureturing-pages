"""Enroll editorial graph invariants in the existing unittest discovery gate."""
from pathlib import Path
import subprocess
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

class MillenniumTests(unittest.TestCase):
    def test_client_contracts(self):
        result = subprocess.run(
            ['node', '--test', 'tests/js/millennium.test.mjs', 'tests/js/i18n.test.mjs'], cwd=ROOT,
            capture_output=True, text=True, timeout=60, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_public_defaults_and_shared_navigation(self):
        for page in (ROOT / 'site').rglob('*.html'):
            html = page.read_text()
            self.assertIn('lang="en"', html, str(page))
            self.assertIn('assets/i18n.mjs', html, str(page))
            self.assertIsNone(re.search(r'[\u3400-\u9fff]', html), str(page))
            nav = re.search(r'<nav aria-label="Primary navigation">(.*?)</nav>', html, re.S)
            if nav:
                self.assertEqual(re.findall(r'>(Explore|Research|Conjectures|Library|Evolution)<', nav[1]),
                                 ['Explore', 'Research', 'Conjectures', 'Library', 'Evolution'], str(page))
        translations = json.loads((ROOT / 'site/assets/locales/zh-CN.json').read_text())
        for english, translated in translations.items():
            self.assertEqual(set(re.findall(r'\{\d+\}', english)),
                             set(re.findall(r'\{\d+\}', translated)), english)

    def test_asset_syntax_and_entrypoint(self):
        for source in ['i18n.mjs', 'millennium-core.mjs', 'millennium.mjs', 'living-library.js']:
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
