"""Local HTTP behavior for the extensionless HTML routes served by GitHub Pages."""
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit


def html_path(path, request_path):
    path = Path(path)
    if not urlsplit(request_path).path.endswith('/') and not path.suffix and not path.is_file():
        candidate = path.with_name(path.name + '.html')
        if candidate.is_file():
            return str(candidate)
    return str(path)


class PagesHTTPRequestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return html_path(super().translate_path(path), path)
