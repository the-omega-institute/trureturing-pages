"""An observational read model over release reconciliation, Library and receipts.

No acquisition, ingestion, receipt mutation or deployment is performed here.
Only a served ledger confirms deployment; --for-deployment stages a projection
whose deployment claims become true when the complete site is published.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime
from functools import lru_cache
import json
from pathlib import Path
import shutil
import sys
import tempfile

from lib import living_library, reconcile_releases as reconcile
from tools.validate import validate, ValidationError


ROOT = Path(__file__).resolve().parents[1]
STATUS_PATH = "data/version-status.v1.json"
SCHEMA = "pages-version-status.v1"
STAGES = ("published", "received", "verified", "generated", "deployed")
EMPTY_RECEIPTS = {"schema_version": reconcile.RECEIPTS_SCHEMA, "entries": []}
STALE_AFTER_SECONDS = 7 * 86400


def timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("status timestamps must be UTC")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def halt(stage, reason, suspected=False):
    return {"stage": stage, "reason": reason, "suspected_upstream_failure": suspected}


def validate_status(value):
    schema = json.loads((ROOT / "contracts/pages-version-status.v1.schema.json").read_text())
    validate(schema, value)
    rows, counts = value["releases"], value["counts"]
    if value["observation"]["state"] == "unavailable":
        if rows or any(v is not None for v in counts.values()) or any(v is not None for v in value["head"].values()):
            raise ValueError("unavailable status cannot claim known counts or heads")
        return value
    if len({r["digest"] for r in rows}) != len(rows):
        raise ValueError("duplicate release in version status")
    for row in rows:
        stages = row["stages"]
        if not stages["published"] or not (stages["received"] == stages["verified"] == stages["generated"]):
            raise ValueError("ingestion evidence must be atomic")
        if stages["deployed"] and not stages["generated"]:
            raise ValueError("deployment needs generated evidence")
        if row["furthest_stage"] != next(k for k in reversed(STAGES) if stages[k]):
            raise ValueError("incorrect furthest stage")
    for stage in STAGES:
        if counts[stage] != sum(r["stages"][stage] for r in rows):
            raise ValueError("incorrect stage count")
    if counts["quarantined"] != sum(r["quarantined_count"] for r in rows):
        raise ValueError("incorrect quarantine count")
    current = value["head"]["current_truth_release_digest"]
    if current is not None:
        # The live release can be absent from the upstream listing (e.g. mock
        # or deleted release); in that case lag is deliberately unknown.
        matching = [r for r in rows if r["digest"] == current]
        if matching and not matching[0]["stages"]["deployed"]:
            raise ValueError("live digest lacks deployed evidence")
    return value


def build_status(releases, history, receipts, is_ancestor, dev_head, *,
                 live_history=None, live_receipts=None, now=None,
                 for_deployment=False, stale_after_seconds=STALE_AFTER_SECONDS, failure=None):
    now = now or reconcile.utc_now()
    checked = timestamp(now)
    if not isinstance(releases, list) or any(not isinstance(r, dict) for r in releases):
        raise ValueError("release listing must be an array of metadata objects")
    if type(stale_after_seconds) is not int or stale_after_seconds < 1:
        raise ValueError("staleness threshold must be positive")
    ancestor = lru_cache(maxsize=None)(is_ancestor)
    # Both the missing set and the complete ancestor ordering belong to the
    # existing planner. In particular, dates never order releases or lag.
    plan = reconcile.plan_releases(releases, history, receipts, ancestor, dev_head, limit=1)
    ordered = reconcile.plan_releases(releases, None, EMPTY_RECEIPTS, ancestor, dev_head, limit=0)["pending"]
    entries = {e["truth_release_digest"]: e for e in reconcile.history_entries(history)}
    if for_deployment:
        live_history, live_receipts = history, receipts
    live_receipts = live_receipts or EMPTY_RECEIPTS
    reconcile.validate_receipt_history(live_history, live_receipts)
    live_entries = {e["truth_release_digest"]: e for e in reconcile.history_entries(live_history)}
    deployed = {r["release_digest"] for r in live_receipts["entries"] if r["deployed"]}
    # A local history/served receipt mismatch is an incoherent observation,
    # never grounds for promoting a different snapshot to deployed.
    for key in deployed & entries.keys():
        if entries[key]["digest"] != live_entries[key]["digest"]:
            raise ValueError("local and live Library coordinates disagree")
    evidence = {**live_entries, **entries}
    blocked = {r["digest"] for r in plan["blocked"]}
    metadata = {r.get("tag_name"): r for r in releases if not r.get("draft") and not r.get("prerelease")}
    if failure:
        reconcile.require_digest(failure["release_digest"])
        if failure["stage"] not in STAGES or failure["reason"] not in {
            "bundle-download-failed", "bundle-invalid", "acquisition-failed",
            "verification-failed", "generation-failed", "deployment-failed", "atomic-ingestion-failed",
        }:
            raise ValueError("invalid observed failure")
    rows = []
    for release in ordered:
        key = release["digest"]
        entry = evidence.get(key)
        assets = metadata[release["tag"]].get("assets")
        if assets is not None and (not isinstance(assets, list) or any(not isinstance(a, dict) for a in assets)):
            raise ValueError("invalid release assets metadata")
        asset = "unknown" if assets is None else "missing"
        if assets is not None and any(a.get("name") == release["tag"] + ".tar.gz"
                                      and a.get("state") == "uploaded" and a.get("size", 0) > 0 for a in assets):
            asset = "present"
        stages = dict(published=True, received=entry is not None, verified=entry is not None,
                      generated=entry is not None, deployed=key in deployed)
        furthest = next(k for k in reversed(STAGES) if stages[k])
        reason = None
        if furthest == "generated":
            reason = halt("deployed", "generated-not-deployed")
        elif furthest == "published":
            reason = (halt("received", "pre-tip-replay-required") if key in blocked else
                      halt("received", "bundle-missing", True) if asset == "missing" else
                      halt("received", "awaiting-ingestion"))
        if failure and key == failure["release_digest"] and furthest != "deployed" and key not in blocked:
            # The completed history entry remains the evidence boundary even
            # if a worker observed bytes before a verification failure.
            reason = halt(failure["stage"], failure["reason"],
                          failure["reason"] in {"bundle-download-failed", "bundle-invalid", "acquisition-failed"})
            if furthest == "generated":
                reason = halt("deployed", "generated-not-deployed")
        quarantined = entry.get("quarantined_problems", []) if entry else []
        if not isinstance(quarantined, list):
            raise ValueError("invalid quarantine audit")
        rows.append({"digest": key, "source_commit": release["source_commit"],
                     "published_at": release["published_at"], "stages": stages,
                     "furthest_stage": furthest, "bundle_asset": asset, "halt": reason,
                     "quarantined_count": len(quarantined)})
    live_tip = live_history["current_truth_release_digest"] if live_history else None
    current = live_tip if live_tip in deployed else None
    keys = [r["digest"] for r in rows]
    behind = len(keys) - keys.index(current) - 1 if current in keys else (len(keys) if not live_history else None)
    dates = [r["published_at"] for r in rows if r["published_at"] is not None]
    latest_date = max(dates, key=timestamp) if dates else None
    # Surface the earliest unresolved coordinate, retaining every row's halt
    # so an upstream missing bundle and an undeployed build can coexist.
    summary_halt = next((r["halt"] for r in rows if r["halt"]), None)
    counts = {stage: sum(r["stages"][stage] for r in rows) for stage in STAGES}
    counts.update(pending=len(plan["pending"]), blocked=len(blocked),
                  quarantined=sum(r["quarantined_count"] for r in rows))
    return validate_status({
        "schema_version": SCHEMA, "observed_at": now,
        "publication": "on-deploy" if for_deployment else "observed",
        "observation": {"state": "fresh", "checked_at": now, "halt_stage": None, "reason": None},
        "counts": counts, "head": {"current_truth_release_digest": current,
            "upstream_latest_digest": keys[-1] if keys else None, "behind": behind},
        "upstream": {"latest_published_at": latest_date, "stale_after_seconds": stale_after_seconds,
                     "stale": (checked - timestamp(latest_date)).total_seconds() > stale_after_seconds if latest_date else None},
        "halt": summary_halt, "releases": rows,
    })


def fallback_status(previous, now, stage="published"):
    if previous is not None:
        value = copy.deepcopy(validate_status(previous))
        if value["observation"]["state"] != "unavailable":
            value["observation"] = {"state": "last-good", "checked_at": now,
                                    "halt_stage": stage, "reason": "status-refresh-failed"}
            return validate_status(value)
    return validate_status({
        "schema_version": SCHEMA, "observed_at": None, "publication": "observed",
        "observation": {"state": "unavailable", "checked_at": now,
                        "halt_stage": stage, "reason": "status-refresh-failed"},
        "counts": {k: None for k in (*STAGES, "pending", "blocked", "quarantined")},
        "head": {"current_truth_release_digest": None, "upstream_latest_digest": None, "behind": None},
        "upstream": {"latest_published_at": None, "stale_after_seconds": STALE_AFTER_SECONDS, "stale": None},
        "halt": None, "releases": [],
    })


def write_status(output, value):
    validate_status(value)
    output = Path(output)
    encoded = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    # Always start from the source template, including on cached build retries.
    template = (ROOT / "site/version-status.html").read_text()
    embedded = encoded.replace("<", "\\u003c").replace("&", "\\u0026")
    page = template.replace("<!-- VERSION_STATUS_SNAPSHOT -->", embedded)
    living_library.write_bytes(output / STATUS_PATH, encoded.encode())
    living_library.write_bytes(output / "version-status.html", page.encode())
    (output / "assets").mkdir(parents=True, exist_ok=True)
    for name in ("version-status-core.mjs", "version-status.mjs", "version-status.css", "site-theme.css", "i18n.mjs", "locales/zh-CN.json"):
        source, target = ROOT / "site/assets" / name, output / "assets" / name
        if source.resolve() != target.resolve():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)


def refresh_status(output, *, previous_url=None, releases_file=None, ancestry_file=None,
                   for_deployment=False, now=None, stale_after_seconds=STALE_AFTER_SECONDS,
                   failure=None, repository=reconcile.REPOSITORY):
    output, now = Path(output), now or reconcile.utc_now()
    previous = None
    local = output / STATUS_PATH
    if local.exists():
        try:
            candidate = validate_status(reconcile.read_json(local.read_bytes()))
            if candidate["publication"] == "observed":
                previous = candidate
        except (ValueError, OSError, KeyError, TypeError, ValidationError):
            pass
    try:
        raw = None
        if previous_url:
            raw = living_library.read_remote(previous_url, f"{STATUS_PATH}?status={now}", optional=True)
        if raw is not None:
            previous = validate_status(reconcile.read_json(raw))
            # This byte stream came from the served site, so an on-deploy
            # projection is now an observed publication.
            previous["publication"] = "observed"
    except (ValueError, OSError, KeyError, TypeError, ValidationError):
        pass  # A corrupt fallback must never become a healthy empty pipeline.
    stage = "published"
    try:
        client = reconcile.GitHub(repository)
        releases = reconcile.read_json(Path(releases_file).read_bytes()) if releases_file else client.releases()
        if ancestry_file:
            ancestry = reconcile.RecordedAncestry(reconcile.read_json(Path(ancestry_file).read_bytes()))
            dev_head = ancestry.head
        else:
            ancestry, dev_head = client, client.dev_head()
        stage = "received"
        history, receipts = reconcile.read_state(output, previous_url)
        live_history, live_receipts = None, EMPTY_RECEIPTS
        if previous_url and not for_deployment:
            # read_state prefers local bytes: an empty directory is necessary
            # here so staged receipts can never masquerade as served evidence.
            with tempfile.TemporaryDirectory(prefix="pages-live-status-") as temp:
                live_history, live_receipts = reconcile.read_state(temp, previous_url)
        value = build_status(releases, history, receipts, ancestry.is_ancestor, dev_head,
                             live_history=live_history, live_receipts=live_receipts, now=now,
                             for_deployment=for_deployment, stale_after_seconds=stale_after_seconds, failure=failure)
    except (ValueError, OSError, KeyError, TypeError, ValidationError) as error:
        print(f"version status refresh failed at {stage}: {error}", file=sys.stderr)
        value = fallback_status(previous, now, stage)
    write_status(output, value)
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("_site"))
    parser.add_argument("--previous-url")
    parser.add_argument("--repository", default=reconcile.REPOSITORY)
    parser.add_argument("--releases-file", type=Path)
    parser.add_argument("--ancestry-file", type=Path)
    parser.add_argument("--for-deployment", action="store_true")
    parser.add_argument("--stale-after-seconds", type=int, default=STALE_AFTER_SECONDS)
    parser.add_argument("--failure-digest")
    parser.add_argument("--failure-stage", choices=STAGES)
    parser.add_argument("--failure-reason")
    args = parser.parse_args(argv)
    failure = None
    if any((args.failure_digest, args.failure_stage, args.failure_reason)):
        if not all((args.failure_digest, args.failure_stage, args.failure_reason)):
            parser.error("failure digest, stage and reason must be supplied together")
        failure = {"release_digest": args.failure_digest, "stage": args.failure_stage, "reason": args.failure_reason}
    value = refresh_status(args.output, previous_url=args.previous_url, repository=args.repository,
                           releases_file=args.releases_file, ancestry_file=args.ancestry_file,
                           for_deployment=args.for_deployment, stale_after_seconds=args.stale_after_seconds, failure=failure)
    print(json.dumps({"observation": value["observation"], "counts": value["counts"], "head": value["head"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
