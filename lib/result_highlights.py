"""Compact, sourced reading cues; ranking scores are never public claim labels."""
from __future__ import annotations

from datetime import date
import re
from urllib.parse import urlsplit

from lib.contributions import REFERENCE_YEAR, documented_year, sentences

REPO = 'https://github.com/the-omega-institute/trureturing'


def _public_url(value):
    try:
        return value if urlsplit(value or '').scheme in ('https', 'http') else ''
    except ValueError:
        return ''


def result_highlight(record, item, problem=None):
    """Describe what the record delivers, with the excerpt behind each cue.

    A bibliography year dates a source, not an unsolved conjecture. Duration
    labels require both an explicitly dated question and a recorded resolution
    date; rebuild time and ranking tiers cannot manufacture historical status.
    """
    problem = problem or {}
    assessment = item.get('assessment', {})
    dimensions = assessment.get('dimensions', {})
    sections = problem.get('sections', {})
    source = _public_url(record.get('source_url'))
    commit = str(record.get('source_commit') or '')
    slug = problem.get('slug') or record['id']
    dossier = f'{REPO}/blob/{commit}/Problems/{slug}.md' if commit else source
    title = str(record.get('title') or '')
    conjecture = bool(re.search(r'\bconjecture\b|\bhypothesis\b', title, re.I))
    kind = record.get('kind')
    headline = 'Conjecture proved' if conjecture and kind == 'proved' else 'Question resolved'
    evidence = []
    contribution = str(assessment.get('contribution') or record.get('summary') or '')
    # Descriptive labels use the released result explanation, not a proposed
    # route or an aggregate importance/reputation score.
    positive = [s for s in sentences(contribution) if not re.search(
        r'\b(?:not|no|open|conjectured|would|could|might|proposed|previously|already|outside)\b', s, re.I)]
    rules = (
        ('New mathematical concept', r'\bintroduc(?:e|es) (?:a |an )?new (?:definition|notion|invariant)\b'),
        ('Sharp bound proved', r'\bsharp (?:upper |lower )?bound\b|\b(?:bound|bounds)\b.{0,90}\battain'),
        ('Exact bounds established', r'\bequal(?:s)? the (?:\w+ )?bounds\b'),
        ('Exact optimum established', r'\b(?:attains?|establish(?:es)?)\b.{0,70}\b(?:maximum|minimum|optimum|smallest|largest)\b'),
        ('Structural characterization', r'\bcharacteri[sz](?:ation|ed|es)\b|\bnormal form\b'),
        ('Exact formula proved', r'\b(?:closed[- ]form|counting formula|exact formula|explicit formula)\b'),
        ('Exact counting formula', r'\bnumber of\b.{0,360}\b(?:equals?|is)\s+(?:\d|\$|\\)'),
        ('Recurrence proved', r'\b(?:recurrence|recursion)\b'),
        ('Equivalence proved', r'\b(?:equivalence|equivalent)\b'),
        ('Bijective proof', r'\b(?:bijection|bijective)\b'),
    )
    if kind == 'refuted':
        headline = 'Conjecture refuted' if conjecture else 'Counterexample found'
        match = next((s for s in positive if re.search(r'\b(?:infinite|parametri[sz]ed) family\b', s, re.I)
                      and re.search(r'\bcounterexamples?\b', s, re.I)), '')
        if match:
            headline = 'Family of counterexamples'
    else:
        match = ''
        for label, pattern in rules:
            match = next((s for s in positive if re.search(pattern, s, re.I)), '')
            if match:
                headline = label
                break
    if match:
        evidence.append({'label': 'Contribution', 'text': match, 'url': dossier})

    # "Fundamental" describes an explicitly attributed question, never a
    # famous author's profile or a high score. Preserve attribution in the UI.
    fundamental = next((s for s in sentences(sections.get('Motivation', ''))
                        if re.search(r'\b(?:this|the) (?:conjecture|question|problem) is (?:a )?(?:fundamental|foundational|central)\b', s, re.I)
                        and not re.search(r'\b(?:not|no|could|would|might)\b', s, re.I)), '')
    if fundamental:
        headline = 'Foundational question resolved'
        evidence.append({'label': 'Context in the source', 'text': fundamental, 'url': dossier})

    history = None
    year, basis = documented_year(problem)
    history_url = _public_url(problem.get('url')) or source or dossier
    # The primary quotation can name the original paper while the bibliography
    # points to a later survey (for example Erdős 1979 / Tenenbaum 2013).
    attribution = str(sections.get('Problem') or '').split('\n\n', 1)[0]
    years = set(re.findall(r'\(((?:18|19|20)\d{2})\)', attribution))
    if (basis != 'Dated conjecture statement' and len(years) == 1
            and re.search(r'\b(?:printed page|journal|paper|section)\b', attribution, re.I)
            and urlsplit(problem.get('url') or '').hostname not in ('oeis.org', 'www.oeis.org')):
        attributed_year = int(next(iter(years)))
        if attributed_year <= REFERENCE_YEAR:
            year, basis, history_url = attributed_year, 'Year in the primary source attribution', dossier
    # A DOI/bibliography may date the journal edition while the supplied v1
    # URL dates an earlier preprint. Label that date as a preprint explicitly.
    if basis != 'Dated conjecture statement':
        for url in (problem.get('url'), problem.get('doi'), record.get('source_url')):
            preprint = re.match(r'(?:https?://(?:www\.)?arxiv\.org/(?:abs|html|pdf)/|'
                                r'(?:https?://doi\.org/)?10\.48550/arxiv\.)(\d{2})\d{2}\.\d{4,5}(?:v\d+|\.pdf)?$',
                                str(url or ''), re.I)
            if preprint and 2000 + int(preprint[1]) <= REFERENCE_YEAR:
                year, basis = 2000 + int(preprint[1]), 'First preprint year'
                history_url = _public_url(url) or source or dossier
                break
    if year:
        posed = basis == 'Dated conjecture statement'
        history = {'label': 'Posed in' if posed else 'First preprint' if basis == 'First preprint year' else 'Source',
                   'value': str(year)}
        history_text = f'{basis}: {year}.'
        if posed:
            # Keep a resolution fixed in history when the site is regenerated.
            try:
                resolved = date.fromisoformat(str(record.get('date') or ''))
            except ValueError:
                resolved = None
            if resolved and resolved.year - year >= 10:
                history = {'label': 'Years from question to resolution',
                           'value': str(resolved.year - year)}
                history_text += f' Resolution recorded in {resolved.year}; elapsed calendar years.'
        evidence.append({'label': 'Historical context', 'text': history_text,
                         'url': history_url})

    standing = dimensions.get('standing', {})
    person = standing.get('person')
    if person and standing.get('evidence'):
        evidence.append({'label': 'Scholarly context', 'text': standing.get('rationale', ''),
                         'url': _public_url(standing['evidence'][-1])})
    return {'headline': headline, 'history': history, 'person': person, 'evidence': evidence}
