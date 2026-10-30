"""Pages-only evidence projection; never edits a published graph or its counters."""
from collections import Counter
import json
from pathlib import Path

from .problem_resolutions import KERNEL_AXIOMS, VERIFIED_STATUSES, index_truth_export
from .vertical_smoke import ReleaseContractError, _read_json, _sha256, _DIGEST, verify_bundle

SCHEMA = "pages-atlas-lean-evidence.v1"


def project_evidence(bundle, verified):
    """Join complete declaration identities, statements and axioms in verified bytes.

    The export is the proven catalog, not a theorem-use graph. The report supplies
    per-declaration receipts and source hashes, including auxiliary declarations.
    Missing evidence excludes a module; contradictory evidence rejects the build.
    """
    bundle = Path(bundle)
    export = _read_json(bundle / "truth-export.v1.json")
    report = _read_json(bundle / "raw-lean-report.json")
    snapshot = _read_json(bundle / verified["source_snapshot"])
    identity = {"source_commit": verified["source_commit"], "source_tree": verified["source_tree"]}
    result = {
        "schema_version": SCHEMA, **identity,
        "truth_release_digest": verified["release_digest"],
        "truth_graph_sha256": snapshot["truth_graph_sha256"],
        "truth_export_sha256": _sha256(bundle / "truth-export.v1.json"),
        "raw_lean_report_sha256": _sha256(bundle / "raw-lean-report.json"),
        "coverage": "available", "nodes": [],
    }
    # Historical/mock releases lack the declaration contract. Preserve that gap
    # explicitly; Closed is never a fallback proof receipt.
    if export.get("dialect") != "stratalint.truth-export.v2" or report.get("schema") != "stratalint-raw-lean-report-v3":
        result.update(coverage="unavailable", reason="unsupported-declaration-evidence")
        return result
    if any(export.get(key) != value for key, value in identity.items()):
        raise ReleaseContractError("Atlas declaration evidence has a different source identity")
    catalog = index_truth_export(export)
    reports = {}
    for module in report["modules"]:
        path = module.get("source_path")
        if path in reports:
            raise ReleaseContractError(f"Duplicate Lean report module: {path}")
        reports[path] = module
    counts = Counter()
    for path, node in sorted(catalog.items()):
        entry = {"repo_path": path, "eligible": False}
        module = reports.get(path)
        if node.get("freeze_status") not in VERIFIED_STATUSES:
            entry["reason"] = "unsupported-proof-status"
        elif not module:
            entry["reason"] = "missing-module-report"
        elif not node.get("declarations"):
            entry["reason"] = "no-published-declarations"
        elif not isinstance(node.get("node_axiom_closure"), list):
            entry["reason"] = "missing-node-axioms"
        elif not set(node["node_axiom_closure"]) <= KERNEL_AXIOMS:
            entry["reason"] = "non-kernel-axioms"
        else:
            if not _DIGEST.fullmatch(module.get("source_sha256", "")):
                raise ReleaseContractError(f"Invalid Lean source binding: {path}")
            declarations, union = {}, set()
            for decl in module.get("declarations", []):
                key = decl.get("name_key")
                if not key or key in declarations or not isinstance(decl.get("axioms"), list):
                    raise ReleaseContractError(f"Incomplete/duplicate Lean declaration receipt: {path}")
                declarations[key] = decl
                union.update(decl["axioms"])
            if union != set(node["node_axiom_closure"]):
                raise ReleaseContractError(f"Export/report axiom union mismatch: {path}")
            receipts = []
            for decl in node["declarations"]:
                receipt = declarations.get(decl.get("declaration_name_key"))
                if (not receipt or receipt.get("include_in_statement") is not True
                        or any(receipt.get(k) != decl.get(k) for k in ("kind", "statement_id"))
                        or not receipt.get("name")
                        or not _DIGEST.fullmatch(receipt.get("statement_id", ""))
                        or not _DIGEST.fullmatch(receipt.get("type_sha256", ""))):
                    raise ReleaseContractError(f"Export/report declaration identity mismatch: {path}")
                receipts.append({k: receipt[k] for k in ("name", "name_key", "kind", "statement_id", "type_sha256", "axioms")})
            if len(receipts) != len({d["name_key"] for d in receipts}):
                raise ReleaseContractError(f"Duplicate published declaration identity: {path}")
            if {d["name_key"] for d in receipts} != {k for k, d in declarations.items() if d.get("include_in_statement") is True}:
                raise ReleaseContractError(f"Incomplete published declaration membership: {path}")
            entry.update(eligible=True, freeze_status=node["freeze_status"],
                         frozen_node_id=node["frozen_node_id"], source_sha256=module["source_sha256"],
                         node_axiom_closure=sorted(union), declarations=receipts,
                         declaration_count=len(receipts),
                         theorem_count=sum(d["kind"] == "theorem" for d in receipts))
        counts[entry.get("reason", entry.get("freeze_status"))] += 1
        result["nodes"].append(entry)
    result["counts"] = dict(counts)
    return result


def write_evidence(bundle, destination, verified=None):
    evidence = project_evidence(bundle, verified or verify_bundle(bundle))
    Path(destination).write_text(json.dumps(evidence, ensure_ascii=False, separators=(",", ":")) + "\n")
    return evidence


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    evidence = write_evidence(args.bundle, args.output)
    print(json.dumps({k: v for k, v in evidence.items() if k != "nodes"}))
