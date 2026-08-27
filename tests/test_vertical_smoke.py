import copy
import hashlib
import io
import json
import shutil
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.vertical_smoke import (  # noqa: E402
    ReleaseContractError,
    TOPOLOGY_PRODUCER_COMMIT,
    TOPOLOGY_VERSION,
    assess_freshness,
    build_basic_site,
    extract_archive,
    project_basic_dag,
    verify_bundle,
    write_deployment_manifest,
)


FIXTURE = ROOT / "tests" / "fixtures" / "truth-release"
RELEASE_DIGEST = "sha256:6263c6c313abc29ca5b27309f30012c643794d07916d5d9ea0cf01b0ce7d8d20"


class VerticalSmokeTests(unittest.TestCase):
    def test_mock_bundle_is_exactly_bound_and_bounded(self):
        verified = verify_bundle(FIXTURE, RELEASE_DIGEST)
        self.assertEqual(verified["release_digest"], RELEASE_DIGEST)
        self.assertEqual(verified["truth_graph"], "truth-graph.v1.json")

    def test_wrong_requested_digest_and_changed_artifact_fail_closed(self):
        with self.assertRaises(ReleaseContractError):
            verify_bundle(FIXTURE, "sha256:" + "0" * 64)
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / "bundle"
            shutil.copytree(FIXTURE, bundle)
            with (bundle / "truth-graph.v1.json").open("a", encoding="utf-8") as stream:
                stream.write("\n")
            with self.assertRaises(ReleaseContractError):
                verify_bundle(bundle)

    def test_archive_path_traversal_is_rejected_before_writing_member(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "hostile.tar.gz"
            with tarfile.open(archive, "w:gz") as output:
                member = tarfile.TarInfo("../outside")
                payload = b"hostile"
                member.size = len(payload)
                output.addfile(member, io.BytesIO(payload))
            destination = Path(directory) / "output"
            with self.assertRaises(ReleaseContractError):
                extract_archive(archive, destination)
            self.assertFalse((Path(directory) / "outside").exists())

    def test_basic_graph_contains_all_states_dependencies_and_blueprint_links(self):
        verified = verify_bundle(FIXTURE)
        graph = project_basic_dag(FIXTURE, verified)
        self.assertEqual(
            {"closed", "open", "tail", "semantic"},
            {node["state"] for node in graph["nodes"]},
        )
        self.assertEqual(graph["counts"]["truth_nodes"], 4)
        self.assertEqual(graph["counts"]["blueprint_nodes"], 2)
        self.assertEqual(graph["counts"]["truth_edges"], 3)
        self.assertEqual(graph["counts"]["blueprint_links"], 3)
        self.assertEqual(
            {"blueprint-dependency", "blueprint-truth-anchor", "truth-dependency"},
            {edge["layer"] for edge in graph["edges"]},
        )
        self.assertEqual(graph["source_snapshot"]["truth_release_digest"], RELEASE_DIGEST)

    def test_basic_site_is_an_atomic_build_input_for_enrichment(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / "site"
            build_basic_site(FIXTURE, site)
            basic = json.loads((site / "data" / "basic-truth-graph.v1.json").read_text())
            fallback = json.loads((site / "data" / "truth-graph.v1.json").read_text())
            self.assertEqual(basic, fallback)
            self.assertTrue((site / "dag.html").is_file())
            self.assertFalse((site / "data" / "certified-topology-view.v1.json").exists())

    def test_deployment_manifest_binds_views_package_and_decimal_measurement(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / "site"
            build_basic_site(FIXTURE, site)
            profile = ROOT / "config" / "algorithm-profile.v1.json"
            topology = site / "data" / "certified-topology.v1.json"
            topology.write_text(json.dumps({
                "truth_release_digest": RELEASE_DIGEST,
                "producer_commit": TOPOLOGY_PRODUCER_COMMIT,
                "algorithm_profile_digest": f"sha256:{hashlib.sha256(profile.read_bytes()).hexdigest()}",
            }))
            metrics = Path(directory) / "metrics.json"
            metrics.write_text(json.dumps({
                "schema": "topology-measurement.v1",
                "elapsed_seconds": 0.04,
                "max_rss_kib": 32768,
            }))
            manifest = write_deployment_manifest(
                site, topology, "1" * 40, "2" * 40, metrics)
            self.assertEqual(manifest["release_digest"], RELEASE_DIGEST)
            self.assertEqual(manifest["topology_version"], TOPOLOGY_VERSION)
            self.assertEqual(manifest["topology_measurement"]["elapsed_seconds"], 0.04)
            self.assertEqual(
                manifest["views"]["enriched"],
                "data/certified-topology-view.v1.json",
            )

    @staticmethod
    def manifest(digest=RELEASE_DIGEST, commit="a" * 40, tree="b" * 40, version=TOPOLOGY_VERSION):
        return {
            "schema": "pages-deployment-manifest.v1",
            "release_digest": digest,
            "source_commit": commit,
            "source_tree": tree,
            "topology_version": version,
        }

    def test_freshness_is_initial_or_idempotent_for_same_binding(self):
        incoming = self.manifest()
        self.assertEqual(assess_freshness(incoming, None)["decision"], "initial")
        self.assertEqual(assess_freshness(incoming, copy.deepcopy(incoming))["decision"], "idempotent")

    def test_freshness_requires_ancestry_for_a_different_release(self):
        current = self.manifest()
        incoming = self.manifest(digest="sha256:" + "c" * 64, commit="d" * 40, tree="e" * 40)
        decision = assess_freshness(incoming, current)
        self.assertEqual(decision["decision"], "candidate-advance")
        self.assertTrue(decision["requires_ancestry_check"])
        self.assertEqual(decision["current_source_commit"], "a" * 40)

    def test_freshness_rejects_rebinding_and_older_topology(self):
        current = self.manifest()
        rebound = self.manifest(tree="c" * 40)
        with self.assertRaises(ReleaseContractError):
            assess_freshness(rebound, current)
        older = self.manifest(
            digest="sha256:" + "d" * 64,
            commit="e" * 40,
            tree="f" * 40,
            version="0.1.0-alpha.0",
        )
        with self.assertRaises(ReleaseContractError):
            assess_freshness(older, current)


if __name__ == "__main__":
    unittest.main()
