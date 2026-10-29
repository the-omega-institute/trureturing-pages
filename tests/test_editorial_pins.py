import copy
import json
from pathlib import Path
import tempfile
import unittest

from lib.contributions import build_index, load_pins, PINS_PATH, editorial_binding
from lib.contribution_stories import build_milestones
from lib.reading_views import research_highlights, assessment_details
from tests import test_contribution_automation as fixtures


PINS = {'pins': [{'id': 'zeta', 'reason': 'Asked as the main open question.', 'headline': 'Zeta, settled',
                  'venue': 'J. Example 1 (2009)', 'quote': 'Is <zeta> true?', 'quote_by': 'A. Author',
                  'answer': '47', 'quote_kind': 'verbatim', 'source_url': 'https://example.org/question', 'scope': 'Only the zeta statement.', 'locator': 'p. 1'}],
        'excluded': [{'id': 'beta', 'reason': 'Already answered in the literature.'}]}


class EditorialPinTests(unittest.TestCase):
    def setUp(self):
        factory = fixtures.ContributionAutomationTests()
        weak = dict(Route='A finite certificate evaluates a witness.',
                    Triage='certified-instance; proof_shape: bind-only', Motivation='')
        self.problems = [factory.dossier('alpha'), factory.dossier('beta'), factory.dossier('zeta', **weak)]
        self.problems[-1]['sections']['Problem'] = 'Is <zeta> true?'
        self.records = [factory.result(p['slug']) for p in self.problems]
        self.snapshot = {'problems': self.problems, 'graph': {'nodes': [], 'edges': [],
                         'source_snapshot': {'source_commit': 'a' * 40}}}

        self.pins = copy.deepcopy(PINS)
        self.pins['pins'][0]['binding'] = editorial_binding(self.problems[-1], self.records[-1])

    def test_pins_lead_without_changing_scores(self):
        plain = build_index(self.snapshot, self.records, pins={'pins': [], 'excluded': []})
        pinned = build_index(self.snapshot, self.records, pins=self.pins)
        self.assertEqual(pinned['results'][0]['id'], 'zeta')
        self.assertEqual({r['id']: r['score'] for r in plain['results']},
                         {r['id']: r['score'] for r in pinned['results']})
        self.assertEqual(pinned['editorial_pins'], ['zeta'])

    def test_pin_selects_and_exclusion_withholds_research_news(self):
        ranking = {r['id']: r for r in build_index(self.snapshot, self.records, pins=self.pins)['results']}
        self.assertTrue(ranking['zeta']['research_news']['eligible'])
        self.assertEqual(ranking['zeta']['research_news']['basis'], 'editorial_pin')
        self.assertFalse(ranking['beta']['research_news']['eligible'])
        self.assertIn('editorial_exclusion', ranking['beta']['research_news']['reasons'])
        self.assertIn('Editorial pin', assessment_details(ranking['zeta']))
        self.assertIn('Not headlined', assessment_details(ranking['beta']))

    def test_missing_pin_is_reported_not_rendered(self):
        pins = copy.deepcopy(self.pins)
        pins['pins'].append({'id': 'withdrawn', 'reason': 'No longer released.'})
        ranking = build_index(self.snapshot, self.records, pins=pins)
        self.assertEqual(ranking['editorial_pins_missing'], ['withdrawn'])
        self.assertNotIn('withdrawn', [r['id'] for r in ranking['results']])

    def test_highlight_quotes_the_source_then_answers_with_escaping(self):
        ranking = build_index(self.snapshot, self.records, pins=self.pins)
        milestones = build_milestones(self.snapshot, self.records, ranking)
        html = research_highlights(self.snapshot, self.records, ranking, milestones=milestones)
        self.assertLess(html.index('discovery-quote'), html.index('discovery-answer'))
        self.assertIn('“Is &lt;zeta&gt; true?”', html)
        self.assertIn('<strong>47</strong>', html)
        self.assertIn('Zeta, settled', html)
        self.assertNotIn('<zeta>', html)

    def test_changed_scope_or_source_disables_stale_pin(self):
        for mutate in (
            lambda: self.records[-1].update(scope='A smaller theorem'),
            lambda: self.problems[-1]['sections'].update(Problem='Is beta true?'),
            lambda: self.problems[-1].update(url='https://example.org/different'),
            lambda: self.pins['pins'][0].update(quote='A fabricated quote'),
        ):
            self.setUp()
            mutate()
            result = build_index(self.snapshot, self.records, pins=self.pins)
            self.assertEqual(result['editorial_pins'], [])
            self.assertEqual(result['editorial_pins_stale'], [{'id': 'zeta', 'reason': 'source_or_scope_changed'}])
            self.assertFalse(any(row.get('editorial_pin') for row in result['results']))

    def test_unrelated_release_change_does_not_remove_reviewed_copy(self):
        self.snapshot['graph']['source_snapshot']['source_commit'] = 'b' * 40
        self.problems[0]['sections']['Route'] = 'A different argument for alpha.'
        result = build_index(self.snapshot, self.records, pins=self.pins)
        self.assertEqual(result['editorial_pins'], ['zeta'])

    def test_paraphrase_is_not_presented_as_direct_quotation(self):
        pin = self.pins['pins'][0]
        pin.update(quote='Does zeta hold?', quote_kind='paraphrase', source_excerpt='Is <zeta> true?')
        ranking = build_index(self.snapshot, self.records, pins=self.pins)
        html = research_highlights(self.snapshot, self.records, ranking)
        self.assertIn('The question · paraphrased', html)
        self.assertIn('Does zeta hold?', html)
        self.assertNotIn('“Does zeta hold?”', html)

    def test_invalid_pins_fail_closed(self):
        for data in [{'schema_version': 'other', 'pins': []},
                     {'schema_version': 'editorial-pins.v1', 'pins': [{'id': 'a'}]},
                     {'schema_version': 'editorial-pins.v1', 'pins': [{'id': 'a', 'reason': 'x'}, {'id': 'a', 'reason': 'y'}]}]:
            with tempfile.TemporaryDirectory() as temp:
                path = Path(temp) / 'pins.json'
                path.write_text(json.dumps(data))
                with self.assertRaises(ValueError):
                    load_pins(path)

    def test_plain_keeps_inequalities_but_drops_quote_markers(self):
        from lib.contributions import plain
        self.assertEqual(plain('> Quoted.\np(A=B=C) = 41/144 > 1/4.'), 'Quoted. p(A=B=C) = 41/144 > 1/4.')

    def test_released_pin_file_is_valid_and_quotes_every_pin(self):
        pins = load_pins(PINS_PATH)
        self.assertTrue(pins['pins'])
        for pin in pins['pins']:
            self.assertTrue(pin.get('quote') and pin.get('quote_by') and pin.get('answer') and pin.get('venue'))

    def test_released_locale_contains_every_visible_pin_translation(self):
        locale = json.loads((Path(__file__).resolve().parents[1] / 'site/assets/locales/zh-CN.json').read_text())
        pins = load_pins(PINS_PATH)['pins']
        for pin in pins:
            for key in ('headline', 'quote', 'answer', 'scope'):
                self.assertEqual(locale.get(pin[key]), pin['zh-CN'][key], (pin['id'], key))
        self.assertEqual(locale['Source excerpt'], '原文引述 · 中文译文')


if __name__ == '__main__':
    unittest.main()
