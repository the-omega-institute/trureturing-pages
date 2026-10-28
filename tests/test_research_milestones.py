import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from lib.contributions import build_index, SETTINGS, documented_year, validate_policy
from lib.contribution_stories import build_milestones, result_story, story_binding, readable
from lib.reading_views import research_highlights, render_research_groups
from lib.research_updates import EMPTY
from tests import test_contribution_automation as fixtures
from tests.test_contribution_automation import paper, collaboration
from tests.test_reading_views import document


class ResearchMilestoneTests(unittest.TestCase):
    def setUp(self):
        factory = fixtures.ContributionAutomationTests()
        self.record = factory.result()
        self.problem = factory.dossier(
            Problem='Conjecture 2. For every positive integer n, establish the identity.',
            Route='We introduce a new invariant. A bijection gives the characterization. Strong induction proves the identity.')
        self.snapshot = {'problems': [self.problem], 'graph': {'nodes': [], 'edges': [],
                         'source_snapshot': {'source_commit': 'a' * 40}}}

    def rank(self):
        return build_index(self.snapshot, [self.record])

    def test_news_threshold_is_inclusive_and_configurable(self):
        item = self.rank()['results'][0]
        settings = copy.deepcopy(SETTINGS)
        settings['research_news']['minimum_score'] = item['score']
        with patch('lib.contributions.SETTINGS', settings):
            self.assertTrue(self.rank()['results'][0]['research_news']['eligible'])
        settings['research_news']['minimum_score'] += .01
        with patch('lib.contributions.SETTINGS', settings):
            self.assertFalse(self.rank()['results'][0]['research_news']['eligible'])

    def test_invalid_threshold_or_weights_cannot_silently_publish_everything(self):
        for value in [-1, 101, float('nan'), True]:
            settings = copy.deepcopy(SETTINGS)
            settings['research_news']['minimum_score'] = value
            with self.assertRaises(ValueError):
                validate_policy(settings)
        settings = copy.deepcopy(SETTINGS)
        settings['weights']['standing'] = 50
        with self.assertRaises(ValueError):
            validate_policy(settings)

    def test_score_alone_cannot_bypass_contribution_gate(self):
        settings = copy.deepcopy(SETTINGS)
        settings['research_news']['minimum_score'] = 0
        self.problem['sections']['Route'] = 'A finite certificate evaluates a witness.'
        self.problem['sections']['Triage'] = 'certified-instance; proof_shape: bind-only'
        self.record['kind'] = 'refuted'
        with patch('lib.contributions.SETTINGS', settings):
            item = self.rank()['results'][0]
        self.assertIn('insufficient_contribution', item['research_news']['reasons'])

    def test_rebuild_is_idempotent_and_removed_results_leave_feed(self):
        ranking = self.rank()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'milestones.json'
            first = build_milestones(self.snapshot, [self.record], ranking, path)
            self.assertEqual(len(first['results']), 1)
            self.assertEqual(build_milestones(self.snapshot, [self.record], ranking, path), first)
            self.assertEqual(json.loads(path.read_text()), first)
            empty = build_milestones(self.snapshot, [], build_index(self.snapshot, []), path)
            self.assertEqual(empty['results'], [])
            self.assertEqual(json.loads(path.read_text())['results'], [])

    def test_new_qualifying_result_needs_no_authored_story(self):
        ranking = self.rank()
        with patch('lib.contribution_stories.load_stories', return_value={}):
            news = build_milestones(self.snapshot, [self.record], ranking)
            html = research_highlights(self.snapshot, [self.record], ranking)
        self.assertEqual(news['results'][0]['story']['origin'], 'released-dossier')
        self.assertIn('data-milestone-id="alpha"', html)
        self.assertNotIn('The released statement is proved.', html)

    def test_authored_story_cannot_change_score_and_expires_with_source(self):
        ranking = self.rank()
        authored = {'alpha': {'binding': story_binding(self.problem, self.record),
                             'en': {'headline': 'A readable research question', 'finding': 'A sourced explanation.'}}}
        story = result_story(self.problem, self.record, ranking['results'][0], authored)
        self.assertEqual(story['headline'], 'A readable research question')
        self.assertEqual(self.rank(), ranking)
        self.problem['sections']['Triage'] += '\nThe theorem has changed.'
        story = result_story(self.problem, self.record, self.rank()['results'][0], authored)
        self.assertEqual(story['origin'], 'released-dossier')
        self.assertNotEqual(story['headline'], 'A readable research question')

    def test_legacy_and_preprint_dates_match_real_hosts_only(self):
        for url, expected in [('https://arxiv.org/abs/quant-ph/0504166v1', 2005),
                              ('https://arxiv.org/abs/math/0010105', 2000),
                              ('https://arxiv.org.evil.example/abs/1508.03551', None),
                              ('https://example.org/abs/1508.03551', None)]:
            self.assertEqual(documented_year({'url': url})[0], expected)

    def test_prose_extensions_prior_literature_and_negations_do_not_earn_concepts(self):
        for extra in ['- **Proved in the cited source — characterization.** The source gives a normal form.',
                      '- **Proved in prose.** We introduce a new invariant.',
                      '| Characterization | Proved in prose below | every dimension |',
                      '- [computed: python3 script reconstructing a matrix]',
                      'This does not require a sufficient spectral characterization.',
                      'This uses no analytic formalization or unproved normal form.']:
            self.problem['sections']['Route'] = 'A determinant estimate proves the identity.'
            self.problem['sections']['Triage'] = 'Tier 1.\n\n- **Proved in Lean.** The identity holds.\n' + extra
            item = self.rank()['results'][0]
            self.assertEqual(item['assessment']['dimensions']['concepts']['level'], 0, extra)

    def test_unknown_author_is_explicit_and_reputation_is_capped(self):
        item = self.rank()['results'][0]
        self.assertEqual(item['assessment']['dimensions']['standing']['evidence_status'], 'not_documented')
        self.assertEqual(self.rank()['dimensions']['standing']['weight'], 5)

    def test_all_qualified_results_are_rendered_beyond_featured_limit(self):
        records, problems = [], []
        for index in range(6):
            r = dict(self.record, id=f'result-{index}')
            p = copy.deepcopy(self.problem); p['slug'] = r['id']
            records.append(r); problems.append(p)
        snapshot = dict(self.snapshot, problems=problems)
        ranking = build_index(snapshot, records)
        html = research_highlights(snapshot, records, ranking)
        self.assertEqual(html.count('data-milestone-id='), 6)
        self.assertIn('class="more-milestones"', html)

    def test_papers_and_confirmed_collaboration_bypass_milestone_threshold(self):
        settings = copy.deepcopy(SETTINGS)
        settings['research_news']['minimum_score'] = 100
        source = document('<main><section id="publications"><article class="news-paper" id="published-paper">A public paper</article></section></main>')
        feed = dict(EMPTY, publications=[paper()], collaborations=[collaboration()])
        with patch('lib.contributions.SETTINGS', settings):
            html = render_research_groups(source, self.snapshot, [self.record], feed)
        self.assertNotIn('data-milestone-id=', html)
        self.assertIn('id="published-paper"', html)
        self.assertIn('A. Researcher from Example Institute', html)

    def test_technical_metadata_stays_out_of_the_readable_fallback(self):
        self.assertEqual(readable('The amplitudes have domain `Fin 16 → Complex`, used by a private Lean declaration.'), '')
        self.assertEqual(readable('The released module has admission_basis: open-problem-resolution.'), '')
        clean = 'The source obtained a bound for decomposable witnesses, leaving the full symmetric case open.'
        self.assertEqual(readable(clean), clean)

    def test_story_markup_is_escaped(self):
        ranking = self.rank()
        news = build_milestones(self.snapshot, [self.record], ranking)
        news['results'][0]['story']['headline'] = '<img src=x onerror=bad()>'
        html = research_highlights(self.snapshot, [self.record], ranking, milestones=news)
        self.assertNotIn('<img src=x', html)
        self.assertIn('&lt;img', html)


if __name__ == '__main__':
    unittest.main()
