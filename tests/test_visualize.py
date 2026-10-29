"""The published Visualize collection mounts without external navigation."""
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from urllib.parse import urljoin, urlsplit, unquote

from lib.visualize import mount_visualize, ROOT
from lib.knowledge_pages import site_header


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        self.refs.extend(value for name, value in attrs if name in {'href', 'src'} and value)


class VisualizeTests(unittest.TestCase):
    def test_publication_mounts_all_entries_and_local_resources_under_its_prefix(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            publication = mount_visualize(output)
            target = output / 'visualize'
            registry = json.loads((target / 'visualizations.json').read_text())
            live = [v for v in registry['visualizations'] if v['status'] == 'live']
            self.assertEqual(len(live), 30)
            for entry in live:
                self.assertTrue((target / entry['path'] / 'index.html').is_file())
                self.assertTrue((target / entry['thumbnail']).is_file())
            for name, digest in publication['files'].items():
                if not name.endswith('.html'):
                    self.assertEqual('sha256:' + sha256((target / name).read_bytes()).hexdigest(), digest)
            for path in target.rglob('*.html'):
                parser = References()
                text = path.read_text()
                parser.feed(text)
                self.assertIn('pages-bridge.js?v=domain-v1', text)
                base = 'https://example.org/visualize/' + path.relative_to(target).as_posix()
                for reference in parser.refs:
                    url = urlsplit(urljoin(base, reference))
                    if url.netloc != 'example.org':
                        continue
                    self.assertTrue(url.path.startswith('/visualize/'), (path, reference))
                    local = output / unquote(url.path.lstrip('/'))
                    self.assertTrue(local.is_file() or (local / 'index.html').is_file(), (path, reference))
            self.assertTrue((target / 'LICENSE').is_file())

    def test_tampered_and_extra_inputs_cannot_be_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / 'vendor/visualize', root / 'vendor/visualize')
            path = root / 'vendor/visualize/site/assets/shell.js'
            path.write_text(path.read_text() + '\n// altered')
            with self.assertRaisesRegex(ValueError, 'digest mismatch'):
                mount_visualize(root / 'output', root)
            (root / 'vendor/visualize/site/unrecorded.js').write_text('')
            with self.assertRaisesRegex(ValueError, 'inventory changed'):
                mount_visualize(root / 'output', root)
            self.assertFalse((root / 'output').exists())

    def test_current_and_archived_headers_resolve_to_the_local_collection(self):
        for prefix in ['', '../../', '../../../../']:
            text = site_header(prefix)
            self.assertIn(f'href="{prefix}visualize/">Visualize</a>', text)
            self.assertNotIn('the-omega-institute.github.io/trureturing-visualize', text)
        for path in (ROOT / 'site').rglob('*.html'):
            self.assertNotIn('the-omega-institute.github.io/trureturing-visualize', path.read_text(), str(path))


if __name__ == '__main__':
    unittest.main()
