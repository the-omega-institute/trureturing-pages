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
                (graph_path.parent / "truth-export.v1.json").write_text(
                    json.dumps({"schema_version": 2, "dialect": "stratalint.truth-export.v2", "nodes": []}))
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

    def test_legacy_export_can_render_dossiers_but_cannot_certify_a_resolution(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            graph_path, manifest_path = root / "graph.json", root / "manifest.json"
            raw = json.dumps(graph()).encode()
            graph_path.write_bytes(raw)
            manifest_path.write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1", "atlas_graph_digest": digest(raw), "truth_release_digest": graph()["source_snapshot"]["truth_release_digest"]}))
            (root / "truth-export.v1.json").write_text(json.dumps({"schema_version": 1, "dialect": "stratalint.truth-export.v1", "nodes": []}))
            problem = parse_problem(problem_source(), "test-question.md")
            with patch("lib.living_library.source_material", return_value=([problem], {})):
                build_library(graph_path, manifest_path, root / "legacy-site", root)
            problem["resolution"] = {"kind": "proved", "declaration_gid": "A.result", "source_path": "Blueprint/A.md"}
            with patch("lib.living_library.source_material", return_value=([problem], {})):
                with self.assertRaisesRegex(ValueError, "Unexpected truth-export wire contract"):
                    build_library(graph_path, manifest_path, root / "unsafe-site", root)
            self.assertFalse((root / "unsafe-site/research.html").exists())

    def test_mismatched_graph_is_rejected_before_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "g.json").write_text(json.dumps(graph()))
            (root / "m.json").write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1", "atlas_graph_digest": "sha256:" + "f" * 64}))
            with self.assertRaisesRegex(ValueError, "verified Atlas"):
                build_library(root / "g.json", root / "m.json", root / "out")

    def test_reconciliation_can_pin_previous_index_while_reusing_archive_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "site"
            def inputs(letter):
                value = dict(graph(letter), synthetic=True)
                raw = json.dumps(value).encode()
                (root / "g.json").write_bytes(raw)
                (root / "m.json").write_text(json.dumps({"schema_version": "pages-atlas-manifest.v1", "atlas_graph_digest": digest(raw), "truth_release_digest": value["source_snapshot"]["truth_release_digest"]}))
            inputs("a")
            first = build_library(root / "g.json", root / "m.json", output)
            inputs("b")
            def remote(url, path):
                self.assertNotEqual(path, "data/library-history.v1.json")
                return (output / path).read_bytes()
            with patch("lib.living_library.read_remote", side_effect=remote):
                result = build_library(root / "g.json", root / "m.json", output,
                                       previous_url="https://example.test/", previous_index=first)
            self.assertEqual(len(result["entries"]), 2)
            self.assertEqual(result["entries"][0], first["entries"][0])

    def test_same_truth_release_is_idempotent_even_if_snapshot_input_differs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "site"
            first_graph = dict(graph(), synthetic=True)
            first_raw = json.dumps(first_graph).encode()
            (root / "g.json").write_bytes(first_raw)
            (root / "m.json").write_text(json.dumps({
                "schema_version": "pages-atlas-manifest.v1",
                "atlas_graph_digest": digest(first_raw),
                "truth_release_digest": first_graph["source_snapshot"]["truth_release_digest"],
            }))
            first = build_library(root / "g.json", root / "m.json", output)
            changed_graph = copy.deepcopy(first_graph)
            changed_graph["nodes"][0]["human_abstract"] = "A later render of the same release."
            changed_raw = json.dumps(changed_graph).encode()
            (root / "g.json").write_bytes(changed_raw)
            (root / "m.json").write_text(json.dumps({
                "schema_version": "pages-atlas-manifest.v1",
                "atlas_graph_digest": digest(changed_raw),
                "truth_release_digest": changed_graph["source_snapshot"]["truth_release_digest"],
            }))
            result = build_library(root / "g.json", root / "m.json", output)
            self.assertEqual(result, first)
            self.assertEqual(len(result["entries"]), 1)

    def test_rebuild_rejects_a_preexisting_duplicate_release_coordinate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "site"
            value = dict(graph(), synthetic=True)
            raw = json.dumps(value).encode()
            (root / "g.json").write_bytes(raw)
            (root / "m.json").write_text(json.dumps({
                "schema_version": "pages-atlas-manifest.v1",
                "atlas_graph_digest": digest(raw),
                "truth_release_digest": value["source_snapshot"]["truth_release_digest"],
            }))
            build_library(root / "g.json", root / "m.json", output)
            index_path = output / "data/library-history.v1.json"
            index = json.loads(index_path.read_text())
            duplicate = dict(index["entries"][0])
            duplicate["digest"] = "sha256:" + "f" * 64
            duplicate["path"] = "data/library/" + duplicate["digest"][7:] + ".json.gz"
            index["entries"].append(duplicate)
            index_path.write_text(json.dumps(index))
            newer = dict(value)
            newer["source_snapshot"] = dict(value["source_snapshot"], truth_release_digest="sha256:" + "b" * 64)
            newer_raw = json.dumps(newer).encode()
            (root / "g.json").write_bytes(newer_raw)
            (root / "m.json").write_text(json.dumps({
                "schema_version": "pages-atlas-manifest.v1",
                "atlas_graph_digest": digest(newer_raw),
                "truth_release_digest": "sha256:" + "b" * 64,
            }))
            with self.assertRaisesRegex(ValueError, "duplicate truth release"):
                build_library(root / "g.json", root / "m.json", output)


if __name__ == "__main__":
    unittest.main()
