import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
import zipfile

from lib import upstream_publication as publication
from lib.reconcile_releases import GitHub, REPOSITORY

A, B, C = 'a' * 40, 'b' * 40, 'c' * 40
DIGEST = 'sha256:' + 'd' * 64


def run(source=B, **changes):
    return dict(id=42, run_attempt=1, head_sha=source, event='push', head_branch='dev',
                conclusion='success', status='completed', path='.github/workflows/ci-push.yml', workflow_id=7, html_url='https://example.test/42',
                repository={'full_name': REPOSITORY}, head_repository={'full_name': REPOSITORY},
                **changes)


def release(**changes):
    return {"tag_name": 'pages-source-' + B, "draft": False, "prerelease": False,
            "target_commitish": C, "published_at": '2026-09-17T00:00:00Z',
            "assets": [], "body": json.dumps({'schema': publication.SCHEMA,
                'source_repository': REPOSITORY, 'source_commit': B, 'release_digest': DIGEST, 'ci_run_id': 42}), **changes}


class SourcePublicationTests(unittest.TestCase):
    def test_newest_source_wins_over_late_rerun_and_excludes_noncanonical_runs(self):
        client = GitHub()
        client.is_ancestor = lambda a, b: a <= b
        invalid = run(C)
        invalid['path'] = '.github/workflows/test.yml'
        fork = run(C)
        fork['head_repository'] = {'full_name': 'fork/trureturing'}
        failed = run(C)
        failed['conclusion'] = 'failure'
        self.assertEqual(publication.select_run(client, [run(B), run(A), invalid, fork, failed], C)['head_sha'], B)
        with self.assertRaisesRegex(ValueError, 'no successful'):
            publication.select_run(client, [invalid, fork, failed], C)

    def test_every_required_job_must_succeed_for_exact_source(self):
        jobs = [{'name': n, 'conclusion': 'success', 'head_sha': B} for n in publication.CHECKS]
        publication.verify_checks(run(), jobs)
        for change in ({'conclusion': 'skipped'}, {'head_sha': A}):
            broken = copy.deepcopy(jobs)
            broken[0].update(change)
            with self.assertRaises(ValueError):
                publication.verify_checks(run(), broken)
        with self.assertRaises(ValueError):
            publication.verify_checks(run(), jobs[1:])

    def test_downstream_target_is_not_mistaken_for_upstream_source(self):
        item = publication.normalize_publication(release())
        self.assertEqual(item['target_commitish'], B)
        self.assertEqual(item['tag_name'], 'truth-release-' + DIGEST[7:])
        self.assertIsNone(publication.normalize_publication(release(draft=True)))
        with self.assertRaises(ValueError):
            publication.normalize_publication(release(tag_name='pages-source-' + A))

    def test_existing_bundle_survives_expired_ci_artifacts(self):
        upstream = GitHub(REPOSITORY)
        upstream.is_ancestor = lambda a, b: True
        upstream.dev_head = lambda: B
        def upstream_get(path):
            if path == 'actions/workflows/ci-push.yml':
                return {'id': 7, 'path': '.github/workflows/ci-push.yml', 'state': 'active'}
            if path == 'branches/dev': return {'protected': True}
            return {'workflow_runs': [run()]}
        upstream.get_json = upstream_get
        pages = GitHub('owner/pages')
        existing = release(assets=[{'name': 'truth-release-' + DIGEST[7:] + '.tar.gz', 'state': 'uploaded', 'size': 42}])
        pages.get_json = lambda path: existing
        with patch.object(publication, 'GitHub', side_effect=[upstream, pages]):
            self.assertFalse(publication.plan('owner/pages')['should_build'])

    def test_list_merges_publications_without_recursive_api_reads(self):
        calls = []
        def get(client, path):
            calls.append((client.repository, path))
            return [release()] if client.repository == 'owner/pages' else []
        with patch.dict('os.environ', {'PAGES_PUBLICATION_REPOSITORY': 'owner/pages'}), patch.object(GitHub, 'get_json', get):
            items = GitHub().releases()
        self.assertEqual(len(calls), 2)
        self.assertEqual(items[0]['target_commitish'], B)

    def test_download_checks_archive_digest_and_exact_transport_wrapper(self):
        def wrapper(extra=False):
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w') as archive:
                archive.writestr(publication.ARCHIVE, b'current transport')
                if extra: archive.writestr('../untrusted', b'invalid')
            return output.getvalue()
        raw = wrapper()
        selection = {'artifact_id': 123, 'artifact_digest': 'sha256:' + hashlib.sha256(raw).hexdigest()}
        def download(args, stdout, check): stdout.write(raw)
        with tempfile.TemporaryDirectory() as temp, patch.object(publication.subprocess, 'run', download):
            destination = Path(temp) / 'valid'
            publication.acquire_report(selection, destination)
            self.assertEqual((destination / publication.ARCHIVE).read_bytes(), b'current transport')
            with self.assertRaisesRegex(ValueError, 'digest'):
                publication.acquire_report({**selection, 'artifact_digest': DIGEST}, Path(temp) / 'invalid')
            raw = wrapper(extra=True)
            selection['artifact_digest'] = 'sha256:' + hashlib.sha256(raw).hexdigest()
            with self.assertRaisesRegex(ValueError, 'unexpected contents'):
                publication.acquire_report(selection, Path(temp) / 'extra')

    def test_artifact_must_bind_run_attempt_source_and_digest(self):
        artifact = {'name': 'ci-current-42-1', 'id': 123, 'expired': False, 'digest': DIGEST,
                    'workflow_run': {'id': 42, 'head_sha': B}}
        self.assertEqual(publication.artifact_for(run(), [artifact], 'ci-current'), artifact)
        for changes in ({'name': 'ci-current-42-2'}, {'expired': True}, {'digest': ''},
                        {'workflow_run': {'id': 41, 'head_sha': B}}, {'workflow_run': {'id': 42, 'head_sha': A}}):
            with self.assertRaises(ValueError):
                publication.artifact_for(run(), [{**artifact, **changes}], 'ci-current')

    def test_plan_skips_docs_only_push_but_selects_new_math_report(self):
        upstream, pages = GitHub(), GitHub('owner/pages')
        upstream.dev_head = lambda: C
        upstream.is_ancestor = lambda a, b: a <= b
        newer, older = run(C), run(B)
        newer['id'] = 43
        artifact = {'name': 'ci-current-42-1', 'id': 123, 'expired': False, 'digest': DIGEST,
                    'workflow_run': {'id': 42, 'head_sha': B}}
        def get(path):
            if path == 'actions/workflows/ci-push.yml':
                return {'id': 7, 'path': '.github/workflows/ci-push.yml', 'state': 'active'}
            if path == 'branches/dev': return {'protected': True}
            if '/runs?' in path: return {'workflow_runs': [newer, older]}
            if '/jobs?' in path:
                sha = C if '/43/' in path else B
                return {'jobs': [{'name': n, 'head_sha': sha, 'conclusion': 'success'} for n in publication.CHECKS]}
            if '/artifacts?' in path: return {'artifacts': [artifact]}
            if path == 'commits/' + B: return {'commit': {'tree': {'sha': A}, 'committer': {'date': '2026-09-19T00:00:00Z'}}}
            raise AssertionError(path)
        upstream.get_json = get
        with patch.object(publication, 'GitHub', side_effect=[upstream, pages]), \
             patch.object(publication, 'pages_release', return_value=None), \
             patch.object(publication, 'report_required', side_effect=[False, True]):
            selected = publication.plan('owner/pages')
        self.assertTrue(selected['should_build'])
        self.assertEqual(selected['source_commit'], B)
        self.assertEqual(selected['latest_successful_ci_source'], C)
        self.assertEqual(selected['skipped_without_report'][0]['source_commit'], C)
        # The old workflow must not be accepted as an already synchronized source.
        older['path'] = '.github/workflows/ci.yml'
        newer['path'] = '.github/workflows/ci.yml'
        with patch.object(publication, 'GitHub', side_effect=[upstream, pages]):
            with self.assertRaisesRegex(ValueError, 'refusing to report stale'):
                publication.plan('owner/pages')

    def test_diagnostics_route_only_exact_source_and_explicit_report_plan(self):
        receipt = {'stage': 'current', 'status': 'completed', 'git_candidate': {'commit': B},
                   'scope': {'execution': {'steps': ['filemap']}}}
        artifact = {'name': 'ci-current-diagnostics-42-1', 'id': 123, 'expired': False,
                    'digest': DIGEST, 'workflow_run': {'id': 42, 'head_sha': B}}
        def download(artifact_id, digest, path):
            with zipfile.ZipFile(path, 'w') as bundle:
                bundle.writestr('current-result.json', json.dumps(receipt))
        with patch.object(publication, 'download_artifact', download):
            self.assertFalse(publication.report_required(run(), [{'name': 'current'}], [artifact]))
            receipt['scope']['execution']['steps'].append('lean-report')
            self.assertTrue(publication.report_required(run(), [{'name': 'current'}], [artifact]))
            receipt['git_candidate']['commit'] = A
            with self.assertRaisesRegex(ValueError, 'differs from selected source'):
                publication.report_required(run(), [{'name': 'current'}], [artifact])
        with self.assertRaisesRegex(ValueError, 'missing or ambiguous'):
            publication.report_required(run(), [{'name': 'current'}], [])

    def test_projection_stops_when_native_transport_verification_fails(self):
        selection = {'source_commit': B, 'source_tree': A, 'ci_run_id': 42, 'ci_run_attempt': 1}
        import subprocess
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(publication.subprocess, 'check_output', return_value=B + '\n' + A + '\n'), \
             patch.object(publication.subprocess, 'run', side_effect=[None, subprocess.CalledProcessError(2, 'restore')]) as execute:
            with self.assertRaises(subprocess.CalledProcessError):
                publication.project(selection, temp, Path(temp) / 'current.tar.gz', Path(temp) / 'out')
            self.assertEqual(execute.call_count, 2)
            self.assertFalse((Path(temp) / 'out').exists())

    def test_projection_preserves_upstream_identity_without_rebuilding_report(self):
        selection = {'source_commit': B, 'source_tree': A, 'ci_run_id': 42, 'ci_run_attempt': 1,
                     'required_checks': list(publication.CHECKS), 'produced_at': '2026-09-19T00:00:00Z'}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'build/ci').mkdir(parents=True)
            (root / 'build/ci/current.json').write_text(json.dumps({'steps': [{'name': 'lean-report'}]}))
            (root / publication.REPORT).parent.mkdir(parents=True)
            (root / publication.REPORT).write_text('{}')
            with patch.dict('os.environ', {'GITHUB_REPOSITORY': 'owner/pages'}), \
                 patch.object(publication.subprocess, 'check_output', return_value=B + '\n' + A + '\n'), \
                 patch.object(publication.subprocess, 'run') as execute:
                publication.project(selection, root, root / 'current.tar.gz', root / 'out')
            self.assertEqual(execute.call_count, 3)
            for call in execute.call_args_list:
                self.assertEqual(call.kwargs['env']['GITHUB_REPOSITORY'], REPOSITORY)
                self.assertEqual(call.kwargs['env']['STRATALINT_CACHE_WRITES'], 'false')
            commands = [call.args[0] for call in execute.call_args_list]
            self.assertIn('restore', commands[1])
            self.assertIn('truth-release', commands[2])
            self.assertIn('engineering=success', commands[2])
            self.assertIn('current=success', commands[2])
            self.assertFalse(any(word in {'lake', 'lean', 'build', 'transport-pack'} for cmd in commands for word in cmd))
