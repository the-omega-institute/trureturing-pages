"""Join human-facing Blueprint exposition onto a release-bound truth DAG.

The graph remains the source of structural truth. Blueprint Markdown is only a
presentation join, and missing documents deliberately fall back to a readable
label derived from the graph's domain and repository path.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:
    from lib.knowledge_pages import annotate_graph, render_knowledge_site
except ModuleNotFoundError:
    # Workflows intentionally support both ``python -m lib.human_labels`` and
    # direct ``python lib/human_labels.py`` invocation.
    from knowledge_pages import annotate_graph, render_knowledge_site


_H1 = re.compile(r"^#(?!#)\s+(.+?)\s*#*\s*$")
_HEADING = re.compile(r"^#{1,6}\s+")
_ABSTRACT = re.compile(r"^##\s+Abstract\s*$", re.IGNORECASE)
_THEOREM = re.compile(
    r"\*\*Theorem\b[^\n(]*\(([^\n]+?)\)\.\*\*", re.IGNORECASE
)
_CAMEL_BOUNDARY = re.compile(
    r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])"
)
_MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_WHITESPACE = re.compile(r"\s+")


def humanize_identifier(value: str) -> str:
    """Split path identifiers such as ``DagCompletion`` into words."""
    value = value.replace("_", " ").replace("-", " ")
    value = _CAMEL_BOUNDARY.sub(" ", value)
    return _WHITESPACE.sub(" ", value).strip()


def fallback_title(node: dict[str, Any]) -> str:
    repo_path = str(node.get("repo_path") or node.get("id") or "Node")
    leaf = Path(repo_path.removesuffix(".lean")).name or "Node"
    leaf_title = humanize_identifier(leaf)
    domain = humanize_identifier(str(node.get("domain") or ""))
    if domain and domain.casefold() != leaf_title.casefold():
        return f"{domain}: {leaf_title}"
    return leaf_title


def _clean_markdown(value: str) -> str:
    value = _MARKDOWN_LINK.sub(r"\1", value)
    return _WHITESPACE.sub(" ", value).strip()


def parse_blueprint(path: Path) -> dict[str, str | None]:
    """Extract the requested H1, Abstract lead, and first theorem name."""
    lines = path.read_text(encoding="utf-8").splitlines()
    title: str | None = None
    abstract: str | None = None
    theorem: str | None = None

    for line in lines:
        if title is None:
            match = _H1.match(line)
            if match:
                title = _clean_markdown(match.group(1)) or None
        if theorem is None:
            match = _THEOREM.search(line)
            if match:
                theorem = _clean_markdown(match.group(1)) or None

    for index, line in enumerate(lines):
        if not _ABSTRACT.match(line.strip()):
            continue
        for candidate in lines[index + 1 :]:
            if _HEADING.match(candidate.strip()):
                break
            candidate = _clean_markdown(candidate)
            if candidate:
                abstract = candidate
                break
        break

    return {
        "human_title": title,
        "human_abstract": abstract,
        "human_theorem": theorem,
    }


def enrich_graph(
    graph: dict[str, Any],
    blueprint_root: str | Path,
    blueprint_ref: str = "unbound",
) -> dict[str, Any]:
    """Return a copy of ``graph`` with human fields and page coordinates."""
    result = json.loads(json.dumps(graph, ensure_ascii=False))
    root = Path(blueprint_root)
    joined = 0
    for node in result.get("nodes", []):
        repo_path = str(node.get("repo_path") or "")
        relative_blueprint = Path(repo_path.removesuffix(".lean")).with_suffix(".md")
        blueprint = root / relative_blueprint
        labels = (
            parse_blueprint(blueprint)
            if blueprint.is_file()
            else {
                "human_title": None,
                "human_abstract": None,
                "human_theorem": None,
            }
        )
        if labels["human_title"]:
            joined += 1
        node.update(labels)
        node["human_title"] = node["human_title"] or fallback_title(node)
        node["blueprint_path"] = (
            f"Blueprint/{relative_blueprint.as_posix()}"
            if blueprint.is_file()
            else None
        )
        node["exposition_authority"] = (
            "blueprint-authored"
            if labels["human_abstract"] or labels["human_theorem"]
            else "path-derived-fallback"
        )

    result.setdefault("human_labels", {})
    result["human_labels"].update(
        {
            "source": "trureturing/Blueprint",
            "blueprint_ref": blueprint_ref,
            "formalized_nodes": joined,
            "fallback_nodes": len(result.get("nodes", [])) - joined,
            "authority": (
                "presentation-only; structural truth remains release-certified"
            ),
        }
    )
    return annotate_graph(result)


def _infer_site_root(output_path: Path) -> Path | None:
    if output_path.parent.name == "data":
        return output_path.parent.parent
    return None


def enrich_file(
    graph_path: str | Path,
    output_path: str | Path,
    blueprint_root: str | Path,
    *,
    blueprint_ref: str = "unbound",
    site_root: str | Path | None = None,
) -> dict[str, Any]:
    graph = json.loads(Path(graph_path).read_text(encoding="utf-8"))
    result = enrich_graph(graph, blueprint_root, blueprint_ref)
    output = Path(output_path)
    root = Path(site_root) if site_root is not None else _infer_site_root(output)
    if root is not None:
        render_knowledge_site(result, root)
    output.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph", help="input truth-graph JSON")
    parser.add_argument("output", help="output graph JSON; may equal input")
    parser.add_argument(
        "blueprint_root",
        help="upstream checkout's Blueprint directory",
    )
    parser.add_argument(
        "--blueprint-ref",
        default="unbound",
        help="exact upstream commit or named ref used for the presentation join",
    )
    parser.add_argument(
        "--site-root",
        help="static site root; inferred when output lives under <site>/data",
    )
    args = parser.parse_args()
    result = enrich_file(
        args.graph,
        args.output,
        args.blueprint_root,
        blueprint_ref=args.blueprint_ref,
        site_root=args.site_root,
    )
    labels = result["human_labels"]
    pages = result["knowledge_pages"]
    print(
        f"enriched {len(result.get('nodes', []))} nodes: "
        f"{labels['formalized_nodes']} Blueprint labels, "
        f"{labels['fallback_nodes']} path fallbacks, "
        f"{pages['node_count']} static concept pages -> {args.output}"
    )


if __name__ == "__main__":
    main()
