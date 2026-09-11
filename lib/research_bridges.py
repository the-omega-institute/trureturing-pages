"""Evidence paths joining public literature, reviewed statements and next questions."""
import hashlib
import re
from urllib.parse import quote

from lib.literature import literature_identity, problem_source_url

RELATIONS = {
    'cites': 'Source-authored attribution to prior literature; not an extracted proof dependency.',
    'acknowledges': 'Source-authored acknowledgement; no theorem-use or novelty claim.',
    'question_source': 'The publication supplies the question or its research context.',
    'addresses': 'Reviewed result addresses exactly the stated public question and scope.',
    'formalized_in': 'Pinned result belongs to this module; current release certification is not inferred.',
    'representation': 'A named equality or characterization in the reviewed pinned Lean source.',
    'proposed_transfer': 'Candidate use on a further question; no successful transfer or benefit claimed.',
    'explains': 'A worked explanation is available; independent human understanding has not been assessed.',
}
REPRESENTATIONS = {
    'thue-morse-reduced-abelian-odd': ('Run compression ↔ character counts', 'reducedParikh_eq_parikh_runCompress', 'For every factor length and start, the class encoding equals character counts after literal run compression. This preserves the reduced abelian class, not the original word.'),
    'chamberland-dilcher-conjecture-2-1': ('Natural square roots ↔ real floor differences', 'd_eq_floor_real_sqrt', 'For natural n and l ≥ 1, the natural-square-root difference agrees with the integer difference of real floor square roots. The domain condition is part of the bridge.'),
    'bosma-conjecture-17': ('Greedy construction ↔ periodic membership', 's_eq_A', 'For d ≥ 2 and g ≥ d+1, the literal greedy sequence and the explicit periodic set have identical membership. The d=1 OEIS seeds remain outside this theorem.'),
}


def extend_index(snapshot, records, edges, news, catalog, stories, assets, base):
    by_id = {r['id']: r for r in records}
    literature, paths = {}, []

    def add(id, kind, title, summary, **fields):
        item = dict(id=id, kind=kind, title=title, summary=summary,
                    url=base + 'discover.html?record=' + quote(id, safe=''),
                    api_url=base + 'api/v1/records/' + hashlib.sha256(id.encode()).hexdigest() + '.json',
                    aliases=[], **fields)
        records.append(item); by_id[id] = item
        return item

    def edge(source, target, kind, scope, url, **evidence):
        item = dict(source=source, target=target, kind=kind, scope=scope, evidence_url=url, **evidence)
        if item not in edges:
            edges.append(item)

    def paper(url, title=None, authors=None, year=None, *, url_source=False):
        identity, ids, canonical = literature_identity(url, url_source=url_source)
        id = 'literature:' + identity
        if id not in literature:
            literature[id] = add(id, 'literature', title or next(iter(ids.values())),
                'External research source. Attribution is retained; a citation does not establish proof coverage or novelty.',
                status='external-literature', identifiers=ids, evidence={'source_url': canonical})
        item = literature[id]
        item['identifiers'].update(ids)
        if title:
            item['title'] = title
        if authors:
            item['authors'] = authors
        if year:
            item['year'] = year
        item['aliases'] = sorted(set(item['aliases'] + list(ids.values()) + ([authors] if authors else [])))
        return id

    snap = snapshot['graph'].get('source_snapshot', {})
    commit = snap.get('source_commit', '')
    for node in snapshot['graph']['nodes']:
        mid = 'module:' + node['id']
        for citation in node.get('literature', []):
            pid = paper(citation['source_url'], citation['title'], citation['authors'], citation['year'])
            kind = 'cites' if citation['role'] == 'citation' else 'acknowledges'
            source_path = node.get('blueprint_path') or 'Blueprint/' + node.get('repo_path', '').removesuffix('.lean') + '.md'
            source_url = 'https://github.com/the-omega-institute/trureturing/blob/' + commit + '/' + source_path
            edge(mid, pid, kind, RELATIONS[kind], source_url,
                 evidence={'source_commit': commit, 'declaration_gid': citation.get('declaration_gid'),
                           'citation_url': citation['source_url'], 'truth_release_digest': snapshot['truth_release_digest']})
    for item in news['publications']:
        pid = paper('https://doi.org/' + item['doi'] if item.get('doi') else item['url'], item['title'], item.get('authors'))
        edge('publication:' + item['id'], pid, 'cites', 'Publication record linked to its bibliographic identity.', item['url'])
    for family in catalog['families']:
        pid = paper('https://doi.org/' + family['doi'])
        edge('question:' + family['id'], pid, 'question_source', family['gap'], 'https://doi.org/' + family['doi'])
    for problem in snapshot['problems']:
        url = problem_source_url(problem)
        pid = paper(url, url_source='url' in problem)
        did = 'dossier:' + problem['slug']
        edge(did, pid, 'question_source', 'Release-bound dossier source; current open/solved literature status is not inferred.', url)
        # OEIS mentions are identifiers, not resolution claims. Preserve the exact source section.
        for section, text in problem['sections'].items():
            for oeis in sorted(set(re.findall(r'\bA\d{6}\b', text))):
                oid = 'oeis:' + oeis
                if oid not in by_id:
                    add(oid, 'sequence', oeis, 'OEIS sequence mentioned in a release-bound research dossier.',
                        status='external-sequence', identifiers={'oeis': oeis}, evidence={'source_url': 'https://oeis.org/' + oeis})
                    by_id[oid]['url'] = base + 'oeis/' + oeis + '/'
                edge(oid, did, 'paper_context', f'Sequence mentioned in the dossier’s {section} section. This does not certify a resolution of any OEIS conjecture.',
                     base + 'research/' + problem['slug'] + '/#' + section.lower())
    modules = {n.get('repo_path', '').removesuffix('.lean'): 'module:' + n['id'] for n in snapshot['graph']['nodes']}
    for result in news['results']:
        rid, story = 'result:' + result['id'], stories[result['id']]
        cid = 'claim:' + result['id']
        add(cid, 'claim', story['source_label'], story['question'], status='public-question-addressed',
            scope=result['scope'], evidence={'source_url': result['source_url']})
        pid = paper(result['source_url'])
        edge(cid, pid, 'question_source', story['source_label'], result['source_url'])
        edge(cid, rid, 'addresses', result['scope'], by_id[rid]['url'])
        if result['module'] in modules:
            edge(rid, modules[result['module']], 'formalized_in', RELATIONS['formalized_in'], by_id[rid]['evidence']['lean_url'])
        proof = assets / 'proofs' / (result['id'] + '.lean')
        if hashlib.sha256(proof.read_bytes()).hexdigest() != story['source_sha256']:
            raise ValueError('Research path pinned proof digest mismatch: ' + result['id'])
        stages = [dict(kind='public_problem', status='source-located', records=[cid, pid]),
                  dict(kind='general_theorem', status='reviewed-pinned-result', records=[rid])]
        rep = REPRESENTATIONS.get(result['id'])
        if rep:
            title, declaration, scope = rep
            if not re.search(r'\btheorem\s+' + re.escape(declaration) + r'\b', proof.read_text()):
                raise ValueError('Missing representation declaration: ' + declaration)
            bid = 'representation:' + result['id']
            evidence = {**by_id[rid]['evidence'], 'assessment': 'reviewed-pinned-statement', 'declaration': result['module'] + '.' + declaration}
            add(bid, 'representation', title, scope, status='reviewed-pinned-statement', evidence=evidence)
            edge(rid, bid, 'representation', scope, by_id[rid]['evidence']['lean_url'])
            stages.append(dict(kind='representation', status='reviewed-pinned-statement', records=[bid]))
        else:
            bid = rid
            stages.append(dict(kind='representation', status='not-documented', records=[]))
        targets = ['question:' + f['id'] for f in catalog['families'] if f.get('builds_on') == result['id']]
        for target in targets:
            edge(bid, target, 'proposed_transfer', 'A next question from this result. Transfer success and improvement over a baseline have not been measured.', by_id[target]['url'])
        stages.append(dict(kind='new_problem', status='proposed' if targets else 'not-documented', records=targets,
                           transfer_benefit='not-measured'))
        eid = 'explanation:' + result['id']
        add(eid, 'explanation', story['example']['title'], story['example']['text'], status='worked-example',
            evidence={'source_url': by_id[rid]['url']})
        by_id[eid]['url'] = by_id[rid]['url']
        edge(rid, eid, 'explains', 'A worked example and proof walkthrough. Independent reader assessment is still needed.', by_id[rid]['url'])
        stages.append(dict(kind='human_understanding', status='explanation-available', records=[eid], independent_assessment='not-assessed'))
        paths.append(dict(id=result['id'], title=result['title'], result=rid, stages=stages,
                          benefit_claim='not-established', source_sha256=story['source_sha256']))
    return paths
