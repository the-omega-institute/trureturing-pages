import json
import os
import re
import shutil
from pathlib import Path

from tools.canonical import digest
from .roots import assert_write_allowed

class DigestMismatchError(ValueError):
    pass

_SEATS = {"correctness", "value", "falsification"}

def _check_path(path, root):
    path = Path(path)
    try:
        root_real = Path(os.path.realpath(root))
        path_real = Path(os.path.realpath(path))
        if os.path.commonpath((str(path_real), str(root_real))) != str(root_real):
            raise DigestMismatchError("derived path escapes root")
        current = Path(root)
        for component in [None, *path.relative_to(root).parts]:
            if component is not None: current = current / component
            if current.is_symlink():
                raise DigestMismatchError("symlink path component forbidden")
    except ValueError as exc:
        raise DigestMismatchError("invalid path") from exc
    return path

def _validate_receipt(work_id, receipt, artifacts):
    if not re.fullmatch(r"[0-9a-f]{64}", work_id): raise DigestMismatchError("invalid work_id")
    if not isinstance(receipt, dict) or receipt.get("work_id", work_id) != work_id or receipt.get("outcome") != "accepted":
        raise DigestMismatchError("invalid receipt")
    chain = receipt.get("chain")
    if not isinstance(chain, dict): raise DigestMismatchError("missing receipt chain")
    reviews = chain.get("reviews", artifacts.get("reviews", {}))
    if set(reviews) != _SEATS: raise DigestMismatchError("accepted requires all review seats")
    if artifacts:
        candidate = artifacts.get("candidate")
        verdict = artifacts.get("verdict")
        decision = artifacts.get("decision")
        if candidate is not None:
            expected = digest(candidate)
            refs = chain.get("candidates")
            recorded = chain.get("candidate_digest")
            if refs is not None:
                if not refs or refs[-1].get("digest") != expected: raise DigestMismatchError("candidate digest mismatch")
            elif recorded != expected: raise DigestMismatchError("candidate digest mismatch")
        if verdict is not None:
            expected = digest(verdict)
            refs = chain.get("verdicts")
            recorded = chain.get("verdict_digest")
            if refs is not None:
                if not refs or refs[-1].get("digest") != expected: raise DigestMismatchError("verdict digest mismatch")
            elif recorded != expected: raise DigestMismatchError("verdict digest mismatch")
        if decision is not None and chain.get("decision_digest") != digest(decision):
            raise DigestMismatchError("decision digest mismatch")
        if "reviews" in artifacts:
            for seat in _SEATS:
                expected = digest(artifacts["reviews"][seat])
                ref = chain.get("reviews", {}).get(seat)
                if ref is None: continue
                recorded = ref.get("digest") if isinstance(ref, dict) else ref
                if recorded != expected: raise DigestMismatchError(f"review digest mismatch: {seat}")
    return chain

def publish_accepted(root, work_id, receipt, artifacts):
    root = Path(root)
    staging = root / "staging" / work_id
    content = root / "content" / "research" / work_id
    results = root / "results"
    assert_write_allowed(root, [root])
    for path in (staging, content, results, results / f"{work_id}.json"):
        _check_path(path, root)
    artifacts = artifacts if isinstance(artifacts, dict) else {}
    _validate_receipt(work_id, receipt, artifacts)
    result_path = results / f"{work_id}.json"
    temp_receipt = results / f".{work_id}.json.tmp"
    results.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if result_path.exists() and content.exists(): return content
    with temp_receipt.open("wb") as stream:
        stream.write(payload); stream.flush(); os.fsync(stream.fileno())
    if staging.exists():
        content.parent.mkdir(parents=True, exist_ok=True)
        if content.exists(): shutil.rmtree(content)
        os.replace(staging, content)
    elif not content.exists():
        raise DigestMismatchError("missing staging")
    os.replace(temp_receipt, result_path)
    return content

def rederive_publish(root, work_id, receipt, artifacts):
    return publish_accepted(root, work_id, receipt, artifacts)

def rederive(root, work_id, receipt, artifacts):
    """Idempotently finish a publish interrupted after content promotion."""
    return publish_accepted(root, work_id, receipt, artifacts)
