import json
import tempfile
import unittest
import threading
from pathlib import Path

from lib.consensus import ConsensusInputError, InvalidReviewError, decide
from lib.guard import ForbiddenCallError, run_checked
from lib.pipeline import CorruptStreamError, JobStore, dispatch, make_work_item
from lib.publish import DigestMismatchError, publish_accepted
from lib.roots import OutOfTreeWriteError, assert_write_allowed
from lib.select import eligibility, select_one
from tools.canonical import digest


def snapshot(nodes):
    return {
        "schema": "source-snapshot.v1", "repo_identity": "o/r",
        "source_commit": "a" * 40, "source_tree": "b" * 40,
        "derived_at": "2026-01-01T00:00:00Z",
        "deriver": {"tool": "test", "ref": "x"}, "open_set": nodes,
    }


class StateMachineRedTests(unittest.TestCase):
    def test_select_ready(self):
        s = snapshot([{"gid": "ready", "deps": [], "deps_all_closed": True}])
        self.assertEqual(eligibility(s), ["ready"])
        self.assertEqual(select_one(eligibility(s), s), ("ready", None))

    def test_select_blocked_must_skip(self):
        s = snapshot([{"gid": "blocked", "deps": ["missing"], "deps_all_closed": False}])
        self.assertIsNone(select_one(eligibility(s), s))

    def test_empty_frontier_noop(self):
        s = snapshot([])
        self.assertEqual(eligibility(s), [])
        self.assertIsNone(select_one([], s))

    def test_deterministic_tie_break(self):
        s = snapshot([
            {"gid": "a", "deps": [], "deps_all_closed": True},
            {"gid": "b", "deps": ["a"], "deps_all_closed": True},
            {"gid": "c", "deps": ["a"], "deps_all_closed": True},
        ])
        self.assertEqual(select_one(["a", "b", "c"], s), ("a", "b"))
        s2 = snapshot([
            {"gid": "z", "deps": [], "deps_all_closed": True},
            {"gid": "y", "deps": ["z"], "deps_all_closed": True},
        ])
        self.assertEqual(select_one(["z", "y"], s2), ("z", "y"))

    def test_replay_idempotent(self):
        s = snapshot([{"gid": "n", "deps": [], "deps_all_closed": True}])
        with tempfile.TemporaryDirectory() as td:
            a = dispatch(JobStore(td), make_work_item(s, ("n", None), "p1"))
            before = (Path(td) / "events" / f"{a['work_id']}.jsonl").read_bytes()
            b = dispatch(JobStore(td), make_work_item(s, ("n", None), "p1"))
            after = (Path(td) / "events" / f"{a['work_id']}.jsonl").read_bytes()
            self.assertEqual(a, b)
            self.assertEqual(before, after)

    def test_dedup_same_work_id(self):
        s = snapshot([{"gid": "n", "deps": [], "deps_all_closed": True}])
        with tempfile.TemporaryDirectory() as td:
            item1 = make_work_item(s, ("n", None), "p1")
            item2 = make_work_item(s, ("n", None), "p1")
            self.assertEqual(item1["work_id"], item2["work_id"])
            dispatch(JobStore(td), item1); dispatch(JobStore(td), item2)
            self.assertEqual(len((Path(td) / "events").glob("*.jsonl").__iter__().__next__().read_text().splitlines()), 1)

    def test_crash_recovery_rederive(self):
        s = snapshot([{"gid": "n", "deps": [], "deps_all_closed": True}])
        with tempfile.TemporaryDirectory() as td:
            item = make_work_item(s, ("n", None), "p1")
            store = JobStore(td); store.append(item["work_id"], "dispatched")
            self.assertEqual(JobStore(td).state(item["work_id"]), "dispatched")

    def test_consensus_blocking_veto(self):
        reviews = {role: {"digest": role[0] * 64, "verdict": "approve", "blocking_findings": []} for role in ("correctness", "value", "falsification")}
        reviews["correctness"]["blocking_findings"] = [{"claim_ref": "c", "finding": "bad", "evidence_pointer": "e"}]
        self.assertEqual(decide({"pass": True, "digest": "m" * 64}, reviews), "revise")

    def test_consensus_no_new_claims(self):
        reviews = {role: {"digest": role[0] * 64, "verdict": "approve", "blocking_findings": []} for role in ("correctness", "value", "falsification")}
        result = decide({"pass": True, "digest": "m" * 64}, reviews)
        self.assertIsInstance(result, str)
        with self.assertRaises(ConsensusInputError):
            decide({"pass": True, "digest": "m" * 64, "claim": "inject"}, reviews)

    def test_digest_mismatch_reject(self):
        with tempfile.TemporaryDirectory() as td:
            receipt = {"chain": {"snapshot_digest": "a" * 64}, "reviews": {"correctness": {"role": "value"}}}
            with self.assertRaises(DigestMismatchError):
                publish_accepted(td, "w" * 64, receipt, {})

    def test_out_of_tree_write_forbidden(self):
        with tempfile.TemporaryDirectory() as td:
            allowed = [Path(td) / "ok"]
            self.assertEqual(assert_write_allowed(Path(td) / "ok" / "x", allowed), Path(td) / "ok" / "x")
            with self.assertRaises(OutOfTreeWriteError):
                assert_write_allowed(Path(td).parent / "bad", allowed)

    def test_zero_github_calls(self):
        with self.assertRaises(ForbiddenCallError):
            run_checked(["gh", "repo", "view"])
        with self.assertRaises(ForbiddenCallError):
            run_checked(["git", "push"])

    def test_corrupt_stream_rejects_forged_accepted(self):
        with tempfile.TemporaryDirectory() as td:
            store = JobStore(td); wid = "a" * 64
            store.append(wid, "dispatched")
            (Path(td) / "events" / f"{wid}.jsonl").open("a").write(json.dumps({"work_id": wid, "event": "accepted"}) + "\n")
            with self.assertRaises(CorruptStreamError): store.state(wid)

    def test_corrupt_stream_rejects_truncated_tail(self):
        with tempfile.TemporaryDirectory() as td:
            wid = "b" * 64; path = Path(td) / "events" / f"{wid}.jsonl"; JobStore(td).append(wid, "dispatched")
            path.open("ab").write(b'{"work_id":"' + wid.encode() + b'","event":"producing"')
            with self.assertRaises(CorruptStreamError): JobStore(td).state(wid)

    def test_corrupt_stream_rejects_wrong_work_id(self):
        with tempfile.TemporaryDirectory() as td:
            wid = "c" * 64; JobStore(td).append(wid, "dispatched")
            with (Path(td) / "events" / f"{wid}.jsonl").open("a") as f: f.write(json.dumps({"work_id":"d"*64,"event":"producing","prev_summary": "x"})+"\n")
            with self.assertRaises(CorruptStreamError): JobStore(td).state(wid)

    def test_valid_event_chain_rederives(self):
        with tempfile.TemporaryDirectory() as td:
            wid = "e" * 64; store = JobStore(td)
            store.append(wid, "dispatched"); store.append(wid, "producing"); store.append(wid, "verifying"); store.append(wid, "consensus"); store.append(wid, "accepted")
            self.assertEqual(store.state(wid), "accepted")

    def test_concurrent_dispatch_single_event(self):
        s = snapshot([{"gid":"n","deps":[],"deps_all_closed":True}])
        with tempfile.TemporaryDirectory() as td:
            item = make_work_item(s, ("n", None), "p1"); store = JobStore(td)
            threads = [threading.Thread(target=dispatch, args=(store, item)) for _ in range(12)]
            [t.start() for t in threads]; [t.join() for t in threads]
            self.assertEqual(len((Path(td)/"events"/f"{item['work_id']}.jsonl").read_text().splitlines()), 1)

    def test_consensus_requires_blocking_findings_and_positive_attempts(self):
        reviews = {r:{"digest":"a"*64,"verdict":"approve"} for r in ("correctness","value","falsification")}
        with self.assertRaises(InvalidReviewError): decide({"pass":True,"digest":"b"*64}, reviews)
        reviews = {r:{"digest":"a"*64,"verdict":"approve","blocking_findings":[]} for r in ("correctness","value","falsification")}
        for attempt in (0, -1):
            with self.assertRaises(ConsensusInputError): decide({"pass":True,"digest":"b"*64}, reviews, attempt, 3)

    def test_consensus_budget_boundary(self):
        reviews = {r:{"digest":"a"*64,"verdict":"approve","blocking_findings":[]} for r in ("correctness","value","falsification")}
        reviews["correctness"]["blocking_findings"] = [{"finding":"x"}]
        self.assertEqual(decide({"pass":True,"digest":"b"*64}, reviews, 3, 3), "dead-letter")
        self.assertEqual(decide({"pass":True,"digest":"b"*64}, reviews, 2, 3), "revise")
        reviews["correctness"]["blocking_findings"] = []
        self.assertEqual(decide({"pass":True,"digest":"b"*64}, reviews, 1, 3), "accept")

    def test_publish_rejects_digest_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            wid = "f"*64; staging = Path(td)/"staging"/wid; staging.mkdir(parents=True)
            candidate = {"id":1}; verdict = {"pass":True}; reviews = {r:{"role":r} for r in ("correctness","value","falsification")}; decision={"outcome":"accept"}
            receipt = {"work_id":wid,"outcome":"accepted","chain":{"candidate_digest":"0"*64,"verdict_digest":digest(verdict),"review_digests":{r:digest(v) for r,v in reviews.items()},"decision_digest":digest(decision)}}
            with self.assertRaises(DigestMismatchError): publish_accepted(td,wid,receipt,{"candidate":candidate,"verdict":verdict,"reviews":reviews,"decision":decision})

    def test_publish_recovery_completes_without_orphan(self):
        with tempfile.TemporaryDirectory() as td:
            wid = "1"*64; staging = Path(td)/"staging"/wid; staging.mkdir(parents=True); (staging/"x").write_text("x")
            candidate={"id":1}; verdict={"pass":True}; reviews={r:{"role":r} for r in ("correctness","value","falsification")}; decision={"outcome":"accept"}
            receipt={"work_id":wid,"outcome":"accepted","chain":{"candidate_digest":digest(candidate),"verdict_digest":digest(verdict),"review_digests":{r:digest(v) for r,v in reviews.items()},"decision_digest":digest(decision)}}
            publish_accepted(td,wid,receipt,{"candidate":candidate,"verdict":verdict,"reviews":reviews,"decision":decision})
            self.assertTrue((Path(td)/"results"/f"{wid}.json").exists()); self.assertFalse(staging.exists())

    def test_publish_rejects_bad_work_id_and_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(DigestMismatchError): publish_accepted(td,"../escape",{}, {})
            wid="2"*64; outside=Path(td).parent/(Path(td).name + "-outside"); outside.mkdir(); (Path(td)/"staging").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(DigestMismatchError): publish_accepted(td,wid,{}, {})

    def test_guard_identifies_paths_and_git_global_options(self):
        for cmd in (["/usr/local/bin/gh","repo"],["git","-C","x","push"],["git","-c","k=v","fetch"]):
            with self.assertRaises(ForbiddenCallError): run_checked(cmd)
        for cmd in (["git","status"],["git","log"],["git","diff"]):
            self.assertNotEqual(run_checked(cmd, capture_output=True).returncode, 99)


if __name__ == "__main__":
    unittest.main()
