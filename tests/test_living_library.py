import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lib.living_library import SECTIONS, MARKDOWN, build_library, content_timeline, create_snapshot, digest, parse_problem
from lib.knowledge_pages import stable_file_name


def problem_source():
    return "---\nslug: test-question\nbibkey: source\narxiv_id: 2405.02727\ntriage: theorem\nmotivation_gids:\n  - A\n---\n# Test question\n\n" + "\n\n".join(f"## {name}\n\nA proposed step, not a completed proof." for name in SECTIONS)


def graph(letter="a"):
    return {"source_snapshot": {"truth_release_digest": "sha256:" + letter * 64, "source_commit": letter * 40}, "nodes": [{"id": "A", "title": "Foundation", "kind": "truth", "domain": "Digit", "repo_path": "A.lean", "status": "Closed", "state": "closed"}], "edges": []}


class LivingLibraryTests(unittest.TestCase):
    def test_problem_parser_preserves_numeric_looking_source_and_proposed_status(self):
        result = parse_problem(problem_source(), "test-question.md")
        self.assertEqual(result["arxiv_id"], "2405.02727")
        self.assertEqual(result["route_status"], "proposed")
        self.assertEqual(result["literature_status"], "not-rechecked")
        self.assertIsNone(result["last_literature_check"])

    def test_invalid_catalog_content_fails_and_html_is_inert(self):
        for source in [problem_source().replace("## Gap", "## Motivation"), problem_source().replace("slug: test-question", "slug: ../../escape"), problem_source().replace("  - A", "  - A\n  - A")]:
            with self.assertRaises(ValueError):
                parse_problem(source, "test-question.md")
        rendered = MARKDOWN.render('<script>alert(1)</script>\n\n[x](javascript:alert(1))')
        self.assertNotIn("<script>", rendered)
        self.assertNotIn('href="javascript:', rendered)
        math = MARKDOWN.render(r"Test \(a_b = x^2\)")
        self.assertIn('class="math-inline"', math)
        self.assertIn("a_b = x^2", math)
        self.assertNotIn("<script>", MARKDOWN.render(r"\(<script>alert(1)</script>\)"))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_problem(problem_source().replace("slug: test-question", "slug: test-question\nslug: test-question"), "test-question.md")

    def test_anchor_updates_trigger_reassessment_without_promoting_route(self):
        problem = parse_problem(problem_source(), "test-question.md")
        a = create_snapshot(graph(), "sha256:" + "1" * 64, [problem], {"A.lean": "1" * 40})
        b = create_snapshot(graph("b"), "sha256:" + "2" * 64, [problem], {"A.lean": "2" * 40})
        timeline = content_timeline([(None, a, None), (None, b, None)])
        self.assertEqual(timeline["nodes"]["A"][1]["event"], "Content changed")
        event = timeline["problems"]["test-question"][1]
        self.assertEqual(event["changed_anchors"], ["A"])
        self.assertEqual(event["review"], "Reassessment needed")
        self.assertEqual(b["problems"][0]["route_status"], "proposed")

    def test_domain_or_analysis_changes_do_not_rewrite_content_history(self):
        a = create_snapshot(graph(), "sha256:" + "1" * 64, [], {"A.lean": "1" * 40})
        changed = graph("b")
        changed["nodes"][0]["domain"] = "Fourier"
        changed["nodes"][0]["true_depth"] = 3
        b = create_snapshot(changed, "sha256:" + "2" * 64, [], {"A.lean": "1" * 40})
        self.assertEqual(len(content_timeline([(None, a, None), (None, b, None)])["nodes"]["A"]), 1)

    def test_archive_preserves_versions_and_rejects_corruption_and_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            graph_path, manifest_path, output = root / "graph.json", root / "manifest.json", root / "site"
            def build(value):
                raw = json.dumps(value).encode()
                graph_path.write_bytes(raw)
                manifest_path.write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1", "atlas_graph_digest": digest(raw), "truth_release_digest": value["source_snapshot"]["truth_release_digest"]}))
                with patch("lib.living_library.source_material", return_value=([parse_problem(problem_source(), "test-question.md")], {"A.lean": "1" * 40})):
                    return build_library(graph_path, manifest_path, output, root)
            first = build(graph())
            self.assertEqual(build(graph()), first)
            newer = graph("b")
            newer["nodes"][0]["human_abstract"] = "A revised explanation."
            second = build(newer)
            self.assertEqual(len(second["entries"]), 2)
            slug = stable_file_name("A")
            old_page = output / "release" / ("a" * 64) / "node" / slug / "index.html"
            self.assertTrue(old_page.exists())
            self.assertNotIn("A revised explanation.", old_page.read_text())
            self.assertIn("A revised explanation.", (output / "knowledge/node" / slug / "index.html").read_text())
            index_bytes = (output / "data/library-history.v1.json").read_bytes()
            with self.assertRaisesRegex(ValueError, "older"):
                build(graph())
            self.assertEqual(index_bytes, (output / "data/library-history.v1.json").read_bytes())
            (output / first["entries"][0]["path"]).write_text("{}")
            with self.assertRaisesRegex(ValueError, "verification"):
                build(newer)
            self.assertEqual(index_bytes, (output / "data/library-history.v1.json").read_bytes())

    def test_mismatched_graph_is_rejected_before_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "g.json").write_text(json.dumps(graph()))
            (root / "m.json").write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1", "atlas_graph_digest": "sha256:" + "f" * 64}))
            with self.assertRaisesRegex(ValueError, "verified Atlas"):
                build_library(root / "g.json", root / "m.json", root / "out")


if __name__ == "__main__":
    unittest.main()
