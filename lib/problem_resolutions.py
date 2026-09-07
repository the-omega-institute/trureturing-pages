"""Project pinned Scribe Markdown records without asserting typed/Lean validation."""
import json
import re

from markdown_it import MarkdownIt

MARKDOWN = MarkdownIt("commonmark", {"html": True})
MARKER = re.compile(r"<!-- scribe-open-problem-resolution-v1 (.+) -->")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate resolution metadata key.")
        result[key] = value
    return result


def bind_resolutions(problems, blueprints, objects):
    by_slug = {p["slug"]: p for p in problems}
    bindings = {}
    for path, text in sorted(blueprints.items()):
        if not path.startswith("Blueprint/") or not path.endswith(".md"):
            raise ValueError("Resolution record is outside Blueprint Markdown.")
        module = path[len("Blueprint/"):-3]
        # CommonMark distinguishes real comments from fenced or indented examples.
        tokens = MARKDOWN.parse(text)
        comments = [token for block in tokens for token in (block.children or [block])
                    if token.type in ("html_block", "html_inline")]
        for token in comments:
            for line in token.content.splitlines():
                if "scribe-open-problem-resolution-v" not in line:
                    continue
                match = MARKER.fullmatch(line)
                if not match:
                    raise ValueError(f"Malformed resolution marker: {path}")
                record = json.loads(match[1], object_pairs_hook=unique_object)
                if not isinstance(record, dict) or set(record) != {"problem_slug", "declaration_gid", "resolution_kind"}:
                    raise ValueError(f"Invalid resolution fields: {path}")
                slug, gid, kind = (record[k] for k in ("problem_slug", "declaration_gid", "resolution_kind"))
                if not isinstance(slug, str) or slug not in by_slug or slug in bindings:
                    raise ValueError(f"Dangling or duplicate resolution problem: {path}")
                if kind not in ("proved", "refuted") or not isinstance(gid, str) or not re.fullmatch(re.escape(module) + r"\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*", gid):
                    raise ValueError(f"Resolution kind or declaration does not match host: {path}")
                if f"Golden/Frozen/state/{module}.lean.json" not in objects:
                    raise ValueError(f"Resolution host lacks a Frozen record: {path}")
                bindings[slug] = {"kind": kind, "declaration_gid": gid, "source_path": path,
                                  "evidence": "source-recorded-markdown"}
    return [{**p, "resolution": bindings[p["slug"]]} if p["slug"] in bindings else p for p in problems]
