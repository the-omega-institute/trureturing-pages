"""Replay the published Sun joint claim that previously blocked reconciliation."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from lib.living_library import parse_problem, render_research
from lib.problem_resolutions import bind_resolutions, index_truth_export, is_kernel_verified, verify_resolutions
from lib.research_catalog import build_catalog
from lib.research_news import result_records
from lib.knowledge_spaces import build_catalog as build_spaces

FIXTURE = Path(__file__).parent / "fixtures/multi-member-resolution"
SLUG = "sun-lowercase-turan-conjecture-52"
MODULE = "D5/S1/Recurrence/Sun/"
HOST = "Blueprint/" + MODULE + "GStrict.md"
GIDS = [MODULE + "GStrict.g_strict_turan", MODULE + "VStrict.v_strict_turan"]
COMMIT = "f51660db17809b11cf6b451fa6f8d1c45fdf3dc8"
RELEASE = "sha256:e94bedc9f62e2fe85c86f5fcfadbcdc9859708416883b58f968d4ed47875e45b"


class JointResolutionTests(unittest.TestCase):
    def setUp(self):
        self.problem = parse_problem((FIXTURE / (SLUG + ".md")).read_text(), SLUG + ".md")
        self.blueprint = (FIXTURE / "GStrict.md").read_text()
        self.export = json.loads((FIXTURE / "truth-export.json").read_text())
        self.objects = {"Golden/Frozen/state/" + gid.split(".", 1)[0] + ".lean.json": "fixture" for gid in GIDS}

    def bind(self, text=None, blueprints=None, objects=None):
        return bind_resolutions([self.problem], blueprints or {HOST: self.blueprint if text is None else text},
                                self.objects if objects is None else objects)

    def verified(self):
        return verify_resolutions(self.bind(), index_truth_export(self.export))

    def snapshot(self):
        return {"schema_version": "pages-library-snapshot.v1", "truth_release_digest": RELEASE,
                "atlas_graph_digest": "sha256:" + "a" * 64,
                "graph": {"source_snapshot": {"source_repo": "the-omega-institute/trureturing",
                          "source_commit": COMMIT, "truth_release_digest": RELEASE},
                          "nodes": [{"id": gid.split(".", 1)[0], "kind": "truth", "domain": "Recurrence",
                                     "repo_path": gid.split(".", 1)[0] + ".lean"} for gid in GIDS], "edges": []},
                "problems": self.verified(), "quarantined_problems": []}

    def test_actual_release_verifies_one_claim_with_both_frozen_members(self):
        problems = self.verified()
        self.assertEqual(len(problems), 1)
        resolution = problems[0]["resolution"]
        self.assertTrue(is_kernel_verified(resolution))
        self.assertEqual(resolution["declaration_gid"], GIDS[0])
        self.assertEqual([m["declaration_gid"] for m in resolution["members"]], GIDS)
        self.assertEqual([m["kernel_verified"]["frozen_node_id"] for m in resolution["members"]],
                         [n["frozen_node_id"] for n in self.export["nodes"]])

    def test_member_order_does_not_change_binding_or_primary_host(self):
        markers = [line for line in self.blueprint.splitlines() if line.startswith("<!-- scribe-open")]
        self.assertEqual(self.bind(), self.bind("\n\n".join(reversed(markers))))

    def test_duplicate_conflicting_or_unanchored_claims_fail(self):
        markers = [line for line in self.blueprint.splitlines() if line.startswith("<!-- scribe-open")]
        for text in [self.blueprint + "\n" + markers[0],
                     markers[0] + "\n\n" + markers[1].replace('"proved"', '"refuted"'),
                     markers[1]]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.bind(text)
        with self.assertRaises(ValueError):
            self.bind(blueprints={HOST: self.blueprint, "Blueprint/" + MODULE + "VStrict.md": markers[1]})

    def test_every_member_needs_a_frozen_record(self):
        objects = dict(self.objects)
        objects.pop("Golden/Frozen/state/" + MODULE + "VStrict.lean.json")
        with self.assertRaisesRegex(ValueError, "Frozen record"):
            self.bind(objects=objects)

    def test_second_member_must_pass_every_gate_without_partial_attestation(self):
        for failure in ("missing", "status", "axioms", "no-axioms", "declaration"):
            for previously_verified in (False, True):
                with self.subTest(failure=failure, previously_verified=previously_verified):
                    export = copy.deepcopy(self.export)
                    second = export["nodes"][1]
                    if failure == "missing":
                        export["nodes"].pop()
                    elif failure == "status":
                        second["freeze_status"] = "open"
                    elif failure == "axioms":
                        second["node_axiom_closure"] = ["sorryAx"]
                    elif failure == "no-axioms":
                        del second["node_axiom_closure"]
                    else:
                        second["declarations"] = []
                    problems = self.verified() if previously_verified else self.bind()
                    with self.assertRaises(ValueError):
                        verify_resolutions(problems, index_truth_export(export))
                    resolution = problems[0]["resolution"]
                    self.assertFalse(is_kernel_verified(resolution))
                    self.assertNotIn("kernel_verified", resolution)
                    self.assertTrue(all("kernel_verified" not in m for m in resolution["members"]))

    def test_incomplete_member_attestations_do_not_publish_a_result(self):
        for members in ([], [None], self.verified()[0]["resolution"]["members"][1:],
                        self.bind()[0]["resolution"]["members"]):
            snapshot = self.snapshot()
            snapshot["problems"][0]["resolution"]["members"] = members
            with self.subTest(members=members):
                self.assertFalse(is_kernel_verified(snapshot["problems"][0]["resolution"]))
                self.assertEqual(build_catalog(snapshot)["families"], [])

    def test_catalog_news_dossier_and_spaces_preserve_joint_evidence(self):
        snapshot = self.snapshot()
        snapshot["problems"][0]["motivation_gids"] = []
        families = build_catalog(snapshot)["families"]
        records = [r for r in result_records(snapshot) if r["id"] == SLUG]
        self.assertEqual(len(families), 1)
        self.assertEqual(len(records), 1)
        self.assertEqual([m["declaration_gid"] for m in families[0]["members"]], GIDS)
        self.assertEqual(records[0]["members"], families[0]["members"])
        targets = build_spaces(snapshot)["targets"]
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0]["member_ids"], [gid.split(".", 1)[0] for gid in GIDS])
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            render_research(snapshot, output, {"path": "data/snapshot.json", "digest": RELEASE})
            dossier = (output / "research" / SLUG / "index.html").read_text()
            news = (output / "research.html").read_text()
            card = news.split('id="' + SLUG + '"', 1)[1].split('</article>', 1)[0]
            for gid in GIDS:
                self.assertIn(gid, dossier)
                self.assertIn(gid, card)
                self.assertIn('/blob/' + COMMIT + '/' + gid.split('.', 1)[0] + '.lean', card)
