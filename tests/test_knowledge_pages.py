import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from lib.knowledge_pages import annotate_graph, mini_graph, node_page, relation_maps, render_knowledge_site, stable_file_name


def fixture():
    nodes = [{"id": str(i), "title": f"Concept {i}", "human_title": f"Concept {i}", "kind": "truth", "domain": "Quantum", "state": "closed", "status": "Closed", "repo_path": f"Quantum/{i}.lean"} for i in range(12)]
    nodes.append({"id": "doc", "title": "Authored exposition", "kind": "blueprint", "state": "semantic", "status": "Semantic"})
    return {"source_snapshot": {"truth_release_digest": "sha256:" + "a" * 64}, "nodes": nodes, "edges": [{"source": str(i), "target": "11", "layer": "truth-dependency"} for i in range(10)] + [{"source": "doc", "target": "11", "layer": "blueprint-truth-anchor"}, {"source": "10", "target": "11", "layer": "structural-affinity"}]}


class KnowledgePagesTests(unittest.TestCase):
    def test_static_proof_diagram_has_no_four_node_cap(self):
        graph = fixture()
        nodes = {n["id"]: n for n in graph["nodes"]}
        edges = [(str(i), "truth-dependency") for i in range(10)]
        output = mini_graph(nodes["11"], edges, [], nodes)
        for i in range(10):
            self.assertIn(f'../{stable_file_name(str(i))}/', output)

    def test_documents_and_affinity_are_not_labeled_as_prerequisites(self):
        graph = annotate_graph(fixture())
        nodes = {n["id"]: n for n in graph["nodes"]}
        parents, children = relation_maps(graph)
        output = node_page(graph, nodes["11"], parents["11"], children["11"], nodes, False)
        proof = output.split('id="proof-paths"')[1].split('id="references"')[0]
        self.assertNotIn(stable_file_name("doc"), proof)
        self.assertNotIn(stable_file_name("10"), proof)
        self.assertIn(stable_file_name("doc"), output.split('id="references"')[1])
        self.assertIn('assets/site-theme.css', output)
        self.assertIn('atlas.html#node=11', output)

    def test_current_and_frozen_pages_bind_the_same_complete_relationship_artifact(self):
        graph = fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            render_knowledge_site(graph, root)
            artifact = root / ("release/" + "a" * 64 + "/relations.v1.json")
            raw = artifact.read_bytes()
            data = json.loads(raw)
            self.assertEqual(len(data["nodes"]), 13)
            self.assertEqual(len(data["edges"]), 12)
            expected = "sha256:" + hashlib.sha256(raw).hexdigest()
            current = (root / "knowledge/node" / stable_file_name("11") / "index.html").read_text()
            frozen = (root / "release" / ("a" * 64) / "node" / stable_file_name("11") / "index.html").read_text()
            self.assertIn(expected, current)
            self.assertIn(expected, frozen)
            self.assertIn('../../../../assets/site-theme.css', frozen)
            self.assertIn('Immutable release view', frozen)
            self.assertIn('assets/site-theme.css', (root / "knowledge/index.html").read_text())

    def test_every_owned_entry_point_loads_shared_theme(self):
        root = Path(__file__).resolve().parents[1] / "site"
        for path in root.rglob("*.html"):
            with self.subTest(path=path):
                self.assertIn('site-theme.css', path.read_text())


if __name__ == "__main__":
    unittest.main()
