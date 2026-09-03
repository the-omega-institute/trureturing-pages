"""Truth-release acquisition, verification, projection, and deploy-state helpers."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tarfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TOPOLOGY_VERSION = "0.2.0-alpha.1"
TOPOLOGY_PRODUCER_COMMIT = "dbd407d52806b4a87bb3c129f810a10d438a2b53"
ALGORITHM_PROFILE = ROOT / "config" / "algorithm-profile.v1.json"
ARTIFACT_KEYS = (
    "source_snapshot",
    "truth_graph",
    "raw_lean_report",
    "truth_export",
    "blueprint_index",
    "frozen_ledger_head",
    "residual_frontier",
)
EXPECTED_ARTIFACT_NAMES = {
    "source-snapshot.v1.json",
    "truth-graph.v1.json",
    "raw-lean-report.json",
    "truth-export.v1.json",
    "blueprint-index.v1.json",
    "frozen-ledger-head.json",
    "echo-residual-summary.md",
}
ADMIN_NAMES = {
    "SHA256SUMS",
    "release-manifest.v1.json",
    "truth-release-publication.v1.json",
}
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_BUNDLE_BYTES = 1024 * 1024 * 1024
MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_BUNDLE_FILES = 16
MAX_GRAPH_NODES = 100_000
MAX_GRAPH_EDGES = 500_000
MAX_BLUEPRINT_NODES = 100_000
MAX_BLUEPRINT_EDGES = 500_000
MAX_ANCHORS = 500_000
_DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
_HEX40 = re.compile(r"[0-9a-f]{40}\Z")
_SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
_STATES = {"closed", "open", "tail", "semantic"}
_STATUS = {state: state.title() for state in _STATES}


class ReleaseContractError(ValueError):
    pass


def _reject_duplicate(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, child in pairs:
        if key in value:
            raise ReleaseContractError(f"duplicate JSON property: {key}")
        value[key] = child
    return value


def _reject_float(value: str) -> None:
    raise ReleaseContractError(f"floating-point values are forbidden: {value}")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate,
            parse_float=_reject_float,
            parse_constant=_reject_float,
        )
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ReleaseContractError(f"cannot read {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise ReleaseContractError(f"{path.name} must contain a JSON object")
    return value


def _read_deployment_json(path: Path) -> dict[str, Any]:
    """Read Pages-owned JSON, where measured seconds may legitimately be decimal."""
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate,
            parse_constant=_reject_float,
        )
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ReleaseContractError(f"cannot read {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise ReleaseContractError(f"{path.name} must contain a JSON object")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _require_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        missing = sorted(expected - set(value))
        extra = sorted(set(value) - expected)
        raise ReleaseContractError(f"{label} field set mismatch (missing={missing}, extra={extra})")


def _require_digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or _DIGEST.fullmatch(value) is None:
        raise ReleaseContractError(f"{label} must be a lowercase sha256 digest")
    return value


def _require_oid(value: Any, label: str) -> str:
    if not isinstance(value, str) or _HEX40.fullmatch(value) is None:
        raise ReleaseContractError(f"{label} must be a lowercase 40-character Git object id")
    return value


def _require_safe_name(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SAFE_NAME.fullmatch(value) is None:
        raise ReleaseContractError(f"{label} is not a safe bundle-root filename")
    return value


def extract_archive(archive: str | Path, output_directory: str | Path) -> None:
    """Extract only bounded, regular root files from an untrusted release tarball."""
    source = Path(archive)
    destination = Path(output_directory)
    if source.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ReleaseContractError("truth-release archive exceeds the compressed-size limit")
    if destination.exists():
        raise ReleaseContractError("archive destination already exists")
    destination.mkdir(parents=True)

    total = 0
    with tarfile.open(source, mode="r:gz") as bundle:
        members = bundle.getmembers()
        if not members or len(members) > MAX_BUNDLE_FILES + 1:
            raise ReleaseContractError("truth-release archive file count is outside bounds")
        files: list[tuple[tarfile.TarInfo, str]] = []
        for member in members:
            normalized = member.name.removeprefix("./")
            if normalized in ("", ".") and member.isdir():
                continue
            path = PurePosixPath(normalized)
            if len(path.parts) != 1 or path.is_absolute() or ".." in path.parts:
                raise ReleaseContractError(f"archive member escapes the bundle root: {member.name}")
            name = _require_safe_name(path.name, "archive member")
            if not member.isfile() or member.islnk() or member.issym():
                raise ReleaseContractError(f"archive member is not a regular file: {member.name}")
            if member.size < 0 or member.size > MAX_FILE_BYTES:
                raise ReleaseContractError(f"archive member exceeds the per-file limit: {member.name}")
            total += member.size
            if total > MAX_BUNDLE_BYTES:
                raise ReleaseContractError("truth-release archive exceeds the expanded-size limit")
            files.append((member, name))

        if len({name for _, name in files}) != len(files):
            raise ReleaseContractError("truth-release archive contains duplicate filenames")
        for member, name in files:
            reader = bundle.extractfile(member)
            if reader is None:
                raise ReleaseContractError(f"cannot read archive member: {member.name}")
            target = destination / name
            with reader, target.open("xb") as writer:
                shutil.copyfileobj(reader, writer, length=1024 * 1024)


def _verify_root_files(bundle: Path) -> None:
    if not bundle.is_dir() or bundle.is_symlink():
        raise ReleaseContractError("bundle root must be a real directory")
    entries = list(bundle.iterdir())
    if len(entries) > MAX_BUNDLE_FILES:
        raise ReleaseContractError("bundle contains too many root entries")
    total = 0
    for entry in entries:
        _require_safe_name(entry.name, "bundle entry")
        if entry.is_symlink() or not entry.is_file():
            raise ReleaseContractError(f"bundle entry is not a regular file: {entry.name}")
        size = entry.stat().st_size
        if size > MAX_FILE_BYTES:
            raise ReleaseContractError(f"bundle entry exceeds the per-file limit: {entry.name}")
        total += size
    if total > MAX_BUNDLE_BYTES:
        raise ReleaseContractError("bundle exceeds the expanded-size limit")


def _read_sums(path: Path) -> dict[str, str]:
    try:
        raw = path.read_bytes()
        text = raw.decode("ascii")
    except (OSError, UnicodeError) as exc:
        raise ReleaseContractError(f"cannot read canonical SHA256SUMS: {exc}") from exc
    if not raw or not raw.endswith(b"\n") or b"\r" in raw:
        raise ReleaseContractError("SHA256SUMS must be non-empty canonical LF text")
    result: dict[str, str] = {}
    previous = ""
    for line in text.splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]{0,127})", line)
        if match is None:
            raise ReleaseContractError("SHA256SUMS contains a malformed line")
        digest, name = match.groups()
        if name <= previous or name in result:
            raise ReleaseContractError("SHA256SUMS filenames must be unique and sorted")
        result[name] = f"sha256:{digest}"
        previous = name
    return result


def _bounded_graph(graph: dict[str, Any]) -> None:
    if graph.get("schema") != "stratalint.truth-graph.v1":
        raise ReleaseContractError("truth graph schema is not stratalint.truth-graph.v1")
    truth = graph.get("truth")
    if not isinstance(truth, dict):
        raise ReleaseContractError("truth graph has no truth object")
    nodes = truth.get("nodes")
    edges = truth.get("edges")
    if not isinstance(nodes, list) or len(nodes) > MAX_GRAPH_NODES:
        raise ReleaseContractError("truth graph node count is outside bounds")
    if not isinstance(edges, list) or len(edges) > MAX_GRAPH_EDGES:
        raise ReleaseContractError("truth graph edge count is outside bounds")
    documents = graph.get("documents", {})
    joins = graph.get("joins", {})
    if not isinstance(documents, dict) or not isinstance(joins, dict):
        raise ReleaseContractError("truth graph documents and joins must be objects")
    document_nodes = documents.get("document_nodes", [])
    document_edges = documents.get("document_edges", {})
    anchors = joins.get("truth_anchors", [])
    if not isinstance(document_nodes, list) or len(document_nodes) > MAX_BLUEPRINT_NODES:
        raise ReleaseContractError("blueprint node count is outside bounds")
    if not isinstance(document_edges, dict):
        raise ReleaseContractError("blueprint edges must be grouped in an object")
    if sum(len(value) for value in document_edges.values() if isinstance(value, list)) > MAX_BLUEPRINT_EDGES:
        raise ReleaseContractError("blueprint edge count exceeds its bound")
    if not isinstance(anchors, list) or len(anchors) > MAX_ANCHORS:
        raise ReleaseContractError("blueprint anchor count is outside bounds")


def verify_bundle(bundle_directory: str | Path, expected_digest: str | None = None) -> dict[str, Any]:
    bundle = Path(bundle_directory)
    _verify_root_files(bundle)
    if {entry.name for entry in bundle.iterdir()} != EXPECTED_ARTIFACT_NAMES | ADMIN_NAMES:
        raise ReleaseContractError("bundle does not contain the exact seven-artifact release file set")

    publication = _read_json(bundle / "truth-release-publication.v1.json")
    _require_keys(
        publication,
        {"schema", "release_digest", "bundle_ref", "source_commit", "source_tree", "producer_commit"},
        "publication",
    )
    if publication["schema"] != "truth-release-publication.v1":
        raise ReleaseContractError("publication schema is not truth-release-publication.v1")
    release_digest = _require_digest(publication["release_digest"], "publication.release_digest")
    if publication["bundle_ref"] != release_digest:
        raise ReleaseContractError("publication bundle_ref is not bound to release_digest")
    source_commit = _require_oid(publication["source_commit"], "publication.source_commit")
    source_tree = _require_oid(publication["source_tree"], "publication.source_tree")
    producer_commit = _require_oid(publication["producer_commit"], "publication.producer_commit")
    if expected_digest not in (None, "", "mock"):
        _require_digest(expected_digest, "expected release digest")
        if expected_digest != release_digest:
            raise ReleaseContractError("publication does not match the requested release digest")

    sums_path = bundle / "SHA256SUMS"
    sums = _read_sums(sums_path)
    if set(sums) != EXPECTED_ARTIFACT_NAMES:
        raise ReleaseContractError("SHA256SUMS does not bind exactly the seven release artifacts")
    actual_release_digest = _sha256(sums_path)
    if actual_release_digest != release_digest:
        raise ReleaseContractError("SHA256SUMS bytes do not hash to publication.release_digest")

    manifest = _read_json(bundle / "release-manifest.v1.json")
    _require_keys(
        manifest,
        {"schema", "source", "trust", "producer", "artifacts", "sha256sums_digest", "produced_at"},
        "manifest",
    )
    if manifest["schema"] != "truth-release.v1" or manifest["sha256sums_digest"] != release_digest:
        raise ReleaseContractError("manifest is not bound to the computed release digest")
    source = manifest["source"]
    producer = manifest["producer"]
    artifacts = manifest["artifacts"]
    if not isinstance(source, dict) or not isinstance(producer, dict) or not isinstance(artifacts, dict):
        raise ReleaseContractError("manifest source, producer, and artifacts must be objects")
    if source.get("source_commit") != source_commit or source.get("source_tree") != source_tree:
        raise ReleaseContractError("publication source identity disagrees with the manifest")
    if producer.get("package_commit") != producer_commit or producer.get("read_only") is not True:
        raise ReleaseContractError("publication producer identity disagrees with the manifest")
    if set(artifacts) != set(ARTIFACT_KEYS):
        raise ReleaseContractError("manifest does not name exactly seven artifact roles")

    named: set[str] = set()
    for role in ARTIFACT_KEYS:
        artifact = artifacts[role]
        if not isinstance(artifact, dict) or set(artifact) != {"file", "sha256"}:
            raise ReleaseContractError(f"manifest artifact {role} has the wrong shape")
        name = _require_safe_name(artifact["file"], f"manifest.artifacts.{role}.file")
        expected_hash = _require_digest(artifact["sha256"], f"manifest.artifacts.{role}.sha256")
        if name in named or name not in EXPECTED_ARTIFACT_NAMES or sums.get(name) != expected_hash:
            raise ReleaseContractError(f"manifest artifact binding is invalid for {role}")
        if _sha256(bundle / name) != expected_hash:
            raise ReleaseContractError(f"artifact bytes do not match their digest: {name}")
        named.add(name)

    snapshot = _read_json(bundle / artifacts["source_snapshot"]["file"])
    if snapshot.get("source_commit") != source_commit or snapshot.get("source_tree") != source_tree:
        raise ReleaseContractError("source snapshot disagrees with publication source identity")
    graph_path = bundle / artifacts["truth_graph"]["file"]
    if snapshot.get("truth_graph_sha256") != _sha256(graph_path):
        raise ReleaseContractError("source snapshot is not bound to the truth graph bytes")
    graph = _read_json(graph_path)
    _bounded_graph(graph)

    return {
        "schema": "verified-truth-release.v1",
        "release_digest": release_digest,
        "source_commit": source_commit,
        "source_tree": source_tree,
        "producer_commit": producer_commit,
        "truth_graph": artifacts["truth_graph"]["file"],
        "source_snapshot": artifacts["source_snapshot"]["file"],
    }


def _node_id(node: dict[str, Any]) -> str:
    gid = node.get("gid")
    if isinstance(gid, str) and gid:
        return gid
    path = node.get("repo_path")
    if not isinstance(path, str) or not path:
        raise ReleaseContractError("truth node has no stable gid or repo_path")
    return path.removesuffix(".lean") if path.endswith(".lean") else path


def _grouping(gid: Any, repo_path: str) -> tuple[str, str]:
    parts = (gid if isinstance(gid, str) and gid else repo_path.removesuffix(".lean")).split("/")
    return ("/".join(parts[:2]), parts[2]) if len(parts) >= 3 else ("Root", parts[0])


def project_basic_dag(bundle_directory: str | Path, verified: dict[str, Any]) -> dict[str, Any]:
    bundle = Path(bundle_directory)
    graph = _read_json(bundle / verified["truth_graph"])
    snapshot = _read_json(bundle / verified["source_snapshot"])
    raw_nodes = graph["truth"]["nodes"]
    nodes: list[dict[str, Any]] = []
    path_to_id: dict[str, str] = {}
    ids: set[str] = set()
    for raw in raw_nodes:
        if not isinstance(raw, dict):
            raise ReleaseContractError("truth graph node must be an object")
        state = raw.get("state")
        path = raw.get("repo_path")
        if state not in _STATES or not isinstance(path, str) or not path:
            raise ReleaseContractError("truth graph node has an invalid state or repo_path")
        node_id = _node_id(raw)
        if node_id in ids or path in path_to_id:
            raise ReleaseContractError("truth graph has duplicate node identity")
        ids.add(node_id)
        path_to_id[path] = node_id
        layer, domain = _grouping(raw.get("gid"), path)
        nodes.append({
            "id": node_id,
            "gid": raw.get("gid"),
            "title": raw.get("module_name") or raw.get("gid") or path,
            "status": _STATUS[state],
            "state": state,
            "kind": "truth",
            "summary": f"{_STATUS[state]} | depth {raw.get('depth', 0)} | {path}",
            "depth": raw.get("depth", 0),
            "repo_path": path,
            "layer": layer,
            "domain": domain,
        })

    edges: list[dict[str, str]] = []
    for raw in graph["truth"]["edges"]:
        dependency = raw.get("dependency")
        dependent = raw.get("dependent")
        if dependency not in path_to_id or dependent not in path_to_id:
            raise ReleaseContractError("truth dependency references an absent node")
        edges.append({
            "source": path_to_id[dependency],
            "target": path_to_id[dependent],
            "dependency": dependency,
            "dependent": dependent,
            "layer": "truth-dependency",
        })

    documents = graph.get("documents", {})
    document_path_to_id: dict[str, str] = {}
    for document in documents.get("document_nodes", []):
        path = document.get("repo_path")
        if not isinstance(path, str) or not path:
            raise ReleaseContractError("blueprint node has no repo_path")
        node_id = f"blueprint:{path}"
        if node_id in ids or path in document_path_to_id:
            raise ReleaseContractError("truth graph has duplicate blueprint identity")
        ids.add(node_id)
        document_path_to_id[path] = node_id
        nodes.append({
            "id": node_id,
            "gid": document.get("gid"),
            "title": document.get("gid") or path,
            "status": "Semantic",
            "state": "semantic",
            "kind": "blueprint",
            "summary": f"Blueprint | {path}",
            "depth": 0,
            "repo_path": path,
            "layer": "Blueprint",
            "domain": "Document",
        })

    document_edges = documents.get("document_edges", {})
    for edge_kind, group in document_edges.items():
        if not isinstance(group, list):
            raise ReleaseContractError("blueprint edge group must be an array")
        for raw in group:
            if edge_kind == "dependency":
                source_path, target_path = raw.get("dependency"), raw.get("dependent")
            elif edge_kind == "narrative_reference":
                source_path, target_path = raw.get("source"), raw.get("target")
            else:
                raise ReleaseContractError(f"unknown blueprint edge kind: {edge_kind}")
            if source_path not in document_path_to_id or target_path not in document_path_to_id:
                raise ReleaseContractError("blueprint edge references an absent document")
            edges.append({
                "source": document_path_to_id[source_path],
                "target": document_path_to_id[target_path],
                "dependency": source_path,
                "dependent": target_path,
                "layer": f"blueprint-{edge_kind.replace('_', '-')}",
            })

    for anchor in graph.get("joins", {}).get("truth_anchors", []):
        document_path = anchor.get("document_repo_path")
        truth_path = anchor.get("formal_truth_repo_path")
        if document_path not in document_path_to_id or truth_path not in path_to_id:
            raise ReleaseContractError("blueprint anchor references an absent endpoint")
        edges.append({
            "source": document_path_to_id[document_path],
            "target": path_to_id[truth_path],
            "dependency": document_path,
            "dependent": truth_path,
            "layer": "blueprint-truth-anchor",
        })

    nodes.sort(key=lambda node: (node["state"], node["id"]))
    edges.sort(key=lambda edge: (edge["layer"], edge["source"], edge["target"]))
    counts = Counter(node["state"] for node in nodes if node["kind"] == "truth")
    return {
        "schema_version": "pages-truth-release-dag.v1",
        "synthetic": graph.get("provenance", {}).get("fixture") == "mock",
        "source_snapshot": {
            "source_repo": snapshot.get("source_repo"),
            "source_commit": verified["source_commit"],
            "source_tree": verified["source_tree"],
            "truth_release_digest": verified["release_digest"],
            "truth_graph_sha256": snapshot.get("truth_graph_sha256"),
            "topology_algorithm": f"Trureturing.Topology/{TOPOLOGY_VERSION}",
        },
        "counts": {
            "nodes": len(nodes),
            "truth_nodes": len(raw_nodes),
            "blueprint_nodes": len(document_path_to_id),
            "dag_closed": counts["closed"],
            "dag_open": counts["open"],
            "dag_tail": counts["tail"],
            "dag_semantic": counts["semantic"],
            "edges": len(edges),
            "truth_edges": len(graph["truth"]["edges"]),
            "blueprint_links": len(edges) - len(graph["truth"]["edges"]),
        },
        "nodes": nodes,
        "edges": edges,
    }


def build_basic_site(bundle_directory: str | Path, output_directory: str | Path) -> dict[str, Any]:
    destination = Path(output_directory)
    if destination.exists():
        raise ReleaseContractError("site output directory already exists")
    verified = verify_bundle(bundle_directory)
    graph = project_basic_dag(bundle_directory, verified)
    shutil.copytree(ROOT / "site", destination)
    data = destination / "data"
    data.mkdir(exist_ok=True)
    encoded = json.dumps(graph, indent=2, ensure_ascii=False) + "\n"
    (data / "basic-truth-graph.v1.json").write_text(encoded, encoding="utf-8")
    (data / "truth-graph.v1.json").write_text(encoded, encoding="utf-8")
    (data / "verified-truth-release.v1.json").write_text(
        json.dumps(verified, indent=2) + "\n", encoding="utf-8")
    return verified


def write_deployment_manifest(
    site_directory: str | Path,
    certified_topology: str | Path,
    pages_commit: str,
    pages_tree: str,
    metrics_path: str | Path | None = None,
) -> dict[str, Any]:
    site = Path(site_directory)
    verified = _read_json(site / "data" / "verified-truth-release.v1.json")
    topology = _read_json(Path(certified_topology))
    if topology.get("truth_release_digest") != verified["release_digest"]:
        raise ReleaseContractError("certified topology is not bound to the verified truth release")
    if topology.get("producer_commit") != TOPOLOGY_PRODUCER_COMMIT:
        raise ReleaseContractError("certified topology producer is not the pinned package commit")
    profile_digest = f"sha256:{hashlib.sha256(ALGORITHM_PROFILE.read_bytes()).hexdigest()}"
    if topology.get("algorithm_profile_digest") != profile_digest:
        raise ReleaseContractError("certified topology is not bound to the pinned algorithm profile")
    _require_oid(pages_commit, "pages_commit")
    _require_oid(pages_tree, "pages_tree")
    metrics = _read_deployment_json(Path(metrics_path)) if metrics_path else None
    if metrics is not None:
        _require_keys(
            metrics,
            {"schema", "elapsed_seconds", "max_rss_kib"},
            "topology measurement",
        )
        elapsed = metrics["elapsed_seconds"]
        rss = metrics["max_rss_kib"]
        if (metrics["schema"] != "topology-measurement.v1"
                or not isinstance(elapsed, (int, float)) or isinstance(elapsed, bool)
                or elapsed < 0
                or not isinstance(rss, int) or isinstance(rss, bool) or rss <= 0):
            raise ReleaseContractError("topology measurement values are invalid")
    manifest: dict[str, Any] = {
        "schema": "pages-deployment-manifest.v1",
        "release_digest": verified["release_digest"],
        "source_commit": verified["source_commit"],
        "source_tree": verified["source_tree"],
        "topology_version": TOPOLOGY_VERSION,
        "topology_producer_commit": TOPOLOGY_PRODUCER_COMMIT,
        "algorithm_profile_digest": profile_digest,
        "pages_commit": pages_commit,
        "pages_tree": pages_tree,
        "views": {
            "basic": "data/basic-truth-graph.v1.json",
            "enriched": "data/certified-topology-view.v1.json",
            "certification": "data/certified-topology.v1.json",
        },
    }
    if metrics is not None:
        manifest["topology_measurement"] = metrics
    (site / "deployment-manifest.v1.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def _version_key(value: Any) -> tuple[int, int, int, int]:
    if not isinstance(value, str):
        raise ReleaseContractError("topology version must be a string")
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)-alpha\.(\d+)", value)
    if match is None:
        raise ReleaseContractError(f"unsupported topology version: {value}")
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def assess_freshness(incoming: dict[str, Any], current: dict[str, Any] | None) -> dict[str, Any]:
    if incoming.get("schema") != "pages-deployment-manifest.v1":
        raise ReleaseContractError("incoming deployment manifest has the wrong schema")
    incoming_digest = _require_digest(incoming.get("release_digest"), "incoming.release_digest")
    incoming_commit = _require_oid(incoming.get("source_commit"), "incoming.source_commit")
    _require_oid(incoming.get("source_tree"), "incoming.source_tree")
    incoming_version = incoming.get("topology_version")
    incoming_version_key = _version_key(incoming_version)
    if current is None:
        return {"decision": "initial", "requires_ancestry_check": False}
    if current.get("schema") != "pages-deployment-manifest.v1":
        raise ReleaseContractError("deployed manifest has the wrong schema")
    current_digest = _require_digest(current.get("release_digest"), "current.release_digest")
    current_commit = _require_oid(current.get("source_commit"), "current.source_commit")
    current_tree = _require_oid(current.get("source_tree"), "current.source_tree")
    if incoming_version_key < _version_key(current.get("topology_version")):
        raise ReleaseContractError("incoming topology version is older than the deployed topology")
    if incoming_digest == current_digest:
        if incoming_commit != current_commit or incoming.get("source_tree") != current_tree:
            raise ReleaseContractError("same release_digest is bound to different source identity")
        return {"decision": "idempotent", "requires_ancestry_check": False}
    if incoming_commit == current_commit:
        raise ReleaseContractError("different release digests cannot replace the same source commit")
    return {
        "decision": "candidate-advance",
        "requires_ancestry_check": True,
        "current_source_commit": current_commit,
        "incoming_source_commit": incoming_commit,
    }


def _write_json(path: str | Path, value: dict[str, Any]) -> None:
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def _main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    extract = commands.add_parser("extract")
    extract.add_argument("archive")
    extract.add_argument("output")
    verify = commands.add_parser("verify")
    verify.add_argument("bundle")
    verify.add_argument("--expected-digest")
    verify.add_argument("--output", required=True)
    build = commands.add_parser("build-basic")
    build.add_argument("bundle")
    build.add_argument("output")
    finalize = commands.add_parser("finalize")
    finalize.add_argument("site")
    finalize.add_argument("topology")
    finalize.add_argument("pages_commit")
    finalize.add_argument("pages_tree")
    finalize.add_argument("--metrics")
    freshness = commands.add_parser("freshness")
    freshness.add_argument("incoming")
    freshness.add_argument("--current")
    freshness.add_argument("--output", required=True)
    args = parser.parse_args()

    if args.command == "extract":
        extract_archive(args.archive, args.output)
    elif args.command == "verify":
        _write_json(args.output, verify_bundle(args.bundle, args.expected_digest))
    elif args.command == "build-basic":
        verified = build_basic_site(args.bundle, args.output)
        print(f"projected basic DAG for {verified['release_digest']}")
    elif args.command == "finalize":
        manifest = write_deployment_manifest(
            args.site, args.topology, args.pages_commit, args.pages_tree, args.metrics)
        print(f"finalized deploy state for {manifest['release_digest']}")
    elif args.command == "freshness":
        incoming = _read_deployment_json(Path(args.incoming))
        current = _read_deployment_json(Path(args.current)) if args.current else None
        _write_json(args.output, assess_freshness(incoming, current))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
