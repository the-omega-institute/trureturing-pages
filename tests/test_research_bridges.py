import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lib.discovery import build_index
from lib.human_labels import enrich_graph
from lib.literature import literature_identity, parse_citations
from lib.living_library import create_snapshot
from tests.test_living_library import graph


def snapshot_fixture():
    return {"graph": graph(), "problems": [], "truth_release_digest": "sha256:" + "a" * 64}


class BridgeTests(unittest.TestCase):
    def test_canonical_identifiers_and_safe_urls(self):
        self.assertEqual(literature_identity('https://doi.org/10.1000/ABC')[0], 'doi:10.1000/abc')
        self.assertEqual(literature_identity('https://arxiv.org/html/2509.16034v1#S3')[0], 'arxiv:2509.16034')
        self.assertEqual(literature_identity('https://doi.org/10.48550/arXiv.2509.16034')[0], 'arxiv:2509.16034')
        self.assertEqual(literature_identity('https://arxiv.org/pdf/2509.16034v2.pdf')[0], 'arxiv:2509.16034')
        for url in ['javascript:alert(1)', 'https://user:password@example.org/x', 'https://doi.org/invalid']:
            with self.assertRaises(ValueError): literature_identity(url)

    def test_emitted_attribution_is_not_proof_coverage_and_skips_code(self):
        line = '*Citation.* A. Author (1942). *Known theorem*. DOI: [10.2307/1968867](https://doi.org/10.2307/1968867).'
        text = '*Formalization.* `D5/S0/Test.known` (`✓ std3`).\n\n' + line + '\n\n```\n' + line.replace('1942', '2099') + '\n```\n\n' + line.replace('Citation', 'Acknowledgement')
        citations = parse_citations(text)
        self.assertEqual(len(citations), 2)
        self.assertEqual(citations[0]['declaration_gid'], 'D5/S0/Test.known')
        self.assertEqual(citations[1]['role'], 'acknowledgement')
        snapshot = snapshot_fixture()
        snapshot['graph']['nodes'][0]['literature'] = citations
        snapshot['graph']['source_snapshot'] = {'source_commit': 'a' * 40}
        index = build_index(snapshot)
        papers = [r for r in index['records'] if r.get('identifiers', {}).get('doi') == '10.2307/1968867']
        self.assertEqual(len(papers), 1)
        self.assertEqual(papers[0]['authors'], 'A. Author')
        self.assertEqual(papers[0]['status'], 'external-literature')
        edges = [e for e in index['relations'] if e['target'] == papers[0]['id']]
        self.assertEqual({e['kind'] for e in edges}, {'cites', 'acknowledges'})
        self.assertTrue(all(e['evidence']['source_commit'] == 'a' * 40 for e in edges))

    def test_citations_survive_release_snapshot_and_affect_content_history(self):
        graph = {'nodes': [{'id': 'D5/S0/Test', 'repo_path': 'D5/S0/Test.lean'}], 'edges': [], 'source_snapshot': {'truth_release_digest': 'sha256:' + 'a' * 64}}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); path = root / 'D5/S0/Test.md'; path.parent.mkdir(parents=True)
            path.write_text('# Test\n\n*Citation.* Author (2001). *Book*. URL: <https://example.org/book>.')
            enriched = enrich_graph(graph, root, 'a' * 40)
        snap = create_snapshot(enriched, 'sha256:' + 'b' * 64, [], {})
        self.assertEqual(snap['graph']['nodes'][0]['literature'][0]['authors'], 'Author')
        before = snap['graph']['nodes'][0]['content_digest']
        enriched['nodes'][0]['literature'][0]['title'] = 'Changed title'
        after = create_snapshot(enriched, 'sha256:' + 'b' * 64, [], {})['graph']['nodes'][0]['content_digest']
        self.assertNotEqual(before, after)

    def test_journeys_do_not_promote_transfer_or_reader_evidence(self):
        index = build_index(snapshot_fixture())
        self.assertEqual(len(index['research_paths']), 4)
        representations = [r for r in index['records'] if r['kind'] == 'representation']
        self.assertEqual(len(representations), 3)
        for p in index['research_paths']:
            self.assertEqual(p['benefit_claim'], 'not-established')
            self.assertEqual(p['stages'][3]['transfer_benefit'], 'not-measured')
            self.assertEqual(p['stages'][4]['independent_assessment'], 'not-assessed')
            self.assertEqual(len(p['stages']), 5)
        self.assertTrue(all(r['evidence']['release_membership'] == 'not-inferred' for r in representations))

    def test_unverified_dossier_oeis_mention_is_not_a_solved_result(self):
        snapshot = snapshot_fixture()
        snapshot['problems'] = [{'slug': 'test', 'title': 'A123456 problem', 'arxiv_id': '2501.12345',
            'motivation_gids': [], 'sections': {'Problem': 'Question about A123456'},
            'resolution': {'kind': 'proved'}}]
        index = build_index(snapshot)
        by_id = {r['id']: r for r in index['records']}
        self.assertEqual(by_id['oeis:A123456']['status'], 'external-sequence')
        self.assertEqual(by_id['dossier:test']['status'], 'source-dossier')
        self.assertNotIn('result:test', by_id)
        self.assertEqual(next(e['kind'] for e in index['relations'] if e['source'] == 'oeis:A123456'), 'paper_context')

    def test_unreviewed_or_missing_bridge_cannot_be_published(self):
        with patch('lib.research_bridges.REPRESENTATIONS', {'thue-morse-reduced-abelian-odd': ('Fake bridge', 'does_not_exist', 'No evidence')}):
            with self.assertRaisesRegex(ValueError, 'Missing representation declaration'):
                build_index(snapshot_fixture())

    def test_arxiv_doi_aliases_merge_without_losing_lookup_identifiers(self):
        index = build_index(snapshot_fixture())
        papers = [r for r in index['records'] if r.get('identifiers', {}).get('arxiv') == '2509.16034']
        self.assertEqual(len(papers), 1)
        self.assertEqual(papers[0]['identifiers']['doi'], '10.48550/arxiv.2509.16034')
