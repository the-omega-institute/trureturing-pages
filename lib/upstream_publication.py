"""Project an upstream CI report into a durable Pages source publication.

No Lean execution. Only successful push runs of upstream dev's canonical ci.yml
are eligible. Published bundles live in Pages so rebuilds outlive CI retention.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
from urllib.error import HTTPError

from lib.reconcile_releases import GitHub, REPOSITORY, require_digest, require_oid
from lib import vertical_smoke

SCHEMA = "pages-upstream-ci-publication.v1"
CHECKS = ("Candidate harness engineering checks", "Canonical Lean report production",
          "Content-addressed dev baseline admission")
SUFFIXES = ("", ".sha256", ".input.attestation", ".provenance.json", ".materials.zip")
REPORT = "candidate-lean-report.json"


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
                or run.get("path") != ".github/workflows/ci.yml"
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


def plan(pages_repository):
    source = GitHub(REPOSITORY)
    pages = GitHub(pages_repository)
    runs = source.get_json("actions/workflows/ci.yml/runs?branch=dev&event=push&status=success&per_page=20")["workflow_runs"]
    run = select_run(source, runs, source.dev_head())
    existing = pages_release(pages, run["head_sha"])
    if existing:
        expected = existing["tag_name"] + ".tar.gz"
        if not any(a.get("name") == expected and a.get("state") == "uploaded" and a.get("size", 0) > 0
                   for a in existing.get("assets", [])):
            raise ValueError("existing Pages source publication is missing its bundle")
        return {"should_build": False, "source_commit": run["head_sha"]}
    if source.get_json("branches/dev").get("protected") is not True:
        raise ValueError("upstream dev is not protected")
    jobs = source.get_json(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100")["jobs"]
    verify_checks(run, jobs)
    artifacts = source.get_json(f"actions/runs/{run['id']}/artifacts?per_page=100")["artifacts"]
    matches = [a for a in artifacts if a.get("name") == "raw-lean-reports" and not a.get("expired")]
    if len(matches) != 1 or matches[0].get("workflow_run", {}).get("head_sha") != run["head_sha"]:
        raise ValueError("missing or ambiguous exact-source raw-lean-reports artifact")
    artifact = matches[0]
    if not artifact.get("digest", "").startswith("sha256:"):
        raise ValueError("upstream artifact has no GitHub content digest")
    commit = source.get_json("commits/" + run["head_sha"])
    return {"should_build": True, "source_commit": run["head_sha"],
            "source_tree": commit["commit"]["tree"]["sha"],
            "produced_at": commit["commit"]["committer"]["date"],
            "ci_run_id": run["id"], "ci_run_attempt": run["run_attempt"],
            "ci_url": run["html_url"], "artifact_id": artifact["id"],
            "artifact_digest": artifact["digest"], "required_checks": list(CHECKS)}


def acquire_report(selection, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / "report.zip"
    with archive.open("wb") as output:
        subprocess.run(["gh", "api", f"repos/{REPOSITORY}/actions/artifacts/{int(selection['artifact_id'])}/zip"],
                       stdout=output, check=True)
    with archive.open("rb") as raw:
        digest = "sha256:" + hashlib.file_digest(raw, "sha256").hexdigest()
    if digest != selection["artifact_digest"]:
        raise ValueError("downloaded CI artifact differs from GitHub digest")
    with zipfile.ZipFile(archive) as bundle:
        expected = {REPORT + suffix for suffix in SUFFIXES}
        names = bundle.namelist()
        if any(names.count(name) != 1 for name in expected):
            raise ValueError("report artifact is missing required evidence or contains duplicate paths")
        if sum(bundle.getinfo(name).file_size for name in expected) > 1024 ** 3:
            raise ValueError("report artifact exceeds size limit")
        for name in sorted(expected):
            (destination / name).write_bytes(bundle.read(name))
    archive.unlink()
    report = destination / REPORT
    actual = hashlib.sha256(report.read_bytes()).hexdigest()
    if (report.with_name(REPORT + ".sha256").read_text().split() != [actual, REPORT]
            or json.loads(report.with_name(REPORT + ".provenance.json").read_text())["report_sha256"] != actual):
        raise ValueError("upstream report checksum/provenance mismatch")


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
    else:
        args.output.write_text(json.dumps(publication_metadata(json.loads(args.selection.read_text()), args.bundle), indent=2) + "\n")


if __name__ == "__main__":
    main()
