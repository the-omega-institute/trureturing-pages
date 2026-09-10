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


# The formalization gate: a resolution may be presented as "solved" only when the exact
# resolving declaration is a kernel-verified node in the published truth-release. We read
# that truth from the release bundle's truth-export and never re-derive or trust the
# Markdown marker alone. The bundle is the sole truth authority, so this gate consumes it
# and does not weaken truth-release.
KERNEL_AXIOMS = frozenset({"propext", "Classical.choice", "Quot.sound"})
VERIFIED_STATUSES = frozenset({"frozen", "proven-not-yet-frozen"})
TRUTH_EXPORT_DIALECT = "stratalint.truth-export.v2"


def _declaration_names(node):
    """Final-name component of every declaration the node kernel-verifies."""
    names = set()
    for declaration in node.get("declarations", []):
        key = declaration.get("declaration_name_key", "")
        match = re.findall(r"\d+:([A-Za-z_][A-Za-z0-9_']*)", key)
        if match:
            names.add(match[-1])
    return names


def index_truth_export(truth_export):
    """Index a published truth-export bundle by repo_path, fail-closed on wire drift."""
    if truth_export.get("schema_version") != 2 or truth_export.get("dialect") != TRUTH_EXPORT_DIALECT:
        raise ValueError("Unexpected truth-export wire contract; refusing to gate against it.")
    index = {}
    for node in truth_export.get("nodes", []):
        repo_path = node.get("repo_path")
        if repo_path in index:
            raise ValueError(f"Duplicate truth-export repo_path: {repo_path}")
        index[repo_path] = node
    return index


def verify_resolutions(problems, truth_export_index):
    """Fail-closed: every bound resolution must name a kernel-verified declaration in the
    published truth-release. Annotates the resolution with the verified node identity;
    raises on any resolution that is not backed by a kernel-clean frozen/proven node."""
    for problem in problems:
        resolution = problem.get("resolution")
        if not resolution:
            continue
        gid = resolution["declaration_gid"]
        module, _, declaration = gid.rpartition(".")
        repo_path = module + ".lean"
        node = truth_export_index.get(repo_path)
        if node is None:
            raise ValueError(f"Resolution {gid}: no published truth-release node for {repo_path}.")
        if node.get("freeze_status") not in VERIFIED_STATUSES:
            raise ValueError(f"Resolution {gid}: node freeze_status {node.get('freeze_status')!r} is not kernel-verified.")
        # An empty closure is a legal subset of the three kernel axioms (a proof that uses none
        # of them is the strongest possible), so it must pass. Missing evidence is different: the
        # field's absence is not an empty set and must fail closed rather than be read as "no axioms".
        if "node_axiom_closure" not in node:
            raise ValueError(f"Resolution {gid}: missing axiom-closure evidence; refusing to read absence as empty.")
        closure = set(node["node_axiom_closure"])
        if not closure <= KERNEL_AXIOMS:
            raise ValueError(f"Resolution {gid}: axiom closure {sorted(closure)} escapes the kernel allowlist.")
        if declaration.rpartition(".")[2] not in _declaration_names(node):
            raise ValueError(f"Resolution {gid}: declaration {declaration} is not among the node's verified declarations.")
        resolution["kernel_verified"] = {
            "frozen_node_id": node["frozen_node_id"],
            "freeze_status": node["freeze_status"],
        }
    return problems
