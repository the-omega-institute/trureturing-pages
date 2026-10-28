"""Readable, source-bound stories for results, with an automatic dossier fallback.

Editorial explanations never change a score. Their binding prevents an old
explanation from surviving a changed theorem, scope or proof account.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

from lib.contributions import delivered_prose, sentences, PIPELINE

ROOT = Path(__file__).resolve().parents[1]


def story_binding(problem, record):
    material = {'sections': {key: problem.get('sections', {}).get(key, '')
                             for key in ('Problem', 'Motivation', 'Route', 'Triage')},
                'kind': record.get('kind'), 'scope': record.get('scope'),
                'statement_id': record.get('statement_id')}
    return hashlib.sha256(json.dumps(material, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def load_stories():
    path = ROOT / 'site/assets/contribution-stories.json'
    return json.loads(path.read_text())['stories'] if path.exists() else {}


def readable(text):
    """Keep actual explanatory prose; equations and implementation stay in evidence."""
    for sentence in sentences(text):
        if not 45 <= len(sentence) <= 540 or PIPELINE.search(sentence):
            continue
        if re.search(r'\$|\\[a-zA-Z]|\bFin\s+\d|→|\||https?://|\b(?:preregister|declaration|kernel.checked|Lean|Mathlib|admission|private|source_path)\b', sentence, re.I):
            continue
        if re.match(r'^(?:The )?(?:OEIS|FORMULA|COMMENT|AUTHOR|LINK|REFERENCE)|^Quoted|^From ', sentence, re.I):
            continue
        return sentence
    return ''


def result_story(problem, record, item, authored=None):
    authored = load_stories() if authored is None else authored
    entry = authored.get(record['id'], {})
    if entry.get('binding') == story_binding(problem, record):
        return {**entry['en'], 'origin': 'source-bound-editorial', 'binding': entry['binding']}
    assessment = item.get('assessment', {})
    sections = problem.get('sections', {})
    finding = readable(assessment.get('contribution')) or readable(record.get('summary'))
    context = readable(sections.get('Motivation'))
    idea = readable(delivered_prose(sections.get('Route')))
    dimensions = assessment.get('dimensions', {})
    if not idea:
        support = ' '.join(dimensions.get('methods', {}).get('supporting_excerpts', []))
        techniques = []
        for label, pattern in [('a bijective argument', r'\bbijection\b'),
                               ('induction', r'\binduction\b'),
                               ('spectral estimates', r'\b(?:spectral|eigen\w*|resolvent)\b'),
                               ('convexity', r'\bconvex\w*\b'),
                               ('polynomial identities', r'\bpolynomial\b'),
                               ('factorization', r'\bfactorization\b')]:
            if re.search(pattern, support, re.I):
                techniques.append(label)
        if techniques:
            idea = 'The proof uses ' + ' and '.join(techniques[:2]) + '.'
    return {'headline': item.get('title') or record['title'],
            'question': readable(sections.get('Problem')),
            'context': context,
            'finding': finding,
            'idea': idea,
            'boundary': readable(assessment.get('next_question')),
            'origin': 'released-dossier', 'binding': story_binding(problem, record)}


def build_milestones(snapshot, records, ranking, destination=None):
    """A current-release projection, keyed by result ID, never append on rebuild.

    Every qualifying result is included, even when no authored story exists.
    Withdrawn results and results below a changed threshold disappear on rebuild.
    Publications/collaborations are independent and are joined only by explicit IDs.
    """
    problems = {p['slug']: p for p in snapshot.get('problems', [])}
    by_id = {r['id']: r for r in records}
    authored = load_stories()
    news = []
    for item in ranking['results']:
        record = by_id[item['id']]
        if not item['research_news']['eligible']:
            continue
        problem = problems.get(record.get('problem_slug') or record['id'], {})
        news.append({'id': item['id'], 'problem_id': problem.get('slug', record['id']),
                     'title': item['title'], 'kind': record['kind'], 'score': item['score'],
                     'date': record.get('date'),
                     'url': 'conjectures.html#resolved-' + item['id'],
                     'story': result_story(problem, record, item, authored),
                     'input_digest': item['input_digest'],
                     **({'pin': item['editorial_pin']} if item.get('editorial_pin') else {})})
    payload = {'schema_version': 'research-milestones.v1', 'ranking_policy': ranking['schema_version'],
               'source_commit': ranking['source_commit'],
               'truth_release_digest': snapshot.get('truth_release_digest'),
               'policy': ranking['research_news_policy'], 'results': news}
    if destination:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload
