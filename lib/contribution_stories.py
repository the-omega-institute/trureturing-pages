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


def readable(text, *, limit=1):
    """Retain mathematical statements while omitting implementation metadata."""
    selected = []
    for sentence in sentences(text):
        if not 25 <= len(sentence) <= 540 or PIPELINE.search(sentence):
            continue
        if re.search(r'\bFin\s+\d|https?://|\b(?:preregister|declaration|kernel.checked|Lean|Mathlib|admission|private|source_path|definitionally)\b', sentence, re.I):
            continue
        if re.match(r'^(?:The )?(?:OEIS|FORMULA|COMMENT|AUTHOR|LINK|REFERENCE)|^Quoted|^From ', sentence, re.I):
            continue
        selected.append(sentence)
        if len(selected) == limit:
            break
    return ' '.join(selected)


def source_question(text, *, include_definition=True):
    """Prefer the actual question to its bibliography or workflow description."""
    text = str(text or '')
    quotes = list(re.finditer(r'(?m)^>[^\n]*(?:\n>[^\n]*)*', text))
    def priority(match):
        quote = re.sub(r'(?m)^>[ \t]?', '', match[0]).strip()
        if re.match(r'^(?:Definition|Theorem|Lemma|Proposition)\b', quote, re.I):
            return -1
        return 2 if re.search(r'\b(?:conjectur\w*|open question|we ask)\b|\?', quote, re.I) else 1
    quotes.sort(key=priority, reverse=True)
    for match in quotes:
        if priority(match) < 0:
            continue
        quote = re.sub(r'(?m)^>[ \t]?', '', match[0]).strip()
        if quote and len(quote) <= 1800:
            definition = text[match.end():].strip().split('\n\n', 1)[0]
            if include_definition and re.match(r'^(?:Here\b|where\b|The quantity\b)', definition) and len(quote + definition) <= 1800:
                quote += ' ' + definition
            return quote
    paragraphs = re.split(r'\n\s*\n', text)
    for i, paragraph in enumerate(paragraphs):
        if re.search(r'\bConjecture\s+[\d.]+.{0,100}\b(?:asserts?|states?|asks?)\b', paragraph, re.I | re.S):
            if i + 1 < len(paragraphs) and paragraphs[i + 1].lstrip().startswith('$$'):
                paragraph += ' ' + paragraphs[i + 1]
            if len(paragraph) <= 1800:
                return paragraph
    return readable(text)


def scope_impact(item):
    """Explain documented reach without inventing novelty or field-wide influence."""
    assessment = item.get('assessment', {})
    facts = assessment.get('dimensions', {})
    advance = facts.get('advance', {}).get('level', 0)
    history = facts.get('history', {})
    year = history.get('source_year')
    context = f'The question is recorded in a {year} source. ' if year else ''
    if assessment.get('scope') == 'partial':
        return context + 'This settles the stated special case; the broader question remains open.'
    if advance >= 3 and item.get('general_scope', assessment.get('general_scope')):
        return context + 'The proof covers every case allowed by the stated hypotheses.'
    return context + 'The result answers the source question in the exact scope stated here.'


def is_assertion(text):
    """A topic heading alone does not tell the reader what was established."""
    if (re.search(r'\b(?:open question|whether|we conjecture|we ask)\b|\?', text, re.I)
            and not re.search(r'\b(?:prov\w*|refut\w*|disprov\w*|counterexample|settles?|answers?)\b', text, re.I)):
        return False
    return bool(re.search(r'\b(?:is|are|has|have|holds?|satisf(?:y|ies)|gives?|forces?|equals?|'
                          r'attains?|determines?|admits?|exists?|implies?|refutes?|proves?|'
                          r'establish(?:es)?|characteri[sz](?:es)?)\b|[≤≥=]|证明|反例|等于|存在|成立', text, re.I))


def source_answer_and_scope(problem):
    """Use explicit settlement prose, keeping unresolved source clauses visible."""
    prose = re.sub(r'(?m)^>[^\n]*(?:\n>[^\n]*)*', '', problem.get('sections', {}).get('Problem', ''))
    answer = scope = ''
    for sentence in sentences(prose):
        clean = readable(sentence)
        if not clean:
            continue
        if not answer and re.search(r'\b(?:is|are) (?:refuted|disproved|proved|settled)\b', clean, re.I) and not re.search(r'\b(?:already|previously)\b', clean, re.I):
            answer = clean
        if not scope and re.search(r'\b(?:clause|classification|question)\b.{0,120}\bremains? open\b|\bleaves? .{0,120} open\b', clean, re.I):
            scope = clean
    triage = problem.get('sections', {}).get('Triage', '')
    boundary = re.search(r'(?im)^[^\n]*\bLogical boundary\b[^\n]*(?:\n(?!\s*[-*]\s|\s*\n)[^\n]*)*', triage)
    if boundary:
        text = re.sub(r'^[\s*\-]*Logical boundary[\s:*]*', '', boundary[0], flags=re.I)
        scope = readable(text, limit=2) or scope
    return answer, scope


def _english_story(problem, record, item, authored=None):
    authored = load_stories() if authored is None else authored
    entry = authored.get(record['id'], {})
    if entry.get('binding') == story_binding(problem, record):
        return {**entry['en'], 'impact': entry['en'].get('context') or scope_impact(item),
                'origin': 'source-bound-editorial', 'binding': entry['binding']}
    assessment = item.get('assessment', {})
    sections = problem.get('sections', {})
    explicit_answer, explicit_scope = source_answer_and_scope(problem)
    finding = readable(assessment.get('contribution'))
    if not is_assertion(finding):
        finding = ''
    finding = finding or explicit_answer
    question = source_question(sections.get('Problem')) or source_question(record.get('scope'))
    question_core = source_question(sections.get('Problem'), include_definition=False) or source_question(record.get('scope'), include_definition=False)
    # A terse module abstract can merely repeat its title. For a fully delivered
    # affirmative conjecture, retain the source's actual mathematical assertion.
    if (record.get('kind') == 'proved' and assessment.get('scope') != 'partial'
            and assessment.get('general_scope') and re.match(r'^We conjecture that\b', question, re.I)
            and (not finding or re.search(r'\bconjecture\b', finding, re.I))):
        finding = 'We prove that ' + re.sub(r'^We conjecture that\s*', '', question_core, flags=re.I)
    if not finding:
        summary = readable(record.get('summary'))
        if is_assertion(summary) and not re.search(r'\bconjectur\w*\b', summary, re.I):
            finding = summary
        elif (record.get('kind') == 'proved' and assessment.get('scope') != 'partial'
              and question_core and '?' not in question_core and is_assertion(question_core)):
            finding = 'Proved for the stated scope: ' + question_core
        elif record.get('kind') == 'refuted':
            finding = 'A verified counterexample disproves the recorded statement.'
        else:
            finding = readable(assessment.get('general_scope')) or readable(record.get('scope'))
    context = readable(sections.get('Motivation'), limit=2)
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
            'question': question,
            'context': context,
            'impact': context or scope_impact(item),
            'finding': finding,
            'idea': idea,
            'boundary': readable(assessment.get('next_question')) or explicit_scope,
            'origin': 'released-dossier', 'binding': story_binding(problem, record)}


def result_story(problem, record, item, authored=None):
    from lib.research_translations import source_item
    story = _english_story(problem, record, item, authored)
    story['formal_title'] = item.get('title') or record['title']
    story['translation_source'] = source_item(record, story, story['formal_title'])['source_digest']
    return story


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
                     'input_digest': item['input_digest']})
    payload = {'schema_version': 'research-milestones.v1', 'ranking_policy': ranking['schema_version'],
               'source_commit': ranking['source_commit'],
               'truth_release_digest': snapshot.get('truth_release_digest'),
               'policy': ranking['research_news_policy'], 'results': news}
    if destination:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload
