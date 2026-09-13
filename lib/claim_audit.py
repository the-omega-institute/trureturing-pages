"""Independent double-check of claimed-solved open problems.

For each kernel-verified resolution this assembles a per-claim audit record whose
four states are kept distinct and never collapsed into a single ``solved`` flag:

  formal_verification   an independent Lean run reproduced the axiom closure and it
                        lies within {propext, Classical.choice, Quot.sound} with no
                        sorry/native axioms (VERIFY gate)
  literature_source     the cited source URL resolves (REVIEW gate, automatable part)
  statement_fidelity    whether the Lean statement faithfully covers the cited
                        problem — adversarial, machine-unverified until an sshx
                        review is recorded
  in_truth_release      the resolution carries the frozen-node attestation of the
                        deployed truth release

The axiom closure is produced by re-running Lean over the fixed source commit
(`#print axioms <decl>` for every declaration); it is not read back from the
release marker, so this is a genuine re-verification rather than a marker echo.
"""
import argparse
import json
import re
from pathlib import Path

ALLOWED_AXIOMS = {"propext", "Classical.choice", "Quot.sound"}
AUDIT = Path(__file__).resolve().parents[1] / "site/assets/claim-audit.v1.json"

# '<name>' depends on axioms: [a, b, c]   (the list may wrap across lines)
_DEPENDS = re.compile(r"'([^']+)' depends on axioms:\s*\[([^\]]*)\]", re.DOTALL)
_NONE = re.compile(r"'([^']+)' does not depend on any axioms")


def parse_axioms(text):
    """Map fully-qualified declaration name -> sorted list of axiom names."""
    result = {}
    for m in _NONE.finditer(text):
        result[m.group(1)] = []
    for m in _DEPENDS.finditer(text):
        axioms = [a.strip() for a in m.group(2).split(",") if a.strip()]
        result[m.group(1)] = sorted(axioms)
    return result


def _candidate_fqns(family):
    """Fully-qualified names to try, in order.

    The base namespace usually equals the full module path, but some modules
    (e.g. D5/S1/Words/Complexity/*) namespace only to the parent directory, so
    also try the path with the final module segment dropped.
    """
    gid = family["declaration_gid"]
    module, _, decl = gid.rpartition(".")
    segments = module.split("/")
    primary = module.replace("/", ".") + "." + decl
    parent = ".".join(segments[:-1]) + "." + decl if len(segments) > 1 else primary
    return [primary, parent]


def _fqn(family):
    return _candidate_fqns(family)[0]


def verify_state(family, axiom_index):
    """VERIFY gate result for one declaration from the independent Lean run."""
    fqn = next((c for c in _candidate_fqns(family) if c in axiom_index), None)
    if fqn is None:
        return {"status": "unverified", "reason": "declaration absent from independent Lean run", "axioms": None}
    axioms = axiom_index[fqn]
    disallowed = [a for a in axioms if a not in ALLOWED_AXIOMS]
    return {
        "status": "pass" if not disallowed else "fail",
        "declaration": fqn,
        "axioms": axioms,
        "disallowed_axioms": disallowed,
    }


def build_records(catalog, axiom_index, literature, reviews=None):
    reviews = reviews or {}
    lit = {r["id"]: r for r in literature}
    records = []
    for f in catalog["families"]:
        rid = f["id"]
        formal = verify_state(f, axiom_index)
        source = lit.get(rid, {})
        review = reviews.get(rid, {})
        records.append({
            "id": rid,
            "title": f["title"],
            "kind": f["kind"],
            "declaration": formal.get("declaration") or _fqn(f),
            "source_url": f["source_url"],
            "source_commit": f["source_commit"],
            "states": {
                "formal_verification": formal,
                "literature_source": {
                    "status": "pass" if source.get("resolves") else "unverified",
                    "http_status": source.get("http_status"),
                    "final_url": source.get("final_url"),
                    "identifier_on_page": source.get("anumber_on_page"),
                },
                "statement_fidelity": {
                    "status": review.get("status", "machine-unverified"),
                    "reviewer": review.get("reviewer"),
                    "note": review.get("note"),
                },
                "in_truth_release": {
                    "status": "pass" if f.get("kernel_verified", {}).get("freeze_status") == "frozen" else "unverified",
                    "frozen_node_id": f.get("kernel_verified", {}).get("frozen_node_id"),
                },
            },
        })
    return {
        "schema_version": "pages-claim-audit.v1",
        "revision": catalog.get("revision"),
        "source_commit": catalog.get("source_commit"),
        "allowed_axioms": sorted(ALLOWED_AXIOMS),
        "records": records,
    }


def summarize(audit):
    rec = audit["records"]
    def count(state, status):
        return sum(1 for r in rec if r["states"][state]["status"] == status)
    return {
        "total": len(rec),
        "formal_verification_pass": count("formal_verification", "pass"),
        "formal_verification_fail": count("formal_verification", "fail"),
        "formal_verification_unverified": count("formal_verification", "unverified"),
        "literature_source_pass": count("literature_source", "pass"),
        "statement_fidelity_reviewed": sum(1 for r in rec if r["states"]["statement_fidelity"]["status"] in ("pass", "fail")),
    }


def main():
    ap = argparse.ArgumentParser(description="Assemble the claim double-check audit")
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--axioms", required=True, help="captured `#print axioms` output")
    ap.add_argument("--literature", required=True)
    ap.add_argument("--reviews", help="optional sshx statement-fidelity verdicts (json list)")
    ap.add_argument("--out", default=str(AUDIT))
    args = ap.parse_args()
    catalog = json.loads(Path(args.catalog).read_text())
    axiom_index = parse_axioms(Path(args.axioms).read_text())
    literature = json.loads(Path(args.literature).read_text())
    reviews = json.loads(Path(args.reviews).read_text()) if args.reviews else None
    audit = build_records(catalog, axiom_index, literature, reviews)
    Path(args.out).write_text(json.dumps(audit, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(summarize(audit), indent=1))


if __name__ == "__main__":
    main()
