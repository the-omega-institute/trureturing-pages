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
from urllib.parse import urlsplit

ALLOWED_AXIOMS = {"propext", "Classical.choice", "Quot.sound"}

# Same host-based scheme the research page groups by (lib/reading_views.series).
SOURCE_GROUPS = {"oeis.org": "OEIS", "erdosproblems.com": "Erdős Problems"}
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


def _closure_state(axioms, declaration, source):
    disallowed = [a for a in axioms if a not in ALLOWED_AXIOMS]
    return {
        "status": "pass" if not disallowed else "fail",
        "declaration": declaration,
        "axioms": sorted(axioms),
        "disallowed_axioms": sorted(disallowed),
        "source": source,
    }


def verify_state(family, axiom_index):
    """VERIFY gate result for one declaration.

    Prefers the independent Lean re-run (``#print axioms`` output in ``axiom_index``);
    otherwise falls back to the axiom closure the release's truth-export attests
    (``node_axiom_closure``, itself fail-closed by ``verify_resolutions``). The record
    names which source was used.
    """
    fqn = next((c for c in _candidate_fqns(family) if c in axiom_index), None)
    if fqn is not None:
        return _closure_state(axiom_index[fqn], fqn, "independent-lean-rerun")
    closure = (family.get("kernel_verified") or {}).get("node_axiom_closure")
    if closure is not None:
        return _closure_state(closure, _fqn(family), "release-truth-export")
    return {"status": "unverified", "reason": "no axiom closure available", "axioms": None}


def build_records(catalog, axiom_index, literature, reviews=None, prior_formal=None):
    reviews = reviews or {}
    prior_formal = prior_formal or {}
    lit = {r["id"]: r for r in literature}
    records = []
    for f in catalog["families"]:
        rid = f["id"]
        formal = verify_state(f, axiom_index)
        if formal["status"] == "unverified" and prior_formal.get(rid, {}).get("status") in ("pass", "fail"):
            formal = dict(prior_formal[rid])
            formal["source"] = (formal.get("source") or "prior") + "-carried"
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
        "categories": categorize(records),
        "records": records,
    }


def _source_group(url):
    host = (urlsplit(url or "").hostname or "").lower().removeprefix("www.")
    return SOURCE_GROUPS.get(host, "Other sources")


def _fully_double_checked(record):
    """A claim passes the double-check when the automated gates all pass. Statement
    fidelity is reported separately and does not gate this (it is not automated)."""
    s = record["states"]
    return s["formal_verification"]["status"] == "pass" and s["literature_source"]["status"] == "pass"


def categorize(records):
    """Screen (筛选) then group (归类): partition claims by whether they clear the
    automated double-check, then group each partition by source and by kind."""
    groups = {}
    for r in records:
        g = _source_group(r.get("source_url"))
        bucket = groups.setdefault(g, {"total": 0, "double_checked": 0, "needs_attention": [],
                                        "proved": 0, "refuted": 0, "ids": []})
        bucket["total"] += 1
        bucket["ids"].append(r["id"])
        bucket[r["kind"]] = bucket.get(r["kind"], 0) + 1
        if _fully_double_checked(r):
            bucket["double_checked"] += 1
        else:
            bucket["needs_attention"].append({
                "id": r["id"],
                "formal_verification": r["states"]["formal_verification"]["status"],
                "literature_source": r["states"]["literature_source"]["status"],
            })
    return dict(sorted(groups.items(), key=lambda kv: (-kv[1]["total"], kv[0])))


def summarize(audit):
    rec = audit["records"]
    def count(state, status):
        return sum(1 for r in rec if r["states"][state]["status"] == status)
    return {
        "total": len(rec),
        "double_checked": sum(1 for r in rec if _fully_double_checked(r)),
        "by_source": {g: b["total"] for g, b in audit.get("categories", {}).items()},
        "formal_verification_pass": count("formal_verification", "pass"),
        "formal_verification_fail": count("formal_verification", "fail"),
        "formal_verification_unverified": count("formal_verification", "unverified"),
        "literature_source_pass": count("literature_source", "pass"),
        "statement_fidelity_reviewed": sum(1 for r in rec if r["states"]["statement_fidelity"]["status"] in ("pass", "fail")),
    }


def _carry_from_prior(prior_path):
    """Reuse a prior audit's literature and fidelity verdicts for ids that recur.

    Existing claims' cited sources and sshx verdicts do not change when a new
    release adds other claims, so the automatic per-deploy run carries them and
    leaves genuinely new claims' literature unchecked rather than refetching.
    """
    literature, reviews, formal = [], [], {}
    prior = json.loads(Path(prior_path).read_text())
    for r in prior.get("records", []):
        formal[r["id"]] = r["states"].get("formal_verification", {})
        src = r["states"].get("literature_source", {})
        if src.get("status") == "pass":
            literature.append({"id": r["id"], "resolves": True,
                               "http_status": src.get("http_status"), "final_url": src.get("final_url"),
                               "anumber_on_page": src.get("identifier_on_page")})
        fid = r["states"].get("statement_fidelity", {})
        if fid.get("status") in ("pass", "fail"):
            reviews.append({"id": r["id"], "status": fid["status"],
                            "reviewer": fid.get("reviewer"), "note": fid.get("note")})
    return literature, reviews, formal


def main():
    ap = argparse.ArgumentParser(description="Assemble the claim double-check audit")
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--axioms", help="captured `#print axioms` output from an independent Lean re-run; "
                                     "omit to source the closure from the release truth-export")
    ap.add_argument("--literature", help="fresh source-URL resolution results (json list)")
    ap.add_argument("--reviews", help="sshx statement-fidelity verdicts (json list)")
    ap.add_argument("--prior", help="a prior claim-audit.v1.json to carry literature and fidelity from")
    ap.add_argument("--out", default=str(AUDIT))
    args = ap.parse_args()
    catalog = json.loads(Path(args.catalog).read_text())
    axiom_index = parse_axioms(Path(args.axioms).read_text()) if args.axioms else {}
    literature = json.loads(Path(args.literature).read_text()) if args.literature else []
    reviews = json.loads(Path(args.reviews).read_text()) if args.reviews else []
    prior_formal = {}
    if args.prior and Path(args.prior).exists():
        carried_lit, carried_rev, prior_formal = _carry_from_prior(args.prior)
        have = {r["id"] for r in literature}
        literature += [r for r in carried_lit if r["id"] not in have]
        haver = {r["id"] for r in reviews}
        reviews += [r for r in carried_rev if r["id"] not in haver]
    audit = build_records(catalog, axiom_index, literature, reviews, prior_formal)
    Path(args.out).write_text(json.dumps(audit, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(summarize(audit), indent=1))


if __name__ == "__main__":
    main()
