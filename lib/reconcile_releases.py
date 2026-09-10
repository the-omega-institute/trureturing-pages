"""Bounded release reconciliation and receipts around the existing Pages pipeline.

Planning reads metadata only. Acquisition and ingestion are explicit worker operations;
projection, topology and deployment remain owned by pages.yml.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
from functools import cmp_to_key, lru_cache
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from lib import living_library, vertical_smoke


REPOSITORY = "the-omega-institute/trureturing"
RECEIPTS_SCHEMA = "pages-ingestion-receipts.v1"
HISTORY_PATH = "data/library-history.v1.json"
RECEIPTS_PATH = "data/ingestion-receipts.v1.json"
TAG = re.compile(r"truth-release-([0-9a-f]{64})\Z")
OID = re.compile(r"[0-9a-f]{40}\Z")
MAX_METADATA_BYTES = 16 * 1024 * 1024


def require_oid(value):
    if not isinstance(value, str) or not OID.fullmatch(value):
        raise ValueError("source_commit must be an immutable lowercase 40-hex commit, not a branch")
    return value


def require_digest(value):
    if not isinstance(value, str) or not living_library.DIGEST.fullmatch(value):
        raise ValueError("release digest must be sha256:<64 lowercase hex>")
    return value


def read_json(raw):
    return json.loads(raw, object_pairs_hook=vertical_smoke._reject_duplicate)


class GitHub:
    """Public REST reads; GH_TOKEN is optional and only sent to api.github.com."""

    def __init__(self, repository=REPOSITORY, token=None):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            raise ValueError("invalid GitHub source repository")
        self.repository = repository
        self.token = os.environ.get("GH_TOKEN", "") if token is None else token

    def get_json(self, path):
        headers = {"User-Agent": "pages-release-reconciler", "Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        request = Request(f"https://api.github.com/repos/{self.repository}/{path}", headers=headers)
        with urlopen(request, timeout=30) as response:
            raw = response.read(MAX_METADATA_BYTES + 1)
        if len(raw) > MAX_METADATA_BYTES:
            raise ValueError("GitHub metadata exceeds size limit")
        return read_json(raw)

    def releases(self):
        result, page = [], 1
        while True:
            items = self.get_json(f"releases?per_page=100&page={page}")
            if not isinstance(items, list):
                raise ValueError("GitHub release listing must be an array")
            result.extend(items)
            if len(items) < 100:
                return result
            page += 1

    def dev_head(self):
        return require_oid(self.get_json("commits/dev")["sha"])

    @lru_cache(maxsize=None)
    def is_ancestor(self, older, newer):
        require_oid(older)
        require_oid(newer)
        if older == newer:
            return True
        value = self.get_json(f"compare/{older}...{newer}?per_page=1")
        if value.get("status") not in {"ahead", "behind", "identical", "diverged"}:
            raise ValueError("GitHub returned an invalid ancestry comparison")
        return (value["status"] in {"ahead", "identical"}
                and value.get("merge_base_commit", {}).get("sha") == older
                and value.get("behind_by") == 0)

    def download(self, release, target):
        tag = "truth-release-" + require_digest(release["digest"])[7:]
        url = f"https://github.com/{self.repository}/releases/download/{tag}/{tag}.tar.gz"
        request = Request(url, headers={"User-Agent": "pages-release-reconciler"})
        total = 0
        with urlopen(request, timeout=60) as response, Path(target).open("xb") as writer:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > vertical_smoke.MAX_ARCHIVE_BYTES:
                    raise ValueError("truth-release archive exceeds the compressed-size limit")
                writer.write(chunk)


class GitAncestry:
    """Read an existing checkout's object database, without fetch or producer work."""

    def __init__(self, repository, ref="dev"):
        self.repository = Path(repository)
        self.head = require_oid(subprocess.check_output(
            ["git", "-C", str(self.repository), "rev-parse", "--verify", f"{ref}^{{commit}}"],
            text=True,
        ).strip())

    @lru_cache(maxsize=None)
    def is_ancestor(self, older, newer):
        result = subprocess.run([
            "git", "-C", str(self.repository), "merge-base", "--is-ancestor",
            require_oid(older), require_oid(newer),
        ], capture_output=True, text=True)
        if result.returncode not in (0, 1):
            raise ValueError(f"cannot establish source ancestry: {result.stderr.strip()}")
        return result.returncode == 0


class RecordedAncestry:
    """Offline parent graph for repeatable audits; never infer order from timestamps."""

    def __init__(self, value):
        self.head = require_oid(value["dev_head"])
        self.parents = value["parents"]
        for commit, parents in self.parents.items():
            require_oid(commit)
            for parent in parents:
                require_oid(parent)

    @lru_cache(maxsize=None)
    def is_ancestor(self, older, newer):
        todo, seen = [newer], set()
        while todo:
            commit = todo.pop()
            if commit == older:
                return True
            if commit in seen:
                continue
            seen.add(commit)
            if commit not in self.parents:
                raise ValueError(f"incomplete recorded ancestry at {commit}")
            todo.extend(self.parents[commit])
        return False


def validate_receipts(value):
    if not isinstance(value, dict) or value.get("schema_version") != RECEIPTS_SCHEMA or not isinstance(value.get("entries"), list):
        raise ValueError("invalid ingestion receipts")
    seen = set()
    for entry in value["entries"]:
        release = require_digest(entry["release_digest"])
        require_digest(entry["library_entry_digest"])
        if release in seen or type(entry.get("deployed")) is not bool:
            raise ValueError("duplicate or invalid ingestion receipt")
        for field in ("recorded_at", "ingested_at"):
            timestamp = entry.get(field)
            if field == "ingested_at" and timestamp is None:
                continue  # The original time cannot be reconstructed from old history.
            if not isinstance(timestamp, str) or not timestamp.endswith("Z"):
                raise ValueError("receipt timestamps must be UTC")
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        seen.add(release)
    return value


def history_entries(history):
    return living_library.validate_index(history)["entries"] if history is not None else []


def read_receipts(path):
    return validate_receipts(read_json(path.read_bytes())) if path.exists() else {"schema_version": RECEIPTS_SCHEMA, "entries": []}


def read_state(output, previous_url=None, history_path=None, receipts_path=None):
    nonce = time.time_ns()
    def read(relative, override):
        if override is not None:
            # An explicitly supplied input must exist; a typo must not reset history.
            return Path(override).read_bytes()
        if previous_url:
            return living_library.read_remote(previous_url, f"{relative}?reconcile={nonce}", optional=True)
        path = Path(output) / relative
        return path.read_bytes() if path.exists() else None

    raw_history = read(HISTORY_PATH, history_path)
    history = read_json(raw_history) if raw_history is not None else None
    history_entries(history)
    raw_receipts = read(RECEIPTS_PATH, receipts_path)
    receipts = validate_receipts(read_json(raw_receipts)) if raw_receipts is not None else {"schema_version": RECEIPTS_SCHEMA, "entries": []}
    validate_receipt_history(history, receipts)
    return history, receipts


def validate_receipt_history(history, receipts):
    coordinates = {(e["truth_release_digest"], e["digest"]) for e in history_entries(history)}
    for receipt in validate_receipts(receipts)["entries"]:
        if (receipt["release_digest"], receipt["library_entry_digest"]) not in coordinates:
            raise ValueError("ingestion receipt has no matching history entry; restore history before retrying")


def plan_releases(releases, history, receipts, is_ancestor, dev_head, limit=1):
    if type(limit) is not int or limit < 0:
        raise ValueError("limit must be a non-negative integer")
    require_oid(dev_head)
    entries = history_entries(history)
    validate_receipt_history(history, receipts)
    known = {e["truth_release_digest"] for e in entries}
    known.update(e["release_digest"] for e in receipts["entries"])
    published = {}
    for item in releases:
        tag = item.get("tag_name", "")
        if item.get("draft") or item.get("prerelease") or not tag.startswith("truth-release-"):
            continue
        match = TAG.fullmatch(tag)
        if not match:
            raise ValueError(f"invalid truth-release tag: {tag}")
        release = {"digest": "sha256:" + match[1], "tag": tag,
                   "source_commit": require_oid(item.get("target_commitish")),
                   "published_at": item.get("published_at")}
        prior = published.get(release["digest"])
        if prior is not None and prior != release:
            raise ValueError("conflicting release metadata for the same digest")
        published[release["digest"]] = release
    missing = [release for key, release in published.items() if key not in known]
    ancestor = lru_cache(maxsize=None)(is_ancestor)
    for release in missing:
        if not ancestor(release["source_commit"], dev_head):
            raise ValueError(f"release source is not an ancestor of dev: {release['digest']}")

    def compare(left, right):
        a, b = left["source_commit"], right["source_commit"]
        if a == b:
            raise ValueError("different release digests have the same source commit")
        if ancestor(a, b):
            return -1
        if ancestor(b, a):
            return 1
        raise ValueError("release sources diverge; no safe ancestor append order")

    pending = sorted(missing, key=cmp_to_key(compare))
    for left, right in zip(pending, pending[1:]):
        compare(left, right)
    blocked, eligible = [], []
    tip = require_oid(entries[-1].get("source_commit")) if entries and pending else None
    if tip and not ancestor(tip, dev_head):
        raise ValueError("archived tip is not an ancestor of dev")
    for release in pending:
        source = release["source_commit"]
        if tip and (source == tip or ancestor(source, tip)):
            blocked.append({**release, "reason": "source_at_or_before_archived_tip"})
        elif tip and not ancestor(tip, source):
            raise ValueError("release source diverges from the archived tip")
        else:
            eligible.append(release)
    return {"schema_version": "pages-release-reconciliation.v1", "dev_head": dev_head,
            "published_count": len(published), "ingested_count": len(known),
            "missing_count": len(missing), "limit": limit,
            "pending": pending, "blocked": blocked, "selected": eligible[:limit]}


@contextmanager
def locked(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def append_receipt(path, entry, *, deployed=False, now=None, recovered=False):
    path = Path(path)
    with locked(path.with_suffix(".lock")):
        receipts = read_receipts(path)
        release = require_digest(entry["truth_release_digest"])
        coordinate = require_digest(entry["digest"])
        existing = next((r for r in receipts["entries"] if r["release_digest"] == release), None)
        if existing:
            if existing["library_entry_digest"] != coordinate:
                raise ValueError("cannot rebind an immutable ingestion receipt")
            return receipts
        timestamp = now or utc_now()
        receipts["entries"].append({"release_digest": release, "library_entry_digest": coordinate,
                                    "ingested_at": None if recovered else timestamp,
                                    "recorded_at": timestamp, "deployed": deployed})
        validate_receipts(receipts)
        living_library.write_bytes(path, (json.dumps(receipts, indent=2) + "\n").encode())
        return receipts


def acquire_release(release, output, destination, download, previous_url=None):
    history, _ = read_state(output, previous_url)
    if any(e["truth_release_digest"] == release["digest"] for e in history_entries(history)):
        return None
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix="release-download-") as temp:
        archive = Path(temp) / "bundle.tar.gz"
        download(release, archive)
        extracted = Path(temp) / "bundle"
        vertical_smoke.extract_archive(archive, extracted)
        verified = vertical_smoke.verify_bundle(extracted, release["digest"])
        if verified["source_commit"] != release["source_commit"]:
            raise ValueError("verified bundle source differs from planned release source")
        if destination.exists():
            raise ValueError("bundle destination already exists")
        extracted.rename(destination)
    return verified


def ingest_release(bundle, graph_path, manifest_path, output, source_repo=None, *,
                   expected_digest, previous_url=None, deployed=False, now=None):
    """Commit verified Library content, then its receipt; recover the write gap.

    The caller supplies the final Atlas from the existing pipeline. A receipt is
    never created for an acquisition, dispatch, failed verification or failed build.
    """
    output = Path(output)
    require_digest(expected_digest)
    with locked(output / ".library-ingestion.lock"):
        # build_library publishes the local index last. It is the recovery point
        # if a prior attempt stopped before writing its receipt.
        if (output / HISTORY_PATH).exists():
            previous_url = None
        history, receipts = read_state(output, previous_url)
        existing = next((e for e in history_entries(history) if e["truth_release_digest"] == expected_digest), None)
        receipt_path = output / RECEIPTS_PATH
        if existing:
            if previous_url:
                living_library.write_bytes(receipt_path, (json.dumps(receipts, indent=2) + "\n").encode())
            for entry in history_entries(history):
                receipts = append_receipt(receipt_path, entry, deployed=bool(previous_url) or deployed, now=now, recovered=True)
            return receipts
        verified = vertical_smoke.verify_bundle(bundle, expected_digest)
        graph = read_json(Path(graph_path).read_bytes())
        source = graph.get("source_snapshot", {})
        if source.get("source_commit") != verified["source_commit"] or source.get("truth_release_digest") != expected_digest:
            raise ValueError("projected graph source does not match the verified bundle")
        # Preserve the prior ledger before the Library commit point, so a crash
        # after that point cannot lose historical receipt times. No new receipt
        # is issued until build_library succeeds.
        if previous_url:
            living_library.write_bytes(receipt_path, (json.dumps(receipts, indent=2) + "\n").encode())
        # This remains the sole implementation of Library snapshots and history.
        index = living_library.build_library(Path(graph_path), Path(manifest_path), output, source_repo,
                                            previous_url, previous_index=history)
        for entry in history_entries(history):
            append_receipt(receipt_path, entry, deployed=bool(previous_url) or deployed, now=now, recovered=True)
        return append_receipt(receipt_path, index["entries"][-1], deployed=deployed, now=now)


def check_checkpoint(output, expected_digest, previous_url=None):
    """Check the bindings on a complete cached site before resuming deployment."""
    output = Path(output)
    history, receipts = read_state(output)
    if previous_url:
        previous_history, previous_receipts = read_state(output, previous_url)
        previous_entries = history_entries(previous_history)
        if history_entries(history)[:len(previous_entries)] != previous_entries:
            raise ValueError("checkpoint would overwrite newer or different deployed history")
        old_rows = previous_receipts["entries"]
        if receipts["entries"][:len(old_rows)] != old_rows:
            raise ValueError("checkpoint would overwrite deployed ingestion receipts")
    manifest = read_json((output / "deployment-manifest.v1.json").read_bytes())
    if manifest.get("schema") != "pages-deployment-manifest.v1" or manifest.get("release_digest") != expected_digest:
        raise ValueError("checkpoint deployment does not match requested release")
    if not history or history["current_truth_release_digest"] != expected_digest:
        raise ValueError("checkpoint history does not end at requested release")
    if not any(r["release_digest"] == expected_digest for r in receipts["entries"]):
        raise ValueError("checkpoint has no ingestion receipt")
    for entry in history["entries"]:
        if living_library.digest((output / entry["path"]).read_bytes()) != entry["digest"]:
            raise ValueError("checkpoint Library snapshot failed verification")
    atlas = read_json((output / "data/pages-atlas-manifest.v1.json").read_bytes())
    graph = (output / "data/pages-atlas-view.v1.json").read_bytes()
    if atlas.get("truth_release_digest") != expected_digest or atlas.get("atlas_graph_digest") != living_library.digest(graph):
        raise ValueError("checkpoint Atlas failed verification")


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("plan", help="metadata only: list missing releases; never download or dispatch")
    plan.add_argument("--dry-run", action="store_true", help="explicit read-only audit (plan is always read-only)")
    plan.add_argument("--limit", type=int, default=1)
    plan.add_argument("--repository", default=REPOSITORY)
    plan.add_argument("--releases-file", type=Path)
    plan.add_argument("--history", type=Path)
    plan.add_argument("--receipts", type=Path)
    plan.add_argument("--output", type=Path, default=Path("_site"))
    plan.add_argument("--previous-url")
    ancestry = plan.add_mutually_exclusive_group()
    ancestry.add_argument("--source-repo", type=Path)
    ancestry.add_argument("--ancestry-file", type=Path)
    plan.add_argument("--source-ref", default="dev")
    plan.add_argument("--requested-digest", help="only admit this coordinate if it is the oldest eligible release")
    plan.add_argument("--github-output", type=Path)
    acquire = commands.add_parser("acquire", help="explicit worker: download and verify one selected release")
    acquire.add_argument("--digest", required=True)
    acquire.add_argument("--source-commit", required=True)
    acquire.add_argument("--repository", default=REPOSITORY)
    acquire.add_argument("--bundle", type=Path, required=True)
    acquire.add_argument("--output", type=Path, default=Path("_site"))
    acquire.add_argument("--previous-url")
    acquire.add_argument("--verified-json", type=Path, required=True)
    ingest = commands.add_parser("ingest", help="verify and archive an already projected Atlas via build_library")
    ingest.add_argument("--bundle", type=Path, required=True)
    ingest.add_argument("--graph", type=Path, required=True)
    ingest.add_argument("--manifest", type=Path, required=True)
    ingest.add_argument("--output", type=Path, default=Path("_site"))
    ingest.add_argument("--source-repo", type=Path)
    ingest.add_argument("--previous-url")
    ingest.add_argument("--digest", required=True)
    ingest.add_argument("--for-deployment", action="store_true", help="stage receipts for atomic publication with this site; not deployment confirmation")
    checkpoint = commands.add_parser("check-checkpoint")
    checkpoint.add_argument("--output", type=Path, default=Path("_site"))
    checkpoint.add_argument("--digest", required=True)
    checkpoint.add_argument("--previous-url")
    return result


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0].startswith("-"):
        argv.insert(0, "plan")
    args = parser().parse_args(argv)
    try:
        if args.command == "plan":
            if args.limit < 0:
                raise ValueError("limit must be a non-negative integer")
            if args.dry_run and args.github_output:
                raise ValueError("dry-run cannot write GitHub outputs")
            history, receipts = read_state(args.output, args.previous_url, args.history, args.receipts)
            client = GitHub(args.repository)
            releases = read_json(args.releases_file.read_bytes()) if args.releases_file else client.releases()
            if args.source_repo:
                ancestry = GitAncestry(args.source_repo, args.source_ref)
            elif args.ancestry_file:
                ancestry = RecordedAncestry(read_json(args.ancestry_file.read_bytes()))
            else:
                ancestry = client
                ancestry.head = client.dev_head()
            result = plan_releases(releases, history, receipts, ancestry.is_ancestor, ancestry.head, args.limit)
            if args.requested_digest:
                requested = require_digest(args.requested_digest)
                if any(e["truth_release_digest"] == requested for e in history_entries(history)):
                    result["selected"] = []
                elif not result["selected"] or result["selected"][0]["digest"] != requested:
                    raise ValueError("requested release is not the oldest eligible missing release; run reconciliation first")
                else:
                    result["selected"] = result["selected"][:1]
            print(json.dumps(result, indent=2))
            if args.github_output:
                first = result["selected"][0] if result["selected"] else {}
                with args.github_output.open("a") as writer:
                    writer.write(f"should_build={str(bool(first)).lower()}\nrelease_digest={first.get('digest', '')}\nsource_commit={first.get('source_commit', '')}\n")
        elif args.command == "acquire":
            release = {"digest": require_digest(args.digest), "source_commit": require_oid(args.source_commit)}
            verified = acquire_release(release, args.output, args.bundle, GitHub(args.repository).download, args.previous_url)
            if verified is None:
                raise ValueError("release is already in history; re-run preflight before building")
            living_library.write_bytes(args.verified_json, (json.dumps(verified, indent=2) + "\n").encode())
        elif args.command == "ingest":
            receipts = ingest_release(args.bundle, args.graph, args.manifest, args.output, args.source_repo,
                                      expected_digest=args.digest, previous_url=args.previous_url,
                                      deployed=args.for_deployment)
            print(f"Ingestion receipts: {len(receipts['entries'])}")
        else:
            check_checkpoint(args.output, require_digest(args.digest), args.previous_url)
        return 0
    except (ValueError, OSError, KeyError, TypeError, HTTPError, URLError) as error:
        print(f"reconciliation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
