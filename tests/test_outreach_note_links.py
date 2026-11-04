"""Cross-channel links must bind public science without exposing mail or drafts."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from lib.living_library import parse_problem, render_research
from lib.reading_views import research_followups
from lib.research_updates import EMPTY, merge_publications, pages_feed, validate_feed
from tests.test_living_library import graph, problem_source


def note():
    return {'id': 'checked-note', 'problem_ids': ['test-question'], 'title': 'An exact result',
            'revision': 2, 'evidence_url': 'https://example.org/pinned/proof.lean',
            'doi': 'https://doi.org/10.5281/zenodo.123',
            'pdf_url': 'https://zenodo.org/records/123/files/note-v2.pdf',
            'source_url': 'https://zenodo.org/records/123/files/source-v2.zip',
            'mathesis_url': 'https://mathesis-omega-research.apps.chrono-ai.fun/papers/WP-2026-0123'}


class OutreachLinksTests(unittest.TestCase):
    def test_mathesis_reading_link_belongs_to_conjecture_not_research_highlights(self):
        feed = validate_feed(dict(EMPTY, notes=[note()]))
        html = research_followups('test-question', feed)
        self.assertNotIn(note()['doi'], html)
        self.assertIn(note()['mathesis_url'], html)
        self.assertNotIn(note()['mathesis_url'], research_followups('test-question', feed, include_mathesis=False))
        self.assertNotIn('version 2', html)
        self.assertEqual(research_followups('unrelated-question', feed), '')

    def test_pages_feed_keeps_arxiv_and_formal_publications_but_drops_zenodo(self):
        arxiv = {'id': 'arxiv-paper', 'problem_ids': [], 'topic': 'arXiv result',
                 'title': 'A preprint', 'authors': 'A. Author', 'date': '2026-10-31',
                 'url': 'https://arxiv.org/abs/2611.01064', 'venue': 'arXiv:2611.01064',
                 'status': 'preprint', 'summary': 'A public preprint.',
                 'evidence_url': 'https://arxiv.org/abs/2611.01064'}
        formal = {**arxiv, 'id': 'formal-paper', 'topic': 'Published result',
                  'title': 'A published paper', 'url': 'https://doi.org/10.1000/example',
                  'venue': 'Example Journal', 'status': 'published',
                  'evidence_url': 'https://doi.org/10.1000/example'}
        accepted = {**formal, 'id': 'accepted-paper', 'url': 'https://example.org/accepted-paper',
                    'status': 'accepted', 'evidence_url': 'https://example.org/acceptance'}
        zenodo = {**arxiv, 'id': 'zenodo-note', 'topic': 'Short note',
                  'title': 'An archived note', 'url': note()['doi'], 'venue': 'Zenodo',
                  'evidence_url': note()['evidence_url']}
        feed = validate_feed(dict(EMPTY, publications=[arxiv, formal, accepted, zenodo], notes=[note()]))
        public = pages_feed(feed)
        self.assertEqual([p['id'] for p in public['publications']], ['arxiv-paper', 'formal-paper', 'accepted-paper'])
        self.assertEqual(public['notes'], [{k: v for k, v in note().items() if k not in ('doi', 'pdf_url', 'source_url')}])
        self.assertNotIn('zenodo', json.dumps(public))
        self.assertEqual(merge_publications([], dict(EMPTY, publications=[accepted]))[0]['status'], 'Accepted')

    def test_archive_only_and_non_arxiv_preprints_do_not_become_publications(self):
        from lib.research_updates import is_pages_publication
        for url in ('https://arxiv.org/abs/not-an-id', 'https://example.org/draft', note()['doi']):
            self.assertFalse(is_pages_publication({'url': url, 'status': 'preprint'}))
        self.assertTrue(is_pages_publication({'url': 'https://arxiv.org/abs/math/0301234', 'status': 'preprint'}))
        self.assertFalse(is_pages_publication({'url': note()['doi'], 'status': 'published'}))
        archive = {k: v for k, v in note().items() if k != 'mathesis_url'}
        self.assertEqual(pages_feed(dict(EMPTY, notes=[archive]))['notes'], [])

    def test_existing_publication_cards_drop_zenodo_supplement_links(self):
        baseline = {**{
            'id': 'arxiv-paper', 'problem_ids': [], 'topic': 'arXiv result',
            'title': 'A preprint', 'authors': 'A. Author', 'date': '2026-10-31',
            'url': 'https://arxiv.org/abs/2611.01064', 'venue': 'arXiv:2611.01064',
            'status': 'preprint', 'summary': 'A public preprint.',
            'evidence_url': 'https://arxiv.org/abs/2611.01064'},
            'links': [{'label': 'Code', 'url': 'https://github.com/example/code'},
                      {'label': 'Archived supplement', 'url': note()['doi']}]}
        merged = merge_publications([baseline], EMPTY)
        self.assertEqual([link['label'] for link in merged[0]['links']], ['Code'])

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

    def test_dossier_and_index_keep_mathesis_mapping_without_archive_links(self):
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
            self.assertNotIn(note()['doi'], dossier)
            index = json.loads((output / 'assets/publication-index.json').read_text())
            self.assertEqual(index['notes'], pages_feed(feed)['notes'])
            research = (output / 'research.html').read_text()
            self.assertNotIn(note()['doi'], research)
            self.assertNotIn(note()['mathesis_url'], research)
            self.assertNotIn(note()['doi'], (output / 'assets/research-updates.json').read_text())


if __name__ == '__main__':
    unittest.main()
