"""A real general theorem must survive automatic assessment and explanation.

Fixture copied verbatim from trureturing@a0bb803b5cbcd26b060ab266714e9e55aa548efe,
Problems/erdos-nicolas-1989-divisor-difference-sum.md (PR #32862).
It exercises an unpublished source example; it is never added to production data.
"""
import copy
from pathlib import Path
import unittest

from lib.contributions import build_index, documented_year, scope_evidence
from lib.contribution_stories import result_story, readable, source_question, source_answer_and_scope, is_assertion
from lib.living_library import parse_problem
from lib.reading_views import render_result_index, story_inline
from tests.test_reading_views import document

FIXTURE = Path(__file__).parent / 'fixtures/contributions/erdos-nicolas-1989-divisor-difference-sum.md'
SOURCE = 'a0bb803b5cbcd26b060ab266714e9e55aa548efe'


class ContributionMeaningTests(unittest.TestCase):
    def setUp(self):
        self.problem = parse_problem(FIXTURE.read_text(), FIXTURE.name)
        self.record = {'id': self.problem['slug'], 'title': self.problem['title'], 'kind': 'proved',
                       'module': 'D5/S3/Arith/Divisors/ErdosNicolas/Main', 'declaration': 'erdos_nicolas',
                       'source_commit': SOURCE, 'source_url': self.problem['url'],
                       'summary': 'P. Erdős and J.-L. Nicolas, On functions connected with prime divisors of an integer (1989).'}
        self.snapshot = {'problems': [self.problem], 'graph': {'source_snapshot': {'source_commit': SOURCE},
                         'nodes': [{'id': self.record['module'], 'human_abstract': 'The Erdős–Nicolas divisor difference conjecture'}], 'edges': []}}

    def item(self):
        return build_index(self.snapshot, [self.record])['results'][0]

    def test_general_computer_assisted_proof_qualifies_without_new_concept_wording(self):
        item = self.item()
        self.assertEqual(item['assessment']['dimensions']['concepts']['level'], 0)
        self.assertEqual(item['assessment']['dimensions']['methods']['level'], 4)
        self.assertEqual(item['assessment']['dimensions']['advance']['level'], 4)
        self.assertEqual(item['assessment']['scope'], 'recorded_statement')
        self.assertTrue(item['research_news']['eligible'])
        self.assertGreaterEqual(item['score'], 50)

    def test_an_oeis_link_does_not_erase_an_explicit_primary_paper_date(self):
        self.assertEqual(documented_year(self.problem), (1989, 'Year in the primary source attribution'))

    def test_another_open_question_does_not_reduce_the_delivered_theorem(self):
        _, boundary = scope_evidence('We conjecture that for every n, P(n) holds.',
                                      'Strong induction proves the claim.',
                                      'The complete catalog problem and a sharper extremal constant remain open.')
        self.assertEqual(boundary, '')
        _, boundary = scope_evidence('We conjecture that for every n, P(n) holds.', '',
                                      'This does not settle the full conjecture.')
        self.assertTrue(boundary)

    def test_names_and_ids_are_not_ranking_overrides(self):
        before = self.item()
        other = copy.deepcopy(self.snapshot)
        other['problems'][0]['slug'] = 'unlisted-general-proof'
        record = dict(self.record, id='unlisted-general-proof', title='An unlisted result')
        after = build_index(other, [record])['results'][0]
        self.assertEqual(before['score'], after['score'])
        self.assertEqual(before['research_news'], after['research_news'])

    def test_story_explains_the_claim_and_its_notation_without_authored_copy(self):
        story = result_story(self.problem, self.record, self.item(), authored={})
        self.assertIn('5040', story['question'])
        self.assertIn('all positive divisors', story['question'])
        self.assertTrue(story['finding'].startswith('We prove that for n > 5040'))
        self.assertNotIn('D5/', story['finding'])
        self.assertNotIn('37 years', story['impact'])
        self.assertNotIn('P. Erdős and J.-L. Nicolas, On functions', story['finding'])

    def test_mathematical_kernels_and_formulas_are_retained(self):
        text = 'A positive semidefinite kernel bounds the interaction between divisor blocks.'
        self.assertEqual(readable(text), text)
        self.assertIn('math-inline', story_inline(r'The bound is $4^{-N}$ for $N\ge2$.'))
        self.assertNotIn('<script>', story_inline('<script>alert(1)</script>'))

    def test_question_selection_skips_quoted_definitions(self):
        text = '> Definition 1. A K-set is a set with the stated property.\n\n> Open Question: Find the smallest K-set.'
        self.assertEqual(source_question(text), 'Open Question: Find the smallest K-set.')

    def test_open_question_is_not_repeated_as_an_answer(self):
        self.assertFalse(is_assertion('The open question is whether the capacity is independent of the input.'))
        problem = {'sections': {'Problem': '> Is every map in A or B independent?\n\nThe all-A clause is refuted. The B clause remains open.'}}
        answer, scope = source_answer_and_scope(problem)
        self.assertEqual(answer, 'The all-A clause is refuted.')
        self.assertEqual(scope, 'The B clause remains open.')

    def test_unquoted_mathematical_paraphrase_wins_over_bibliographic_metadata(self):
        text = 'The reference names Conjecture 4.3.\n\nUnder these hypotheses, Conjecture 4.4 asserts the following together:\n\n$$A=B.$$'
        self.assertTrue(source_question(text).startswith('Under these hypotheses'))

    def test_question_answer_and_importance_are_visible_in_the_closed_row(self):
        source = document(f'<main><article class="news-result" id="{self.record["id"]}">Exact proof record</article></main>')
        ranking = build_index(self.snapshot, [self.record])
        html = render_result_index(source, self.snapshot, [self.record], ranking)
        summary = html.split('</summary>', 1)[0]
        for field in ('question', 'finding', 'impact'):
            self.assertIn(f'data-story-field="{field}"', summary)
        self.assertIn('5040', summary)
        self.assertIn('Exact proof record', html)


if __name__ == '__main__':
    unittest.main()
