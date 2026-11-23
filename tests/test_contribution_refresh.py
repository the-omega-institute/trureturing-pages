"""Release changes replace the leading results without a selected-ID list."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from lib.contributions import build_index, load_prior_results, plain
from lib.contribution_stories import build_milestones
from lib.reading_views import Fragments, ranking_guide, render_result_index, research_highlights
from tests import test_contribution_automation as fixtures
from tests.test_reading_views import document


class ContributionRefreshTests(unittest.TestCase):
    def setUp(self):
        factory = fixtures.ContributionAutomationTests()
        self.old = factory.dossier('old', Problem='Conjecture 1. Establish the identity.',
                                 Route='A finite certificate evaluates the identity.',
                                 Motivation='', Triage='proof_shape: bind-only')
        self.new = factory.dossier('new', Problem='Conjecture 2. For every positive integer n, establish the identity.',
                                 Route='We introduce a new invariant. A bijection gives a structural characterization. Strong induction proves the identity.')
        self.records = [factory.result('old'), factory.result('new')]
        self.snapshot = {'problems': [self.old, self.new], 'graph': {
            'source_snapshot': {'source_commit': 'a' * 40}, 'nodes': [], 'edges': []}}

    def test_new_stronger_result_replaces_the_leader_and_enters_news_without_authored_copy(self):
        before = build_index(dict(self.snapshot, problems=[self.old]), self.records[:1])
        self.assertEqual(before['results'][0]['id'], 'old')
        with patch('lib.contribution_stories.load_stories', return_value={}):
            ranking = build_index(self.snapshot, self.records)
            milestones = build_milestones(self.snapshot, self.records, ranking)
            html = research_highlights(self.snapshot, self.records, ranking)
        self.assertEqual([r['id'] for r in ranking['results']], ['new', 'old'])
        self.assertGreater(ranking['results'][0]['score'], ranking['results'][1]['score'])
        self.assertEqual([r['id'] for r in milestones['results']], ['new'])
        self.assertIn('data-milestone-id="new"', html)
        self.assertNotIn('data-milestone-id="old"', html)

    def test_changed_evidence_reorders_existing_results_and_withdrawal_removes_news(self):
        ranking = build_index(self.snapshot, self.records)
        changed = copy.deepcopy(self.snapshot)
        changed['problems'][0]['sections'] = copy.deepcopy(self.new['sections'])
        changed['problems'][1]['sections'] = copy.deepcopy(self.old['sections'])
        reranked = build_index(changed, self.records)
        self.assertEqual([r['id'] for r in reranked['results']], ['old', 'new'])
        withdrawn = build_index(self.snapshot, self.records[:1])
        self.assertEqual([r['id'] for r in withdrawn['results']], ['old'])
        self.assertEqual(build_milestones(self.snapshot, self.records[:1], withdrawn)['results'], [])
        self.assertEqual(ranking, build_index(self.snapshot, list(reversed(self.records))))

    def test_all_rows_render_in_the_persisted_automatic_order(self):
        ranking = build_index(self.snapshot, self.records)
        source = document('<main>' + ''.join(
            f'<article class="news-result" id="{r["id"]}">Verified proof {r["id"]}</article>'
            for r in self.records) + '</main>')
        html = render_result_index(source, self.snapshot, self.records, ranking)
        rows = Fragments(html).select(cls='result-item')
        self.assertEqual([r.attrs['id'] for r in rows], ['resolved-new', 'resolved-old'])
        self.assertIn('Verified proof old', html)
        self.assertNotIn('Editorial selection', html)

    def test_prior_answer_keeps_its_rank_and_cannot_become_a_new_highlight(self):
        baseline = build_index(self.snapshot, self.records)
        prior = {'new': {'id': 'new', 'reason': 'Previously proved in the cited paper.',
                         'source_url': 'https://example.org/prior-answer'}}
        with patch('lib.contributions.load_prior_results', return_value=prior):
            ranking = build_index(self.snapshot, self.records)
        self.assertEqual([(r['id'], r['score']) for r in baseline['results']],
                         [(r['id'], r['score']) for r in ranking['results']])
        self.assertTrue(baseline['results'][0]['research_news']['eligible'])
        self.assertFalse(ranking['results'][0]['research_news']['eligible'])
        self.assertEqual(ranking['results'][0]['research_news']['reasons'], ['known_prior_result'])

    def test_prior_answer_requires_a_citation(self):
        for value in [{'schema_version': 'other', 'results': []},
                      {'schema_version': 'prior-results.v1', 'results': [{'id': 'new', 'reason': 'Unsupported'}]}]:
            with tempfile.TemporaryDirectory() as temp:
                path = Path(temp) / 'prior.json'
                path.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    load_prior_results(path)

    def test_reading_guide_explains_automatic_replacement(self):
        html = ranking_guide(build_index(self.snapshot, self.records))
        self.assertIn('New results enter this order on publication', html)
        self.assertIn('New qualifying results appear automatically', html)
        self.assertNotIn('Editorial selection', html)

    def test_plain_keeps_inequalities_but_drops_quote_markers(self):
        self.assertEqual(plain('> Quoted.\np(A=B=C) = 41/144 > 1/4.'),
                         'Quoted. p(A=B=C) = 41/144 > 1/4.')


if __name__ == '__main__':
    unittest.main()
