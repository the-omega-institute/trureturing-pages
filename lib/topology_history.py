from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any


DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
SCHEMA = "topology-atlas-delta.v1"
MANIFEST_SCHEMA = "pages-topology-history.v1"
TOP_LEVEL = {
    "schema_version",
    "from_truth_release_digest",
    "to_truth_release_digest",
    "from_topology_atlas_digest",
    "to_topology_atlas_digest",
    "from_evidence_digest",
    "to_evidence_digest",
    "algorithm_profile_digest",
    "producer_commit",
    "node_transitions",
    "edge_transitions",
    "cluster_lineage",
    "frontier_delta",
    "summary",
}


class TopologyHistoryError(ValueError):
    pass


def _pairs_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise TopologyHistoryError(f"duplicate JSON member: {key}")
        result[key] = value
    return result


def _load_strict(path: Path) -> tuple[bytes, dict[str, Any]]:
    raw = path.read_bytes()
    try:
        value = json.loads(raw, object_pairs_hook=_pairs_object)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise TopologyHistoryError(f"{path} is malformed JSON") from exc
    if not isinstance(value, dict):
        raise TopologyHistoryError(f"{path} must contain a JSON object")
    return raw, value


def _require_digest(value: Any, name: str) -> str:
    if not isinstance(value, str) or not DIGEST.fullmatch(value):
        raise TopologyHistoryError(f"{name} must use sha256:<64 lowercase hex>")
    return value


def _require_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise TopologyHistoryError(f"{name} must be a non-negative integer")
    return value


def _require_sorted_unique(values: Any, name: str) -> list[str]:
    if not isinstance(values, list) or any(
        not isinstance(value, str) or not value for value in values
    ):
        raise TopologyHistoryError(f"{name} must be an array of non-empty strings")
    if values != sorted(set(values)):
        raise TopologyHistoryError(f"{name} must be strictly ordinal-sorted and unique")
    return values


def validate_delta(value: dict[str, Any]) -> None:
    if set(value) != TOP_LEVEL:
        missing = sorted(TOP_LEVEL - set(value))
        unknown = sorted(set(value) - TOP_LEVEL)
        raise TopologyHistoryError(
            f"delta members mismatch; missing={missing}, unknown={unknown}"
        )
    if value["schema_version"] != SCHEMA:
        raise TopologyHistoryError(f"schema_version must be {SCHEMA}")
    for field in (
        "from_truth_release_digest",
        "to_truth_release_digest",
        "from_topology_atlas_digest",
        "to_topology_atlas_digest",
        "from_evidence_digest",
        "to_evidence_digest",
        "algorithm_profile_digest",
    ):
        _require_digest(value[field], field)
    if value["from_truth_release_digest"] == value["to_truth_release_digest"]:
        raise TopologyHistoryError("delta must cross two truth releases")
    producer = value["producer_commit"]
    if not isinstance(producer, str) or not re.fullmatch(r"[0-9a-f]{40}", producer):
        raise TopologyHistoryError("producer_commit must be 40 lowercase hex characters")
    for field in ("node_transitions", "edge_transitions", "cluster_lineage"):
        if not isinstance(value[field], list):
            raise TopologyHistoryError(f"{field} must be an array")
    node_ids = [item.get("stable_node_id") for item in value["node_transitions"]]
    _require_sorted_unique(node_ids, "node_transitions.stable_node_id")
    edge_ids = [
        f"{item.get('stable_dependency_id')}\0{item.get('stable_dependent_id')}"
        for item in value["edge_transitions"]
    ]
    _require_sorted_unique(edge_ids, "edge_transitions stable endpoint pairs")
    frontier = value["frontier_delta"]
    if not isinstance(frontier, dict) or set(frontier) != {
        "entered_frontier",
        "left_frontier",
    }:
        raise TopologyHistoryError("frontier_delta has an invalid shape")
    _require_sorted_unique(frontier["entered_frontier"], "entered_frontier")
    _require_sorted_unique(frontier["left_frontier"], "left_frontier")
    summary = value["summary"]
    expected_fields = {
        "nodes_added",
        "nodes_retired",
        "nodes_retained",
        "edges_added",
        "edges_removed",
        "edges_retained",
        "cluster_continuations",
        "cluster_splits",
        "cluster_merges",
        "cluster_reorganizations",
        "clusters_new",
        "clusters_retired",
    }
    if not isinstance(summary, dict) or set(summary) != expected_fields:
        raise TopologyHistoryError("summary has an invalid shape")
    for field in expected_fields:
        _require_integer(summary[field], f"summary.{field}")
    node_counts = {
        relation: sum(
            item.get("relation") == relation for item in value["node_transitions"]
        )
        for relation in ("added", "retired", "retained")
    }
    edge_counts = {
        relation: sum(
            item.get("relation") == relation for item in value["edge_transitions"]
        )
        for relation in ("added", "removed", "retained")
    }
    cluster_counts = {
        relation: sum(
            item.get("relation") == relation for item in value["cluster_lineage"]
        )
        for relation in (
            "continuation",
            "split",
            "merge",
            "reorganization",
            "new",
            "retired",
        )
    }
    expected = {
        "nodes_added": node_counts["added"],
        "nodes_retired": node_counts["retired"],
        "nodes_retained": node_counts["retained"],
        "edges_added": edge_counts["added"],
        "edges_removed": edge_counts["removed"],
        "edges_retained": edge_counts["retained"],
        "cluster_continuations": cluster_counts["continuation"],
        "cluster_splits": cluster_counts["split"],
        "cluster_merges": cluster_counts["merge"],
        "cluster_reorganizations": cluster_counts["reorganization"],
        "clusters_new": cluster_counts["new"],
        "clusters_retired": cluster_counts["retired"],
    }
    if summary != expected:
        raise TopologyHistoryError("summary disagrees with exact transition arrays")
    forbidden = {
        "x",
        "y",
        "z",
        "fx",
        "fy",
        "fz",
        "camera",
        "camera_position",
        "conformation",
        "drag_offset",
        "drag_offsets",
        "cluster_offsets",
    }

    def walk(item: Any, path: str) -> None:
        if isinstance(item, dict):
            for key, child in item.items():
                if key in forbidden:
                    raise TopologyHistoryError(
                        f"{path}.{key} is presentation state and cannot enter history"
                    )
                walk(child, f"{path}.{key}")
        elif isinstance(item, list):
            for index, child in enumerate(item):
                walk(child, f"{path}[{index}]")

    walk(value, "$delta")


def _canonical_bytes(value: dict[str, Any]) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def build_manifest(
    current_release_digest: str,
    delta_paths: list[Path],
    output_path: Path,
) -> dict[str, Any]:
    current = _require_digest(current_release_digest, "current_release_digest")
    deltas: list[tuple[Path, bytes, dict[str, Any], str]] = []
    for path in delta_paths:
        raw, value = _load_strict(path)
        validate_delta(value)
        digest = "sha256:" + hashlib.sha256(raw).hexdigest()
        deltas.append((path, raw, value, digest))
    by_from: dict[tuple[str, str], tuple[Path, bytes, dict[str, Any], str]] = {}
    to_coordinates: set[tuple[str, str]] = set()
    for item in deltas:
        value = item[2]
        key = (
            value["from_truth_release_digest"],
            value["from_topology_atlas_digest"],
        )
        if key in by_from:
            raise TopologyHistoryError(f"history forks at {key[0]}")
        by_from[key] = item
        to_coordinates.add(
            (
                value["to_truth_release_digest"],
                value["to_topology_atlas_digest"],
            )
        )
    starts = [key for key in by_from if key not in to_coordinates]
    if deltas and len(starts) != 1:
        raise TopologyHistoryError("history must form one continuous release chain")
    ordered: list[tuple[Path, bytes, dict[str, Any], str]] = []
    if starts:
        cursor = starts[0]
        while cursor in by_from:
            item = by_from[cursor]
            ordered.append(item)
            value = item[2]
            cursor = (
                value["to_truth_release_digest"],
                value["to_topology_atlas_digest"],
            )
        if len(ordered) != len(deltas):
            raise TopologyHistoryError("history contains a disconnected release segment")
    if ordered and ordered[-1][2]["to_truth_release_digest"] != current:
        raise TopologyHistoryError("history does not terminate at current release")

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    history_dir = output_path.parent / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    for _, raw, value, digest in ordered:
        filename = f"topology-atlas-delta-{digest[7:]}.json"
        destination = history_dir / filename
        if destination.exists() and destination.read_bytes() != raw:
            raise TopologyHistoryError(f"content-address collision at {destination}")
        if not destination.exists():
            temporary = destination.with_suffix(destination.suffix + ".tmp")
            temporary.write_bytes(raw)
            temporary.replace(destination)
        relative = destination.relative_to(output_path.parent.parent).as_posix()
        entries.append(
            {
                "delta_path": relative,
                "delta_digest": digest,
                "from_truth_release_digest": value[
                    "from_truth_release_digest"
                ],
                "to_truth_release_digest": value["to_truth_release_digest"],
                "from_topology_atlas_digest": value[
                    "from_topology_atlas_digest"
                ],
                "to_topology_atlas_digest": value[
                    "to_topology_atlas_digest"
                ],
            }
        )
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "current_truth_release_digest": current,
        "entries": entries,
    }
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_bytes(_canonical_bytes(manifest))
    temporary.replace(output_path)
    return manifest


def _release_from_manifest(path: Path) -> str:
    _, value = _load_strict(path)
    release = value.get("truth_release_digest")
    return _require_digest(release, "truth_release_digest")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a content-addressed Pages Topology Atlas history manifest."
    )
    parser.add_argument("--current-release-digest")
    parser.add_argument("--current-atlas-manifest", type=Path)
    parser.add_argument("--delta", action="append", type=Path, default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    if bool(args.current_release_digest) == bool(args.current_atlas_manifest):
        parser.error(
            "provide exactly one of --current-release-digest or --current-atlas-manifest"
        )
    current = (
        args.current_release_digest
        if args.current_release_digest
        else _release_from_manifest(args.current_atlas_manifest)
    )
    build_manifest(current, args.delta, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
