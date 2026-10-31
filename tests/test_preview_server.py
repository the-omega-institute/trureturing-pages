"""Exercise the same clean/legacy URL pairs as the production static host."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

from lib.preview_server import PagesHTTPRequestHandler


class PreviewRoutingTests(unittest.TestCase):
    def test_clean_pages_coexist_with_directories_assets_and_legacy_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'research.html').write_text('<h1>Papers</h1>')
            (root / 'research/topic').mkdir(parents=True)
            (root / 'research/topic/index.html').write_text('<h1>Topic</h1>')
            (root / 'research/index.html').write_text('<h1>Directory</h1>')
            (root / 'data.json').write_text('{"original": true}')
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(PagesHTTPRequestHandler, directory=directory))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f'http://127.0.0.1:{server.server_port}'
                for route, content in [('/research?lang=zh-CN', '<h1>Papers</h1>'),
                                       ('/research.html', '<h1>Papers</h1>'),
                                       ('/research/', '<h1>Directory</h1>'),
                                       ('/research/topic/', '<h1>Topic</h1>'),
                                       ('/data.json', '{"original": true}')]:
                    with self.subTest(route=route), urlopen(base + route) as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.read().decode(), content)
                        if route.startswith('/research'):
                            self.assertIn('text/html', response.headers['Content-Type'])
                with self.assertRaises(HTTPError) as failure:
                    urlopen(base + '/missing')
                self.assertEqual(failure.exception.code, 404)
                failure.exception.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
