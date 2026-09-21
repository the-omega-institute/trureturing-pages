"""Project an upstream CI report into a durable Pages source publication.

No Lean execution. Only successful push runs of upstream dev's canonical ci-push.yml
are eligible. Published bundles live in Pages so rebuilds outlive CI retention.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import zipfile
from urllib.error import HTTPError

from lib.reconcile_releases import GitHub, REPOSITORY, require_digest, require_oid
from lib import vertical_smoke

SCHEMA = "pages-upstream-ci-publication.v1"
WORKFLOW = "ci-push.yml"
CHECKS = ("engineering", "current")
REPORT = ".lake/build/stratalint/raw-lean-report.json"
ARCHIVE = "ci-current.tar.gz"


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


def artifact_for(run, artifacts, prefix):
    name = f"{prefix}-{run['id']}-{run['run_attempt']}"
    matches = [a for a in artifacts if a.get("name") == name and not a.get("expired")]
    if (len(matches) != 1 or matches[0].get("workflow_run", {}).get("head_sha") != run["head_sha"]
            or matches[0].get("workflow_run", {}).get("id") != run["id"]):
        raise ValueError("missing or ambiguous exact-run artifact: " + name)
    require_digest(matches[0].get("digest", ""))
    return matches[0]


def download_artifact(artifact_id, digest, archive):
    require_digest(digest)
    with Path(archive).open("wb") as output:
        subprocess.run(["gh", "api", f"repos/{REPOSITORY}/actions/artifacts/{int(artifact_id)}/zip"],
                       stdout=output, check=True)
    with Path(archive).open("rb") as raw:
        actual = "sha256:" + hashlib.file_digest(raw, "sha256").hexdigest()
    if actual != digest:
        raise ValueError("downloaded CI artifact differs from GitHub digest")


def report_required(run, jobs, artifacts):
    """Diagnostics only route candidates; native transport verification admits them."""
    current = next(job for job in jobs if job["name"] == "current")
    execution = [step for step in current.get("steps", []) if step.get("name") == "Execute selected stage"]
    if len(execution) == 1 and execution[0].get("conclusion") == "skipped":
        return False
    diagnostic = artifact_for(run, artifacts, "ci-current-diagnostics")
    with tempfile.TemporaryDirectory(prefix="pages-ci-diagnostics-") as temp:
        archive = Path(temp) / "diagnostics.zip"
        download_artifact(diagnostic["id"], diagnostic["digest"], archive)
        with zipfile.ZipFile(archive) as bundle:
            name = "current-result.json"
            if bundle.namelist().count(name) != 1 or bundle.getinfo(name).file_size > 32 * 1024 ** 2:
                raise ValueError("missing or invalid current diagnostic receipt")
            receipt = json.loads(bundle.read(name))
    if (receipt.get("stage") != "current" or receipt.get("status") != "completed"
            or receipt.get("git_candidate", {}).get("commit") != run["head_sha"]):
        raise ValueError("current diagnostic receipt differs from selected source")
    steps = receipt["scope"]["execution"]["steps"]
    if not isinstance(steps, list) or not all(isinstance(step, str) for step in steps):
        raise ValueError("invalid current diagnostic execution plan")
    return "lean-report" in steps


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
    skipped = []
    latest = None
    # API pages follow original creation time, so a late rerun cannot outrank a
    # newer dev push. Every accepted source must still belong to protected dev.
    for page in range(1, 11):
        runs = source.get_json(f"actions/workflows/{WORKFLOW}/runs?branch=dev&event=push&status=success&per_page=100&page={page}")["workflow_runs"]
        for run in sorted(runs, key=lambda row: row["id"], reverse=True):
            if run.get("workflow_id") != workflow["id"]:
                continue
            try:
                select_run(source, [run], head)
            except ValueError as error:
                if str(error) == "no successful canonical upstream dev CI run available":
                    continue
                raise
            latest = latest or run["head_sha"]
            freshness = {"upstream_dev_head": head, "latest_successful_ci_source": latest,
                         "skipped_without_report": skipped.copy()}
            existing = pages_release(pages, run["head_sha"])
            if existing:
                expected = existing["tag_name"] + ".tar.gz"
                if not any(a.get("name") == expected and a.get("state") == "uploaded" and a.get("size", 0) > 0
                           for a in existing.get("assets", [])):
                    raise ValueError("existing Pages source publication is missing its bundle")
                return {"should_build": False, "status": "latest-report-already-published",
                        "source_commit": run["head_sha"], **freshness}
            jobs = source.get_json(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100")["jobs"]
            verify_checks(run, jobs)
            artifacts = source.get_json(f"actions/runs/{run['id']}/artifacts?per_page=100")["artifacts"]
            if not report_required(run, jobs, artifacts):
                skipped.append({"source_commit": run["head_sha"], "ci_run_id": run["id"],
                                "reason": "lean-report-not-required"})
                continue
            artifact = artifact_for(run, artifacts, "ci-current")
            commit = source.get_json("commits/" + run["head_sha"])
            return {"should_build": True, "status": "new-report-awaiting-transport-verification", **freshness,
                    "source_commit": run["head_sha"],
                    "source_tree": commit["commit"]["tree"]["sha"],
                    "produced_at": commit["commit"]["committer"]["date"],
                    "ci_run_id": run["id"], "ci_run_attempt": run["run_attempt"],
                    "ci_url": run["html_url"], "artifact_id": artifact["id"],
                    "artifact_digest": artifact["digest"], "required_checks": list(CHECKS)}
        if len(runs) < 100:
            break
    raise ValueError("no publishable current CI report found; refusing to report stale data as synchronized")


def acquire_report(selection, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / "report.zip"
    download_artifact(selection["artifact_id"], selection["artifact_digest"], archive)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.namelist() != [ARCHIVE] or bundle.getinfo(ARCHIVE).file_size > 2 * 1024 ** 3:
            raise ValueError("current artifact has unexpected contents or exceeds size limit")
        with bundle.open(ARCHIVE) as reader, (destination / ARCHIVE).open("wb") as writer:
            shutil.copyfileobj(reader, writer)
    archive.unlink()


def project(selection, repository, archive, destination):
    """Reuse the source commit's transport verifier and compiled exporter, without Lean."""
    repository = Path(repository).resolve()
    commit = require_oid(selection["source_commit"])
    identity = subprocess.check_output(["git", "rev-parse", "HEAD", "HEAD^{tree}"], cwd=repository, text=True).splitlines()
    if identity != [commit, selection["source_tree"]]:
        raise ValueError("upstream checkout differs from selected source")
    # Transport identity is the source repository, not this Pages workflow.
    environment = {**os.environ, "GITHUB_REPOSITORY": REPOSITORY, "STRATALINT_CACHE_WRITES": "false"}
    helper = "tools/scripts/workflow/ci.py"
    subprocess.run(["python3", helper, "checkout", "--repository", str(repository), "--commit", commit],
                   cwd=repository, check=True, env=environment)
    subprocess.run(["python3", helper, "restore", "--repository", str(repository), "--stage", "current",
                    "--commit", commit, "--run-id", str(selection["ci_run_id"]),
                    "--run-attempt", str(selection["ci_run_attempt"]), "--archive", str(Path(archive).resolve())],
                   cwd=repository, check=True, env=environment)
    current = json.loads((repository / "build/ci/current.json").read_text())
    if not any(step["name"] == "lean-report" for step in current["steps"]) or not (repository / REPORT).is_file():
        raise ValueError("verified current transport has no complete Lean report")
    if selection["required_checks"] != list(CHECKS):
        raise ValueError("unexpected selected check contract")
    command = ["dotnet", "tools/StrataLint.Cli/bin/Release/net10.0/StrataLint.dll", "truth-release",
               "--out", str(Path(destination).resolve()), "--candidate-lean-report", str(repository / REPORT),
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
    export.add_argument("--archive", type=Path, required=True)
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
        project(json.loads(args.selection.read_text()), args.repository, args.archive, args.destination)
    else:
        args.output.write_text(json.dumps(publication_metadata(json.loads(args.selection.read_text()), args.bundle), indent=2) + "\n")


if __name__ == "__main__":
    main()
