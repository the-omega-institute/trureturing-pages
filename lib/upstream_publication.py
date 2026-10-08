"""Project an upstream CI report into a durable Pages source publication.

Consume existing published cache snapshots without running Lean, gated by
canonical ci-current.yml push checks for their exact protected-dev source.
Published bundles live in Pages so rebuilds outlive upstream cache retention.
"""
from __future__ import annotations

import argparse
import base64
import io
import zipfile
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import tarfile
import re
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from lib.reconcile_releases import GitHub, REPOSITORY, require_digest, require_oid
from lib import vertical_smoke

SCHEMA = "pages-upstream-ci-publication.v1"
WORKFLOW = "ci-current.yml"
CHECKS = ("required",)
EXPORT_CHECKS = (*CHECKS, "lean-cache-publication")
CACHE_WORKFLOW = "lean-cache-publish.yml"
CACHE_TAG = re.compile(r"lean-cache-(?:v2|verify-v1)-[0-9a-f]{40}-linux-arm64-[1-9][0-9]*-[1-9][0-9]*\Z")
REPORT = ".lake/build/stratalint/raw-lean-report.json"
REPORT_FILES = tuple("raw-lean-report.json" + suffix for suffix in
                     ("", ".sha256", ".input.attestation", ".provenance.json", ".materials.zip"))
CACHE_LIMIT = 16 * 1024 ** 3
REPORT_LIMIT = 1024 ** 3
SCRIBE_LIMIT = 256 * 1024 ** 2
OUTCOME_PATH = "data/upstream-publication-outcome.v1.json"
OUTCOME_BRANCH = "pages-sync-status"
OUTCOME_SCHEMA = "pages-upstream-publication-outcome.v1"
BLOCKED_STATUSES = {"awaiting-scribe-publication", "content-validation-rejected",
                    "awaiting-upstream-ci", "upstream-ci-failed"}
CONTENT_REJECTIONS = ("TRUTH_RELEASE_INVALID residual frontier evaluation failed:",
                      "TRUTH_RELEASE_INVALID frozen ledger does not form a closed dependency DAG",
                      "TRUTH_RELEASE_INVALID Scribe emission verification failed: describe red code=")


def read_outcome(client):
    try:
        item = client.get_json(f"contents/{OUTCOME_PATH}?ref={OUTCOME_BRANCH}")
    except HTTPError as error:
        if error.code == 404:
            return None
        raise
    value = json.loads(base64.b64decode("".join(item["content"].split()), validate=True),
                       object_pairs_hook=vertical_smoke._reject_duplicate)
    if (value.get("schema") != OUTCOME_SCHEMA or value.get("source_repository") != REPOSITORY
            or type(value.get("run_id")) is not int or value["run_id"] < 1
            or value.get("status") not in BLOCKED_STATUSES | {"published", "publication-failed"}):
        raise ValueError("invalid downstream publication outcome")
    require_oid(value["source_commit"])
    require_oid(value["adapter_commit"])
    require_digest(value["input_digest"])
    if (value.get("reason") is not None and not isinstance(value["reason"], str)
            or value.get("rejection_run_id") is not None
            and (type(value["rejection_run_id"]) is not int or value["rejection_run_id"] < 1)):
        raise ValueError("invalid downstream rejection diagnostic")
    report_ci = value.get("report_ci")
    if report_ci is not None:
        require_oid(report_ci["source_commit"])
        if (report_ci.get("status") not in {"awaiting-upstream-ci", "upstream-ci-failed"}
                or report_ci.get("ci_run_id") is not None
                and (type(report_ci["ci_run_id"]) is not int or report_ci["ci_run_id"] < 1)
                or any(report_ci.get(k) is not None and not isinstance(report_ci[k], str)
                       for k in ("ci_status", "ci_conclusion"))):
            raise ValueError("invalid report CI diagnostic")
    rejections = value.get("rejections", [])
    if not isinstance(rejections, list) or len(rejections) > 100:
        raise ValueError("invalid publication rejection history")
    for rejection in rejections:
        require_oid(rejection["source_commit"])
        require_digest(rejection["input_digest"])
        if (type(rejection.get("run_id")) is not int or rejection["run_id"] < 1
                or not isinstance(rejection.get("reason"), str)):
            raise ValueError("invalid publication rejection history")
    return value


def input_digest(selection, adapter_commit):
    # Both source and immutable input bytes must match before suppressing a retry.
    value = {"adapter_commit": require_oid(adapter_commit),
             "source_commit": selection["source_commit"], "source_tree": selection["source_tree"],
             "report_archive_sha256": selection["report_manifest"]["archive_sha256"],
             "scribe": selection.get("scribe")}
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def scribe_selection(client, releases, commit, dev_head=None):
    """Keep resource provenance separate from the checked report's identity.

    A pack is content addressed, not bound to the report revision by its native
    contract. For another revision, projection retains only resources whose
    source scripts have identical Git blobs, then runs all native export checks.
    """
    candidates = sorted(releases, key=lambda r: r.get("target_commitish") != commit)
    for release in candidates:
        tag = release.get("tag_name", "")
        if (release.get("draft") or release.get("prerelease")
                or not re.fullmatch(r"scribe-resources-[0-9a-f]{64}", tag)):
            continue
        resource_source = require_oid(release["target_commitish"])
        if resource_source != commit and (dev_head is None or not client.is_ancestor(resource_source, dev_head)):
            continue
        # The tag is authoritative; release target_commitish is editable metadata.
        tagged = client.get_json("commits/" + tag)
        if tagged.get("sha") != resource_source:
            raise ValueError("Scribe release tag differs from its declared source")
        assets = release.get("assets", [])
        matching = [a for a in assets if a.get("name") == "scribe-resources.zip"]
        if len(matching) != 1:
            raise ValueError("missing or duplicate Scribe resource asset")
        asset = matching[0]
        if (asset.get("state") != "uploaded" or type(asset.get("size")) is not int
                or not 0 < asset["size"] <= SCRIBE_LIMIT):
            raise ValueError("invalid Scribe resource asset")
        require_digest(asset["digest"])
        return {"source_commit": resource_source, "report_source_commit": commit, "release_tag": tag,
                "pack_digest": tag.removeprefix("scribe-resources-"),
                "asset": {k: asset[k] for k in ("name", "size", "digest")}}
    return None


def acquire_scribe(selection, destination):
    scribe = selection.get("scribe")
    if scribe is None:
        return
    if scribe.get("report_source_commit", scribe["source_commit"]) != selection["source_commit"]:
        raise ValueError("Scribe resources differ from report source")
    raw = asset_bytes(scribe["release_tag"], scribe["asset"], SCRIBE_LIMIT)
    # Transport identity and logical resource identity are distinct. The native
    # source-pinned verifier checks every entry before truth-release consumes it.
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = [i for i in archive.infolist() if i.filename == "manifest.json"]
        if len(entries) != 1 or entries[0].file_size > 4 * 1024 ** 2:
            raise ValueError("invalid Scribe resource manifest")
        manifest = json.loads(archive.read(entries[0]), object_pairs_hook=vertical_smoke._reject_duplicate)
    if (manifest.get("schema") != "trureturing.scribe.resource-pack"
            or manifest.get("totalSha256") != scribe["pack_digest"]):
        raise ValueError("Scribe resource identity differs from release tag")
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "scribe-resources.zip").write_bytes(raw)


def adapt_scribe(scribe, repository, pack):
    """Reuse unchanged published definition bytes; never execute Scribe scripts.

    The original pack must pass the source-pinned native verifier first. Its
    release source remains explicit; a subset receives its own logical digest.
    The native truth-release verifier then checks that subset against the report.
    """
    report_source = scribe.get("report_source_commit", scribe["source_commit"])
    if scribe["source_commit"] == report_source:
        return pack, scribe["pack_digest"]
    def scripts(commit):
        rows = subprocess.check_output(["git", "ls-tree", "-r", "-z", require_oid(commit),
                                        "--", "Blueprint"], cwd=repository).split(b"\0")
        result = {}
        for row in rows:
            if not row: continue
            metadata, path = row.split(b"\t", 1)
            mode, kind, oid = metadata.split()
            if path.endswith(b".scribe.cs") and kind == b"blob" and mode in {b"100644", b"100755"}:
                result[path.decode()] = oid
        return result
    original, selected = scripts(scribe["source_commit"]), scripts(report_source)
    with zipfile.ZipFile(pack) as archive:
        manifest = json.loads(archive.read("manifest.json"), object_pairs_hook=vertical_smoke._reject_duplicate)
        entries, excluded = [], []
        for entry in manifest["entries"]:
            path = "Blueprint/" + entry["gid"] + ".scribe.cs"
            if path in selected and original.get(path) == selected[path]:
                entries.append(entry)
            else:
                excluded.append(entry["gid"])
        # A subset must retain its document references as well as script identity.
        # If an unchanged document references an excluded definition, exclude the
        # whole document, recursively. Published bytes are never rewritten.
        references = {entry["gid"]: document_targets(json.loads(archive.read(entry["path"]),
                      object_pairs_hook=vertical_smoke._reject_duplicate)) for entry in entries}
        retained = {entry["gid"] for entry in entries}
        unavailable = {}
        while True:
            missing = {gid: sorted(references[gid] - retained) for gid in retained
                       if references[gid] - retained}
            if not missing:
                break
            unavailable.update(missing)
            retained.difference_update(missing)
        entries = [entry for entry in entries if entry["gid"] in retained]
        excluded.extend(sorted(unavailable))
        if not entries:
            raise ValueError("published Scribe pack has no unchanged resource inputs for report source")
        digest = hashlib.sha256(json.dumps(entries, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()
        manifest.update(entries=entries, entryCount=len(entries), totalSha256=digest)
        adapted = pack.with_name("scribe-resources-consumed.zip")
        with zipfile.ZipFile(adapted, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for entry in entries:
                output.writestr(entry["path"], archive.read(entry["path"]))
            output.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")).encode())
    reused = {"Blueprint/" + entry["gid"] + ".scribe.cs" for entry in entries}
    scribe.update(consumed_pack_digest=digest,
                  adaptation={"policy": "unchanged-script-blobs.v2", "reused_entries": len(entries),
                              "excluded_gids": excluded,
                              "unavailable_document_targets": unavailable,
                              "unpublished_gids": sorted(path.removeprefix("Blueprint/").removesuffix(".scribe.cs")
                                                         for path in selected.keys() - reused)})
    return adapted, digest


def document_targets(value):
    """Read module references from the existing serialized document AST.

    Explicit plane references (Library, Evidence, Blueprint, etc.) and formal
    declarations remain governed by the native verifier, not subset closure.
    """
    result = set()
    if isinstance(value, list):
        for child in value:
            result.update(document_targets(child))
    elif isinstance(value, dict):
        kind = value.get("type")
        if kind == "GidReference":
            gid = value["value"]
            if not gid.startswith(("D5/B/", "D5/E/", "D5/C/", "D5/L/", "D5/P/")) and "." not in gid.rsplit("/", 1)[-1]:
                result.add(gid)
        elif kind == "Dependency":
            result.add(value["target"])
        elif kind == "NarrativeReference" and value["target"].get("type") == "Document":
            result.add(value["target"]["documentGid"])
        for child in value.values():
            result.update(document_targets(child))
    return result



def normalize_publication(item):
    """Expose a Pages publication to the existing content-addressed planner.

    A downstream release target is a Pages commit; the source commit is explicitly
    recorded in its structured notes. Never confuse the two repositories.
    """
    if item.get("draft") or item.get("prerelease") or not item.get("tag_name", "").startswith("pages-source-"):
        return None
    metadata = json.loads(item["body"])
    if metadata.get("schema") != SCHEMA or metadata.get("source_repository") != REPOSITORY:
        raise ValueError("invalid Pages source publication provenance")
    source = require_oid(metadata["source_commit"])
    digest = require_digest(metadata["release_digest"])
    if item["tag_name"] != "pages-source-" + source:
        raise ValueError("Pages publication tag differs from source")
    run_id = metadata.get("ci_run_id")
    if type(run_id) is not int or run_id < 1:
        raise ValueError("Pages publication requires upstream CI provenance")
    return {**item, "target_commitish": source, "tag_name": "truth-release-" + digest[7:],
            "upstream_ci_run_id": run_id}


def pages_release(client, source):
    try:
        item = client.get_json("releases/tags/pages-source-" + require_oid(source))
    except HTTPError as error:
        if error.code == 404:
            return None
        raise
    return normalize_publication(item)


def select_run(client, runs, dev_head):
    """Use ancestry, not completion time (an older rerun can finish last)."""
    eligible = []
    for run in runs:
        if (run.get("event") != "push" or run.get("head_branch") != "dev"
                or run.get("conclusion") != "success" or run.get("status") != "completed"
                or run.get("path") != ".github/workflows/" + WORKFLOW
                or run.get("repository", {}).get("full_name") != REPOSITORY
                or run.get("head_repository", {}).get("full_name") != REPOSITORY):
            continue
        source = require_oid(run["head_sha"])
        if client.is_ancestor(source, dev_head):
            eligible.append(run)
    selected = None
    for run in eligible:
        if selected is None or client.is_ancestor(selected["head_sha"], run["head_sha"]):
            selected = run
    if selected is None:
        raise ValueError("no successful canonical upstream dev CI run available")
    return selected


def verify_checks(run, jobs):
    for name in CHECKS:
        matches = [j for j in jobs if j.get("name") == name]
        if (len(matches) != 1 or matches[0].get("conclusion") != "success"
                or matches[0].get("head_sha") != run["head_sha"]):
            raise ValueError("upstream required check is not successful for this source: " + name)


def asset_bytes(tag, asset, limit):
    """Public release transport; never send API credentials to redirected hosts."""
    url = f"https://github.com/{REPOSITORY}/releases/download/{quote(tag, safe='')}/{quote(asset['name'], safe='')}"
    with urlopen(Request(url, headers={"User-Agent": "pages-source-consumer"}), timeout=60) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit or len(raw) != asset["size"]:
        raise ValueError("release asset size mismatch")
    if "sha256:" + hashlib.sha256(raw).hexdigest() != require_digest(asset["digest"]):
        raise ValueError("release asset digest mismatch")
    return raw


def cache_manifest(release):
    assets = release.get("assets", [])
    names = [asset["name"] for asset in assets]
    if len(set(names)) != len(names) or names.count("manifest.json") != 1:
        raise ValueError("missing or duplicate cache release manifest")
    raw = asset_bytes(release["tag_name"], next(a for a in assets if a["name"] == "manifest.json"), 16384)
    manifest = json.loads(raw, object_pairs_hook=vertical_smoke._reject_duplicate)
    source = require_oid(manifest["producer_commit_sha"])
    run, attempt = manifest["workflow_run_id"], manifest["workflow_run_attempt"]
    partition = manifest["partition"]
    prefix = "lean-cache-verify-v1-" if release["tag_name"].startswith("lean-cache-verify-v1-") else "lean-cache-v2-"
    if (manifest.get("schema") != "lean-release-seed-v3"
            or not re.fullmatch(r"[0-9a-f]{40}/linux-arm64", partition)
            or not all(isinstance(v, str) and re.fullmatch(r"[1-9][0-9]*", v) for v in (run, attempt))
            or release["tag_name"] != prefix + partition.replace("/", "-") + "-" + run + "-" + attempt):
        raise ValueError("cache manifest source attribution mismatch")
    require_digest("sha256:" + manifest["archive_sha256"])
    parts = manifest["parts"]
    if not isinstance(parts, list) or not 1 <= len(parts) <= 100:
        raise ValueError("invalid cache parts inventory")
    for index, part in enumerate(parts):
        expected = "lean-build.tgz" if len(parts) == 1 else f"lean-build.tgz.part-{index:02d}"
        if (part.get("name") != expected or type(part.get("bytes")) is not int
                or not 0 < part["bytes"] <= 1610612736):
            raise ValueError("invalid cache parts inventory")
        require_digest("sha256:" + part["sha256"])
        matching = [a for a in assets if a["name"] == expected]
        if (len(matching) != 1 or matching[0].get("state") != "uploaded"
                or matching[0].get("size") != part["bytes"]
                or matching[0].get("digest") != "sha256:" + part["sha256"]):
            raise ValueError("cache part differs from release inventory")
    total = sum(part["bytes"] for part in parts)
    if (type(manifest["archive_bytes"]) is not int or total != manifest["archive_bytes"]
            or total > CACHE_LIMIT or set(names) != {"manifest.json", *[p["name"] for p in parts]}):
        raise ValueError("cache archive size or inventory mismatch")
    return manifest


def verify_cache_run(source, manifest, release_tag=None):
    run = source.get_json(f"actions/runs/{manifest['workflow_run_id']}/attempts/{manifest['workflow_run_attempt']}")
    verification = release_tag is not None and release_tag.startswith("lean-cache-verify-v1-")
    branch = run.get("head_branch", "")
    producer_scope = (branch == "dev" or branch.startswith("integration-")) if verification else branch == "dev"
    if verification and manifest.get("source_ref") is not None:
        producer_scope = producer_scope and manifest["source_ref"] == "refs/heads/" + branch
    workflow = "ci-publication-verify.yml" if verification else CACHE_WORKFLOW
    event = "push" if verification else "schedule"
    if (run.get("id") != int(manifest["workflow_run_id"])
            or run.get("run_attempt") != int(manifest["workflow_run_attempt"])
            or run.get("head_sha") != manifest["producer_commit_sha"]
            or not producer_scope or run.get("event") != event
            or run.get("path") != ".github/workflows/" + workflow
            or run.get("status") != "completed" or run.get("conclusion") != "success"
            or run.get("repository", {}).get("full_name") != REPOSITORY
            or run.get("head_repository", {}).get("full_name") != REPOSITORY):
        raise ValueError("cache report has no matching successful published producer")
    return run


def order_snapshots(source, snapshots):
    """Newest source first; retain only the newest producer attempt per source."""
    from functools import cmp_to_key
    by_source = {}
    for snapshot in snapshots:
        manifest = snapshot[1]
        commit = manifest["producer_commit_sha"]
        previous = by_source.get(commit)
        attempt = lambda m: (int(m["workflow_run_id"]), int(m["workflow_run_attempt"]))
        if previous is None or attempt(manifest) > attempt(previous[1]):
            by_source[commit] = snapshot
    def compare(left, right):
        a, b = left[1]["producer_commit_sha"], right[1]["producer_commit_sha"]
        if source.is_ancestor(a, b): return 1
        if source.is_ancestor(b, a): return -1
        raise ValueError("published report sources are not on one protected-dev history")
    return sorted(by_source.values(), key=cmp_to_key(compare))


def report_ci(source, workflow, commit, head):
    runs = source.get_json(f"actions/workflows/{WORKFLOW}/runs?branch=dev&event=push&head_sha={commit}&per_page=100")["workflow_runs"]
    exact = [r for r in runs if r.get("head_sha") == commit and r.get("workflow_id") == workflow["id"]
             and r.get("event") == "push" and r.get("head_branch") == "dev"
             and r.get("path") == ".github/workflows/" + WORKFLOW
             and r.get("repository", {}).get("full_name") == REPOSITORY
             and r.get("head_repository", {}).get("full_name") == REPOSITORY]
    if any(r.get("head_sha") == commit and r not in exact for r in runs):
        raise ValueError("report CI identity mismatch")
    successful = [r for r in exact if r.get("status") == "completed" and r.get("conclusion") == "success"]
    if successful:
        run = select_run(source, successful, head)
        jobs = source.get_json(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100")["jobs"]
        verify_checks(run, jobs)
        return run, None
    latest = max(exact, key=lambda r: (r["id"], r["run_attempt"]), default=None)
    failed = latest and latest.get("status") == "completed"
    return None, {"status": "upstream-ci-failed" if failed else "awaiting-upstream-ci",
                  "source_commit": commit, "ci_run_id": latest["id"] if latest else None,
                  "ci_status": latest.get("status") if latest else None,
                  "ci_conclusion": latest.get("conclusion") if latest else None}


def plan(pages_repository, adapter_commit=None):
    source = GitHub(REPOSITORY)
    pages = GitHub(pages_repository)
    workflow = source.get_json("actions/workflows/" + WORKFLOW)
    if workflow.get("path") != ".github/workflows/" + WORKFLOW or workflow.get("state") != "active":
        raise ValueError("canonical upstream workflow is missing or inactive")
    if source.get_json("branches/dev").get("protected") is not True:
        raise ValueError("upstream dev is not protected")
    head = source.dev_head()
    # GitHub keeps historical workflow records after the YAML has been removed.
    # Check the dev tree too, or another rename can recreate the stale-green bug.
    workflow_path = ".github/workflows/" + WORKFLOW
    try:
        current_workflow = source.get_json(f"contents/{workflow_path}?ref={head}")
    except HTTPError as error:
        if error.code == 404:
            raise ValueError("canonical CI workflow was removed from dev; update the downstream adapter") from error
        raise
    if current_workflow.get("type") != "file" or current_workflow.get("path") != workflow_path:
        raise ValueError("canonical CI workflow is not a file on current dev")
    snapshots = []
    # Existing scheduled and verification cache producers carry checked reports. Their
    # manifest selects an exact source; a cache is never itself a CI verdict.
    releases = source.releases()
    for release in releases:
        if (release.get("draft") or release.get("prerelease")
                or not CACHE_TAG.fullmatch(release.get("tag_name", ""))):
            continue
        manifest = cache_manifest(release)
        commit = manifest["producer_commit_sha"]
        if source.is_ancestor(commit, head):
            snapshots.append((release, manifest))
    ordered = order_snapshots(source, snapshots)
    if not ordered:
        raise ValueError("no published upstream report snapshot on protected dev")
    newest_release, newest_manifest = ordered[0]
    waiting = None
    rejected = None
    previous = read_outcome(pages) if adapter_commit else None
    rejections = list(previous.get("rejections", [])) if previous else []
    if previous and previous["status"] == "content-validation-rejected" and not any(
            r["input_digest"] == previous["input_digest"] for r in rejections):
        rejections.append({"source_commit": previous["source_commit"], "input_digest": previous["input_digest"],
                           "reason": previous.get("reason") or "native content validation rejected",
                           "run_id": previous.get("rejection_run_id") or previous["run_id"]})
    for release, manifest in ordered:
        commit = manifest["producer_commit_sha"]
        producer = verify_cache_run(source, manifest, release["tag_name"])
        existing = pages_release(pages, commit)
        freshness = {"upstream_dev_head": head, "report_source_commit": commit,
                     "report_release_tag": release["tag_name"],
                     "latest_report_source_commit": newest_manifest["producer_commit_sha"],
                     "latest_report_release_tag": newest_release["tag_name"]}
        if waiting: freshness["newer_report"] = waiting
        if existing:
            expected = existing["tag_name"] + ".tar.gz"
            if not any(a.get("name") == expected and a.get("state") == "uploaded" and a.get("size", 0) > 0
                       for a in existing.get("assets", [])):
                raise ValueError("existing Pages source publication is missing its bundle")
            return {"should_build": False, "status": "latest-report-already-published",
                    "source_commit": commit, "rejections": rejections, **freshness}
        run, blocked = report_ci(source, workflow, commit, head)
        if not run:
            if waiting is None:
                waiting = {**blocked, "report_release_tag": release["tag_name"]}
            continue
        identity = source.get_json("commits/" + commit)
        selection = {"should_build": True, "status": "existing-upstream-report-awaiting-verification", **freshness,
                "source_commit": commit, "source_tree": identity["commit"]["tree"]["sha"],
                "produced_at": identity["commit"]["committer"]["date"],
                "ci_run_id": run["id"], "ci_run_attempt": run["run_attempt"], "ci_url": run["html_url"],
                "report_run_id": producer["id"], "report_run_attempt": producer["run_attempt"],
                "report_manifest": manifest, "required_checks": list(EXPORT_CHECKS), "rejections": rejections}
        contract = source.get_json(f"contents/tools/StrataLint.Cli/Commands/TruthReleaseCommand.cs?ref={commit}")
        code = base64.b64decode(contract["content"]).decode()
        if "--scribe-pack" in code:
            selection["scribe"] = scribe_selection(source, releases, commit, head)
            if selection["scribe"] is None:
                selection.update(should_build=False, status="awaiting-scribe-publication")
        if adapter_commit:
            selection["input_digest"] = input_digest(selection, adapter_commit)
            rejection = next((r for r in rejections if r["input_digest"] == selection["input_digest"]), None)
        else:
            rejection = None
        if rejection:
            selection.update(should_build=False, status="content-validation-rejected",
                             rejection_reason=rejection["reason"], rejection_run_id=rejection["run_id"])
            rejected = rejected or selection
            continue
        return selection
    return rejected or {"should_build": False, **waiting, "upstream_dev_head": head, "rejections": rejections}


class CacheReader:
    """Concatenate and hash all parts while tar reads; retain only report files."""
    def __init__(self, selection):
        self.tag = selection["report_release_tag"]
        self.manifest = selection["report_manifest"]
        self.parts = iter(self.manifest["parts"])
        self.response = None
        self.archive_hash = hashlib.sha256()
        self.part_hash = None
        self.part_bytes = 0
        self.finished = False

    def read(self, size):
        if size < 0:
            raise ValueError("unbounded cache read")
        output = bytearray()
        while len(output) < size and not self.finished:
            if self.response is None:
                part = next(self.parts, None)
                if part is None:
                    self.finished = True
                    if self.archive_hash.hexdigest() != self.manifest["archive_sha256"]:
                        raise ValueError("cache archive digest mismatch")
                    break
                self.part = part
                url = f"https://github.com/{REPOSITORY}/releases/download/{quote(self.tag, safe='')}/{part['name']}"
                self.response = urlopen(Request(url, headers={"User-Agent": "pages-source-consumer"}), timeout=60)
                self.part_hash, self.part_bytes = hashlib.sha256(), 0
            block = self.response.read(min(size - len(output), 1024 * 1024))
            if block:
                self.part_bytes += len(block)
                if self.part_bytes > self.part["bytes"]:
                    raise ValueError("cache part exceeds declared size")
                self.part_hash.update(block)
                self.archive_hash.update(block)
                output.extend(block)
            else:
                self.response.close()
                self.response = None
                if self.part_bytes != self.part["bytes"] or self.part_hash.hexdigest() != self.part["sha256"]:
                    raise ValueError("cache part size or digest mismatch")
        return bytes(output)

    def close(self):
        if self.response is not None:
            self.response.close()


def acquire_report(selection, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    reader = CacheReader(selection)
    found = set()
    expanded_bytes = 0
    try:
        with tarfile.open(fileobj=reader, mode="r|gz", bufsize=1024 * 1024) as bundle:
            for member in bundle:
                expanded_bytes += member.size
                if expanded_bytes > 64 * 1024 ** 3:
                    raise ValueError("cache archive exceeds expanded size limit")
                prefix = "build/stratalint/"
                name = member.name[len(prefix):] if member.name.startswith(prefix) else None
                if name not in REPORT_FILES:
                    continue
                if name in found or not member.isfile() or member.size > REPORT_LIMIT:
                    raise ValueError("invalid or duplicate report member in cache archive")
                found.add(name)
                with bundle.extractfile(member) as source, (destination / name).open("wb") as target:
                    shutil.copyfileobj(source, target)
        # tar can stop at end markers before the last compressed bytes: all
        # transport bytes still have to pass both part and archive hashes.
        while reader.read(1024 * 1024):
            pass
        if found != set(REPORT_FILES):
            raise ValueError("upstream cache snapshot has an incomplete report bundle")
        report = (destination / REPORT_FILES[0]).read_bytes()
        if (destination / (REPORT_FILES[0] + ".sha256")).read_text().split() != [hashlib.sha256(report).hexdigest(), REPORT_FILES[0]]:
            raise ValueError("raw report SHA-256 mismatch")
    except Exception:
        for name in REPORT_FILES:
            (destination / name).unlink(missing_ok=True)
        raise
    finally:
        reader.close()



def project(selection, repository, report_directory, destination):
    """Build only the exporter; consume the checked CI report without running Lean."""
    repository = Path(repository).resolve()
    commit = require_oid(selection["source_commit"])
    identity = subprocess.check_output(["git", "rev-parse", "HEAD", "HEAD^{tree}"], cwd=repository, text=True).splitlines()
    if identity != [commit, selection["source_tree"]]:
        raise ValueError("upstream checkout differs from selected source")
    if selection["required_checks"] != list(EXPORT_CHECKS):
        raise ValueError("unexpected selected check contract")
    report_directory = Path(report_directory)
    if any(not (report_directory / name).is_file() or (report_directory / name).is_symlink() for name in REPORT_FILES):
        raise ValueError("verified report bundle is missing")
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(("GITHUB_", "CI_"))
                   and key not in {"CANDIDATE_SHA", "BASE_SHA", "GH_TOKEN"}}
    environment.update(GITHUB_REPOSITORY=REPOSITORY, STRATALINT_CACHE_WRITES="false")
    target = repository / REPORT
    target.parent.mkdir(parents=True, exist_ok=True)
    for name in REPORT_FILES:
        shutil.copyfile(report_directory / name, target.parent / name)
    config = Path(__file__).resolve().parents[1] / "config/upstream-export.nuget.config"
    project_path = "tools/StrataLint.Cli/StrataLint.Cli.csproj"
    subprocess.run(["dotnet", "restore", project_path, "--configfile", str(config),
                    "-p:RestoreLockedMode=true"], cwd=repository, check=True, env=environment)
    subprocess.run(["dotnet", "build", project_path, "--configuration", "Release", "--no-restore"],
                   cwd=repository, check=True, env=environment)
    command = ["dotnet", "tools/StrataLint.Cli/bin/Release/net10.0/StrataLint.dll", "truth-release",
               "--out", str(Path(destination).resolve()), "--candidate-lean-report", str(target),
               "--producer-package-commit", commit, "--produced-at", selection["produced_at"],
               "--commit-on-protected-dev", "true"]
    scribe = selection.get("scribe")
    if scribe:
        if scribe.get("report_source_commit", scribe["source_commit"]) != commit:
            raise ValueError("Scribe resources differ from selected source")
        pack = report_directory.resolve() / "scribe-resources.zip"
        if not pack.is_file() or pack.is_symlink():
            raise ValueError("verified Scribe resource pack is missing")
        scribe_tool = ("tools/StrataLint.Scribe/bin/Release/net10.0/StrataLint.Scribe.dll"
                       if (repository / "tools/StrataLint.Scribe/StrataLint.Scribe.csproj").is_file()
                       else "tools/StrataLint.Scribe.Documents/bin/Release/net10.0/StrataLint.Scribe.Documents.dll")
        subprocess.run(["dotnet", scribe_tool,
                        "resources", "verify", "--pack", str(pack)],
                       cwd=repository, check=True, env=environment)
        pack, digest = adapt_scribe(scribe, repository, pack)
        if pack.name != "scribe-resources.zip":
            subprocess.run(["dotnet", scribe_tool, "resources", "verify", "--pack", str(pack)],
                           cwd=repository, check=True, env=environment)
        command.extend(["--scribe-pack", str(pack), "--scribe-pack-digest", digest])
    for check in selection["required_checks"]:
        command.extend(["--required-check", check + "=success"])
    # Capture the export diagnostic only. Restore/build/network failures remain
    # ordinary retryable failures and never become content rejection receipts.
    result = subprocess.run(command, cwd=repository, env=environment, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout or "", end="")
    if result.returncode:
        lines = (result.stdout or "").splitlines()
        reasons = [line for line in lines if line.startswith(CONTENT_REJECTIONS)]
        if any(line.startswith(CONTENT_REJECTIONS[-1]) for line in lines):
            reasons.extend(line for line in lines if line.startswith("describe red code="))
        if reasons and result.returncode == 2:
            selection.update(status="content-validation-rejected", rejection_reason="\n".join(reasons))
            return False
        result.check_returncode()
    return True


def publication_metadata(selection, bundle):
    verified = vertical_smoke.verify_bundle(bundle)
    if (verified["source_commit"] != selection["source_commit"]
            or verified["source_tree"] != selection["source_tree"]):
        raise ValueError("exported bundle differs from selected upstream CI source")
    return {"schema": SCHEMA, "source_repository": REPOSITORY,
            **{k: v for k, v in selection.items() if k != "should_build"},
            "release_digest": verified["release_digest"]}


def publish_outcome(repository, selection, adapter_commit, run_id, failed=False):
    """Record a semantic publication outcome on the downstream diagnostic branch."""
    status = selection["status"]
    if status not in BLOCKED_STATUSES:
        status = "publication-failed" if failed else "published"
    if failed:
        status = "publication-failed"
    # Already published plans omit report material; their completed run needs no
    # rejection receipt. Still clear the previous blocked state explicitly.
    digest = selection.get("input_digest") or "sha256:" + hashlib.sha256(selection["source_commit"].encode()).hexdigest()
    value = {"schema": OUTCOME_SCHEMA, "source_repository": REPOSITORY,
             "source_commit": require_oid(selection["source_commit"]),
             "adapter_commit": require_oid(adapter_commit), "run_id": int(run_id),
             "status": status, "input_digest": require_digest(digest),
             "reason": selection.get("rejection_reason"),
             "rejection_run_id": selection.get("rejection_run_id")}
    report_ci = selection.get("newer_report")
    if status in {"awaiting-upstream-ci", "upstream-ci-failed"}:
        report_ci = {k: selection.get(k) for k in
                     ("status", "source_commit", "ci_run_id", "ci_status", "ci_conclusion")}
    if report_ci:
        value["report_ci"] = report_ci
    rejections = list(selection.get("rejections", []))
    if status == "content-validation-rejected" and not any(r["input_digest"] == digest for r in rejections):
        rejections.append({"source_commit": value["source_commit"], "input_digest": digest,
                           "reason": value["reason"], "run_id": value["rejection_run_id"] or value["run_id"]})
    value["rejections"] = rejections[-100:]
    client = GitHub(repository)
    def write(endpoint, payload, method="PUT"):
        subprocess.run(["gh", "api", "--method", method, f"repos/{repository}/{endpoint}", "--input", "-"],
                       input=json.dumps(payload), text=True, capture_output=True, check=True)
    try:
        client.get_json("git/ref/heads/" + OUTCOME_BRANCH)
    except HTTPError as error:
        if error.code != 404: raise
        write("git/refs", {"ref": "refs/heads/" + OUTCOME_BRANCH, "sha": adapter_commit}, "POST")
    previous = None
    try:
        previous = client.get_json(f"contents/{OUTCOME_PATH}?ref={OUTCOME_BRANCH}")
    except HTTPError as error:
        if error.code != 404: raise
    payload = {"branch": OUTCOME_BRANCH, "message": "Record upstream publication outcome for Pages",
               "content": base64.b64encode((json.dumps(value) + "\n").encode()).decode()}
    if previous: payload["sha"] = previous["sha"]
    write("contents/" + OUTCOME_PATH, payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    select = commands.add_parser("plan")
    select.add_argument("--pages-repository", required=True)
    select.add_argument("--output", type=Path, required=True)
    select.add_argument("--github-output", type=Path)
    select.add_argument("--adapter-commit")
    download = commands.add_parser("acquire")
    download.add_argument("--selection", type=Path, required=True)
    download.add_argument("--destination", type=Path, required=True)
    export = commands.add_parser("project")
    export.add_argument("--selection", type=Path, required=True)
    export.add_argument("--repository", type=Path, required=True)
    export.add_argument("--report-directory", type=Path, required=True)
    export.add_argument("--destination", type=Path, required=True)
    export.add_argument("--github-output", type=Path)
    metadata = commands.add_parser("metadata")
    metadata.add_argument("--selection", type=Path, required=True)
    metadata.add_argument("--bundle", type=Path, required=True)
    metadata.add_argument("--output", type=Path, required=True)
    outcome = commands.add_parser("outcome")
    outcome.add_argument("--selection", type=Path, required=True)
    outcome.add_argument("--pages-repository", required=True)
    outcome.add_argument("--adapter-commit", required=True)
    outcome.add_argument("--run-id", required=True, type=int)
    outcome.add_argument("--failed", action="store_true")
    args = parser.parse_args()
    if args.command == "plan":
        value = plan(args.pages_repository, args.adapter_commit)
        args.output.write_text(json.dumps(value, indent=2) + "\n")
        if args.github_output:
            with args.github_output.open("a") as output:
                output.write(f"should_build={str(value['should_build']).lower()}\nsource_commit={value['source_commit']}\n")
    elif args.command == "acquire":
        selection = json.loads(args.selection.read_text())
        acquire_scribe(selection, args.destination)
        acquire_report(selection, args.destination)
    elif args.command == "project":
        selection = json.loads(args.selection.read_text())
        succeeded = project(selection, args.repository, args.report_directory, args.destination)
        args.selection.write_text(json.dumps(selection, indent=2) + "\n")
        if args.github_output:
            with args.github_output.open("a") as output:
                output.write(f"should_publish={str(succeeded).lower()}\n")
    elif args.command == "outcome":
        publish_outcome(args.pages_repository, json.loads(args.selection.read_text()),
                        args.adapter_commit, args.run_id, args.failed)
    else:
        args.output.write_text(json.dumps(publication_metadata(json.loads(args.selection.read_text()), args.bundle), indent=2) + "\n")


if __name__ == "__main__":
    main()
