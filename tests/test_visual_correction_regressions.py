"""Retain the existing route/publication checks during visual restoration."""
import subprocess
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

class ExistingContractsTests(unittest.TestCase):
    def test_existing_reading_client_contracts(self):
        subprocess.run(['node', '--test', 'tests/js/reading.test.mjs'], cwd=ROOT,
                       check=True, capture_output=True, text=True)

    def test_merged_presentation_uses_existing_rebuild_path(self):
        workflow=(ROOT/'.github/workflows/refresh-presentation.yml').read_text()
        self.assertIn('branches: [dev]',workflow)
        self.assertIn('gh workflow run pages.yml',workflow)
        self.assertIn('-f rebuild_current=true',workflow)
        self.assertNotIn('actions/deploy-pages',workflow)
        self.assertNotIn('truth_release_digest=mock',workflow)
        self.assertNotIn('pull_request:',workflow)

if __name__ == '__main__': unittest.main()
