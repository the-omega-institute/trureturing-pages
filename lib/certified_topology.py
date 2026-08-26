"""Fail-closed certified-topology.v1 adapter for the Pages DAG projection."""
from __future__ import annotations

import copy
import json
import math
import re
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = ROOT / "contracts" / "certified-topology.v1.schema.json"


class TopologyContractError(ValueError):
    pass


@dataclass(frozen=True)
class TopologyNodeMetrics:
    node_id: str
    in_degree: int
    out_degree: int
    min_depth: int
    max_depth: int
    ancestor_count: int
    descendant_count: int
    descendant_cost: int
    normalized_reach: Fraction
    dependency_betweenness: Fraction


@dataclass(frozen=True)
class CertifiedTopology:
    truth_release_digest: str
    algorithm_profile_digest: str
    producer_commit: str
    nodes: tuple[TopologyNodeMetrics, ...]


def _reject_duplicate(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise TopologyContractError(f"duplicate object member: {key}")
        result[key] = value
    return result


def _reject_float(value: str) -> None:
    raise TopologyContractError(
        f"floating-point numeric lexemes are forbidden: {value}")


def _resolve(schema: dict[str, Any], root: dict[str, Any]) -> dict[str, Any]:
    reference = schema.get("$ref")
    if reference is None:
        return schema
    if not reference.startswith("#/"):
        raise TopologyContractError(f"unsupported schema reference: {reference}")
    resolved: Any = root
    for part in reference[2:].split("/"):
        resolved = resolved[part.replace("~1", "/").replace("~0", "~")]
    if not isinstance(resolved, dict):
        raise TopologyContractError(f"schema reference is not an object: {reference}")
    return resolved


def _validate(schema: dict[str, Any], value: Any, root: dict[str, Any], path: str) -> None:
    schema = _resolve(schema, root)
    if "const" in schema and (type(value) is not type(schema["const"]) or value != schema["const"]):
        raise TopologyContractError(f"{path}: must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise TopologyContractError(f"{path}: value is outside the schema enum")

    expected = schema.get("type")
    kinds = {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
    }
    if expected is not None and not kinds.get(expected, False):
        raise TopologyContractError(f"{path}: expected {expected}")

    if isinstance(value, dict):
        required = schema.get("required", [])
        for name in required:
            if name not in value:
                raise TopologyContractError(f"{path}.{name}: missing required property")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            unknown = set(value).difference(properties)
            if unknown:
                name = min(unknown)
                raise TopologyContractError(
                    f"{path}.{name}: additional property is not allowed")
        for name, child in properties.items():
            if name in value:
                _validate(child, value[name], root, f"{path}.{name}")
    elif isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            _validate(schema["items"], item, root, f"{path}[{index}]")

    if isinstance(value, int) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise TopologyContractError(
                f"{path}: must be >= {schema['minimum']}")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            raise TopologyContractError(f"{path}: string is too short")
        if "pattern" in schema and re.fullmatch(schema["pattern"], value) is None:
            raise TopologyContractError(f"{path}: does not match schema pattern")
    if isinstance(value, list) and len(value) < schema.get("minItems", 0):
        raise TopologyContractError(f"{path}: array is too short")

    if "oneOf" in schema:
        matches = 0
        for option in schema["oneOf"]:
            try:
                _validate(option, value, root, path)
                matches += 1
            except TopologyContractError:
                pass
        if matches != 1:
            raise TopologyContractError(
                f"{path}: must match exactly one schema alternative")


def read_certified_topology(
    topology_path: str | Path,
    schema_path: str | Path = DEFAULT_SCHEMA,
) -> CertifiedTopology:
    try:
        schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
        value = json.loads(
            Path(topology_path).read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate,
            parse_float=_reject_float,
            parse_constant=_reject_float,
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise TopologyContractError(str(exc)) from exc

    _validate(schema, value, schema, "$")
    nodes: list[TopologyNodeMetrics] = []
    seen: set[str] = set()
    for raw in value["nodes"]:
        node_id = raw["node_id"]
        if node_id in seen:
            raise TopologyContractError(f"duplicate node_id: {node_id}")
        seen.add(node_id)
        rationals = []
        for name in ("normalized_reach", "dependency_betweenness"):
            rational = raw[name]
            numerator = rational["numerator"]
            denominator = rational["denominator"]
            if math.gcd(numerator, denominator) != 1:
                raise TopologyContractError(
                    f"{node_id}.{name}: rational must be gcd-reduced")
            rationals.append(Fraction(numerator, denominator))
        nodes.append(TopologyNodeMetrics(
            node_id,
            raw["in_degree"],
            raw["out_degree"],
            raw["min_depth"],
            raw["max_depth"],
            raw["ancestor_count"],
            raw["descendant_count"],
            raw["descendant_cost"],
            rationals[0],
            rationals[1],
        ))

    cycle = value["cycle_certificate"]
    dangling = value["dangling_reference_certificate"]
    if (cycle["status"] == "acyclic") != (not cycle["cycles"]):
        raise TopologyContractError("cycle certificate status disagrees with cycles")
    if (dangling["status"] == "complete") != (not dangling["dangling_references"]):
        raise TopologyContractError(
            "dangling-reference certificate status disagrees with entries")
    if cycle["status"] != "acyclic" or dangling["status"] != "complete":
        raise TopologyContractError(
            "Pages only consumes acyclic, complete certified topology")

    return CertifiedTopology(
        value["truth_release_digest"],
        value["algorithm_profile_digest"],
        value["producer_commit"],
        tuple(nodes),
    )


def enrich_dag(graph: dict[str, Any], topology: CertifiedTopology) -> dict[str, Any]:
    """Attach certified metrics to matching DAG nodes without recomputing them."""
    result = copy.deepcopy(graph)
    by_id: dict[str, dict[str, Any]] = {}
    for node in result.get("nodes", []):
        for identity in (node.get("id"), node.get("gid"), node.get("repo_path")):
            if identity:
                by_id[identity] = node

    for metrics in topology.nodes:
        node = by_id.get(metrics.node_id)
        if node is None:
            raise TopologyContractError(
                f"certified node {metrics.node_id!r} is absent from the Pages DAG")
        node.update({
            "in_degree": metrics.in_degree,
            "out_degree": metrics.out_degree,
            "min_depth": metrics.min_depth,
            "max_depth": metrics.max_depth,
            "true_depth": metrics.max_depth,
            "ancestor_count": metrics.ancestor_count,
            "descendant_count": metrics.descendant_count,
            "descendant_cost": metrics.descendant_cost,
            "normalized_reach": str(metrics.normalized_reach),
            "dependency_betweenness": str(metrics.dependency_betweenness),
        })

    result["schema_version"] = "pages-certified-topology-view.v1"
    result["source_snapshot"] = {
        **result.get("source_snapshot", {}),
        "truth_release_digest": topology.truth_release_digest,
        "algorithm_profile_digest": topology.algorithm_profile_digest,
        "topology_producer_commit": topology.producer_commit,
    }
    result["counts"] = {
        **result.get("counts", {}),
        "certified_topology_nodes": len(topology.nodes),
    }
    return result


def project_files(
    graph_path: str | Path,
    topology_path: str | Path,
    output_path: str | Path,
    schema_path: str | Path = DEFAULT_SCHEMA,
) -> dict[str, Any]:
    topology = read_certified_topology(topology_path, schema_path)
    try:
        graph = json.loads(
            Path(graph_path).read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate,
            parse_float=_reject_float,
            parse_constant=_reject_float,
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise TopologyContractError(str(exc)) from exc
    result = enrich_dag(graph, topology)
    Path(output_path).write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return result


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 4:
        raise SystemExit(
            "usage: python -m lib.certified_topology "
            "<truth-graph.v1.json> <certified-topology.v1.json> <output.json>")
    project_files(sys.argv[1], sys.argv[2], sys.argv[3])
