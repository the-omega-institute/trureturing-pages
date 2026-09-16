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
                conclusion='success', status='completed', path='.github/workflows/ci.yml',
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
        upstream.get_json = lambda path: {'workflow_runs': [run()]}
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

    def test_download_checks_archive_digest_and_report_sidecars(self):
        report = b'{"modules":[]}'
        sha = hashlib.sha256(report).hexdigest()
        contents = {'': report, '.sha256': f'{sha}  {publication.REPORT}\n'.encode(),
                    '.provenance.json': json.dumps({'report_sha256': sha}).encode(),
                    '.input.attestation': b'input', '.materials.zip': b'materials'}
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            for suffix, data in contents.items():
                archive.writestr(publication.REPORT + suffix, data)
            archive.writestr('../untrusted', b'ignored')
        raw = output.getvalue()
        selection = {'artifact_id': 123, 'artifact_digest': 'sha256:' + hashlib.sha256(raw).hexdigest()}
        def download(args, stdout, check):
            stdout.write(raw)
        with tempfile.TemporaryDirectory() as temp, patch.object(publication.subprocess, 'run', download):
            destination = Path(temp) / 'valid'
            publication.acquire_report(selection, destination)
            self.assertEqual((destination / publication.REPORT).read_bytes(), report)
            self.assertFalse((Path(temp) / 'untrusted').exists())
            with self.assertRaisesRegex(ValueError, 'digest'):
                publication.acquire_report({**selection, 'artifact_digest': DIGEST}, Path(temp) / 'invalid')
