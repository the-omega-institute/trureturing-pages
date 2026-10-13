import gzip
from hashlib import sha256
import io
import unittest
from unittest.mock import patch

from tools import build_reading_preview as preview


class Response(io.BytesIO):
    def __init__(self, body, encoding=None):
        super().__init__(body)
        self.headers = {} if encoding is None else {'Content-Encoding': encoding}


class ReadingPreviewTransportTests(unittest.TestCase):
    def test_requests_compression_and_restores_exact_artifact_bytes(self):
        artifact = b'{"graph":"' + b'x' * 10000 + b'"}\n'
        transport = gzip.compress(artifact)
        with patch.object(preview, 'urlopen', return_value=Response(transport, 'gzip')) as request, \
             patch.object(preview, 'MAX_TRANSFER_BYTES', 1024):
            raw, transferred = preview.download('data/pages-atlas-view.v1.json')
        self.assertEqual(raw, artifact)
        self.assertEqual(sha256(raw).hexdigest(), sha256(artifact).hexdigest())
        self.assertEqual(transferred, len(transport))
        self.assertEqual(request.call_args.args[0].get_header('Accept-encoding'), 'gzip')

    def test_http_decoding_preserves_a_gzip_artifacts_own_compression(self):
        artifact = gzip.compress(b'{"immutable":"snapshot"}')
        with patch.object(preview, 'urlopen', return_value=Response(gzip.compress(artifact), 'gzip')):
            raw, transferred = preview.download('data/library/immutable.json.gz')
        self.assertEqual(raw, artifact)
        self.assertEqual(gzip.decompress(raw), b'{"immutable":"snapshot"}')

    def test_uncompressed_http_response_preserves_bytes(self):
        artifact = b'{"manifest":"identity"}'
        with patch.object(preview, 'urlopen', return_value=Response(artifact)):
            self.assertEqual(preview.download('data/manifest.json'), (artifact, len(artifact)))

    def test_transfer_and_expansion_budgets_fail_closed(self):
        with patch.object(preview, 'urlopen', return_value=Response(b'x' * 101)), \
             patch.object(preview, 'MAX_TRANSFER_BYTES', 100):
            with self.assertRaisesRegex(ValueError, 'Preview input budget exceeded: data/too-large.json'):
                preview.download('data/too-large.json')
        with patch.object(preview, 'urlopen', return_value=Response(gzip.compress(b'x' * 101), 'gzip')), \
             patch.object(preview, 'MAX_FILE_BYTES', 100):
            with self.assertRaisesRegex(ValueError, 'expanded artifact budget exceeded'):
                preview.download('data/compression-bomb.json')

    def test_invalid_and_unrequested_encodings_fail_closed(self):
        with patch.object(preview, 'urlopen', return_value=Response(b'not gzip', 'gzip')):
            with self.assertRaises(OSError):
                preview.download('data/corrupt.json')
        with patch.object(preview, 'urlopen', return_value=Response(b'encoded', 'br')):
            with self.assertRaisesRegex(ValueError, 'Unsupported preview HTTP content encoding'):
                preview.download('data/unrequested.json')


if __name__ == '__main__':
    unittest.main()
