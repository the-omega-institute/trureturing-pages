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
from unittest.mock import patch

from lib import vertical_smoke


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
    def test_artifact_bounds_apply_to_both_extracted_and_local_files(self):
        # Actual sparse file sizes exercise the former 512 MiB boundary without
        # allocating report payloads.
        cases = [('raw-lean-report.json', 512 * 1024 * 1024 + 1, True),
                 ('raw-lean-report.json', vertical_smoke.MAX_RAW_REPORT_BYTES, True),
                 ('raw-lean-report.json', vertical_smoke.MAX_RAW_REPORT_BYTES + 1, False),
                 ('truth-export.v1.json', vertical_smoke.MAX_FILE_BYTES + 1, False),
                 ('other.json', vertical_smoke.MAX_FILE_BYTES + 1, False)]
        for name, size, accepted in cases:
            with self.subTest(name=name, size=size), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                bundle = root / 'bundle'
                bundle.mkdir()
                with (bundle / name).open('wb') as output:
                    output.truncate(size)
                if accepted:
                    vertical_smoke._verify_root_files(bundle)
                else:
                    with self.assertRaisesRegex(ReleaseContractError, 'per-file limit'):
                        vertical_smoke._verify_root_files(bundle)

        # Exercise archive admission with scaled payloads and normalized names.
        for name, size, accepted in [('raw-lean-report.json', 32, True),
                                     ('raw-lean-report.json', 33, False),
                                     ('truth-export.v1.json', 17, False)]:
            with self.subTest(archive_member=name, size=size), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                archive = root / 'bundle.tar.gz'
                with tarfile.open(archive, 'w:gz') as output:
                    member = tarfile.TarInfo('./' + name)
                    member.size = size
                    output.addfile(member, io.BytesIO(b'x' * size))
                with patch.object(vertical_smoke, 'MAX_FILE_BYTES', 16), \
                     patch.object(vertical_smoke, 'MAX_RAW_REPORT_BYTES', 32):
                    if accepted:
                        extract_archive(archive, root / 'extracted')
                        self.assertEqual((root / 'extracted' / name).stat().st_size, size)
                    else:
                        with self.assertRaisesRegex(ReleaseContractError, 'per-file limit'):
                            extract_archive(archive, root / 'extracted')

    def test_larger_report_still_respects_aggregate_bundle_bound(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bundle = root / 'bundle'
            bundle.mkdir()
            for name, size in [('raw-lean-report.json', 16), ('truth-export.v1.json', 8)]:
                (bundle / name).write_bytes(b'x' * size)
            archive = root / 'bundle.tar.gz'
            with tarfile.open(archive, 'w:gz') as output:
                for path in bundle.iterdir():
                    output.add(path, arcname=path.name)
            with patch.object(vertical_smoke, 'MAX_BUNDLE_BYTES', 23):
                with self.assertRaisesRegex(ReleaseContractError, 'expanded-size limit'):
                    vertical_smoke._verify_root_files(bundle)
                with self.assertRaisesRegex(ReleaseContractError, 'expanded-size limit'):
                    extract_archive(archive, root / 'extracted')

    @staticmethod
    def rebind_bundle(bundle):
        """Recompute transport hashes after an intentional fixture mutation."""
        manifest_path = bundle / "release-manifest.v1.json"
        manifest = json.loads(manifest_path.read_text())
        for artifact in manifest["artifacts"].values():
            artifact["sha256"] = "sha256:" + hashlib.sha256((bundle / artifact["file"]).read_bytes()).hexdigest()
        sums = "".join(f'{artifact["sha256"][7:]}  {artifact["file"]}\n'
                       for artifact in sorted(manifest["artifacts"].values(), key=lambda artifact: artifact["file"]))
        (bundle / "SHA256SUMS").write_text(sums)
        release_digest = "sha256:" + hashlib.sha256(sums.encode()).hexdigest()
        manifest["sha256sums_digest"] = release_digest
        manifest_path.write_text(json.dumps(manifest))
        publication_path = bundle / "truth-release-publication.v1.json"
        publication = json.loads(publication_path.read_text())
        publication.update(release_digest=release_digest, bundle_ref=release_digest)
        publication_path.write_text(json.dumps(publication))
        return release_digest

    @classmethod
    def v2_bundle(cls, directory):
        # The existing upstream v2 writer removes the residual artifact and its
        # snapshot hash, while retaining the v1 transport filenames.
        bundle = Path(directory) / "bundle"
        shutil.copytree(FIXTURE, bundle)
        (bundle / "echo-residual-summary.md").unlink()
        snapshot_path = bundle / "source-snapshot.v1.json"
        snapshot = json.loads(snapshot_path.read_text())
        snapshot["schema"] = "source-snapshot.v2"
        del snapshot["residual_frontier_sha256"]
        snapshot_path.write_text(json.dumps(snapshot))
        manifest_path = bundle / "release-manifest.v1.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["schema"] = "truth-release.v2"
        del manifest["artifacts"]["residual_frontier"]
        manifest_path.write_text(json.dumps(manifest))
        return bundle, cls.rebind_bundle(bundle)

    @classmethod
    def state_table_bundle(cls, directory, schema="truth-release"):
        bundle, _ = cls.v2_bundle(directory)
        (bundle / "frozen-ledger-head.json").unlink()
        snapshot_path = bundle / "source-snapshot.v1.json"
        snapshot = json.loads(snapshot_path.read_text())
        snapshot["schema"] = "source-snapshot"
        del snapshot["frozen_ledger_head_hash"]
        del snapshot["frozen_ledger_sequence"]
        snapshot_path.write_text(json.dumps(snapshot))
        manifest_path = bundle / "release-manifest.v1.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["schema"] = schema
        del manifest["artifacts"]["frozen_ledger_head"]
        manifest_path.write_text(json.dumps(manifest))
        return bundle, cls.rebind_bundle(bundle)

    def test_verified_publication_projects_paired_tetrahedron_mixed_and_legacy(self):
        from lib.atlas_admission import project_evidence

        with tempfile.TemporaryDirectory() as directory:
            bundle, _ = self.state_table_bundle(directory, "truth-release-scheduled")
            snapshot = json.loads((bundle / "source-snapshot.v1.json").read_text())
            graph = json.loads((bundle / "truth-graph.v1.json").read_text())
            node = graph["truth"]["nodes"][0]
            path = "D5/S3/Quantum/AURICOmega/RationalBlochTetrahedron.lean"
            node.update(repo_path=path)
            tetra_key = "ns(ns(ns(ns(ns(ns(n0,2:D5),2:S3),7:Quantum),10:AURICOmega),24:RationalBlochTetrahedron),38:no_rational_bloch_tetrahedral_triangle)"
            digest = lambda char: "sha256:" + char * 64
            declarations = [
                {"declaration_name_key": tetra_key, "kind": "theorem", "statement_id": digest("1"),
                 "libraries": ["Init", "OmegaMath"], "axioms": ["propext"],
                 "strict_omega": {"declaration_name_key": tetra_key, "kind": "theorem",
                                  "statement_type_address": digest("2"), "official_statement_type_address": digest("3"),
                                  "libraries": ["OmegaInit", "OmegaMath"], "axioms": []}},
                {"declaration_name_key": "mixed", "kind": "theorem", "statement_id": digest("4"),
                 "libraries": ["Init", "Mathlib", "OmegaMathlib"], "axioms": ["Classical.choice", "Quot.sound", "propext"],
                 "strict_omega": {"declaration_name_key": "mixed", "kind": "theorem",
                                  "statement_type_address": digest("5"), "official_statement_type_address": digest("6"),
                                  "libraries": ["Mathlib", "OmegaMathlib"], "axioms": ["propext"]}},
                {"declaration_name_key": "legacy", "kind": "theorem", "statement_id": digest("7"),
                 "libraries": ["OmegaMath"], "axioms": [], "omega_only_axiom_free": True},
            ]
            node["strict_omega_declarations"] = copy.deepcopy(declarations[:2])
            export = {"schema_version": 2, "dialect": "stratalint.truth-export.v2",
                      "source_commit": snapshot["source_commit"], "source_tree": snapshot["source_tree"],
                      "nodes": [{"repo_path": path, "freeze_status": "frozen", "frozen_node_id": digest("8"),
                                 "node_axiom_closure": ["Classical.choice", "Quot.sound", "propext"],
                                 "declarations": declarations}]}
            receipts = [{"name": "D5.S3.Quantum.AURICOmega.RationalBlochTetrahedron." + name,
                         "name_key": row["declaration_name_key"], "kind": row["kind"], "statement_id": row["statement_id"],
                         "type_sha256": row.get("strict_omega", {}).get("official_statement_type_address", digest("9")),
                         "include_in_statement": True, "axioms": row["axioms"]}
                        for name, row in zip(("no_rational_bloch_tetrahedral_triangle", "mixed", "legacy"), declarations)]
            report = {"schema": "stratalint-raw-lean-report-v3", "modules": [{"source_path": path,
                      "source_sha256": digest("a"), "declarations": receipts}]}

            def publish():
                for name, value in [("truth-export.v1.json", export), ("truth-graph.v1.json", graph), ("raw-lean-report.json", report)]:
                    (bundle / name).write_text(json.dumps(value))
                for field, name in [("declarations_sha256", "truth-export.v1.json"),
                                    ("truth_graph_sha256", "truth-graph.v1.json"), ("raw_lean_report_sha256", "raw-lean-report.json")]:
                    snapshot[field] = vertical_smoke._sha256(bundle / name)
                (bundle / "source-snapshot.v1.json").write_text(json.dumps(snapshot))
                return self.rebind_bundle(bundle)

            verified = verify_bundle(bundle, publish())
            details = project_evidence(bundle, verified)["nodes"][0]["declarations"]
            self.assertEqual(details[0]["measurement"]["axioms"], ["propext"])
            self.assertEqual(details[0]["measurement"]["strict_omega"], declarations[0]["strict_omega"])
            self.assertEqual(details[1]["measurement"]["strict_omega"]["axioms"], ["propext"])
            self.assertEqual(details[1]["measurement"]["axioms"], ["Classical.choice", "Quot.sound", "propext"])
            self.assertNotIn("strict_omega", details[2]["measurement"])
            self.assertTrue(details[2]["measurement"]["omega_only_axiom_free"])

            node["strict_omega_declarations"][0]["strict_omega"]["axioms"] = ["propext"]
            with self.assertRaisesRegex(ReleaseContractError, "disagree between truth export and graph"):
                verify_bundle(bundle, publish())
            node["strict_omega_declarations"] = copy.deepcopy(declarations[:2])
            receipts[0]["type_sha256"] = digest("b")
            with self.assertRaisesRegex(ReleaseContractError, "crossed strict Omega"):
                project_evidence(bundle, verify_bundle(bundle, publish()))

    def test_scheduled_state_table_bundle_preserves_transport_source_and_projection(self):
        from lib.upstream_publication import publication_metadata
        with tempfile.TemporaryDirectory() as directory:
            bundle, digest = self.state_table_bundle(directory, "truth-release-scheduled")
            archive = Path(directory) / "scheduled.tar.gz"
            with tarfile.open(archive, "w:gz") as output:
                for path in bundle.iterdir():output.add(path, arcname=path.name)
            acquired = Path(directory) / "acquired"
            extract_archive(archive, acquired)
            verified = verify_bundle(acquired, digest)
            selection = {"source_commit": verified["source_commit"], "source_tree": verified["source_tree"],
                         "ci_run_id": 42, "should_build": True}
            self.assertEqual(publication_metadata(selection, acquired)["release_digest"], digest)
            site = Path(directory) / "site"
            build_basic_site(acquired, site)
            basic = json.loads((site / "data/basic-truth-graph.v1.json").read_text())
            self.assertEqual(basic["source_snapshot"]["truth_release_digest"], digest)
            self.assertEqual(basic["source_snapshot"]["source_commit"], verified["source_commit"])

    def test_scheduled_state_table_does_not_relax_artifact_or_snapshot_admission(self):
        for mutation in ("changed-bytes", "swapped-roles", "rebound-old-snapshot", "rebound-source", "unknown"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                bundle, _ = self.state_table_bundle(directory, "truth-release-scheduled")
                path = bundle / "release-manifest.v1.json"
                manifest = json.loads(path.read_text())
                if mutation == "changed-bytes":
                    (bundle / "raw-lean-report.json").write_text("different report")
                elif mutation == "swapped-roles":
                    roles = manifest["artifacts"]
                    roles["truth_graph"], roles["raw_lean_report"] = roles["raw_lean_report"], roles["truth_graph"]
                    path.write_text(json.dumps(manifest))
                elif mutation == "unknown":
                    manifest["schema"] = "truth-release-scheduled.v99"
                    path.write_text(json.dumps(manifest))
                else:
                    snapshot_path = bundle / "source-snapshot.v1.json"
                    snapshot = json.loads(snapshot_path.read_text())
                    if mutation == "rebound-old-snapshot":snapshot["schema"] = "source-snapshot.v2"
                    else:snapshot["source_commit"] = "a" * 40
                    snapshot_path.write_text(json.dumps(snapshot))
                    self.rebind_bundle(bundle)
                with self.assertRaises(ReleaseContractError):verify_bundle(bundle)

    def test_state_table_bundle_reaches_metadata_archive_and_basic_site(self):
        from lib.upstream_publication import publication_metadata
        with tempfile.TemporaryDirectory() as directory:
            bundle, digest = self.state_table_bundle(directory)
            archive = Path(directory) / "bundle.tar.gz"
            with tarfile.open(archive, "w:gz") as output:
                for path in bundle.iterdir():
                    output.add(path, arcname=path.name)
            acquired = Path(directory) / "acquired"
            extract_archive(archive, acquired)
            verified = verify_bundle(acquired, digest)
            selection = {"source_commit": verified["source_commit"], "source_tree": verified["source_tree"],
                         "ci_run_id": 42, "should_build": True}
            self.assertEqual(publication_metadata(selection, acquired)["release_digest"], digest)
            site = Path(directory) / "site"
            build_basic_site(acquired, site)
            basic = json.loads((site / "data/basic-truth-graph.v1.json").read_text())
            self.assertEqual(basic["counts"]["truth_nodes"], 4)
            self.assertEqual(basic["source_snapshot"]["truth_release_digest"], digest)

    def test_state_table_rejects_missing_extra_changed_and_swapped_artifacts(self):
        for mutation in ("missing", "extra", "changed", "swapped"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                bundle, _ = self.state_table_bundle(directory)
                if mutation == "missing":
                    (bundle / "raw-lean-report.json").unlink()
                elif mutation == "extra":
                    (bundle / "frozen-ledger-head.json").write_text("old ledger")
                elif mutation == "changed":
                    (bundle / "raw-lean-report.json").write_text("changed bytes")
                else:
                    path = bundle / "release-manifest.v1.json"
                    manifest = json.loads(path.read_text())
                    artifacts = manifest["artifacts"]
                    artifacts["truth_graph"], artifacts["raw_lean_report"] = artifacts["raw_lean_report"], artifacts["truth_graph"]
                    path.write_text(json.dumps(manifest))
                with self.assertRaises(ReleaseContractError):
                    verify_bundle(bundle)

    def test_state_table_rejects_rebound_old_snapshot_and_ledger_fields(self):
        for field, value in (("schema", "source-snapshot.v2"), ("frozen_ledger_sequence", 0),
                             ("frozen_ledger_head_hash", "sha256:" + "0" * 64)):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                bundle, _ = self.state_table_bundle(directory)
                path = bundle / "source-snapshot.v1.json"
                snapshot = json.loads(path.read_text())
                snapshot[field] = value
                path.write_text(json.dumps(snapshot))
                self.rebind_bundle(bundle)
                with self.assertRaisesRegex(ReleaseContractError, "snapshot"):
                    verify_bundle(bundle)

    def test_state_table_rejects_rehashed_snapshot_with_conflicting_identity_or_hash(self):
        for field, value in (("source_repo", "other/repository"), ("source_commit", "a" * 40),
                             ("source_tree", "a" * 40), ("producer_package_commit", "a" * 40),
                             ("truth_graph_sha256", "sha256:" + "0" * 64),
                             ("raw_lean_report_sha256", "sha256:" + "0" * 64),
                             ("declarations_sha256", "sha256:" + "0" * 64)):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                bundle, _ = self.state_table_bundle(directory)
                path = bundle / "source-snapshot.v1.json"
                snapshot = json.loads(path.read_text())
                snapshot[field] = value
                path.write_text(json.dumps(snapshot))
                self.rebind_bundle(bundle)
                with self.assertRaisesRegex(ReleaseContractError, "source snapshot"):
                    verify_bundle(bundle)

    def test_mock_bundle_is_exactly_bound_and_bounded(self):
        verified = verify_bundle(FIXTURE, RELEASE_DIGEST)
        self.assertEqual(verified["release_digest"], RELEASE_DIGEST)
        self.assertEqual(verified["truth_graph"], "truth-graph.v1.json")

    def test_v2_bundle_reaches_publication_metadata_and_basic_site(self):
        from lib.upstream_publication import publication_metadata
        with tempfile.TemporaryDirectory() as directory:
            bundle, digest = self.v2_bundle(directory)
            verified = verify_bundle(bundle, digest)
            selection = {"source_commit": verified["source_commit"], "source_tree": verified["source_tree"],
                         "ci_run_id": 42, "should_build": True}
            self.assertEqual(publication_metadata(selection, bundle)["release_digest"], digest)
            with self.assertRaisesRegex(ValueError, "differs from selected"):
                publication_metadata({**selection, "source_commit": "a" * 40}, bundle)
            site = Path(directory) / "site"
            build_basic_site(bundle, site)
            self.assertEqual(json.loads((site / "data/verified-truth-release.v1.json").read_text())["release_digest"], digest)
            self.assertEqual(json.loads((site / "data/basic-truth-graph.v1.json").read_text())["counts"]["truth_nodes"], 4)

    def test_v2_rejects_missing_extra_and_changed_artifacts(self):
        for mutation in ("missing", "extra", "changed"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                bundle, _ = self.v2_bundle(directory)
                if mutation == "missing":
                    (bundle / "raw-lean-report.json").unlink()
                elif mutation == "extra":
                    (bundle / "echo-residual-summary.md").write_text("old residual")
                else:
                    (bundle / "raw-lean-report.json").write_text("changed bytes")
                with self.assertRaises(ReleaseContractError):
                    verify_bundle(bundle)

    def test_v2_rejects_unknown_mixed_and_swapped_role_contracts(self):
        for mutation in ("unknown", "v1", "roles", "swapped"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                bundle, _ = self.v2_bundle(directory)
                path = bundle / "release-manifest.v1.json"
                manifest = json.loads(path.read_text())
                if mutation in ("unknown", "v1"):
                    manifest["schema"] = "truth-release.v3" if mutation == "unknown" else "truth-release.v1"
                elif mutation == "roles":
                    manifest["artifacts"]["residual_frontier"] = manifest["artifacts"].pop("raw_lean_report")
                else:
                    artifacts = manifest["artifacts"]
                    artifacts["truth_graph"], artifacts["raw_lean_report"] = artifacts["raw_lean_report"], artifacts["truth_graph"]
                path.write_text(json.dumps(manifest))
                with self.assertRaises(ReleaseContractError):
                    verify_bundle(bundle)

    def test_v2_rejects_cryptographically_rebound_snapshot_of_another_version(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, _ = self.v2_bundle(directory)
            path = bundle / "source-snapshot.v1.json"
            snapshot = json.loads(path.read_text())
            snapshot["schema"] = "source-snapshot.v1"
            path.write_text(json.dumps(snapshot))
            self.rebind_bundle(bundle)
            with self.assertRaisesRegex(ReleaseContractError, "snapshot schema"):
                verify_bundle(bundle)

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
            self.assertEqual((site / "data/truth-export.v1.json").read_bytes(),
                             (FIXTURE / "truth-export.v1.json").read_bytes())
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
