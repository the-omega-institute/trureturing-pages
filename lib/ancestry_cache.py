"""Reuse immutable Git commit ancestry facts; mutable release/head reads stay fresh."""
from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import re

OID = re.compile(r"[0-9a-f]{40}\Z")


class AncestryCache:
    def __init__(self, path, repository):
        self.path, self.repository = Path(path), repository
        self.head = None
        self.facts = {}
        self.parents = defaultdict(set)
        if self.path.exists():
            if self.path.stat().st_size > 16 * 1024 * 1024:
                raise ValueError("ancestry cache exceeds size limit")
            data = json.loads(self.path.read_text())
            if data.get("schema") != "pages-ancestry-cache.v1" or data.get("repository") != repository:
                raise ValueError("ancestry cache repository/schema mismatch")
            self.head = data.get("head")
            if self.head is not None and not OID.fullmatch(self.head):
                raise ValueError("invalid cached ancestry head")
            for a, b, result in data["facts"]:
                self._record(a, b, result)

    def _record(self, older, newer, result):
        if not OID.fullmatch(older) or not OID.fullmatch(newer) or type(result) is not bool:
            raise ValueError("invalid immutable ancestry fact")
        if (older, newer) in self.facts and self.facts[older, newer] != result:
            raise ValueError("conflicting immutable ancestry facts")
        self.facts[older, newer] = result
        if result:
            self.parents[newer].add(older)

    def get(self, older, newer):
        if older == newer:
            return True
        if (older, newer) in self.facts:
            return self.facts[older, newer]
        # A -> B and B -> C establish A -> C, including when the dev head advances.
        seen, pending = set(), [newer]
        while pending:
            current = pending.pop()
            if current == older:
                return True
            if current not in seen:
                seen.add(current)
                pending.extend(self.parents[current] - seen)
        return None  # Absence of a path never establishes non-ancestry.

    def record(self, older, newer, result):
        self._record(older, newer, result)
        self.save()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {"schema": "pages-ancestry-cache.v1", "repository": self.repository,
                "head": self.head, "facts": [[a, b, value] for (a, b), value in sorted(self.facts.items())]}
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(data, separators=(',', ':')) + '\n')
        temporary.replace(self.path)
