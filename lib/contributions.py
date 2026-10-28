"""Source-bound, evidenced assessments; outreach never changes these scores."""
from __future__ import annotations

import json
import math
from pathlib import Path
import re

from lib.literature import validate_http_url

VERSION = 'contribution-assessment.v1'
POLICY = 'contribution-ranking.v1'
# The conceptual and methodological contributions deliberately outweigh a bare result.
DIMENSIONS = {
    'significance': ('Problem significance', 20),
    'concepts': ('New concepts', 20),
    'methods': ('New methods', 15),
    'advance': ('Mathematical advance', 10),
    'standing': ('Scholarly context', 15),
    'history': ('Problem age', 10),
    'attention': ('Research attention', 10),
}


def integer(value, low, high):
    # Dossier YAML uses BaseLoader: accept canonical integer strings too.
    if isinstance(value, bool) or not re.fullmatch(r'0|[1-9][0-9]*', str(value)):
        raise ValueError('Expected an integer')
    number = int(value)
    if not low <= number <= high:
        raise ValueError('Integer outside assessment bounds')
    return number


def assessment(raw):
    if not isinstance(raw, dict) or raw.get('schema_version') != VERSION:
        raise ValueError('Unsupported contribution assessment')
    dimensions = raw.get('dimensions')
    if not isinstance(dimensions, dict) or set(dimensions) - set(DIMENSIONS):
        raise ValueError('Unknown assessment dimension')
    result = {'schema_version': VERSION, 'dimensions': {}}
    for key, item in dimensions.items():
        if not isinstance(item, dict):
            raise ValueError('Invalid assessment dimension')
        rationale, evidence = item.get('rationale'), item.get('evidence')
        if not isinstance(rationale, str) or not rationale.strip():
            raise ValueError('Assessment needs a rationale')
        if not isinstance(evidence, list) or not evidence:
            raise ValueError('Assessment needs public evidence')
        for url in evidence:
            validate_http_url(url)
        fact = {'rationale': rationale, 'evidence': sorted(set(evidence))}
        if key == 'history':
            proposed = integer(item.get('proposed_year'), 1, 9999)
            resolved = integer(item.get('resolved_year'), proposed, 9999)
            age = resolved - proposed
            level = sum(age >= boundary for boundary in (2, 5, 15, 40))
            fact.update(proposed_year=proposed, resolved_year=resolved, years=age)
        else:
            level = integer(item.get('level'), 0, 4)
        fact['level'] = level
        result['dimensions'][key] = fact
    for key in ('question_context', 'contribution', 'next_question'):
        if raw.get(key):
            if not isinstance(raw[key], str):
                raise ValueError('Assessment narrative must be text')
            result[key] = raw[key]
    return result


def score(dimensions, selected=None):
    selected = list(DIMENSIONS) if selected is None else list(dict.fromkeys(selected))
    if not selected or set(selected) - set(DIMENSIONS):
        raise ValueError('Select at least one known dimension')
    weight = sum(DIMENSIONS[key][1] for key in selected)
    covered = sum(DIMENSIONS[key][1] for key in selected if key in dimensions)
    points = sum(DIMENSIONS[key][1] * dimensions[key]['level'] / 4
                 for key in selected if key in dimensions)
    rounded = lambda value: math.floor(value * 100 + 0.5) / 100
    return {'score': rounded(points * 100 / weight) if covered == weight else None,
            'evidenced_score': rounded(points * 100 / weight),
            'coverage': rounded(covered * 100 / weight),
            'status': 'complete' if covered == weight else 'partial' if covered else 'pending'}


def ranking_key(item):
    return ({'complete': 0, 'partial': 1, 'pending': 2}[item['status']],
            -item['evidenced_score'], item['title'].casefold(), item['id'])


def build_index(snapshot, records, destination=None):
    problems = {p['slug']: p for p in snapshot.get('problems', [])}
    items = []
    for record in records:
        problem = problems.get(record.get('problem_slug') or record['id'], {})
        raw = problem.get('contribution_assessment')
        normalized, error = {'dimensions': {}}, None
        if raw is not None:
            try:
                normalized = assessment(raw)
            except ValueError as exc:
                # Editorial metadata must never quarantine a valid proof.
                error = str(exc)
        item = dict(id=record['id'], title=record['title'], assessment=normalized,
                    **score(normalized['dimensions']))
        if error:
            item['assessment_error'] = error
        items.append(item)
    payload = {'schema_version': POLICY,
               'source_commit': snapshot.get('graph', {}).get('source_snapshot', {}).get('source_commit'),
               'dimensions': {k: {'label': label, 'weight': weight} for k, (label, weight) in DIMENSIONS.items()},
               'results': sorted(items, key=ranking_key)}
    if destination:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload
