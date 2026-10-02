"""Observe upstream CI separately from the immutable published-data queue.

The diagnostic branch contains observations only. Deployment is confirmed by
the served Library and receipts, never by a CI artifact or this branch.
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
from pathlib import Path
from urllib.error import HTTPError

from lib import reconcile_releases as reconcile

BRANCH = "pages-sync-status"
PATH = "data/version-status.v1.json"
WORKFLOW = "ci-current.yml"


def observe(client, pages, live_source, dev_head, now):
    value = {"state": "unavailable", "checked_at": now, "reason": None,
             "dev_head": dev_head, "live_source_commit": live_source, "commits_ahead": None,
             "ci_workflow": WORKFLOW, "ci_state": None, "ci_run_id": None,
             "ci_source_commit": None, "ci_status": None, "ci_conclusion": None,
             "publication_run_id": None, "publication_status": None,
             "publication_conclusion": None}
    try:
        if live_source:
            comparison = client.get_json(f"compare/{live_source}...{dev_head}?per_page=1")
            if (comparison.get("status") in {"ahead", "identical"}
                    and comparison.get("merge_base_commit", {}).get("sha") == live_source
                    and comparison.get("behind_by") == 0):
                ahead = comparison["ahead_by"]
                if type(ahead) is not int or ahead < 0:
                    raise ValueError("invalid upstream source distance")
                value["commits_ahead"] = ahead
        workflow = client.get_json("actions/workflows/" + WORKFLOW)
        value["ci_state"] = workflow["state"]
        if workflow.get("path") != ".github/workflows/" + WORKFLOW or workflow["state"] != "active":
            value["reason"] = "ci-workflow-unavailable"
        else:
            runs = client.get_json(f"actions/workflows/{WORKFLOW}/runs?branch=dev&event=push&per_page=1")["workflow_runs"]
            if runs:
                run = runs[0]
                if (run.get("path") != ".github/workflows/" + WORKFLOW or run.get("head_branch") != "dev"
                        or run.get("event") != "push" or run.get("workflow_id") != workflow["id"]
                        or run.get("head_repository", {}).get("full_name") != reconcile.REPOSITORY):
                    raise ValueError("upstream CI identity mismatch")
                value.update(ci_run_id=run["id"], ci_source_commit=reconcile.require_oid(run["head_sha"]),
                             ci_status=run["status"], ci_conclusion=run["conclusion"])
        # A running attempt must not conceal the last completed publication failure.
        runs = pages.get_json("actions/workflows/sync-upstream.yml/runs?branch=dev&status=completed&per_page=1")["workflow_runs"]
        if runs:
            run = runs[0]
            if run.get("path") != ".github/workflows/sync-upstream.yml" or run.get("head_branch") != "dev":
                raise ValueError("Pages publication identity mismatch")
            value.update(publication_run_id=run["id"], publication_status=run["status"],
                         publication_conclusion=run["conclusion"])
            if run["conclusion"] != "success":
                value["reason"] = value["reason"] or "publication-failed"
        value["state"] = "fresh"
    except (ValueError, OSError, KeyError, TypeError):
        value["reason"] = "source-observation-failed"
    return value


def publish(repository, source, revision):
    """Publish only a validated observed snapshot with ordinary GitHub API writes."""
    from lib.version_status import validate_status
    client = reconcile.GitHub(repository)
    value = validate_status(reconcile.read_json(Path(source).read_bytes()))
    if value["publication"] != "observed":
        raise ValueError("unserved on-deploy snapshots cannot be published as observations")
    revision = reconcile.require_oid(revision)
    def write(endpoint, data):
        completed = subprocess.run(["gh", "api", "--method", "POST" if endpoint == "git/refs" else "PUT",
                                    f"repos/{repository}/{endpoint}", "--input", "-"],
                                   input=json.dumps(data), text=True, capture_output=True, check=True)
        return reconcile.read_json(completed.stdout)
    try:
        client.get_json("git/ref/heads/" + BRANCH)
    except HTTPError as error:
        if error.code != 404:
            raise
        write("git/refs", {"ref": "refs/heads/" + BRANCH, "sha": revision})
    previous = None
    try:
        previous = client.get_json(f"contents/{PATH}?ref={BRANCH}")
        old = validate_status(reconcile.read_json(base64.b64decode(previous["content"])))
        if old["observation"]["checked_at"] > value["observation"]["checked_at"]:
            raise ValueError("refusing to overwrite a newer observation")
    except HTTPError as error:
        if error.code != 404:
            raise
    encoded = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    request = {"message": "Observe served Pages release and upstream publication progress",
               "branch": BRANCH, "content": base64.b64encode(encoded).decode()}
    if previous:
        request["sha"] = previous["sha"]
    write("contents/" + PATH, request)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    publish(args.repository, args.source, args.revision)


if __name__ == "__main__":
    main()
