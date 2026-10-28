"""Behavioral checks for ranking and the independent public research feed."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from lib.contributions import DIMENSIONS, build_index, documented_year, score
from lib.research_updates import EMPTY, load_feed, merge_publications, refresh_from_release, validate_feed
from lib.reading_views import research_followups
from lib.living_library import parse_problem
from tests.test_living_library import problem_source


def evidence(level=2):
    return {'level': level, 'rationale': 'Documented reuse in a distinct problem.',
            'evidence': ['https://example.org/public-paper']}


def paper():
    return {'id': 'paper-alpha', 'title': 'A new method', 'authors': 'A. Researcher',
            'date': '2026-10-01', 'url': 'https://arxiv.org/abs/2609.12345v2', 'venue': 'arXiv',
            'status': 'preprint', 'summary': 'A method and its precise boundary.',
            'topic': 'the general case', 'problem_ids': ['alpha'], 'evidence_url': 'https://arxiv.org/abs/2609.12345'}


def collaboration():
    return {'id': 'joint-alpha', 'problem_ids': ['alpha'], 'topic': 'a reusable definition',
            'status': 'confirmed_active', 'people': [{'name': 'A. Researcher', 'institution': 'Example Institute'}],
            'evidence_url': 'https://example.org/public-project'}


class ContributionAutomationTests(unittest.TestCase):
    def result(self, slug='alpha', kind='proved'):
        return {'id': slug, 'title': slug.title(), 'kind': kind, 'module': 'D5/' + slug,
                'source_url': 'https://example.org/question', 'summary': 'The exact stated question is resolved.'}

    def dossier(self, slug='alpha', **sections):
        return {'slug': slug, 'title': slug.title(), 'url': 'https://example.org/question',
                'sections': {'Problem': 'For every positive integer n, establish the identity.',
                             'Motivation': 'The source proves the first few cases of the proposed identity.',
                             'Route': 'A bijection gives a structural representation. Strong induction proves the identity.',
                             'Triage': 'Tier 1. The result has proof_shape: content.', **sections}}

    def ranked(self, problems, records=None, nodes=None, edges=None):
        records = records or [self.result(p['slug']) for p in problems]
        snapshot = {'problems': problems, 'graph': {'source_snapshot': {'source_commit': 'a' * 40},
                    'nodes': nodes or [], 'edges': edges or []}}
        return build_index(snapshot, records)

    def test_every_existing_dossier_gets_a_stable_score_without_new_fields(self):
        problems = [self.dossier('zeta'), self.dossier('alpha')]
        first = self.ranked(problems)
        self.assertEqual(first, self.ranked(list(reversed(problems))))
        self.assertTrue(all(isinstance(r['score'], (int, float)) and r['status'] == 'assessed' for r in first['results']))
        self.assertEqual(first['owner'], 'trureturing-pages')
        self.assertEqual(first['source_commit'], 'a' * 40)
        self.assertEqual([r['id'] for r in first['results']], ['alpha', 'zeta'])

    def test_actual_contribution_limits_age_and_reputation_bonus(self):
        strong = {k: {'level': 0} for k in DIMENSIONS}
        strong.update(concepts={'level': 3}, methods={'level': 3}, advance={'level': 3}, significance={'level': 2})
        witness = {k: {'level': 0} for k in DIMENSIONS}
        witness.update(significance={'level': 1}, methods={'level': 1}, advance={'level': 1},
                       history={'level': 4}, standing={'level': 4})
        self.assertGreater(score(strong), score(witness))
        self.assertEqual(score({k: {'level': 4} for k in DIMENSIONS}), 100)

    def test_new_concept_and_general_argument_rank_above_a_single_witness(self):
        concept = self.dossier('concept', Route='We introduce a new invariant. A bijection proves the structural characterization.')
        witness = self.dossier('witness', Problem='A conjectured inequality.', Motivation='',
                               Route='The finite certificate evaluates the witness at n = 7.', Triage='Tier 1; certified-instance; proof_shape: bind-only.')
        result = self.ranked([witness, concept], [self.result('witness', 'refuted'), self.result('concept')])
        self.assertEqual(result['results'][0]['id'], 'concept')
        facts = result['results'][0]['assessment']['dimensions']
        self.assertEqual(facts['concepts']['level'], 3)
        self.assertTrue(facts['concepts']['evidence'])
        self.assertIn('new invariant', facts['concepts']['excerpt'])

    def test_unproved_and_negated_ideas_do_not_receive_concept_credit(self):
        for route in ['No new definition is introduced.', 'We could introduce a new invariant.',
                      'A new framework remains open.', 'Try a new definition and seek a bijection.']:
            result = self.ranked([self.dossier(Route=route, Triage='Tier 1')])['results'][0]
            self.assertEqual(result['assessment']['dimensions']['concepts']['level'], 0, route)
        result = self.ranked([self.dossier(Route='', Triage='Tier 1.\n\n**Argued, not formalized.**\nWe introduce a new invariant.')])['results'][0]
        self.assertEqual(result['assessment']['dimensions']['concepts']['level'], 0)

    def test_source_category_and_repeated_words_do_not_add_points(self):
        p = self.dossier()
        q = copy.deepcopy(p); q['url'] = 'https://oeis.org/A000001'; q['sections']['Route'] *= 12
        self.assertEqual(self.ranked([p])['results'][0]['score'], self.ranked([q])['results'][0]['score'])

    def test_history_uses_the_conjecture_date_not_the_oeis_author_date(self):
        p = self.dossier(Problem='FORMULA:\n\n> Conjecture: a(n) = n*n. - _A. Author_, May 17 2022\n\nAUTHOR:\n> _B. Author_, Sep 04 2002')
        p['url'] = 'https://oeis.org/A000001'
        self.assertEqual(documented_year(p)[0], 2022)
        p['sections']['Problem'] = 'A formula.\n\nAUTHOR:\n> _B. Author_, Sep 04 2002'
        self.assertIsNone(documented_year(p)[0])
        p['url'] = 'https://arxiv.org/abs/1509.12345v2'
        self.assertEqual(documented_year(p)[0], 2015)

    def test_background_belongs_to_the_primary_attribution_not_incidental_names(self):
        p = self.dossier(Problem="Erdős's 1989 reminiscence records the uniqueness question.", Route='The finite certificate gives a counterexample.')
        first = self.ranked([p])['results'][0]['assessment']['dimensions']['standing']
        self.assertEqual(first['person'], 'Paul Erdős')
        p['sections']['Problem'] = 'A. Student, a new question about graphs.'
        p['sections']['Route'] = "We use Erdős's lemma and a bijection."
        second = self.ranked([p])['results'][0]['assessment']['dimensions']['standing']
        self.assertEqual(second['level'], 0)

    def test_proof_reuse_counts_distinct_result_consumers_only(self):
        ps = [self.dossier('alpha'), self.dossier('beta')]
        edge = {'source': 'D5/alpha', 'target': 'D5/beta', 'layer': 'truth-dependency'}
        one = self.ranked(ps, edges=[edge])
        many = self.ranked(ps, edges=[edge, edge, dict(edge, layer='structural-affinity')])
        self.assertEqual(one, many)
        alpha = next(r for r in one['results'] if r['id'] == 'alpha')
        self.assertEqual(alpha['assessment']['dimensions']['significance']['consumers'], ['beta'])

    def test_scope_boundary_is_preserved_and_limits_the_advance(self):
        p = self.dossier(Triage='Tier 1. This does not settle the full recursion. The sign remains open.')
        item = self.ranked([p])['results'][0]
        self.assertLessEqual(item['assessment']['dimensions']['advance']['level'], 2)
        self.assertIn('does not settle', item['assessment']['next_question'])

    def test_obsolete_upstream_assessments_are_not_a_dependency(self):
        p = self.dossier(); baseline = self.ranked([p])
        p['contribution_assessment'] = {'schema_version': 'unsupported', 'score': 100}
        self.assertEqual(baseline, self.ranked([p]))
        parsed = parse_problem(problem_source().replace('---\n', '---\ncontribution_assessment: ignored\n', 1), 'test-question.md')
        self.assertNotIn('contribution_assessment', parsed)

    def test_scores_and_reasons_are_persisted_with_the_source_commit(self):
        snapshot = {'problems': [self.dossier()], 'graph': {'source_snapshot': {'source_commit': 'a' * 40}}}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'scores.json'
            value = build_index(snapshot, [self.result()], path)
            self.assertEqual(json.loads(path.read_text()), value)
            self.assertEqual(value, build_index(snapshot, [self.result()]))

    def test_publication_or_collaboration_each_qualifies(self):
        for feed in [dict(EMPTY, publications=[paper()]), dict(EMPTY, collaborations=[collaboration()])]:
            validate_feed(feed)
            self.assertTrue(research_followups('alpha', feed))
            self.assertEqual(research_followups('unrelated', feed), '')
        both = dict(EMPTY, publications=[paper()], collaborations=[collaboration()])
        html = research_followups('alpha', both)
        self.assertIn('Further research on the general case', html)
        self.assertIn('In collaboration with A. Researcher from Example Institute', html)
        self.assertEqual(html.count('<p>'), 2)

    def test_contact_interest_submission_and_private_fields_do_not_qualify(self):
        for status in ['active', 'interested', 'coauthorship_pending', 'completed']:
            with self.assertRaises(ValueError):
                validate_feed(dict(EMPTY, collaborations=[dict(collaboration(), status=status)]))
        for status in ['draft', 'submitted', 'accepted']:
            with self.assertRaises(ValueError):
                validate_feed(dict(EMPTY, publications=[dict(paper(), status=status)]))
        with self.assertRaises(ValueError):
            validate_feed(dict(EMPTY, collaborations=[dict(collaboration(), message_id='private-mail')]))
        with self.assertRaises(ValueError):
            validate_feed(dict(EMPTY, schema_version='v2'))

    def test_arxiv_versions_dedupe_without_inventing_problem_links(self):
        baseline = dict(paper(), id='existing-anchor', url='https://doi.org/10.48550/arXiv.2609.12345', image='cover.jpg')
        merged = merge_publications([baseline], dict(EMPTY, publications=[paper()]))
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]['id'], 'existing-anchor')
        self.assertEqual(merged[0]['image'], 'cover.jpg')
        with self.assertRaises(ValueError):
            validate_feed(dict(EMPTY, publications=[paper(), dict(paper(), id='duplicate', url='https://arxiv.org/pdf/2609.12345v3')]))

    def test_feed_replacement_removes_collaboration_and_does_not_accumulate_papers(self):
        baseline = []
        full = dict(EMPTY, publications=[paper()], collaborations=[collaboration()])
        self.assertEqual(len(merge_publications(baseline, full)), 1)
        self.assertEqual(merge_publications(baseline, EMPTY), [])
        self.assertEqual(research_followups('alpha', EMPTY), '')

    def test_stable_result_id_replaces_bootstrap_citation_and_preserves_editorial_content(self):
        baseline = dict(paper(), id='padovan', image='padovan.jpg', highlight='An authored qualification.')
        later = dict(paper(), id='padovan', title='The journal paper',
                     url='https://doi.org/10.1234/example', venue='Example Journal', status='published')
        merged = merge_publications([baseline], dict(EMPTY, publications=[later]))
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]['id'], 'padovan')
        self.assertEqual(merged[0]['url'], later['url'])
        self.assertEqual(merged[0]['status'], 'Published')
        self.assertEqual(merged[0]['image'], 'padovan.jpg')
        self.assertEqual(merged[0]['highlight'], baseline['highlight'])
        self.assertEqual(merged[0]['evidence'], later['evidence_url'])

    def test_feed_only_note_keeps_its_anchor_across_doi_replacement(self):
        first = merge_publications([], dict(EMPTY, publications=[paper()]))
        later = dict(paper(), url='https://doi.org/10.1234/extended', status='published')
        merged = merge_publications(first, dict(EMPTY, publications=[later]))
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]['id'], first[0]['id'])
        self.assertEqual(merged[0]['url'], later['url'])

    def test_same_topic_or_problem_does_not_replace_another_paper(self):
        baseline = paper()
        another = dict(paper(), id='independent-paper', url='https://doi.org/10.1234/independent')
        merged = merge_publications([baseline], dict(EMPTY, publications=[another]))
        self.assertEqual(len(merged), 2)

    def test_markup_is_escaped_and_unsafe_links_rejected(self):
        p = dict(paper(), topic='<img src=x onerror=bad()>')
        html = research_followups('alpha', validate_feed(dict(EMPTY, publications=[p])))
        self.assertNotIn('<img', html)
        self.assertIn('&lt;img', html)
        for key in ['url', 'evidence_url']:
            with self.assertRaises(ValueError):
                validate_feed(dict(EMPTY, publications=[dict(paper(), **{key: 'javascript:bad()'})]))

    def test_feed_refresh_distinguishes_missing_release_from_network_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'feed.json'; path.write_text(json.dumps(EMPTY))
            before = path.read_bytes()
            with patch('lib.research_updates.subprocess.run', return_value=subprocess.CompletedProcess([], 1, '', 'gh: Not Found (HTTP 404)')):
                refresh_from_release(path)
            with patch('lib.research_updates.subprocess.run', return_value=subprocess.CompletedProcess([], 1, '', 'network failure')):
                self.assertRaises(RuntimeError, refresh_from_release, path)
            self.assertEqual(path.read_bytes(), before)

    def test_checked_in_public_bootstrap_is_valid(self):
        self.assertEqual(len(load_feed()['publications']), 2)


if __name__ == '__main__': unittest.main()
