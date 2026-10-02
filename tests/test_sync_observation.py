import base64
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from lib import sync_observation as sync
from lib.reconcile_releases import REPOSITORY

A, B = 'a' * 40, 'b' * 40
NOW = '2026-10-02T07:00:00Z'


class Client:
    def get_json(self, path):
        if path.startswith('compare/'):
            return {'status': 'ahead', 'merge_base_commit': {'sha': A}, 'behind_by': 0, 'ahead_by': 420}
        if path == 'actions/workflows/ci-current.yml':
            return {'id': 7, 'path': '.github/workflows/ci-current.yml', 'state': 'active'}
        if path.startswith('actions/workflows/ci-current.yml/runs?'):
            return {'workflow_runs': [{'id': 42, 'workflow_id': 7, 'path': '.github/workflows/ci-current.yml',
                    'head_sha': B, 'head_branch': 'dev', 'event': 'push',
                    'head_repository': {'full_name': REPOSITORY}, 'status': 'in_progress', 'conclusion': None}]}
        if path.startswith('actions/workflows/sync-upstream.yml/runs?'):
            return {'workflow_runs': [{'id': 52, 'path': '.github/workflows/sync-upstream.yml',
                    'head_branch': 'dev', 'status': 'completed', 'conclusion': 'failure'}]}
        raise AssertionError(path)


class SourceObservationTests(unittest.TestCase):
    def test_source_lag_and_failed_publisher_remain_visible_when_release_lag_is_zero(self):
        value = sync.observe(Client(), Client(), A, B, NOW)
        self.assertEqual(value['state'], 'fresh')
        self.assertEqual(value['commits_ahead'], 420)
        self.assertEqual(value['reason'], 'publication-failed')
        self.assertEqual(value['ci_status'], 'in_progress')
        self.assertEqual(value['publication_run_id'], 52)

    def test_deleted_workflow_is_a_diagnostic_not_a_healthy_empty_queue(self):
        client = Client()
        original = client.get_json
        client.get_json = lambda p: {'path': '.github/workflows/ci-current.yml', 'state': 'deleted'} if p == 'actions/workflows/ci-current.yml' else original(p)
        value = sync.observe(client, Client(), A, B, NOW)
        self.assertEqual(value['reason'], 'ci-workflow-unavailable')
        self.assertIsNone(value['ci_run_id'])

    def test_diverged_source_distance_is_unknown(self):
        client = Client()
        original = client.get_json
        client.get_json = lambda p: {'status': 'diverged'} if p.startswith('compare/') else original(p)
        self.assertIsNone(sync.observe(client, Client(), A, B, NOW)['commits_ahead'])

    def test_unavailable_or_fork_ci_cannot_claim_fresh_source_progress(self):
        for bad in [OSError('offline'), 'fork']:
            client = Client()
            original = client.get_json
            def get(path):
                if isinstance(bad, OSError):
                    raise bad
                value = original(path)
                if path.startswith('actions/workflows/ci-current.yml/runs?'):
                    value['workflow_runs'][0]['head_repository']['full_name'] = 'fork/repo'
                return value
            client.get_json = get
            value = sync.observe(client, Client(), A, B, NOW)
            self.assertEqual(value['state'], 'unavailable')
            self.assertEqual(value['reason'], 'source-observation-failed')

    def test_unserved_candidate_is_never_written_to_diagnostic_branch(self):
        from tests.test_version_status import VersionStatusTests
        case = VersionStatusTests(); case.setUp()
        value = case.build(for_deployment=True)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'status.json'; path.write_text(json.dumps(value))
            with patch.object(sync.subprocess, 'run') as execute:
                with self.assertRaisesRegex(ValueError, 'unserved'):
                    sync.publish('owner/pages', path, A)
                execute.assert_not_called()

    def test_observation_write_updates_only_json_and_preserves_newer_snapshot(self):
        from tests.test_version_status import VersionStatusTests
        case = VersionStatusTests(); case.setUp()
        value = case.build()
        client = sync.reconcile.GitHub('owner/pages')
        old = copy.deepcopy(value)
        previous = {'sha': B, 'content': base64.b64encode(json.dumps(old).encode()).decode()}
        client.get_json = lambda path: {'ref': 'refs/heads/' + sync.BRANCH} if path.startswith('git/') else previous
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'status.json'; source.write_text(json.dumps(value))
            with patch.object(sync.reconcile, 'GitHub', return_value=client), \
                 patch.object(sync.subprocess, 'run', return_value=type('Result', (), {'stdout': '{}'})()) as execute:
                sync.publish('owner/pages', source, A)
                self.assertEqual(execute.call_count, 1)
                call = execute.call_args
                self.assertEqual(call.args[0], ['gh', 'api', '--method', 'PUT', 'repos/owner/pages/contents/' + sync.PATH, '--input', '-'])
                payload = json.loads(call.kwargs['input'])
                self.assertEqual(payload['branch'], sync.BRANCH)
                self.assertEqual(payload['sha'], B)
                self.assertEqual(json.loads(base64.b64decode(payload['content'])), value)
            old['observation']['checked_at'] = '2099-01-01T00:00:00Z'
            previous['content'] = base64.b64encode(json.dumps(old).encode()).decode()
            with patch.object(sync.reconcile, 'GitHub', return_value=client), patch.object(sync.subprocess, 'run') as execute:
                with self.assertRaisesRegex(ValueError, 'newer observation'):
                    sync.publish('owner/pages', source, A)
                execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
