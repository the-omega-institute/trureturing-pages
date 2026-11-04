import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pymupdf

from lib import publication_previews as previews
from lib.living_library import render_research
from lib.research_updates import EMPTY
from tests.test_living_library import graph


def paper():
    return {'id': 'new-result', 'title': 'A New Result', 'authors': 'A. Author',
            'date': '2026-11-02', 'status': 'preprint', 'summary': 'A checked result.',
            'topic': 'Mathematics', 'problem_ids': [], 'venue': 'arXiv:2611.03956',
            'url': 'https://arxiv.org/abs/2611.03956',
            'evidence_url': 'https://arxiv.org/abs/2611.03956v2'}


def pdf(title='A NEW RESULT', revision='v2'):
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), title)
        page.insert_text((72, 96), 'arXiv:2611.03956' + revision)
        return document.tobytes()


class PublicationPreviewTests(unittest.TestCase):
    def setup_site(self, root):
        assets = root / 'assets'
        assets.mkdir()
        (assets / 'research-news.json').write_text(json.dumps({'publications': []}))
        (assets / 'research-updates.json').write_text(json.dumps(dict(EMPTY, publications=[paper()])))

    def test_feed_only_paper_gets_a_real_image_and_keeps_its_anchor(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.setup_site(root)
            with patch.object(previews, 'download_pdf', return_value=pdf()) as download:
                records = previews.prepare_previews(root)
            self.assertEqual(download.call_args.args[0], 'https://arxiv.org/pdf/2611.03956v2')
            image = root / records[0]['image']
            self.assertTrue(image.read_bytes().startswith(b'\xff\xd8'))
            pixmap = pymupdf.Pixmap(str(image))
            self.assertEqual(max(pixmap.width, pixmap.height), 960)
            snapshot = {'graph': graph(), 'problems': [], 'truth_release_digest': 'sha256:' + 'a' * 64}
            render_research(snapshot, root, {'path': 'data/example.json', 'digest': 'sha256:' + 'b' * 64})
            index = json.loads((root / 'assets/publication-index.json').read_text())
            item = next(p for p in index['publications'] if p['id'] == 'paper-new-result')
            self.assertEqual(item['image'], records[0]['image'])
            html = (root / 'research.html').read_text()
            card = html.split('id="paper-new-result"', 1)[1].split('</article>', 1)[0]
            self.assertIn('class="paper-preview"', card)
            self.assertNotIn('journal-mark', card)

    def test_wrong_pdf_does_not_publish_a_preview_registry(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.setup_site(root)
            with patch.object(previews, 'download_pdf', return_value=pdf('Another Paper')):
                with self.assertRaisesRegex(ValueError, 'title does not match'):
                    previews.prepare_previews(root)
            self.assertFalse((root / previews.REGISTRY).exists())

    def test_new_revision_and_tampered_images_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.setup_site(root)
            with patch.object(previews, 'download_pdf', return_value=pdf()):
                records = previews.prepare_previews(root)
            changed = {**paper(), 'evidence_url': 'https://arxiv.org/abs/2611.03956v3'}
            with self.assertRaisesRegex(ValueError, 'Stale publication preview'):
                previews.apply_previews([changed], root)
            (root / records[0]['image']).write_bytes(b'corrupt image')
            with self.assertRaisesRegex(ValueError, 'digest mismatch'):
                previews.apply_previews([paper()], root)

    def test_same_title_from_the_wrong_revision_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'announced arXiv revision'):
            previews.render_first_page(pdf(revision='v1'), 'A New Result', '2611.03956v2')

    def test_editorial_images_do_not_require_an_arxiv_download(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.setup_site(root)
            (root / 'assets/research-news.json').write_text(json.dumps({
                'publications': [{**paper(), 'image': 'assets/reviewed.jpg'}]}))
            with patch.object(previews, 'download_pdf') as download:
                self.assertEqual(previews.prepare_previews(root), [])
            download.assert_not_called()

    def test_oversized_or_non_pdf_responses_are_rejected(self):
        for data in (b'<html>temporarily unavailable</html>', b'%PDF-' + b'x' * 20):
            with self.subTest(data=data), patch.object(previews, 'MAX_PDF_BYTES', 20), \
                 patch.object(previews, 'urlopen', return_value=io.BytesIO(data)):
                with self.assertRaisesRegex(ValueError, 'Invalid or oversized'):
                    previews.download_pdf('https://arxiv.org/pdf/2611.03956v2')
