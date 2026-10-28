"""Public context labels must not promote a score or a source date into a claim."""
import unittest

from lib.result_highlights import result_highlight
from lib.reading_views import Fragments, render_conjecture_overview, render_result_index
from tests.test_reading_views import results


class ResultHighlightTests(unittest.TestCase):
    def record(self, **changes):
        return dict(id='alpha', title='Conjecture 1', kind='proved', module='D5/S3/Quantum/Example',
                    source_url='https://example.org/paper', source_commit='a' * 40, **changes)

    def item(self, contribution='', **dimensions):
        return {'assessment': {'contribution': contribution, 'dimensions': dimensions}}

    def test_source_age_does_not_establish_years_spent_unsolved(self):
        problem = {'bibkey': 'author1970question', 'sections': {'Problem': 'Conjecture 1.'}}
        badge = result_highlight(self.record(date='2026-10-01'), self.item(), problem)
        self.assertEqual(badge['history'], {'label': 'Source', 'value': '1970'})
        self.assertNotIn('56', badge['headline'])

    def test_duration_requires_a_dated_question_and_resolution(self):
        problem = {'sections': {'Problem': 'This conjecture was posed in 1970.'}}
        record = self.record(date='2020-04-01')
        badge = result_highlight(record, self.item(), problem)
        self.assertEqual(badge['history'], {'label': 'Years from question to resolution', 'value': '50'})
        # No date means no aging relative to build time.
        for missing in (None, '', '2026', 'invalid'):
            record['date'] = missing
            self.assertEqual(result_highlight(record, self.item(), problem)['history'],
                             {'label': 'Posed in', 'value': '1970'})

    def test_oeis_author_date_is_not_question_date(self):
        p = {'url': 'https://oeis.org/A000001', 'sections': {
            'Problem': 'A conjectured recurrence.\n\nAUTHOR:\n> A. Author, May 17 1970'}}
        self.assertIsNone(result_highlight(self.record(), self.item(), p)['history'])

    def test_preprint_year_keeps_its_bibliographic_meaning(self):
        p = {'bibkey': 'authors2016paper', 'doi': '10.1000/journal',
             'url': 'https://arxiv.org/abs/1508.03551v2'}
        badge = result_highlight(self.record(date='2026-10-01'), self.item(), p)
        self.assertEqual(badge['history'], {'label': 'First preprint', 'value': '2015'})
        p['url'] = 'https://example.org/abs/1508.03551v2'
        self.assertEqual(result_highlight(self.record(), self.item(), p)['history'],
                         {'label': 'Source', 'value': '2016'})

    def test_primary_paper_date_wins_over_a_later_survey(self):
        p = {'bibkey': 'survey2013', 'sections': {
            'Problem': 'Erdős, Some unconventional problems, Astérisque 61 (1979), printed page 78:\n\n> Perhaps...'}}
        badge = result_highlight(self.record(), self.item(), p)
        self.assertEqual(badge['history'], {'label': 'Source', 'value': '1979'})
        self.assertIn('/Problems/alpha.md', badge['evidence'][-1]['url'])

    def test_high_score_and_famous_author_do_not_make_a_question_fundamental(self):
        badge = result_highlight(self.record(), self.item(
            significance={'level': 4}, standing={'level': 4, 'person': 'A. Author',
                                               'rationale': 'Foundational work.', 'evidence': ['https://example.org/profile']}))
        self.assertEqual(badge['headline'], 'Conjecture proved')
        self.assertEqual(badge['person'], 'A. Author')

    def test_foundational_label_requires_explicit_context(self):
        p = {'sections': {'Motivation': 'This conjecture is central to the classification of these channels.'}}
        badge = result_highlight(self.record(), self.item(), p)
        self.assertEqual(badge['headline'], 'Foundational question resolved')
        self.assertIn('classification', badge['evidence'][0]['text'])
        p['sections']['Motivation'] = 'The conjecture is not fundamental to this theory.'
        self.assertEqual(result_highlight(self.record(), self.item(), p)['headline'], 'Conjecture proved')

    def test_actual_contribution_is_visible_without_promoting_a_proposed_route(self):
        badge = result_highlight(self.record(), self.item('The state attains the sharp upper bound.'))
        self.assertEqual(badge['headline'], 'Sharp bound proved')
        self.assertEqual(badge['evidence'][0]['text'], 'The state attains the sharp upper bound.')
        self.assertIn('/Problems/alpha.md', badge['evidence'][0]['url'])
        problem = {'sections': {'Route': 'We could introduce a new framework and prove a sharp upper bound.'}}
        self.assertEqual(result_highlight(self.record(), self.item(), problem)['headline'], 'Conjecture proved')

    def test_refutation_never_uses_a_proof_headline(self):
        record = self.record(); record['kind'] = 'refuted'
        badge = result_highlight(record, self.item('The source conjectures a sharp upper bound.'))
        self.assertEqual(badge['headline'], 'Conjecture refuted')

    def test_map_outcome_edges_follow_records_not_field_position(self):
        records = [dict(id='q1', module='D5/S3/Quantum/Q1', kind='proved'),
                   dict(id='q2', module='D5/S3/Quantum/Q2', kind='refuted'),
                   dict(id='n1', module='D5/S3/Arith/N1', kind='proved')]
        parsed = Fragments(render_conjecture_overview(records))
        edges = [(e.attrs['data-field'], e.attrs['data-outcome'], e.attrs['data-count'])
                 for e in parsed.select(tag='path') if 'data-outcome' in e.attrs]
        self.assertEqual(edges, [('Quantum information', 'proved', '1'), ('Quantum information', 'refuted', '1'),
                                 ('Number theory', 'proved', '1')])

    def test_context_is_escaped_and_sits_left_of_the_title(self):
        records, source = results()
        records[0]['summary'] = 'The state attains the sharp upper bound <script>alert(1)</script>.'
        html = render_result_index(source, {}, records)
        parsed = Fragments(html)
        row = parsed.raw(parsed.select(id='resolved-sequence')[0])
        self.assertLess(row.index('result-impact-list'), row.index('result-summary'))
        self.assertIn('About this highlight', row)
        self.assertNotIn('<script>alert', row)


if __name__ == '__main__':
    unittest.main()
