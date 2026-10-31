"""Cross-channel links must bind public science without exposing mail or drafts."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from lib.living_library import parse_problem, render_research
from lib.reading_views import research_followups
from lib.research_updates import EMPTY, validate_feed
from tests.test_living_library import graph, problem_source


def note():
    return {'id': 'checked-note', 'problem_ids': ['test-question'], 'title': 'An exact result',
            'revision': 2, 'evidence_url': 'https://example.org/pinned/proof.lean',
            'doi': 'https://doi.org/10.5281/zenodo.123',
            'pdf_url': 'https://zenodo.org/records/123/files/note-v2.pdf',
            'source_url': 'https://zenodo.org/records/123/files/source-v2.zip',
            'mathesis_url': 'https://mathesis-omega-research.apps.chrono-ai.fun/papers/WP-2026-0123'}


class OutreachLinksTests(unittest.TestCase):
    def test_problem_links_show_the_exact_note_doi_and_public_mathesis_page(self):
        feed = validate_feed(dict(EMPTY, notes=[note()]))
        html = research_followups('test-question', feed)
        for key in ('doi', 'pdf_url', 'source_url', 'mathesis_url'):
            self.assertIn('href="' + note()[key] + '"', html)
        self.assertIn('version 2', html)
        self.assertEqual(research_followups('unrelated-question', feed), '')

    def test_private_submission_sandbox_and_correspondence_fields_are_rejected(self):
        for change in ({'mathesis_url': note()['mathesis_url'].replace('/papers/', '/submissions/')},
                       {'pdf_url': 'https://sandbox.zenodo.org/records/123/files/note.pdf'},
                       {'doi': 'https://doi.org/10.5072/zenodo.123'},
                       {'thread_id': 'private-message'}, {'email': 'private@example.org'},
                       {'revision': True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_feed(dict(EMPTY, notes=[{**note(), **change}]))
        reserved = {key: value for key, value in note().items() if key not in ('doi', 'mathesis_url')}
        with self.assertRaises(ValueError):
            validate_feed(dict(EMPTY, notes=[reserved]))

    def test_exchange_does_not_claim_collaboration_and_summary_is_escaped(self):
        project = {'id': 'exchange', 'problem_ids': ['test-question'], 'topic': 'sharp bounds',
                   'status': 'research_exchange', 'people': [{'name': 'A. Researcher', 'institution': 'University'}],
                   'evidence_url': 'https://example.org/public-research', 'date': '2026-10-30',
                   'summary': 'Checking the equality case <script>unsafe</script>.'}
        html = research_followups('test-question', validate_feed(dict(EMPTY, collaborations=[project])))
        self.assertIn('Research exchange with A. Researcher', html)
        self.assertNotIn('In collaboration with', html)
        self.assertNotIn('<script>', html)
        self.assertIn('2026-10-30', html)
        project['status'] = 'confirmed_active'
        self.assertIn('In collaboration with', research_followups('test-question', dict(EMPTY, collaborations=[project])))

    def test_dossier_and_deployment_index_carry_the_same_public_note(self):
        feed = dict(EMPTY, updated_at='2026-10-31T00:00:00Z', notes=[note()])
        problem = parse_problem(problem_source(), 'test-question.md')
        snapshot = {'graph': graph(), 'problems': [problem], 'truth_release_digest': 'sha256:' + 'a' * 64}
        with tempfile.TemporaryDirectory() as root:
            output = Path(root)
            (output / 'assets').mkdir()
            (output / 'assets/research-updates.json').write_text(json.dumps(feed))
            render_research(snapshot, output, {'path': 'data/test.json', 'digest': 'sha256:' + 'b' * 64})
            dossier = (output / 'research/test-question/index.html').read_text()
            self.assertIn(note()['mathesis_url'], dossier)
            self.assertIn(note()['doi'], dossier)
            index = json.loads((output / 'assets/publication-index.json').read_text())
            self.assertEqual(index['notes'], [note()])


if __name__ == '__main__':
    unittest.main()
