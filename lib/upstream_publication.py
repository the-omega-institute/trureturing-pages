"""Project an upstream CI report into a durable Pages source publication.

Consume existing scheduled cache snapshots without running Lean, gated by
canonical ci-current.yml push checks for their exact protected-dev source.
Published bundles live in Pages so rebuilds outlive upstream cache retention.
"""
from __future__ import annotations

import argparse
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
REPORT = ".lake/build/stratalint/raw-lean-report.json"
REPORT_FILES = tuple("raw-lean-report.json" + suffix for suffix in
                     ("", ".sha256", ".input.attestation", ".provenance.json", ".materials.zip"))
CACHE_LIMIT = 16 * 1024 ** 3
REPORT_LIMIT = 1024 ** 3


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
    if (manifest.get("schema") != "lean-release-seed-v3"
            or not re.fullmatch(r"[0-9a-f]{40}/linux-arm64", partition)
            or not all(isinstance(v, str) and re.fullmatch(r"[1-9][0-9]*", v) for v in (run, attempt))
            or release["tag_name"] != "lean-cache-v2-" + partition.replace("/", "-") + "-" + run + "-" + attempt):
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


def verify_cache_run(source, manifest):
    run = source.get_json(f"actions/runs/{manifest['workflow_run_id']}/attempts/{manifest['workflow_run_attempt']}")
    if (run.get("id") != int(manifest["workflow_run_id"])
            or run.get("run_attempt") != int(manifest["workflow_run_attempt"])
            or run.get("head_sha") != manifest["producer_commit_sha"]
            or run.get("head_branch") != "dev" or run.get("event") != "schedule"
            or run.get("path") != ".github/workflows/" + CACHE_WORKFLOW
            or run.get("status") != "completed" or run.get("conclusion") != "success"
            or run.get("repository", {}).get("full_name") != REPOSITORY
            or run.get("head_repository", {}).get("full_name") != REPOSITORY):
        raise ValueError("cache report has no matching successful scheduled dev producer")
    return run


def plan(pages_repository):
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
    # The existing scheduled cache producer carries the checked report. Its
    # manifest selects an exact source; a cache is never itself a CI verdict.
    for release in source.releases():
        if (release.get("draft") or release.get("prerelease")
                or not re.fullmatch(r"lean-cache-v2-[0-9a-f]{40}-linux-arm64-[1-9][0-9]*-[1-9][0-9]*", release.get("tag_name", ""))):
            continue
        manifest = cache_manifest(release)
        commit = manifest["producer_commit_sha"]
        if source.is_ancestor(commit, head):
            snapshots.append((release, manifest))
    selected = None
    for snapshot in snapshots:
        if selected is None or source.is_ancestor(selected[1]["producer_commit_sha"], snapshot[1]["producer_commit_sha"]):
            selected = snapshot
    if selected is None:
        raise ValueError("no published upstream report snapshot on protected dev")
    release, manifest = selected
    commit = manifest["producer_commit_sha"]
    producer = verify_cache_run(source, manifest)
    existing = pages_release(pages, commit)
    freshness = {"upstream_dev_head": head, "report_source_commit": commit,
                 "report_release_tag": release["tag_name"]}
    if existing:
        expected = existing["tag_name"] + ".tar.gz"
        if not any(a.get("name") == expected and a.get("state") == "uploaded" and a.get("size", 0) > 0
                   for a in existing.get("assets", [])):
            raise ValueError("existing Pages source publication is missing its bundle")
        return {"should_build": False, "status": "latest-report-already-published",
                "source_commit": commit, **freshness}
    runs = source.get_json(f"actions/workflows/{WORKFLOW}/runs?branch=dev&event=push&head_sha={commit}&status=success&per_page=100")["workflow_runs"]
    exact = [r for r in runs if r.get("head_sha") == commit and r.get("workflow_id") == workflow["id"]]
    run = select_run(source, exact, head)
    jobs = source.get_json(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100")["jobs"]
    verify_checks(run, jobs)
    identity = source.get_json("commits/" + commit)
    return {"should_build": True, "status": "existing-upstream-report-awaiting-verification", **freshness,
            "source_commit": commit, "source_tree": identity["commit"]["tree"]["sha"],
            "produced_at": identity["commit"]["committer"]["date"],
            "ci_run_id": run["id"], "ci_run_attempt": run["run_attempt"], "ci_url": run["html_url"],
            "report_run_id": producer["id"], "report_run_attempt": producer["run_attempt"],
            "report_manifest": manifest, "required_checks": list(EXPORT_CHECKS)}


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
    for check in selection["required_checks"]:
        command.extend(["--required-check", check + "=success"])
    subprocess.run(command, cwd=repository, check=True, env=environment)


def publication_metadata(selection, bundle):
    verified = vertical_smoke.verify_bundle(bundle)
    if (verified["source_commit"] != selection["source_commit"]
            or verified["source_tree"] != selection["source_tree"]):
        raise ValueError("exported bundle differs from selected upstream CI source")
    return {"schema": SCHEMA, "source_repository": REPOSITORY,
            **{k: v for k, v in selection.items() if k != "should_build"},
            "release_digest": verified["release_digest"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    select = commands.add_parser("plan")
    select.add_argument("--pages-repository", required=True)
    select.add_argument("--output", type=Path, required=True)
    select.add_argument("--github-output", type=Path)
    download = commands.add_parser("acquire")
    download.add_argument("--selection", type=Path, required=True)
    download.add_argument("--destination", type=Path, required=True)
    export = commands.add_parser("project")
    export.add_argument("--selection", type=Path, required=True)
    export.add_argument("--repository", type=Path, required=True)
    export.add_argument("--report-directory", type=Path, required=True)
    export.add_argument("--destination", type=Path, required=True)
    metadata = commands.add_parser("metadata")
    metadata.add_argument("--selection", type=Path, required=True)
    metadata.add_argument("--bundle", type=Path, required=True)
    metadata.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "plan":
        value = plan(args.pages_repository)
        args.output.write_text(json.dumps(value, indent=2) + "\n")
        if args.github_output:
            with args.github_output.open("a") as output:
                output.write(f"should_build={str(value['should_build']).lower()}\nsource_commit={value['source_commit']}\n")
    elif args.command == "acquire":
        acquire_report(json.loads(args.selection.read_text()), args.destination)
    elif args.command == "project":
        project(json.loads(args.selection.read_text()), args.repository, args.report_directory, args.destination)
    else:
        args.output.write_text(json.dumps(publication_metadata(json.loads(args.selection.read_text()), args.bundle), indent=2) + "\n")


if __name__ == "__main__":
    main()
