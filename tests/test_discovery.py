import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from lib.discovery import build_index, render_discovery
from lib.living_library import page_shell
from tests.test_living_library import graph


class DiscoveryTests(unittest.TestCase):
    def snapshot(self):
        return {"graph": graph(), "problems": [], "truth_release_digest": "sha256:" + "a" * 64}

    def test_sequence_associations_do_not_promote_proof_scope(self):
        index = build_index(self.snapshot())
        records = {r["id"]: r for r in index["records"]}
        self.assertEqual(records["oeis:A026471"]["status"], "external-sequence")
        association = next(e for e in index["relations"] if e["source"] == "oeis:A026471")
        self.assertEqual(association["kind"], "paper_context")
        self.assertIn("not covered", association["scope"])
        self.assertEqual(records[association["target"]]["status"], "proved")
        self.assertEqual(sum(r["kind"] == "result" for r in records.values()), 4)
        self.assertTrue(any(e["kind"] == "builds_on" and e["source"] == "result:thue-morse-reduced-abelian-odd" for e in index["relations"]))

    def test_static_api_digest_neighbors_and_crawlable_pages(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            render_discovery(out, self.snapshot(), page_shell)
            manifest = json.loads((out / "api/v1/manifest.json").read_text())
            self.assertEqual(manifest["index_sha256"], hashlib.sha256((out / "api/v1/index.json").read_bytes()).hexdigest())
            record = json.loads((out / "api/v1/oeis/A010060.json").read_text())
            self.assertEqual(record["record"]["identifiers"]["oeis"], "A010060")
            self.assertEqual(record["relations"][0]["kind"], "studied_object")
            self.assertEqual(record["neighbors"][0]["evidence"]["assessment"], "reviewed-pinned-result")
            self.assertIn("not the derived complexity", record["relations"][0]["scope"])
            html = (out / "oeis/A010060/index.html").read_text()
            self.assertIn('rel="canonical"', html)
            self.assertIn("Thue-Morse", html)
            self.assertTrue((out / "llms.txt").exists())
            render_discovery(out, self.snapshot(), page_shell)
            self.assertEqual(manifest, json.loads((out / "api/v1/manifest.json").read_text()))
