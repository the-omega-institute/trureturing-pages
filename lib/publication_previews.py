"""Prepare genuine arXiv first pages before the offline Research renderer runs."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from urllib.request import Request, urlopen

from lib.literature import literature_identity
from lib.research_updates import load_feed, merge_publications

REGISTRY = 'assets/publication-previews.json'
SCHEMA = 'publication-previews.v1'
MAX_PDF_BYTES = 32 * 1024 * 1024
ARXIV = re.compile(r'(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?')


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text).casefold() if c.isalnum())


def pdf_source(paper):
    identity = literature_identity(paper['url'])[0]
    if not identity.startswith('arxiv:'):
        return None
    identifier = identity.removeprefix('arxiv:')
    # Evidence links carry the announced revision even when the article URL
    # intentionally points to the version-independent public record.
    for field in ('evidence_url', 'url', 'venue'):
        for match in ARXIV.finditer(paper.get(field, '')):
            candidate = match.group()
            if re.sub(r'v\d+$', '', candidate) == identifier and re.search(r'v\d+$', candidate):
                return 'https://arxiv.org/pdf/' + candidate
    return 'https://arxiv.org/pdf/' + identifier


def download_pdf(url):
    request = Request(url, headers={'User-Agent': 'trureturing-pages-preview/1.0'})
    with urlopen(request, timeout=45) as response:
        data = response.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES or not data.startswith(b'%PDF-'):
        raise ValueError('Invalid or oversized publication PDF: ' + url)
    return data


def render_first_page(data, title, identifier):
    import pymupdf
    with pymupdf.open(stream=data, filetype='pdf') as document:
        if document.needs_pass or not document.page_count:
            raise ValueError('Unreadable publication PDF')
        page = document[0]
        text = page.get_text()
        if normalized(title) not in normalized(text):
            raise ValueError('PDF first-page title does not match the publication: ' + title)
        if re.search(r'v\d+$', identifier) and not re.search(re.escape(identifier) + r'\b', text):
            raise ValueError('PDF first page does not identify the announced arXiv revision: ' + identifier)
        scale = 960 / max(page.rect.width, page.rect.height)
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        return pixmap.tobytes('jpeg', jpg_quality=90)


def prepare_previews(site):
    """Acquire missing previews; errors stop publication instead of hiding a gap."""
    site = Path(site)
    catalog = json.loads((site / 'assets/research-news.json').read_text())
    papers = merge_publications(catalog['publications'], load_feed(site / 'assets/research-updates.json'))
    records = []
    with tempfile.TemporaryDirectory() as temp:
        pending = []
        for paper in papers:
            source = pdf_source(paper)
            if not source or paper.get('image'):
                continue
            data = download_pdf(source)
            identifier = source.rsplit('/pdf/', 1)[1]
            image = render_first_page(data, paper['title'], identifier)
            name = identifier.replace('/', '-')
            path = 'assets/publications/generated/arxiv-' + name + '.jpg'
            record = {'identity': literature_identity(paper['url'])[0],
                      'title': paper['title'], 'source_url': source, 'image': path,
                      'pdf_sha256': sha256(data).hexdigest(), 'image_sha256': sha256(image).hexdigest()}
            staged = Path(temp) / Path(path).name
            staged.write_bytes(image)
            pending.append((staged, site / path))
            records.append(record)
        for staged, destination in pending:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(staged.read_bytes())
    registry = site / REGISTRY
    registry.parent.mkdir(parents=True, exist_ok=True)
    registry.write_text(json.dumps({'schema_version': SCHEMA, 'previews': records}, indent=2) + '\n')
    return records


def apply_previews(papers, site):
    """Bind prepared images without network access or changing paper identity."""
    path = Path(site) / REGISTRY
    if not path.exists():
        return papers
    registry = json.loads(path.read_text())
    if registry.get('schema_version') != SCHEMA:
        raise ValueError('Unsupported publication preview registry')
    by_identity = {record['identity']: record for record in registry['previews']}
    result = []
    for paper in papers:
        record = by_identity.get(literature_identity(paper['url'])[0])
        if record and not paper.get('image'):
            expected = pdf_source(paper)
            if record['source_url'] != expected or normalized(record['title']) != normalized(paper['title']):
                raise ValueError('Stale publication preview: ' + paper['title'])
            image = Path(record['image'])
            if (image.is_absolute() or '..' in image.parts
                    or image.parent != Path('assets/publications/generated')
                    or image.suffix != '.jpg'):
                raise ValueError('Invalid publication preview path')
            if sha256((Path(site) / image).read_bytes()).hexdigest() != record['image_sha256']:
                raise ValueError('Publication preview digest mismatch')
            paper = {**paper, 'image': image.as_posix()}
        result.append(paper)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    records = prepare_previews(parser.parse_args().site)
    print(json.dumps({'generated_previews': len(records), 'previews': records}, indent=2))
