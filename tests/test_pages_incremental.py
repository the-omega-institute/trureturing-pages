"""Exercise real generated artifacts and immutable metadata reuse across runs."""
from io import BytesIO
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from lib import living_library, pages_incremental as incremental, reconcile_releases as reconcile, vertical_smoke
from lib.ancestry_cache import AncestryCache

FIXTURES = Path(__file__).parent / 'fixtures'
A, B, C, D = (c * 40 for c in 'abcd')


class AncestryCacheTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / 'ancestry.json'

    def test_saved_facts_are_reused_with_transitivity_but_negative_facts_are_not(self):
        cache = AncestryCache(self.path, 'example/math')
        cache.record(A, B, True)
        cache.record(B, C, True)
        cache.record(D, B, False)
        restored = AncestryCache(self.path, 'example/math')
        self.assertTrue(restored.get(A, C))
        self.assertFalse(restored.get(D, B))
        self.assertIsNone(restored.get(D, C))
        self.assertIsNone(restored.get(C, A))
        with self.assertRaisesRegex(ValueError, 'repository'):
            AncestryCache(self.path, 'different/math')
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            restored.record(A, B, False)

    def test_new_clients_read_fresh_head_and_only_compare_the_head_advance(self):
        first = reconcile.GitHub('example/math', token='', ancestry_cache=self.path)
        with patch.object(first, 'get_json', side_effect=[{'sha': B},
                {'status': 'ahead', 'merge_base_commit': {'sha': A}, 'behind_by': 0}]) as api:
            self.assertEqual(first.dev_head(), B)
            self.assertTrue(first.is_ancestor(A, B))
            self.assertEqual(api.call_count, 2)
        second = reconcile.GitHub('example/math', token='', ancestry_cache=self.path)
        with patch.object(second, 'get_json', side_effect=[{'sha': C},
                {'status': 'ahead', 'merge_base_commit': {'sha': B}, 'behind_by': 0}]) as api:
            self.assertEqual(second.dev_head(), C)
            self.assertTrue(second.is_ancestor(A, C))
            self.assertEqual(api.call_count, 2)
            self.assertEqual(api.call_args.args, (f'compare/{B}...{C}?per_page=1',))
        third = reconcile.GitHub('example/math', token='', ancestry_cache=self.path)
        with patch.object(third, 'get_json', return_value={'sha': C}) as api:
            self.assertEqual(third.dev_head(), C)
            self.assertTrue(third.is_ancestor(A, C))
            api.assert_called_once_with('commits/dev')

    def test_force_push_does_not_infer_ancestry_from_old_head(self):
        cache = AncestryCache(self.path, 'example/math')
        cache.record(A, B, True)
        cache.head = B
        cache.save()
        client = reconcile.GitHub('example/math', token='', ancestry_cache=self.path)
        with patch.object(client, 'get_json', side_effect=[{'sha': C},
                {'status': 'diverged'}, {'status': 'diverged'}]) as api:
            self.assertEqual(client.dev_head(), C)
            self.assertFalse(client.is_ancestor(A, C))
            self.assertEqual(api.call_count, 3)

    def test_only_immutable_sha_comparisons_use_stable_urls(self):
        requests = []
        def respond(request, **kwargs):
            requests.append(request)
            return BytesIO(b'{}')
        with patch.object(reconcile, 'urlopen', side_effect=respond):
            for _ in range(2):
                client = reconcile.GitHub('example/math', token='')
                client.get_json(f'compare/{A}...{B}?per_page=1')
                client.get_json('commits/dev')
                client.get_json('releases?per_page=100&page=1')
        self.assertEqual(requests[0].full_url, requests[3].full_url)
        self.assertIsNone(requests[0].get_header('Cache-control'))
        for index in (1, 2):
            self.assertNotEqual(requests[index].full_url, requests[index + 3].full_url)
            self.assertEqual(requests[index].get_header('Cache-control'), 'no-cache')


class GeneratedReuseTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.write('site/open-math.html', '<html>deck one</html>')
        self.write('site/assets/deck.css', 'body { color: black }')
        self.write('site/assets/deck.mjs', 'export const version = 1;')
        self.write('site/assets/old.svg', '<svg/>')
        self.write('site/version-status.html', 'status template')
        self.write('site/assets/research-catalog.json', '{}')
        self.write('tools/layout.mjs', 'import "../site/assets/layout.mjs";')
        self.write('site/assets/layout.mjs', 'import "./vendor/math.mjs";')
        self.write('site/assets/vendor/math.mjs', 'export const PI = 3;')
        self.write('lib/generator.py', '# generator')
        self.commit()
        self.bundle = FIXTURES / 'truth-release'
        self.verified = vertical_smoke.verify_bundle(self.bundle)
        self.release = self.verified['release_digest']
        graph = vertical_smoke.project_basic_dag(self.bundle, self.verified)
        graph['synthetic'] = True
        graph_path = self.root / 'graph.json'
        graph_path.write_text(json.dumps(graph))
        atlas_path = self.root / 'atlas.json'
        atlas_path.write_text(json.dumps({'schema_version': 'pages-atlas-manifest.v1',
            'atlas_graph_digest': living_library.digest(graph_path.read_bytes()),
            'truth_release_digest': self.release}))
        self.site = self.root / 'output'
        shutil.copytree(self.repo / 'site', self.site)
        reconcile.ingest_release(self.bundle, graph_path, atlas_path, self.site,
                                 expected_digest=self.release, deployed=True, now='2026-09-11T03:00:00Z')
        shutil.copyfile(graph_path, self.site / 'data/pages-atlas-view.v1.json')
        shutil.copyfile(atlas_path, self.site / 'data/pages-atlas-manifest.v1.json')
        (self.site / 'data/verified-truth-release.v1.json').write_text(json.dumps(self.verified))
        topology = json.loads((FIXTURES / 'certified-topology.v1.json').read_text())
        topology.update(truth_release_digest=self.release, producer_commit=vertical_smoke.TOPOLOGY_PRODUCER_COMMIT,
                        algorithm_profile_digest='sha256:' + incremental.sha(vertical_smoke.ALGORITHM_PROFILE))
        (self.site / 'data/certified-topology.v1.json').write_text(json.dumps(topology))
        vertical_smoke.write_deployment_manifest(self.site, self.site / 'data/certified-topology.v1.json',
                                                 self.git('rev-parse', 'HEAD'), self.git('rev-parse', 'HEAD^{tree}'))
        (self.site / 'version-status.html').write_text('generated status')
        self.manifest = self.root / 'cache/manifest.json'
        incremental.seal(self.site, self.manifest, self.repo)
        self.served = {p: (self.site / p).read_bytes() for p in (reconcile.HISTORY_PATH, reconcile.RECEIPTS_PATH)}

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True).strip()

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture')

    def write(self, name, text):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def restore(self):
        with patch.object(living_library, 'read_remote', side_effect=lambda url, path, **kw: self.served.get(path.split('?')[0])) as remote:
            result = incremental.restore(self.site, self.manifest, self.release, 'https://example.test/', self.repo)
        return result, remote

    def test_presentation_overlay_preserves_generated_bytes_and_mtimes_and_updates_revision(self):
        generated = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.site.rglob('*')
                     if p.is_file() and p.relative_to(self.site).parts[0] in {'data', 'knowledge', 'research'}}
        self.write('site/open-math.html', '<html>new deck</html>')
        self.write('site/assets/deck.css', 'body { color: blue }')
        self.write('site/assets/deck.mjs', 'export const version = 2;')
        self.write('site/assets/open-math/new.json', '{"nodes":[]}')
        (self.repo / 'site/assets/old.svg').unlink()
        self.commit()
        result, remote = self.restore()
        self.assertTrue(result)
        self.assertGreaterEqual(remote.call_count, 2)
        for name in ('open-math.html', 'assets/deck.css', 'assets/deck.mjs', 'assets/open-math/new.json'):
            self.assertEqual((self.site / name).read_bytes(), (self.repo / 'site' / name).read_bytes())
        self.assertFalse((self.site / 'assets/old.svg').exists())
        for path, expected in generated.items():
            self.assertEqual((path.read_bytes(), path.stat().st_mtime_ns), expected, str(path))
        manifest = json.loads((self.site / 'deployment-manifest.v1.json').read_text())
        self.assertEqual(manifest['pages_commit'], self.git('rev-parse', 'HEAD'))
        self.assertEqual(manifest['release_digest'], self.release)
        incremental.seal(self.site, self.manifest, self.repo)
        self.assertTrue(self.restore()[0])

    def test_generation_inputs_and_transitive_layout_dependencies_invalidate_cache(self):
        for name in ('lib/generator.py', 'site/assets/research-catalog.json',
                     'site/assets/vendor/math.mjs', 'tools/layout.mjs'):
            path = self.repo / name
            original = path.read_text()
            with self.subTest(name=name):
                path.write_text(original + '\nchanged')
                self.assertFalse(self.restore()[0])
                path.write_text(original)
        self.assertFalse(incremental.restore(self.site, self.manifest, 'sha256:' + 'f' * 64, root=self.repo))

    def test_generated_template_change_and_generated_path_collision_fall_back(self):
        self.write('site/version-status.html', 'new template')
        self.assertFalse(self.restore()[0])
        self.write('site/version-status.html', 'status template')
        self.write('site/conjectures.html', 'would overwrite generated research')
        self.assertFalse(self.restore()[0])

    def test_cache_tampering_is_rejected_before_overlay(self):
        self.write('site/open-math.html', 'new deck')
        (self.site / 'data/pages-atlas-view.v1.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'verification'):
            self.restore()
        self.assertEqual((self.site / 'open-math.html').read_text(), '<html>deck one</html>')

    def test_live_history_is_fetched_even_with_complete_local_history(self):
        history = json.loads(self.served[reconcile.HISTORY_PATH])
        history['entries'][0]['generated_at'] = '2026-09-12T03:00:00Z'
        self.served[reconcile.HISTORY_PATH] = json.dumps(history).encode()
        with self.assertRaisesRegex(ValueError, 'checkpoint.*history'):
            self.restore()


if __name__ == '__main__':
    unittest.main()
