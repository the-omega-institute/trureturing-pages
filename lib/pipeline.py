import json
import os
import fcntl
from datetime import datetime, timezone
from pathlib import Path
from tools.workid import derive_work_id
from tools.canonical import digest

class CorruptStreamError(ValueError):
    pass

EVENTS = ("dispatched", "producing", "verifying", "consensus", "accepted", "revise", "dead-letter")
TRANSITIONS = {None: {"dispatched"}, "dispatched": {"producing"}, "producing": {"verifying"}, "verifying": {"consensus"}, "consensus": {"accepted", "revise", "dead-letter"}, "revise": {"producing"}, "accepted": set(), "dead-letter": set()}

def _now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def make_work_item(snapshot, selection, pipeline_version):
    winner, runner = selection
    work_id = derive_work_id(snapshot["source_commit"], winner, pipeline_version)
    nodes = {n["gid"]: n for n in snapshot.get("open_set", [])}
    unlocks = sum(1 for n in nodes.values() if winner in n.get("deps", []))
    visiting, depths = set(), {}
    def depth(gid):
        if gid in depths: return depths[gid]
        if gid in visiting: raise ValueError("dependency cycle")
        visiting.add(gid)
        depths[gid] = max((depth(d) + 1 for d in nodes.get(gid, {}).get("deps", []) if d in nodes), default=0)
        visiting.remove(gid)
        return depths[gid]
    winner_depth = depth(winner)
    return {"schema": "work-item.v1", "work_id": work_id, "node_gid": winner,
            "source_commit": snapshot["source_commit"], "pipeline_version": pipeline_version,
            "eligibility": {"state": "Open", "deps_all_closed": True},
            "selection": {"tie_break": {"unlocks": unlocks, "depth": winner_depth, "gid": winner}, "runner_up": runner},
            "created_at": snapshot.get("derived_at", _now())}

class JobStore:
    def __init__(self, durable_dir):
        self.root = Path(durable_dir); self.events = self.root / "events"; self.events.mkdir(parents=True, exist_ok=True)
    def _path(self, work_id):
        if not isinstance(work_id, str) or len(work_id) != 64 or any(c not in "0123456789abcdef" for c in work_id):
            raise CorruptStreamError("invalid work_id")
        return self.events / f"{work_id}.jsonl"
    def append(self, work_id, event, data=None):
        if not isinstance(work_id, str) or len(work_id) != 64 or any(c not in "0123456789abcdef" for c in work_id):
            raise ValueError("invalid work_id")
        if event not in EVENTS: raise ValueError("invalid event")
        path = self._path(work_id)
        lock_path = self.events / f"{work_id}.lock"
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            records = self._read_records(path) if path.exists() else []
            current = records[-1]["event"] if records else None
            if event in ("dispatched",) and current == event: return
            if event not in TRANSITIONS[current]: raise ValueError("invalid state transition")
            record = {"work_id": work_id, "event": event}
            if records: record["prev_summary"] = digest(records[-1])
            if data is not None: record["data"] = data
            with path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n")
                stream.flush(); os.fsync(stream.fileno())
            fcntl.flock(lock, fcntl.LOCK_UN)

    def _read_records(self, path):
        try: raw = path.read_bytes()
        except OSError as exc: raise CorruptStreamError(str(exc)) from exc
        if raw and not raw.endswith(b"\n"): raise CorruptStreamError("truncated event line")
        records = []
        for line in raw.splitlines():
            try: rec = json.loads(line)
            except (json.JSONDecodeError, UnicodeDecodeError) as exc: raise CorruptStreamError("invalid event json") from exc
            if not isinstance(rec, dict) or rec.get("work_id") != path.stem or rec.get("event") not in EVENTS:
                raise CorruptStreamError("invalid event record")
            if records:
                if rec.get("prev_summary") != digest(records[-1]): raise CorruptStreamError("broken event hash chain")
            elif "prev_summary" in rec: raise CorruptStreamError("unexpected chain head")
            if rec["event"] not in TRANSITIONS[records[-1]["event"] if records else None]:
                raise CorruptStreamError("invalid event transition")
            records.append(rec)
        return records
    def state(self, work_id):
        path = self._path(work_id)
        if not path.exists(): return None
        records = self._read_records(path)
        return records[-1]["event"] if records else None

    def rederive(self, snapshot=None, results_dir=None):
        """Reconstruct all known job states solely from append-only events/results."""
        states = {}
        for path in sorted(self.events.glob("*.jsonl")):
            try: states[path.stem] = self.state(path.stem)
            except CorruptStreamError: states[path.stem] = "corrupted"
        if results_dir:
            for path in Path(results_dir).glob("*.json"):
                states.setdefault(path.stem, "completed")
        return states

def dispatch(store, work_item):
    work_id = work_item["work_id"]
    if store.state(work_id) is None:
        store.append(work_id, "dispatched", {"work_item": work_item})
    return work_item
