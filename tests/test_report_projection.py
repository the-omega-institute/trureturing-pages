"""Published-report consumption must not depend on native release reissuance."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from lib import upstream_publication as publication, vertical_smoke
from tests import test_upstream_publication as upstream_tests
from tests import test_vertical_smoke as vertical_tests
from tests.test_upstream_publication import A, B, C
from tests.test_vertical_smoke import FIXTURE


class ReportProjectionTests(unittest.TestCase):
    def selection(self):
        selected, _ = upstream_tests.SourcePublicationTests().planned(adapter=C, scribe_required=True,
                                                 resources=[upstream_tests.SourcePublicationTests().scribe_release()],
                                                 report_projection=True)
        selected['pages_repository'] = 'the-omega-institute/trureturing-pages'
        return selected

    def project_fixture(self, root, result=None):
        selected = self.selection()
        reports = root / 'reports'
        reports.mkdir()
        for name in publication.REPORT_FILES:
            (reports / name).write_bytes(b'original published report')
        (reports / 'scribe-resources.zip').write_bytes(b'published pack')
        project = root / 'tools/StrataLint.Scribe/StrataLint.Scribe.csproj'
        project.parent.mkdir(parents=True)
        project.write_text('<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>')
        commands = []
        def run(command, **kwargs):
            commands.append(command)
            if 'truth-export' in command:
                if result is not None:
                    return result
                out = Path(command[command.index('--out') + 1])
                out.mkdir()
                (out / 'truth-export.v1.json').write_text(json.dumps({
                    'schema_version': 2, 'dialect': 'stratalint.truth-export.v2',
                    'source_commit': B, 'source_tree': A, 'nodes': []}))
            if 'dag-render' in command:
                generated = root / 'Generated'
                generated.mkdir()
                shutil.copyfile(FIXTURE / 'truth-graph.v1.json', generated / 'truth-graph.v1.json')
            return subprocess.CompletedProcess(command, 0, stdout='')
        with patch.object(publication.subprocess, 'check_output', return_value=B+'\n'+A+'\n'), \
             patch.object(publication.subprocess, 'run', side_effect=run):
            ok = publication.project(selected, root, reports, root / 'bundle')
        return ok, selected, commands

    def test_selects_existing_report_consumers_with_explicit_pages_identity(self):
        selected = self.selection()
        self.assertEqual(selected['projection_contract'], publication.PROJECTION_CONTRACT)
        self.assertEqual(selected['adapter_commit'], C)
        self.assertTrue(selected['should_build'])

    def test_direct_consumption_reaches_verified_bundle_metadata_and_site(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            ok, selected, commands = self.project_fixture(root)
            self.assertTrue(ok)
            self.assertFalse(any('truth-release' in command for command in commands))
            self.assertFalse(any(command[0] in {'lean', 'lake', 'make'} for command in commands))
            self.assertLess(next(i for i,c in enumerate(commands) if 'truth-export' in c),
                            next(i for i,c in enumerate(commands) if 'dag-render' in c))
            bundle = root / 'bundle'
            manifest = json.loads((bundle / 'release-manifest.v1.json').read_text())
            self.assertEqual(manifest['schema'], publication.PROJECTION_CONTRACT)
            self.assertEqual(manifest['producer']['package_commit'], C)
            self.assertEqual((bundle / 'raw-lean-report.json').read_bytes(), b'original published report')
            self.assertNotIn('blueprint_index', manifest['artifacts'])
            verified = vertical_smoke.verify_bundle(bundle)
            self.assertEqual(publication.publication_metadata(selected, bundle)['release_digest'], verified['release_digest'])
            vertical_smoke.build_basic_site(bundle, root / 'site')
            self.assertEqual(json.loads((root / 'site/data/basic-truth-graph.v1.json').read_text())['counts']['truth_nodes'], 4)

    def test_frozen_mismatch_stops_before_graph_or_bundle_publication(self):
        reason = 'TRUTH_EXPORT_REJECTED frozen state does not match current report: D5/S3/X.lean'
        with tempfile.TemporaryDirectory() as temp:
            ok, selected, commands = self.project_fixture(Path(temp), subprocess.CompletedProcess([], 2, stdout=reason+'\n'))
            self.assertFalse(ok)
            self.assertEqual(selected['status'], 'content-validation-rejected')
            self.assertEqual(selected['rejection_reason'], reason)
            self.assertFalse(any('dag-render' in command for command in commands))

    def test_export_infrastructure_failure_remains_retryable(self):
        with tempfile.TemporaryDirectory() as temp, self.assertRaises(subprocess.CalledProcessError):
            self.project_fixture(Path(temp), subprocess.CompletedProcess([], 137, stdout='out of memory'))

    def test_rehashed_conflicting_source_provenance_and_report_are_rejected(self):
        for filename, field, value in [
            ('truth-export.v1.json', 'source_commit', C),
            ('truth-export.v1.json', 'source_tree', B),
            ('report-provenance.v1.json', 'exporter_commit', C),
            ('report-provenance.v1.json', 'report_run_id', 999),
            ('report-provenance.v1.json', 'required_checks', []),
            ('source-snapshot.v1.json', 'producer_package_commit', A),
        ]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                self.project_fixture(root)
                bundle = root / 'bundle'
                path = bundle / filename
                content = json.loads(path.read_text())
                content[field] = value
                path.write_text(json.dumps(content))
                # Rebind transport AND snapshot hashes: identity checks must still reject.
                snapshot_path = bundle / 'source-snapshot.v1.json'
                snapshot = json.loads(snapshot_path.read_text())
                for role in ('truth_export', 'report_provenance'):
                    snapshot[role+'_sha256'] = vertical_smoke._sha256(bundle / vertical_smoke.ARTIFACT_PROFILES[publication.PROJECTION_CONTRACT][role])
                snapshot_path.write_text(json.dumps(snapshot))
                vertical_tests.VerticalSmokeTests.rebind_bundle(bundle)
                with self.assertRaises(vertical_smoke.ReleaseContractError):
                    vertical_smoke.verify_bundle(bundle)

    def test_pages_projection_cannot_claim_native_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.project_fixture(root)
            path = root / 'bundle/truth-release-publication.v1.json'
            value = json.loads(path.read_text())
            value['schema'] = 'truth-release-publication.v1'
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(vertical_smoke.ReleaseContractError, 'publication schema'):
                vertical_smoke.verify_bundle(root / 'bundle')
