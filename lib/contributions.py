"""Pages-owned reading order derived from the existing released dossiers.

No new trureturing fields, service credentials, model calls or upstream writes.
Signals are capped, cited and scoped to the delivered result. They are editorial
ranking estimates, not a proof of novelty or an objective measure of importance.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from lib.literature import problem_source_url

ROOT = Path(__file__).resolve().parents[1]
POLICY = 'contribution-ranking.v2'
REFERENCE_YEAR = 2026  # Fixed policy baseline; rebuilds do not silently age results.
DIMENSIONS = {
    'significance': ('Problem significance', 20),
    'concepts': ('Conceptual contribution', 20),
    'methods': ('Proof methods', 15),
    'advance': ('Mathematical advance', 10),
    'standing': ('Scholarly context', 15),
    'history': ('Historical context', 10),
    'attention': ('Prior research', 10),
}
REPO = 'https://github.com/the-omega-institute/trureturing'
MONTH = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
NEGATION = re.compile(r'\b(?:not|no|neither|without|unproved|unverified|proposed|would|could|might|planned|try|seek|remains? open|not formalized|outside|out of scope)\b', re.I)
PIPELINE = re.compile(r'D5/|Blueprint/|std3|Scribe|Freeze|frozen|admission|preregister|proof_shape|escape_witness|utility[:=]|source[- ]bound|kernel', re.I)


def plain(text):
    text = re.sub(r'\[([^\]]+)\]\([^\s)]+\)', r'\1', str(text or ''))
    return ' '.join(re.sub(r'[`*_>#]', '', text).split())


def sentences(text):
    # Code and metadata cannot establish conceptual novelty or a proof mechanism.
    text = re.sub(r'```.*?```', '', str(text or ''), flags=re.S)
    return [plain(s) for s in re.split(r'\n\s*\n|(?<=[.!?])\s+(?=[A-Z])', text) if plain(s)]


def positive_excerpt(text, pattern):
    for sentence in sentences(text):
        if len(sentence) <= 1800 and re.search(pattern, sentence, re.I) and not NEGATION.search(sentence):
            return sentence
    return None


def first_readable(text):
    return next((s for s in sentences(text) if not PIPELINE.search(s) and len(s) > 30 and '|' not in s), '')


def documented_year(problem):
    """Use a dated conjecture line before the date of its container/source.

    In particular an OEIS AUTHOR date is not the date of a later conjecture.
    These are documented-source dates, never asserted years of failed attempts.
    """
    question = problem.get('sections', {}).get('Problem', '')
    dated = []
    for block in re.split(r'\n\s*\n', question):
        block = re.split(r'(?im)^\s*>?\s*(?:AUTHOR\b|%A\b)', block)[0]
        if re.search(r'conjectur|open question|hypothesis', block, re.I):
            dated += [int(y) for y in re.findall(MONTH + r'\s+\d{1,2},?\s+((?:18|19|20)\d{2})', block, re.I)]
            dated += [int(y) for y in re.findall(r'(?:posed|conjectured|asked|open)\s+(?:in|since)\s+((?:18|19|20)\d{2})', block, re.I)]
    dated = [y for y in dated if y <= REFERENCE_YEAR]
    if dated:
        return min(dated), 'Dated conjecture statement'
    # Do not substitute an OEIS entry's creation/author date for its conjecture.
    if urlsplit(problem.get('url', '')).hostname in ('oeis.org', 'www.oeis.org'):
        return None, None
    arxiv = str(problem.get('arxiv_id') or problem.get('doi') or problem.get('url') or '')
    match = re.search(r'(?:arxiv[.:/]|/(?:abs|html|pdf)/)(\d{2})\d{2}\.\d{4,5}', arxiv, re.I)
    if match:
        year = 2000 + int(match[1])
        if year <= REFERENCE_YEAR:
            return year, 'Date of the cited source (not a claim of time spent open)'
    # The bibliographic key is existing upstream metadata, not a search timestamp.
    match = re.search(r'((?:18|19|20)\d{2})', str(problem.get('bibkey', '')))
    if match and int(match[1]) <= REFERENCE_YEAR:
        return int(match[1]), 'Year recorded in the source bibliography'
    header = question.split('\n\n', 1)[0]
    match = re.search(r'\b((?:18|19|20)\d{2})\b(?=.{0,35}\b(?:paper|conjecture|question|reminiscence|note))', header, re.I)
    return (int(match[1]), 'Year in the source attribution') if match and int(match[1]) <= REFERENCE_YEAR else (None, None)


def context(snapshot, records):
    """Count only another released result's actual use, not helper/module counts."""
    graph = snapshot.get('graph', {})
    nodes = {n['id']: n for n in graph.get('nodes', [])}
    owners = defaultdict(set)
    for r in records:
        modules = {r.get('module', '')} | {m['declaration_gid'].split('.')[0] for m in r.get('members', [])}
        for module in modules - {''}:
            owners[module].add(r['id'])
    consumers = defaultdict(set)
    for edge in graph.get('edges', []):
        if edge.get('layer') != 'truth-dependency':
            continue
        # Release graph direction is prerequisite -> consumer.
        for owner in owners.get(edge['source'], ()):
            consumers[owner].update(owners.get(edge['target'], set()) - {owner})
    return nodes, consumers


def derive_assessment(problem, record, snapshot, nodes, consumers, profiles):
    sections = problem.get('sections', {})
    question = sections.get('Problem', record.get('scope', ''))
    motivation = sections.get('Motivation', '')
    route = sections.get('Route', '')
    triage = sections.get('Triage', '')
    # A later "argued/not formalized/open" subsection cannot score as delivered work.
    delivered = re.split(r'\*\*Argued|\*\*Open|\n### (?:Open|Unproved|Unverified)|\n- \*\*Open', triage, maxsplit=1, flags=re.I)[0]
    proof_text = route + '\n\n' + delivered
    commit = snapshot.get('graph', {}).get('source_snapshot', {}).get('source_commit') or record.get('source_commit', '')
    slug = problem.get('slug', record['id'])
    dossier = f'{REPO}/blob/{commit}/Problems/{slug}.md' if commit else record.get('source_url', '')
    source = problem_source_url(problem) if any(problem.get(k) for k in ('url', 'doi', 'arxiv_id')) else record.get('source_url', '')
    facts = {}

    def put(key, level, rationale, excerpt='', urls=None):
        facts[key] = {'level': level, 'rationale': rationale, 'evidence': [u for u in (urls or [dossier]) if u]}
        if excerpt:
            facts[key]['excerpt'] = excerpt[:1800]

    put('significance', 1, 'A released resolution of an explicitly recorded external question.', urls=[source, dossier])
    tier = re.search(r'\bTier\s*([123])\b', triage, re.I)
    if tier:
        put('significance', int(tier[1]), 'Uses the existing dossier tier: recent specific question, computational frontier, or core problem.', plain(triage.split('\n\n')[0]))
    relation = positive_excerpt(motivation, r'\b(?:equivalent to|necessary for|implies|foundation for|central to|reduces? .{1,100} to)\b')
    if relation:
        put('significance', max(2, facts['significance']['level']), 'The dossier explains a connection to a broader mathematical question.', relation)
    if consumers.get(record['id']):
        put('significance', min(4, facts['significance']['level'] + 1),
            'Another released result consumes this result as a proof dependency. Distinct consumers are counted once.')
        facts['significance']['consumers'] = sorted(consumers[record['id']])

    put('concepts', 0, 'No additional conceptual contribution identified by the automatic reading rules.')
    formulation = positive_excerpt(proof_text, r'\b(?:equivalence|representation|encoding|reformulation)\b')
    if formulation:
        put('concepts', 1, 'The argument includes a structural formulation; this alone does not establish a new concept.', formulation)
    characterization = positive_excerpt(proof_text, r'\b(?:characteri[sz](?:ation|es?|ing)|normal form)\b')
    if characterization:
        put('concepts', 2, 'The delivered argument gives a structural characterization or normal form.', characterization)
    new_concept = positive_excerpt(proof_text, r'\b(?:we introduce|introduc(?:es?|ing) (?:a|an) new|new (?:definition|notion|invariant|framework))\b')
    if new_concept:
        put('concepts', 3, 'The proof account explicitly describes a new concept. This is source evidence, not an independent novelty certification.', new_concept)

    # Existing proof_shape and utility descriptions distinguish a substantive
    # argument from evaluating a witness. Neither "definition" nor length wins points.
    content = bool(re.search(r'proof_shape\s*[:=]\s*[`\"\']?content\b|\|\s*`[^`]+`\s*\|\s*content\s*\|', triage, re.I))
    instance = bool(re.search(r'certified[- ]instance|numeric[- ]reduction|proof_shape\s*[:=]\s*[`\"\']?bind-only', triage, re.I))
    if re.search(r'(?:not|neither|no)\s+(?:a\s+)?(?:bounded enumeration|checker|numeric reduction|certified instance)', triage, re.I):
        instance = False
    put('methods', 2 if content else 1, 'Existing proof account records a substantive content argument.' if content else 'A verified proof or refutation is available; additional method evidence is scored only when documented.')
    mechanism = positive_excerpt(proof_text, r'\b(?:injection|injective|bijection|induction|spectral|energy estimate|isoperimetr|interpolat|duality|recurren(?:ce|t)|separat(?:ing|ion)|convex|rank bound|factorization|valuation|divisib|descent|generating function|determinant|isomorphism|monotonic|extremal)\w*\b')
    if mechanism:
        put('methods', 3 if content else 2, 'The proof route identifies a mathematical mechanism beyond the final certificate.', mechanism)

    put('advance', 2 if record['kind'] == 'proved' else 1,
        'The exact recorded statement is proved.' if record['kind'] == 'proved' else 'The exact recorded statement is refuted; a single witness does not by itself imply a broader advance.')
    universal = positive_excerpt(question, r'\b(?:for (?:every|all)|every (?:positive|integer|dimension)|arbitrary (?:depth|dimension|size)|all (?:positive|integer|dimensions))\b')
    family = positive_excerpt(proof_text, r'\b(?:infinite family|for (?:every|all)|uniform(?:ly)? in|arbitrary (?:depth|dimension)|all dimensions)\b')
    if record['kind'] == 'proved' and (universal or family):
        put('advance', 3, 'The proved statement applies to the stated general family, not just a checked finite range.', universal or family)
    elif record['kind'] == 'refuted' and family and not instance:
        put('advance', 2, 'The refutation is supported by a documented parameterized argument or family.', family)
    boundary = next((s for s in sentences(question + '\n\n' + triage)
                     if re.search(r'only .{0,60}(?:case|difference|recurrence)|does not (?:settle|resolve)|remains? (?:open|untouched)|out of scope|outside (?:that|this|the) result|no claim about', s, re.I)), '')
    if boundary:
        facts['advance']['level'] = min(2, facts['advance']['level'])
        facts['advance']['boundary'] = boundary[:1800]

    year, basis = documented_year(problem)
    put('history', sum(REFERENCE_YEAR - year >= boundary for boundary in (2, 5, 15, 40)) if year else 0,
        f'{basis}: {year}. Historical context is capped; this does not establish sustained unsuccessful research.' if year else 'No safely attributable question/source date found; no historical bonus.', urls=[source, dossier])
    facts['history']['source_year'] = year

    put('standing', 0, 'No verified proposer profile matched; no reputation or affiliation is guessed.')
    # Restrict matching to primary attribution. Names in the Route, Gap or
    # supporting literature cannot transfer their reputation to the proposer.
    attribution = plain(question.split('\n\n', 1)[0])
    for profile in profiles:
        if re.search(profile['attribution_pattern'], attribution, re.I):
            if profile['level'] > facts['standing']['level']:
                put('standing', profile['level'], profile['context'], attribution, [source, profile['url']])
                facts['standing']['person'] = profile['name']

    put('attention', 0, 'No documented prior mathematical attempt identified; searches and search failures earn no points.')
    prior = positive_excerpt(motivation, r'\b(?:source|paper|authors?|earlier work|previous work)\b.{0,130}\b(?:proves?|proved|settles?|settled|shows?|showed|partial|upper bound|lower bound|finite cases)\b')
    if prior:
        put('attention', 1, 'The motivation identifies an earlier mathematical result or partial case.', prior)
    repeated = positive_excerpt(motivation, r'\b(?:several|multiple|independent) (?:papers|authors|groups|attempts)|\b(?:remained|stayed) open (?:across|since)\b')
    if repeated:
        put('attention', 2, 'The dossier records attention extending beyond a single statement.', repeated)

    node = nodes.get(record.get('module', ''), {})
    contribution = str(node.get('human_abstract') or '').strip()
    if not contribution or PIPELINE.search(contribution):
        contribution = str(record.get('summary', '')).strip() or first_readable(route)
    return {'dimensions': facts, 'question_context': first_readable(motivation),
            'contribution': contribution, 'next_question': boundary,
            'basis': 'Existing source dossier, released proof explanation and recorded dependencies'}


def score(dimensions):
    points = {key: weight * dimensions[key]['level'] / 4 for key, (_, weight) in DIMENSIONS.items()}
    contribution = sum(points[key] for key in ('concepts', 'methods', 'advance'))
    importance = sum(points[key] for key in ('significance', 'standing', 'history', 'attention'))
    # Couple importance to the actual advance: an old, famous question is not
    # automatically a major contribution when only a small witness is delivered.
    return round(contribution + importance * (0.35 + 0.65 * contribution / 45), 2)


def ranking_key(item):
    return (-item['score'], -item['assessment']['dimensions']['concepts']['level'],
            -item['assessment']['dimensions']['methods']['level'], item['title'].casefold(), item['id'])


def build_index(snapshot, records, destination=None):
    profiles = json.loads((ROOT / 'site/assets/scholarly-context.json').read_text())['people']
    problems = {p['slug']: p for p in snapshot.get('problems', [])}
    nodes, consumers = context(snapshot, records)
    items = []
    for record in records:
        problem = problems.get(record.get('problem_slug') or record['id'], {})
        assessed = derive_assessment(problem, record, snapshot, nodes, consumers, profiles)
        title = record['title']
        if title == record['id'].replace('-', ' '):
            title = nodes.get(record.get('module', ''), {}).get('human_title') or title
            # Older human-title fields sometimes contain a module identifier.
            if re.fullmatch(r'[A-Za-z0-9_]+', title):
                title = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', title.replace('_', ' '))
        item = {'id': record['id'], 'title': title, 'assessment': assessed,
                'score': score(assessed['dimensions']), 'status': 'assessed'}
        item['input_digest'] = hashlib.sha256(json.dumps({
            'problem': {k: v for k, v in problem.items() if k != 'contribution_assessment'},
            'record': record, 'assessment': assessed}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        items.append(item)
    payload = {'schema_version': POLICY, 'owner': 'trureturing-pages', 'reference_year': REFERENCE_YEAR,
               'source_commit': snapshot.get('graph', {}).get('source_snapshot', {}).get('source_commit'),
               'dimensions': {k: {'label': label, 'weight': weight} for k, (label, weight) in DIMENSIONS.items()},
               'results': sorted(items, key=ranking_key)}
    if destination:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload
