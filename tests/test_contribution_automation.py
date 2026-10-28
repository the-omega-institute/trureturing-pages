"""Behavioral checks for ranking and the independent public research feed."""
import copy
import itertools
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from lib.contributions import DIMENSIONS, VERSION, assessment, build_index, score
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
    def test_scores_are_evidenced_not_counts_or_outcomes(self):
        raw = {'schema_version': VERSION, 'dimensions': {k: evidence(4) for k in DIMENSIONS if k != 'history'}}
        raw['dimensions']['history'] = {'proposed_year': '1989', 'resolved_year': '2026',
                                       'rationale': 'Question posed in the cited source.', 'evidence': ['https://example.org/1989']}
        facts = assessment(raw)['dimensions']
        self.assertEqual(facts['history']['level'], 3)
        self.assertEqual(score(facts)['score'], 97.5)
        self.assertEqual(score(facts, ['history'])['score'], 75)
        self.assertEqual(score(facts, ['methods', 'concepts'])['score'], 100)

    def test_unknown_is_not_zero_and_partial_is_not_renormalized(self):
        self.assertIsNone(score({})['score'])
        partial = score({'concepts': evidence(4)})
        self.assertEqual(partial, {'score': None, 'evidenced_score': 20, 'coverage': 20, 'status': 'partial'})
        zero = score({'concepts': evidence(0)}, ['concepts'])
        self.assertEqual(zero['score'], 0)
        self.assertEqual(zero['status'], 'complete')
        self.assertRaises(ValueError, score, {}, [])

    def test_metadata_survives_parse_and_bad_assessment_does_not_erase_proof(self):
        source = problem_source().replace('---\n', '---\ncontribution_assessment:\n  schema_version: unsupported\n', 1)
        problem = parse_problem(source, 'test-question.md')
        snapshot = {'problems': [problem], 'graph': {'source_snapshot': {'source_commit': 'a' * 40}}}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'scores.json'
            result = build_index(snapshot, [{'id': problem['slug'], 'title': 'Question'}], path)
            self.assertEqual(json.loads(path.read_text()), result)
        self.assertEqual(result['results'][0]['status'], 'pending')
        self.assertIn('assessment_error', result['results'][0])
        self.assertEqual(result['source_commit'], 'a' * 40)

    def test_bad_evidence_levels_and_future_history_fail(self):
        for bad in [dict(evidence(4), evidence=[]), dict(evidence(4), evidence=['javascript:alert(1)']),
                    evidence(True), evidence(5), evidence(-1), dict(evidence(2), rationale='')]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                assessment({'schema_version': VERSION, 'dimensions': {'concepts': bad}})
        with self.assertRaises(ValueError):
            assessment({'schema_version': VERSION, 'dimensions': {'history': dict(evidence(), proposed_year=2026, resolved_year=1989)}})

    def test_ranking_is_stable_and_outreach_has_no_scoring_input(self):
        records = [{'id': 'z', 'title': 'Zeta'}, {'id': 'a', 'title': 'Alpha'}]
        first = build_index({}, records)
        self.assertEqual(first, build_index({}, list(reversed(records))))
        self.assertEqual([r['id'] for r in first['results']], ['a', 'z'])

    def test_client_and_build_agree_for_every_nonempty_dimension_selection(self):
        facts = {k: evidence(i % 5) for i, k in enumerate(DIMENSIONS)}
        cases = []
        for size in range(1, len(DIMENSIONS) + 1):
            for selected in itertools.combinations(DIMENSIONS, size):
                weights = {key: DIMENSIONS[key][1] for key in selected}
                cases.extend([{'dimensions': facts, 'weights': weights, 'expected': score(facts, selected)},
                              {'dimensions': {'concepts': evidence(1)}, 'weights': weights,
                               'expected': score({'concepts': evidence(1)}, selected)}])
        script = """import fs from 'node:fs';
import {assessmentScore} from './site/assets/contribution-ranking.mjs';
import assert from 'node:assert/strict';
for (const c of JSON.parse(fs.readFileSync(0,'utf8'))) assert.deepEqual(assessmentScore(c.dimensions,c.weights),c.expected);
"""
        subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(cases), text=True, check=True)

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
