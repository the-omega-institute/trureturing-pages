"""Check direct historical links and old bookmarks against a generated site."""
import argparse
from functools import partial
import gzip
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urlencode, urlsplit
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    args = parser.parse_args()
    site = args.site.resolve()
    entries = json.loads((site / 'data/library-history.v1.json').read_text())['entries']
    entry = entries[0]
    assert len(entries) > 1
    raw = (site / entry['path']).read_bytes()
    snapshot = json.loads(gzip.decompress(raw) if entry['path'].endswith('.gz') else raw)
    node = snapshot['graph']['nodes'][0]
    slug = hashlib.sha256(node['id'].encode()).hexdigest()
    release = entry['truth_release_digest']
    assert not (site / 'release' / release[7:] / 'node' / slug / 'index.html').exists()

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def translate_path(self, path):
            return super().translate_path(path.replace('/trureturing-pages/', '/', 1))

        def send_error(self, code, message=None, explain=None):
            if code != 404:
                return super().send_error(code, message, explain)
            data = (site / '404.html').read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True)
            page = browser.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + 'library-history.html?lang=en#' + urlencode({'release': release, 'node': node['id']}))
            page.wait_for_selector('.archive-row')
            href = page.locator('.archive-row').first.get_attribute('href')
            assert urlsplit(href).path.endswith('/library-version.html'), href
            page.locator('.archive-row').first.click()
            page.wait_for_selector('#archived-concept h1')
            assert release in page.locator('#archived-concept').inner_text()
            expected_title = node.get('human_title') or node.get('title') or node['id']
            assert page.locator('#archived-concept h1').inner_text() == expected_title
            for path in [
                'library-version.html?lang=en#' + urlencode({'snapshot': entry['digest'], 'node': node['id']}),
                f'release/{release[7:]}/node/{slug}/?lang=en',
            ]:
                page.goto(base + path)
                page.wait_for_selector('#archived-concept h1')
                assert '/library-version.html?' in page.url, page.url
                assert page.locator('#archived-concept h1').inner_text() == expected_title
                assert release in page.locator('#archived-concept').inner_text()
                source = page.get_by_role('link', name='Source at this release').get_attribute('href')
                assert '/blob/' + snapshot['graph']['source_snapshot']['source_commit'] + '/' in source
            response = page.goto(base + 'does-not-exist.html')
            assert response.status == 404
            assert page.url.endswith('/does-not-exist.html')
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
    print('Direct archive links, pinned snapshot links, legacy bookmarks, source revisions and unrelated 404s pass.')


if __name__ == '__main__':
    main()
