from http.client import RemoteDisconnected
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from lib import upstream_publication as publication
from lib.reconcile_releases import GitHub
from tests import test_report_projection


class PublicationNotesTests(unittest.TestCase):
    def test_growing_diagnostics_and_resource_inventory_do_not_grow_release_notes(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = test_report_projection.ReportProjectionTests()
            _, selection, _ = fixture.project_fixture(Path(temp))
            bundle = Path(temp) / 'bundle'
            before = publication.publication_metadata(selection, bundle)
            selection['rejections'] = [{'reason': 'historical diagnostic ' * 20000}] * 100
            selection['scribe']['adaptation'] = {'excluded_gids': ['D5/S3/Unpublished'] * 100000}
            selection['newer_rejection'] = {'reason': 'newer diagnostic ' * 20000}
            selection['newer_report'] = {'reason': 'unrelated moving-source observation'}
            after = publication.publication_metadata(selection, bundle)
            self.assertEqual(before, after)
            self.assertLess(len(json.dumps(after, indent=2)), publication.NOTES_LIMIT)
            self.assertEqual(after['source_commit'], selection['source_commit'])
            self.assertEqual(after['report_manifest'], selection['report_manifest'])
            manifest = json.loads((bundle / 'release-manifest.v1.json').read_text())
            self.assertEqual(after['bundle_provenance'], manifest['artifacts']['report_provenance'])
            normalized = publication.normalize_publication({
                'draft': False, 'prerelease': False, 'tag_name': 'pages-source-' + after['source_commit'],
                'target_commitish': selection['adapter_commit'], 'body': json.dumps(after)})
            self.assertEqual(normalized['target_commitish'], selection['source_commit'])
            self.assertEqual(normalized['upstream_ci_run_id'], selection['ci_run_id'])
            self.assertEqual(normalized['tag_name'], 'truth-release-' + after['release_digest'][7:])

    def test_full_resource_provenance_stays_in_the_verified_bundle(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _, selection, _ = test_report_projection.ReportProjectionTests().project_fixture(root)
            # Exercise the writer with a genuine large resource inventory.
            selection['scribe']['adaptation'] = {'excluded_gids': ['D5/S3/Unpublished'] * 10000}
            publication.write_report_projection(selection, root, root / 'reports', root / 'bundle')
            metadata = publication.publication_metadata(selection, root / 'bundle')
            provenance = json.loads((root / 'bundle/report-provenance.v1.json').read_text())
            self.assertEqual(provenance['scribe']['adaptation'], selection['scribe']['adaptation'])
            self.assertNotIn('adaptation', metadata['scribe'])
            self.assertEqual(metadata['bundle_provenance']['sha256'],
                             publication.vertical_smoke._sha256(root / 'bundle/report-provenance.v1.json'))

    def test_oversized_identity_is_rejected_before_release_api_write(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _, selection, _ = test_report_projection.ReportProjectionTests().project_fixture(root)
            selection['ci_url'] = 'x' * publication.NOTES_LIMIT
            with self.assertRaisesRegex(ValueError, 'bounded release-notes'):
                publication.publication_metadata(selection, root / 'bundle')


class PublicationReadRetryTests(unittest.TestCase):
    def test_diff_timeout_uses_real_commit_ancestry_including_divergence(self):
        detail = {'errors': [{'resource': 'Comparison', 'field': 'diff', 'code': 'not_available'}]}
        error = HTTPError('https://api.github.com', 422, 'diff timeout', {}, io.BytesIO(json.dumps(detail).encode()))
        with tempfile.TemporaryDirectory() as temp:
            upstream = Path(temp) / 'upstream'
            def git(*args):
                return subprocess.check_output(['git', '-C', str(upstream), *args], text=True).strip()
            subprocess.run(['git', 'init', '--initial-branch=dev', str(upstream)], check=True, capture_output=True)
            def commit(message):
                git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
                    'commit', '--allow-empty', '-m', message)
                return git('rev-parse', 'HEAD')
            older = commit('base')
            newer = commit('dev')
            git('checkout', '-b', 'other', older)
            divergent = commit('other')
            execute = subprocess.run
            url = 'https://github.com/' + publication.REPOSITORY + '.git'
            def transport(args, **kwargs):
                return execute([str(upstream) if arg == url else arg for arg in args], **kwargs)
            client = publication.PublicationGitHub()
            client._ancestry_directory = str(Path(temp) / 'graph')
            with patch.object(GitHub, 'get_json', side_effect=error) as read, \
                 patch.object(publication.subprocess, 'run', side_effect=transport) as commands:
                self.assertTrue(client.is_ancestor(older, newer))
                self.assertFalse(client.is_ancestor(newer, older))
                self.assertFalse(client.is_ancestor(divergent, newer))
                self.assertTrue(client.is_ancestor(newer, newer))
            read.assert_called_once()
            fetches = [call.args[0] for call in commands.call_args_list if 'fetch' in call.args[0]]
            self.assertEqual([args[-1] for args in fetches], [newer, divergent])
            self.assertTrue(all('--filter=tree:0' in args and '--no-tags' in args for args in fetches))
            self.assertFalse((Path(client._ancestry_directory) / 'source.git' / 'index').exists())

    def test_other_422_responses_do_not_start_a_git_fallback(self):
        for detail in ({'errors': [{'resource': 'Comparison', 'field': 'base', 'code': 'invalid'}]},
                       {'errors': None}, [], 'invalid JSON'):
            raw = detail.encode() if isinstance(detail, str) else json.dumps(detail).encode()
            error = HTTPError('https://api.github.com', 422, 'permanent', {}, io.BytesIO(raw))
            client = publication.PublicationGitHub()
            client._ancestry_directory = 'unused'
            with self.subTest(detail=detail), patch.object(GitHub, 'get_json', side_effect=error), \
                 patch.object(client, '_git_is_ancestor') as fallback:
                with self.assertRaises(HTTPError):
                    client.is_ancestor('a' * 40, 'b' * 40)
                fallback.assert_not_called()

    def test_disconnect_and_server_error_retry_the_same_read(self):
        for error in [RemoteDisconnected('connection closed'),
                      HTTPError('https://api.github.com', 500, 'Internal Server Error', {}, io.BytesIO())]:
            with self.subTest(error=type(error).__name__), \
                 patch.object(GitHub, 'get_json', side_effect=[error, {'verified': True}]) as read, \
                 patch.object(publication.time, 'sleep') as sleep:
                self.assertEqual(publication.PublicationGitHub().get_json('compare/a...b'), {'verified': True})
                self.assertEqual(read.call_args_list[0], read.call_args_list[1])
                self.assertEqual(read.call_count, 2)
                sleep.assert_called_once_with(1)

    def test_persistent_disconnect_stops_after_three_reads(self):
        with patch.object(GitHub, 'get_json', side_effect=RemoteDisconnected('connection closed')) as read, \
             patch.object(publication.time, 'sleep') as sleep:
            with self.assertRaises(RemoteDisconnected):
                publication.PublicationGitHub().get_json('commits/dev')
            self.assertEqual(read.call_count, 3)
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    def test_identity_parse_and_permanent_api_errors_are_not_retried(self):
        errors = [ValueError('invalid metadata'),
                  *[HTTPError('https://api.github.com', code, 'permanent', {}, io.BytesIO())
                    for code in (401, 403, 404, 422)]]
        for error in errors:
            with self.subTest(error=error), patch.object(GitHub, 'get_json', side_effect=error) as read, \
                 patch.object(publication.time, 'sleep') as sleep:
                with self.assertRaises(type(error)):
                    publication.PublicationGitHub().get_json('commits/dev')
                self.assertEqual(read.call_count, 1)
                sleep.assert_not_called()
