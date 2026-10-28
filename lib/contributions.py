"""Pages-owned reading order derived from the existing released dossiers.

No new trureturing fields, service credentials, model calls or upstream writes.
Signals are capped, cited and scoped to the delivered result. They are editorial
ranking estimates, not a proof of novelty or an objective measure of importance.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit

from lib.literature import problem_source_url

ROOT = Path(__file__).resolve().parents[1]
POLICY = 'contribution-ranking.v3'
POLICY_PATH = ROOT / 'config/contribution-policy.v3.json'


def validate_policy(value):
    dimensions = {'significance', 'concepts', 'methods', 'advance', 'standing', 'history', 'attention'}
    if (set(value) != {'schema_version', 'reference_year', 'weights', 'research_news'}
            or value['schema_version'] != 'contribution-policy.v3'
            or type(value['reference_year']) is not int or not 1900 <= value['reference_year'] <= 2100
            or set(value['weights']) != dimensions):
        raise ValueError('Invalid contribution policy')
    def number(x, low, high):
        return type(x) in (int, float) and math.isfinite(x) and low <= x <= high
    weights = value['weights']
    if any(not number(x, 0, 100) for x in weights.values()) or sum(weights.values()) != 100:
        raise ValueError('Contribution weights must sum to 100')
    maximum = sum(weights[k] for k in ('concepts', 'methods', 'advance'))
    news = value['research_news']
    if (maximum <= 0 or set(news) != {'minimum_score', 'minimum_significance', 'minimum_contribution_points', 'featured_count'}
            or not number(news['minimum_score'], 0, 100)
            or not number(news['minimum_significance'], 0, 4)
            or not number(news['minimum_contribution_points'], 0, maximum)
            or type(news['featured_count']) is not int or not 1 <= news['featured_count'] <= 12):
        raise ValueError('Invalid Research News selection policy')
    return value


SETTINGS = validate_policy(json.loads(POLICY_PATH.read_text()))
REFERENCE_YEAR = SETTINGS['reference_year']  # Fixed; rebuilds never silently age results.
DIMENSIONS = {
    'significance': ('Problem significance', 30),
    'concepts': ('Conceptual contribution', 20),
    'methods': ('Proof methods', 15),
    'advance': ('Mathematical advance', 15),
    'standing': ('Scholarly context', 5),
    'history': ('Historical context', 10),
    'attention': ('Prior research', 5),
}
DIMENSIONS = {key: (label, SETTINGS['weights'][key]) for key, (label, _) in DIMENSIONS.items()}
if sum(weight for _, weight in DIMENSIONS.values()) != 100:
    raise ValueError('Contribution weights must sum to 100')
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
    header = question.split('\n\n', 1)[0]
    years = set(re.findall(r'\(((?:18|19|20)\d{2})\)', header))
    if len(years) == 1 and re.search(r'\b(?:printed page|journal|paper|section)\b', header, re.I):
        year = int(next(iter(years)))
        if year <= REFERENCE_YEAR:
            return year, 'Year in the primary source attribution'
    for key in ('url', 'doi', 'arxiv_id'):
        value = problem.get(key)
        value = str(value or '')
        if key == 'arxiv_id' and not value.lower().startswith(('http', 'arxiv:')):
            value = 'arxiv:' + value
        # Only explicit arXiv identities, never a lookalike host or URL path.
        match = re.fullmatch(r'(?:https?://(?:www\.)?arxiv\.org/(?:abs|html|pdf)/|(?:https?://doi\.org/)?10\.48550/arxiv\.|arxiv:)(?:(?:[a-z-]+/)?)(\d{2})(\d{2})(?:\.\d{4,5}|\d{3})(?:v\d+|\.pdf)?', value, re.I)
        if match:
            yy, month = int(match[1]), int(match[2])
            year = (1900 if yy >= 91 else 2000) + yy
            if 1 <= month <= 12 and year <= REFERENCE_YEAR:
                return year, 'First preprint year'
    # The bibliographic key is existing upstream metadata, not a search timestamp.
    match = re.search(r'((?:18|19|20)\d{2})', str(problem.get('bibkey', '')))
    if match and int(match[1]) <= REFERENCE_YEAR:
        return int(match[1]), 'Year recorded in the source bibliography'
    header = question.split('\n\n', 1)[0]
    match = re.search(r'\b((?:18|19|20)\d{2})\b(?=.{0,35}\b(?:paper|conjecture|question|reminiscence|note))', header, re.I)
    return (int(match[1]), 'Year in the source attribution') if match and int(match[1]) <= REFERENCE_YEAR else (None, None)


def delivered_prose(text):
    """Only the delivered portions of a dossier may earn contribution credit.

    A proposed extension, prose-only equality classification or supporting
    literature result must not be promoted to a released contribution.
    """
    output, excluded = [], False
    for block in re.split(r'\n\s*\n|\n(?=\s*(?:[-*]\s+|\d+\.\s))', str(text or '')):
        heading = re.sub(r'^[\s#*\d.\-]+', '', block).split('\n', 1)[0]
        if re.search(r'^(?:Argued|Reasoning|Open|Unproved|Unverified|Computed|Paper proof|Proved in prose|Literature ingredient)\b|\b(?:proved in prose|in the cited source|literature ingredient|not a Lean statement|not formalized)\b', heading, re.I):
            excluded = True
        elif re.search(r'^(?:Proved\b|Kernel.checked|Mechanism.{0,20}proved)', heading, re.I):
            excluded = False
        if excluded:
            continue
        # Markdown table rows carry their own status.
        lines = [re.split(r'\*\*Open\b', line, maxsplit=1, flags=re.I)[0] for line in block.splitlines() if not re.search(
            r'\b(?:not formalized|proved in prose|refuted in prose|reasoning only|literature ingredient|in the cited source|unverified|computed by|no uniform Lean|private native evidence)\b', line, re.I)]
        output.append('\n'.join(lines))
    return '\n\n'.join(output)


def safe_excerpt(text, pattern):
    """Recognize assertions; absence of an assumption is not a negated result."""
    for sentence in sentences(text):
        if len(sentence) > 1800 or not re.search(pattern, sentence, re.I):
            continue
        if re.search(r'\b(?:would|could|might|try|seek|planned|proposed route|remains? open|not formalized|out of scope)\b', sentence, re.I):
            continue
        if re.search(r'https?://|\b(?:computed|experiment|python|SymPy|script|unproved)\b', sentence, re.I):
            continue
        if re.search(r'\b(?:no|not|without) (?:a |an )?(?:new |structural )?(?:definition|notion|invariant|framework|characterization|bijection|proof|method)\b', sentence, re.I):
            continue
        return sentence
    return None


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
    delivered = delivered_prose(triage)
    proof_text = delivered_prose(route) + '\n\n' + delivered
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
    named = next((s for s in sentences(question) if len(s) <= 1800 and re.search(
        r'\b(?:conjecture\s+\d|(?:open )?(?:problem|question)\s+\d|open (?:question|problem)|we (?:now )?ask)\b', s, re.I)), None)
    if named:
        put('significance', 2, 'An explicitly identified research question in the original source.', named, [source, dossier])
    tier = re.search(r'\bTier[ -]*([123])\b', triage + '\n' + motivation + '\n' + question, re.I)
    if tier:
        put('significance', max(facts['significance']['level'], min(2, int(tier[1]))), 'The dossier identifies an established research line; its workflow tier alone cannot establish foundational importance.', plain(triage.split('\n\n')[0]))
    relation = safe_excerpt(motivation, r'\b(?:necessary for|foundation for|central to|applies? .{0,100} to|determines? .{0,100} (?:limit|bound)|reduces? .{1,100} to)\b')
    if relation:
        put('significance', max(2, facts['significance']['level']), 'The dossier explains a connection to a broader mathematical question.', relation)
    if consumers.get(record['id']):
        put('significance', min(3, facts['significance']['level'] + 1),
            'A distinct released result depends on this result’s module in the recorded proof graph. This supports reuse, not field-wide foundational status.')
        facts['significance']['consumers'] = sorted(consumers[record['id']])

    put('concepts', 0, 'No additional conceptual contribution identified by the automatic reading rules.')
    formulation = positive_excerpt(proof_text, r'\b(?:equivalence|representation|encoding|reformulation)\b')
    if formulation:
        put('concepts', 1, 'The argument includes a structural formulation; this alone does not establish a new concept.', formulation)
    characterization = positive_excerpt(proof_text, r'\b(?:characteri[sz](?:ation|es?|ing)|normal form|reconstruct\w*)\b')
    if characterization and re.search(r'\b(?:computed|experiment|python|SymPy|script)\b|https?://', characterization, re.I):
        characterization = None
    if characterization:
        put('concepts', 2, 'The delivered argument gives a structural characterization or normal form.', characterization)
    new_concept = safe_excerpt(proof_text, r'\b(?:we introduce|introduc(?:es?|ing) (?:a|an) new|new (?:definition|notion|invariant|framework))\b')
    if new_concept:
        put('concepts', 3, 'The proof account explicitly describes a new concept. This is source evidence, not an independent novelty certification.', new_concept)

    # Existing proof_shape and utility descriptions distinguish a substantive
    # argument from evaluating a witness. Neither "definition" nor length wins points.
    content = bool(re.search(r'proof_shape\s*[:=]\s*[`\"\']?content\b|\|\s*`[^`]+`\s*\|\s*content\s*\|', triage, re.I))
    instance = bool(re.search(r'certified[- ]instance|numeric[- ]reduction|proof_shape\s*[:=]\s*[`\"\']?bind-only', triage, re.I))
    if re.search(r'(?:not|neither|no)\s+(?:a\s+)?(?:bounded enumeration|checker|numeric reduction|certified instance)', triage, re.I):
        instance = False
    put('methods', 2 if content else 1, 'Existing proof account records a substantive content argument.' if content else 'A verified proof or refutation is available; additional method evidence is scored only when documented.')
    mechanisms = []
    for pattern in (r'\b(?:injection|injective|bijection|isomorphism)\b',
                    r'\b(?:induction|recurren\w*|descent)\b',
                    r'\b(?:spectral|eigen\w*|resolvent|determinant|rank bound)\b',
                    r'\b(?:convex\w*|duality|separat\w*|interpolat\w*|pinching|majorant)\b',
                    r'\b(?:factorization|valuation|divisib\w*|generating function)\b',
                    r'\b(?:energy estimate|isoperimetr\w*|sum.of.squares|curvature)\b'):
        mechanism = safe_excerpt(proof_text, pattern)
        if mechanism and mechanism not in mechanisms:
            mechanisms.append(mechanism)
    if mechanisms:
        put('methods', 3 if content or len(mechanisms) >= 2 else 2,
            'The delivered argument combines documented mathematical mechanisms.' if len(mechanisms) >= 2 else 'The delivered argument documents a mathematical mechanism.',
            mechanisms[0])
        facts['methods']['supporting_excerpts'] = mechanisms

    put('advance', 2 if record['kind'] == 'proved' else 1,
        'The exact recorded statement is proved.' if record['kind'] == 'proved' else 'The exact recorded statement is refuted; a single witness does not by itself imply a broader advance.')
    universal = positive_excerpt(question, r'\b(?:for (?:every|all)|every (?:positive|integer|dimension)|arbitrary (?:depth|dimension|size)|all (?:positive|integer|dimensions))\b')
    family = safe_excerpt(proof_text, r'\b(?:infinite family|for (?:every|all)|uniform(?:ly)? in|arbitrary (?:depth|dimension)|all dimensions)\b')
    if record['kind'] == 'proved' and (universal or family):
        put('advance', 3, 'The proved statement applies to the stated general family, not just a checked finite range.', universal or family)
    elif record['kind'] == 'refuted' and family and not instance:
        put('advance', 2, 'The refutation is supported by a documented parameterized argument or family.', family)
    obstruction = safe_excerpt(question + '\n' + motivation + '\n' + proof_text,
                               r'\b(?:no (?:single |finite |such )?(?:polynomial|characterization|criterion)|impossibility|no.go|cannot (?:be |exist|characterize)|rules? out (?:every|any|all))\b')
    if record['kind'] == 'refuted' and obstruction and not instance:
        put('advance', 3, 'The argument establishes an obstruction to a proposed characterization or class of methods.', obstruction)
    conclusion = nodes.get(record.get('module', ''), {}).get('human_abstract') or record.get('summary', '')
    sharp = safe_excerpt(conclusion, r'\b(?:sharp (?:upper |lower )?bound|global (?:minimum|maximum|optimum)|exact optimum)\b')
    if record['kind'] == 'proved' and sharp and re.search(r'\battain\w*\b', str(conclusion), re.I):
        put('advance', 4, 'The released conclusion establishes an optimal bound and an attaining case, giving an exact extremal answer.', sharp)
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
    prior = safe_excerpt(motivation, r'\b(?:source|paper|authors?|earlier work|previous work|later work)\b.{0,130}\b(?:proves?|proved|settles?|settled|shows?|showed|obtained|uses|partial|upper bound|lower bound|finite cases)\b')
    if prior:
        put('attention', 1, 'The motivation identifies an earlier mathematical result or partial case.', prior)
    repeated = positive_excerpt(motivation, r'\b(?:several|multiple|independent) (?:papers|authors|groups|attempts)|\b(?:remained|stayed) open (?:across|since)\b')
    if repeated:
        put('attention', 2, 'The dossier records attention extending beyond a single statement.', repeated)

    # Missing evidence remains explicit. Reputation is a small optional bonus,
    # never a renormalized denominator or a fabricated estimate for other people.
    for key, fact in facts.items():
        fact['evidence_status'] = 'documented' if fact['level'] else 'not_documented'

    node = nodes.get(record.get('module', ''), {})
    contribution = str(node.get('human_abstract') or '').strip()
    if not contribution or PIPELINE.search(contribution):
        contribution = str(record.get('summary', '')).strip() or first_readable(route)
    return {'dimensions': facts, 'question_context': first_readable(motivation),
            'contribution': contribution, 'next_question': boundary,
            'scope': 'partial' if boundary else 'recorded_statement',
            'basis': 'Existing source dossier, released proof explanation and recorded dependencies'}


def score(dimensions):
    points = {key: weight * dimensions[key]['level'] / 4 for key, (_, weight) in DIMENSIONS.items()}
    contribution = sum(points[key] for key in ('concepts', 'methods', 'advance'))
    importance = sum(points[key] for key in ('significance', 'standing', 'history', 'attention'))
    # Couple importance to the actual advance: an old, famous question is not
    # automatically a major contribution when only a small witness is delivered.
    maximum = sum(DIMENSIONS[key][1] for key in ('concepts', 'methods', 'advance'))
    return round(contribution + importance * (0.4 + 0.6 * contribution / maximum), 2)


def ranking_key(item):
    return (-item['score'], -item['assessment']['dimensions']['concepts']['level'],
            -item['assessment']['dimensions']['methods']['level'], item['id'])


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
        item['contribution_points'] = round(sum(DIMENSIONS[k][1] * assessed['dimensions'][k]['level'] / 4
                                               for k in ('concepts', 'methods', 'advance')), 2)
        item['input_digest'] = hashlib.sha256(json.dumps({
            'problem': {k: v for k, v in problem.items() if k != 'contribution_assessment'},
            'record': record, 'assessment': assessed}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        items.append(item)
    payload = {'schema_version': POLICY, 'owner': 'trureturing-pages', 'reference_year': REFERENCE_YEAR,
               'source_commit': snapshot.get('graph', {}).get('source_snapshot', {}).get('source_commit'),
               'dimensions': {k: {'label': label, 'weight': weight} for k, (label, weight) in DIMENSIONS.items()},
               'research_news_policy': SETTINGS['research_news'],
               'results': sorted(items, key=ranking_key)}
    for item in payload['results']:
        policy = SETTINGS['research_news']
        reasons = []
        if item['score'] < policy['minimum_score']:
            reasons.append('below_score_threshold')
        if item['assessment']['dimensions']['significance']['level'] < policy['minimum_significance']:
            reasons.append('insufficient_problem_context')
        if item['contribution_points'] < policy['minimum_contribution_points']:
            reasons.append('insufficient_contribution')
        item['research_news'] = {'eligible': not reasons, 'reasons': reasons}
    if destination:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload
