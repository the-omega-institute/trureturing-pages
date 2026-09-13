"""Deterministic projection of #48-verified resolutions into the research catalog."""
import argparse
import gzip
import json
from pathlib import Path

from lib.literature import problem_source_url
from lib.problem_resolutions import is_kernel_verified
from lib.research_news import _derived_field, _problem_summary

CATALOG = Path(__file__).resolve().parents[1] / "site/assets/research-catalog.json"


def build_catalog(snapshot):
    if snapshot.get("schema_version") != "pages-library-snapshot.v1":
        raise ValueError("Research catalog requires a verified Library snapshot v1")
    source = snapshot["graph"]["source_snapshot"]
    if source["truth_release_digest"] != snapshot["truth_release_digest"]:
        raise ValueError("Mixed Library and graph truth releases")
    domains = {node["id"]: node.get("domain") for node in snapshot["graph"]["nodes"]}
    families = []
    seen = set()
    for problem in snapshot["problems"]:
        resolution = problem.get("resolution")
        if not is_kernel_verified(resolution):
            continue
        slug = problem["slug"]
        if slug in seen:
            raise ValueError("Duplicate verified problem slug: " + slug)
        seen.add(slug)
        url = resolution.get("source_url") or problem_source_url(problem)
        source_area = _derived_field(problem, url, resolution)
        domain = next((domains[gid] for gid in problem.get("motivation_gids", []) if domains.get(gid)), None)
        families.append({
            "id": slug, "title": problem["title"],
            "area": source_area if source_area != "Open problem" else domain or source_area,
            "kind": resolution["kind"], "summary": _problem_summary(problem),
            "source_url": url, "source_commit": source["source_commit"],
            "declaration_gid": resolution["declaration_gid"],
            "kernel_verified": resolution["kernel_verified"],
        })
    return {
        "schema_version": "pages-research-catalog.v1",
        "revision": snapshot["truth_release_digest"],
        "source_repo": source["source_repo"], "source_commit": source["source_commit"],
        "review_scope": "Resolutions machine-verified by the truth-release package and #48 gate. Each declaration is a kernel-verified frozen/proven node in this release.",
        "families": sorted(families, key=lambda family: family["id"]),
    }


def write_catalog(snapshot, path=CATALOG):
    result = build_catalog(snapshot)
    Path(path).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate the verified research catalog")
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    args = parser.parse_args(argv)
    raw = args.snapshot.read_bytes()
    snapshot = json.loads(gzip.decompress(raw) if args.snapshot.suffix == ".gz" else raw)
    result = write_catalog(snapshot, args.catalog)
    print(f"Generated {len(result['families'])} kernel-verified research resolutions.")


if __name__ == "__main__":
    main()
