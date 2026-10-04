import copy
import base64
import subprocess
import zipfile
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from lib import upstream_publication as publication
from lib.reconcile_releases import GitHub, REPOSITORY

A, B, C = 'a' * 40, 'b' * 40, 'c' * 40
DIGEST = 'sha256:' + 'd' * 64
TAG = 'lean-cache-v2-' + A + '-linux-arm64-123-1'


def run(source=B, **changes):
    return dict(id=42, run_attempt=1, head_sha=source, event='push', head_branch='dev',
                conclusion='success', status='completed', path='.github/workflows/ci-current.yml',
                workflow_id=7, html_url='https://example.test/42',
                repository={'full_name': REPOSITORY}, head_repository={'full_name': REPOSITORY}, **changes)


def release(**changes):
    return {'tag_name': 'pages-source-' + B, 'draft': False, 'prerelease': False,
            'target_commitish': C, 'published_at': '2026-09-17T00:00:00Z',
            'assets': [], 'body': json.dumps({'schema': publication.SCHEMA,
                'source_repository': REPOSITORY, 'source_commit': B, 'release_digest': DIGEST, 'ci_run_id': 42}), **changes}


def transport(raw, source=B):
    manifest = {'schema': 'lean-release-seed-v3', 'partition': A + '/linux-arm64',
        'producer_commit_sha': source, 'workflow_run_id': '123', 'workflow_run_attempt': '1',
        'archive_sha256': hashlib.sha256(raw).hexdigest(), 'archive_bytes': len(raw),
        'parts': [{'name': 'lean-build.tgz', 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}]}
    data = json.dumps(manifest).encode()
    snapshot = {'tag_name': TAG, 'draft': False, 'prerelease': False,
        'assets': [{'name': name, 'size': len(body), 'state': 'uploaded',
                    'digest': 'sha256:' + hashlib.sha256(body).hexdigest()}
                   for name, body in [('manifest.json', data), ('lean-build.tgz', raw)]]}
    return manifest, snapshot, data


def report_archive(extra=None, omit=None):
    report = b'{"modules":[],"schema":"stratalint-raw-lean-report-v2"}'
    files = {name: b'checked' for name in publication.REPORT_FILES}
    files['raw-lean-report.json'] = report
    files['raw-lean-report.json.sha256'] = hashlib.sha256(report).hexdigest().encode() + b'  raw-lean-report.json\n'
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, data in files.items():
            if name == omit: continue
            member = tarfile.TarInfo('build/stratalint/' + name); member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
        if extra: archive.addfile(extra)
    return output.getvalue(), files


class SourcePublicationTests(unittest.TestCase):
    def test_newest_source_wins_over_late_rerun_and_excludes_noncanonical_runs(self):
        client = GitHub(); client.is_ancestor = lambda a, b: a <= b
        invalid = run(C); invalid['path'] = '.github/workflows/test.yml'
        fork = run(C); fork['head_repository'] = {'full_name': 'fork/trureturing'}
        failed = run(C); failed['conclusion'] = 'failure'
        self.assertEqual(publication.select_run(client, [run(B), run(A), invalid, fork, failed], C)['head_sha'], B)
        with self.assertRaisesRegex(ValueError, 'no successful'):
            publication.select_run(client, [invalid, fork, failed], C)

    def test_required_aggregate_must_succeed_for_exact_source(self):
        jobs = [{'name': n, 'conclusion': 'success', 'head_sha': B} for n in publication.CHECKS]
        publication.verify_checks(run(), jobs)
        for change in ({'conclusion': 'skipped'}, {'head_sha': A}):
            with self.assertRaises(ValueError): publication.verify_checks(run(), [{**jobs[0], **change}])
        with self.assertRaises(ValueError): publication.verify_checks(run(), [])
        with self.assertRaises(ValueError): publication.verify_checks(run(), jobs * 2)

    def test_downstream_target_is_not_mistaken_for_upstream_source(self):
        item = publication.normalize_publication(release())
        self.assertEqual(item['target_commitish'], B)
        self.assertEqual(item['tag_name'], 'truth-release-' + DIGEST[7:])
        self.assertIsNone(publication.normalize_publication(release(draft=True)))
        with self.assertRaises(ValueError): publication.normalize_publication(release(tag_name='pages-source-' + A))

    def test_list_merges_publications_without_recursive_api_reads(self):
        calls = []
        def get(client, path):
            calls.append((client.repository, path))
            return [release()] if client.repository == 'owner/pages' else []
        with patch.dict('os.environ', {'PAGES_PUBLICATION_REPOSITORY': 'owner/pages'}), patch.object(GitHub, 'get_json', get):
            items = GitHub().releases()
        self.assertEqual(len(calls), 2)
        self.assertEqual(items[0]['target_commitish'], B)

    def test_manifest_binds_tag_parts_sizes_hashes_and_source(self):
        manifest, snapshot, data = transport(b'cache')
        with patch.object(publication, 'asset_bytes', return_value=data):
            self.assertEqual(publication.cache_manifest(snapshot), manifest)
        mutations = [lambda m: m.update(producer_commit_sha='dev'),
            lambda m: m.update(workflow_run_attempt='2'), lambda m: m.update(archive_bytes=999),
            lambda m: m['parts'][0].update(name='../escape'), lambda m: m['parts'][0].update(sha256='x'*64),
            lambda m: m['parts'][0].update(bytes=True)]
        for mutate in mutations:
            broken = copy.deepcopy(manifest); mutate(broken)
            with patch.object(publication, 'asset_bytes', return_value=json.dumps(broken).encode()):
                with self.assertRaises(ValueError): publication.cache_manifest(snapshot)
        for mutate in [lambda r: r['assets'].append(r['assets'][0]),
                       lambda r: r['assets'][1].update(digest=DIGEST),
                       lambda r: r['assets'][1].update(size=1)]:
            broken = copy.deepcopy(snapshot); mutate(broken)
            with patch.object(publication, 'asset_bytes', return_value=data):
                with self.assertRaises(ValueError): publication.cache_manifest(broken)

    def test_manifest_transport_checks_actual_bytes(self):
        raw = b'{}'; asset = {'name': 'manifest.json', 'size': 2, 'digest': 'sha256:' + hashlib.sha256(raw).hexdigest()}
        with patch.object(publication, 'urlopen', return_value=io.BytesIO(raw)):
            self.assertEqual(publication.asset_bytes(TAG, asset, 16), raw)
        for broken in ({**asset, 'size': 1}, {**asset, 'digest': DIGEST}):
            with patch.object(publication, 'urlopen', return_value=io.BytesIO(raw)):
                with self.assertRaises(ValueError): publication.asset_bytes(TAG, broken, 16)

    def test_cache_run_is_not_a_pr_or_integration_verification(self):
        manifest, _, _ = transport(b'cache')
        producer = run(); producer.update(id=123, event='schedule', path='.github/workflows/lean-cache-publish.yml')
        client = GitHub(); client.get_json = lambda path: producer
        self.assertEqual(publication.verify_cache_run(client, manifest), producer)
        for field, invalid in [('event', 'push'), ('head_sha', A), ('conclusion', 'failure'),
                               ('run_attempt', 2), ('head_branch', 'integration-a')]:
            with patch.object(client, 'get_json', return_value={**producer, field: invalid}):
                with self.assertRaises(ValueError): publication.verify_cache_run(client, manifest)

    def planned(self, existing=None, scribe_required=False, resources=None, previous=None, adapter=None):
        upstream, pages = GitHub(), GitHub('owner/pages')
        upstream.dev_head = lambda: C; upstream.is_ancestor = lambda a, b: a <= b
        manifest, snapshot, data = transport(b'cache')
        upstream.releases = lambda: [snapshot, {'tag_name': 'lean-cache-verify-v1-irrelevant'}, *(resources or [])]
        producer = run(); producer.update(id=123, event='schedule', path='.github/workflows/lean-cache-publish.yml')
        calls = []
        def get(path):
            calls.append(path)
            if path == 'actions/workflows/ci-current.yml': return {'id': 7, 'path': '.github/workflows/ci-current.yml', 'state': 'active'}
            if path == 'branches/dev': return {'protected': True}
            if path.startswith('contents/tools/'): return {'content': base64.b64encode(b'--scribe-pack' if scribe_required else b'legacy native exporter').decode()}
            if path.startswith('contents/'): return {'type': 'file', 'path': '.github/workflows/ci-current.yml'}
            if path == 'actions/runs/123/attempts/1': return producer
            if '/runs?' in path: return {'workflow_runs': [run()]}
            if '/jobs?' in path: return {'jobs': [{'name': 'required', 'head_sha': B, 'conclusion': 'success'}]}
            if path.startswith('commits/scribe-resources-'): return {'sha': B}
            if path == 'commits/' + B: return {'commit': {'tree': {'sha': A}, 'committer': {'date': '2026-10-02T00:00:00Z'}}}
            raise AssertionError(path)
        upstream.get_json = get
        with patch.object(publication, 'GitHub', side_effect=[upstream, pages]), \
             patch.object(publication, 'pages_release', return_value=existing), \
             patch.object(publication, 'asset_bytes', return_value=data), \
             patch.object(publication, 'read_outcome', return_value=previous):
            return publication.plan('owner/pages', adapter), calls

    def test_plan_consumes_existing_scheduled_snapshot_and_exact_ci(self):
        selection, calls = self.planned()
        self.assertTrue(selection['should_build'])
        self.assertEqual(selection['source_commit'], B)
        self.assertEqual(selection['report_run_id'], 123)
        self.assertEqual(selection['required_checks'], ['required', 'lean-cache-publication'])
        self.assertTrue(any('head_sha=' + B in call for call in calls))
        self.assertFalse(any('artifacts' in call or 'ci-push' in call for call in calls))

    def test_existing_bundle_does_not_require_ci_transport_retention(self):
        existing = publication.normalize_publication(release(assets=[{'name': 'truth-release-' + DIGEST[7:] + '.tar.gz', 'state': 'uploaded', 'size': 42}]))
        value, calls = self.planned(existing)
        self.assertFalse(value['should_build'])
        self.assertFalse(any('/jobs?' in call for call in calls))

    def test_stream_verifies_all_parts_and_extracts_only_report_bundle(self):
        raw, files = report_archive(tarfile.TarInfo('../ignored'))
        manifest, _, _ = transport(raw)
        # Exercise boundaries in the compressed stream with two inventory parts.
        chunks = [raw[:17], raw[17:]]
        manifest['parts'] = [{'name': f'lean-build.tgz.part-{i:02d}', 'sha256': hashlib.sha256(part).hexdigest(), 'bytes': len(part)} for i, part in enumerate(chunks)]
        selection = {'report_release_tag': TAG, 'report_manifest': manifest}
        with tempfile.TemporaryDirectory() as temp, patch.object(publication, 'urlopen', side_effect=[io.BytesIO(part) for part in chunks]):
            publication.acquire_report(selection, temp)
            self.assertEqual({p.name: p.read_bytes() for p in Path(temp).iterdir()}, files)

    def test_stream_rejects_truncation_tampering_missing_or_duplicate_reports(self):
        duplicate = tarfile.TarInfo('build/stratalint/raw-lean-report.json')
        for index, raw in enumerate((report_archive()[0], report_archive(duplicate)[0], report_archive(omit='raw-lean-report.json.materials.zip')[0])):
            manifest, _, _ = transport(raw)
            if index == 0: manifest['archive_sha256'] = 'f'*64
            with tempfile.TemporaryDirectory() as temp, patch.object(publication, 'urlopen', return_value=io.BytesIO(raw)):
                with self.assertRaises(ValueError): publication.acquire_report({'report_release_tag': TAG, 'report_manifest': manifest}, temp)
                self.assertEqual(list(Path(temp).iterdir()), [])
        raw, _ = report_archive(); manifest, _, _ = transport(raw)
        manifest['parts'][0]['sha256'] = 'f'*64
        with tempfile.TemporaryDirectory() as temp, patch.object(publication, 'urlopen', return_value=io.BytesIO(raw)):
            with self.assertRaisesRegex(ValueError, 'part size or digest'): publication.acquire_report({'report_release_tag': TAG, 'report_manifest': manifest}, temp)

    def test_projection_builds_only_exporter_and_preserves_upstream_identity(self):
        selection = {'source_commit': B, 'source_tree': A, 'required_checks': list(publication.EXPORT_CHECKS), 'produced_at': '2026-10-02T00:00:00Z'}
        with tempfile.TemporaryDirectory() as temp, \
             patch.dict('os.environ', {'GITHUB_REPOSITORY': 'owner/pages', 'GITHUB_SHA': C, 'CI_PLAN_PATH': '/pages/plan.json', 'GH_TOKEN': 'pages-only-token', 'DOTNET_ROOT': '/dotnet'}), \
             patch.object(publication.subprocess, 'check_output', return_value=B + '\n' + A + '\n'), \
             patch.object(publication.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout='')) as execute:
            root = Path(temp); reports = root / 'report'; reports.mkdir()
            for name in publication.REPORT_FILES: (reports / name).write_bytes(b'checked')
            publication.project(selection, root, reports, root / 'out')
            self.assertEqual((root / publication.REPORT).read_bytes(), b'checked')
        commands = [call.args[0] for call in execute.call_args_list]
        self.assertEqual([c[1] for c in commands], ['restore', 'build', 'tools/StrataLint.Cli/bin/Release/net10.0/StrataLint.dll'])
        self.assertIn('required=success', commands[-1]); self.assertIn('lean-cache-publication=success', commands[-1])
        self.assertFalse(any(word in {'lake', 'lean', 'make'} for cmd in commands for word in cmd))
        for call in execute.call_args_list:
            env = call.kwargs['env']
            self.assertEqual(env['GITHUB_REPOSITORY'], REPOSITORY)
            self.assertEqual(env['STRATALINT_CACHE_WRITES'], 'false')
            self.assertEqual([k for k in env if k.startswith('GITHUB_')], ['GITHUB_REPOSITORY'])
            self.assertNotIn('GH_TOKEN', env); self.assertNotIn('CI_PLAN_PATH', env)

    def test_removed_workflow_cannot_reuse_historical_success_as_freshness(self):
        upstream, pages = GitHub(), GitHub('owner/pages'); upstream.dev_head = lambda: C
        def get(path):
            if path == 'actions/workflows/ci-current.yml': return {'id': 7, 'path': '.github/workflows/ci-current.yml', 'state': 'active'}
            if path == 'branches/dev': return {'protected': True}
            if path.startswith('contents/'): raise HTTPError(path, 404, 'Not Found', {}, None)
            raise AssertionError(path)
        upstream.get_json = get
        with patch.object(publication, 'GitHub', side_effect=[upstream, pages]):
            with self.assertRaisesRegex(ValueError, 'removed from dev'): publication.plan('owner/pages')


    def scribe_release(self, source=B, **changes):
        return {'tag_name': 'scribe-resources-' + 'e'*64, 'target_commitish': source,
                'assets': [{'name': 'scribe-resources.zip', 'size': 123, 'state': 'uploaded', 'digest': DIGEST}], **changes}

    def test_new_contract_waits_without_building_or_mixing_older_resource_source(self):
        for resources in ([], [self.scribe_release(source=A)], [self.scribe_release(draft=True)]):
            selected, _ = self.planned(scribe_required=True, resources=resources)
            self.assertFalse(selected['should_build'])
            self.assertEqual(selected['status'], 'awaiting-scribe-publication')
        selected, _ = self.planned(scribe_required=True, resources=[self.scribe_release()])
        self.assertTrue(selected['should_build'])
        self.assertEqual(selected['scribe']['pack_digest'], 'e'*64)
        self.assertNotEqual('sha256:' + selected['scribe']['pack_digest'], selected['scribe']['asset']['digest'])

    def test_scribe_tag_identity_and_asset_inventory_must_match(self):
        client = GitHub(); client.get_json = lambda _: {'sha': A}
        with self.assertRaisesRegex(ValueError, 'tag differs'):
            publication.scribe_selection(client, [self.scribe_release()], B)
        client.get_json = lambda _: {'sha': B}
        for assets in ([], [self.scribe_release()['assets'][0]]*2,
                       [{**self.scribe_release()['assets'][0], 'size': True}],
                       [{**self.scribe_release()['assets'][0], 'digest': 'bad'}]):
            with self.assertRaises(ValueError):
                publication.scribe_selection(client, [self.scribe_release(assets=assets)], B)

    def test_resource_acquisition_checks_transport_and_logical_identity(self):
        def pack(digest):
            data = io.BytesIO()
            with zipfile.ZipFile(data, 'w') as z:
                z.writestr('manifest.json', json.dumps({'schema': 'trureturing.scribe.resource-pack', 'totalSha256': digest}))
            return data.getvalue()
        scribe = publication.scribe_selection(type('Client', (), {'get_json': lambda _, path: {'sha': B}})(), [self.scribe_release()], B)
        for digest in ('e'*64, 'f'*64):
            raw = pack(digest)
            scribe['asset'].update(size=len(raw), digest='sha256:'+hashlib.sha256(raw).hexdigest())
            with tempfile.TemporaryDirectory() as temp, patch.object(publication, 'urlopen', return_value=io.BytesIO(raw)):
                if digest == 'e'*64:
                    publication.acquire_scribe({'source_commit': B, 'scribe': scribe}, temp)
                    self.assertEqual((Path(temp)/'scribe-resources.zip').read_bytes(), raw)
                else:
                    with self.assertRaisesRegex(ValueError, 'identity differs'):
                        publication.acquire_scribe({'source_commit': B, 'scribe': scribe}, temp)
                    self.assertFalse((Path(temp)/'scribe-resources.zip').exists())
        with self.assertRaisesRegex(ValueError, 'differ from report'):
            publication.acquire_scribe({'source_commit': A, 'scribe': scribe}, '/unused')

    def projection(self, export_result, scribe=False):
        selection = {'source_commit': B, 'source_tree': A, 'required_checks': list(publication.EXPORT_CHECKS), 'produced_at': '2026-10-02T00:00:00Z'}
        if scribe:
            selection['scribe'] = {'source_commit': B, 'pack_digest': 'e'*64}
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(publication.subprocess, 'check_output', return_value=B+'\n'+A+'\n'), \
             patch.object(publication.subprocess, 'run', side_effect=lambda cmd, **kw: export_result if 'truth-release' in cmd else subprocess.CompletedProcess(cmd, 0)) as execute:
            root=Path(temp); reports=root/'reports'; reports.mkdir()
            for name in publication.REPORT_FILES: (reports/name).write_bytes(b'checked')
            if scribe: (reports/'scribe-resources.zip').write_bytes(b'pack')
            result = publication.project(selection, root, reports, root/'output')
            return result, selection, [c.args[0] for c in execute.call_args_list]

    def test_source_pinned_native_pack_verification_precedes_export_with_logical_digest(self):
        ok, _, commands = self.projection(subprocess.CompletedProcess([], 0, stdout=''), scribe=True)
        self.assertTrue(ok)
        self.assertEqual(commands[-2][-4:-1], ['resources', 'verify', '--pack'])
        self.assertIn('--scribe-pack', commands[-1])
        self.assertEqual(commands[-1][commands[-1].index('--scribe-pack-digest')+1], 'e'*64)
        self.assertFalse(any(x in {'lean', 'lake', 'make'} for c in commands for x in c))

    def test_only_explicit_native_content_failure_becomes_rejection(self):
        reason = 'TRUTH_RELEASE_INVALID residual frontier evaluation failed: entry x handwritten status partial-closed differs from derived absorbed-closed'
        ok, selection, _ = self.projection(subprocess.CompletedProcess([], 2, stdout=reason+'\n'))
        self.assertFalse(ok)
        self.assertEqual(selection['status'], 'content-validation-rejected')
        self.assertEqual(selection['rejection_reason'], reason)
        for output, code in [('network failed', 2), ('TRUTH_RELEASE_INVALID required Scribe resource pack', 2), (reason, 137)]:
            with self.assertRaises(subprocess.CalledProcessError):
                self.projection(subprocess.CompletedProcess([], code, stdout=output))

    def test_rejection_suppresses_only_identical_inputs_and_adapter(self):
        selected, _ = self.planned(adapter=C)
        previous={'status':'content-validation-rejected', 'input_digest':selected['input_digest'],
                  'run_id':123, 'rejection_run_id':122, 'reason':'invalid source contents'}
        retry, _ = self.planned(adapter=C, previous=previous)
        self.assertFalse(retry['should_build'])
        self.assertEqual(retry['rejection_run_id'], 122)
        newer, _ = self.planned(adapter=A, previous=previous)
        self.assertTrue(newer['should_build'])
        previous['status']='publication-failed'
        self.assertTrue(self.planned(adapter=C, previous=previous)[0]['should_build'])
        changed=copy.deepcopy(selected); changed['report_manifest']['archive_sha256']='f'*64
        self.assertNotEqual(publication.input_digest(changed,C), selected['input_digest'])
        changed=copy.deepcopy(selected); changed['scribe']={'pack_digest':'e'*64}
        self.assertNotEqual(publication.input_digest(changed,C), selected['input_digest'])

    def test_outcome_uses_downstream_branch_and_failure_cannot_claim_published(self):
        selection, _ = self.planned(adapter=C)
        for failed, status in [(False,'published'), (True,'publication-failed')]:
            client=GitHub('owner/pages')
            def get(path):
                if path.startswith('git/'): return {'ref':'existing'}
                raise HTTPError(path,404,'missing',{},None)
            client.get_json=get
            with patch.object(publication,'GitHub',return_value=client), patch.object(publication.subprocess,'run') as execute:
                publication.publish_outcome('owner/pages',selection,C,44,failed)
                call=execute.call_args
                self.assertIn('repos/owner/pages/contents/'+publication.OUTCOME_PATH,call.args[0])
                payload=json.loads(call.kwargs['input'])
                self.assertEqual(payload['branch'],'pages-sync-status')
                value=json.loads(base64.b64decode(payload['content']))
                self.assertEqual(value['status'],status)
                self.assertEqual(value['input_digest'],selection['input_digest'])

    def test_outcome_reader_accepts_github_base64_linebreaks_and_rejects_bad_identity(self):
        value={'schema':publication.OUTCOME_SCHEMA,'source_repository':REPOSITORY,'source_commit':B,
               'adapter_commit':C,'input_digest':DIGEST,'run_id':42,'status':'awaiting-scribe-publication'}
        client=GitHub()
        client.get_json=lambda _: {'content':base64.encodebytes(json.dumps(value).encode()).decode()}
        self.assertEqual(publication.read_outcome(client),value)
        value['source_repository']='fork/repo'
        with self.assertRaises(ValueError): publication.read_outcome(client)

if __name__ == '__main__': unittest.main()
