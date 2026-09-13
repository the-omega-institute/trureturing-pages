import unittest

from lib.claim_audit import ALLOWED_AXIOMS, build_records, parse_axioms, summarize, verify_state


class ClaimAuditTest(unittest.TestCase):
    def test_parse_axioms_multiline_and_none_and_native(self):
        text = (
            "'A.b' depends on axioms: [propext,\n Classical.choice,\n Quot.sound]\n"
            "'A.c' does not depend on any axioms\n"
            "'A.d' depends on axioms: [propext, sorryAx]\n"
            "'A.e' depends on axioms: [Lean.ofReduceBool, propext]\n"
        )
        idx = parse_axioms(text)
        self.assertEqual(idx["A.b"], ["Classical.choice", "Quot.sound", "propext"])
        self.assertEqual(idx["A.c"], [])
        self.assertIn("sorryAx", idx["A.d"])
        self.assertIn("Lean.ofReduceBool", idx["A.e"])

    def test_verify_state_pass_fail_and_native_rejected(self):
        fam = {"declaration_gid": "D5/S1/M.thm"}
        self.assertEqual(verify_state(fam, {"D5.S1.M.thm": sorted(ALLOWED_AXIOMS)})["status"], "pass")
        self.assertEqual(verify_state(fam, {"D5.S1.M.thm": ["sorryAx"]})["status"], "fail")
        self.assertEqual(verify_state(fam, {"D5.S1.M.thm": ["Lean.ofReduceBool"]})["status"], "fail")
        self.assertEqual(verify_state(fam, {})["status"], "unverified")

    def test_verify_state_parent_namespace_fallback(self):
        # namespace equals the parent directory, not the full module path
        fam = {"declaration_gid": "D5/S1/Words/Complexity/ThueMorseX.reducedAbelianComplexity_odd"}
        idx = {"D5.S1.Words.Complexity.reducedAbelianComplexity_odd": ["propext"]}
        state = verify_state(fam, idx)
        self.assertEqual(state["status"], "pass")
        self.assertEqual(state["declaration"], "D5.S1.Words.Complexity.reducedAbelianComplexity_odd")

    def test_build_records_keeps_four_states_distinct(self):
        catalog = {
            "revision": "r1", "source_commit": "abc",
            "families": [{
                "id": "oeis-a1-foo", "title": "Foo", "kind": "proved",
                "declaration_gid": "D5/S1/M.thm", "source_url": "https://oeis.org/A1",
                "source_commit": "abc",
                "kernel_verified": {"freeze_status": "frozen", "frozen_node_id": "sha256:dead"},
            }],
        }
        axioms = {"D5.S1.M.thm": sorted(ALLOWED_AXIOMS)}
        literature = [{"id": "oeis-a1-foo", "resolves": True, "http_status": 200, "final_url": "https://oeis.org/A1"}]
        audit = build_records(catalog, axioms, literature)
        states = audit["records"][0]["states"]
        self.assertEqual(states["formal_verification"]["status"], "pass")
        self.assertEqual(states["literature_source"]["status"], "pass")
        # fidelity is not implied by the Lean run; it stays machine-unverified
        self.assertEqual(states["statement_fidelity"]["status"], "machine-unverified")
        self.assertEqual(states["in_truth_release"]["status"], "pass")
        s = summarize(audit)
        self.assertEqual(s["formal_verification_pass"], 1)
        self.assertEqual(s["statement_fidelity_reviewed"], 0)

    def test_disallowed_axiom_does_not_pass(self):
        catalog = {"families": [{
            "id": "x", "title": "X", "kind": "proved", "declaration_gid": "D5/M.t",
            "source_url": "u", "source_commit": "c", "kernel_verified": {},
        }]}
        audit = build_records(catalog, {"D5.M.t": ["myPrivateAxiom", "propext"]}, [])
        self.assertEqual(audit["records"][0]["states"]["formal_verification"]["status"], "fail")


if __name__ == "__main__":
    unittest.main()
