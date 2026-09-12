"""No network, source checkout, or new truth authority is needed by this projector."""
import copy
import gzip
import json
import html
import importlib.util
import sys
import types
from unittest.mock import patch
from pathlib import Path
import subprocess
import tempfile
import unittest

from lib.knowledge_spaces import build_catalog, canonical, digest, render_spaces, rebuild_site, overview_html
from lib.literature import parse_citations


def fixture():
    refs = parse_citations('''*Formalization.* `D5/Observation/Root.theorem`

*Citation.* Example Author (2025). *Observation foundations*. DOI: [10.1234/example](https://doi.org/10.1234/example).

*Acknowledgement.* Another Author (2024). *A related method*. URL: <https://example.org/method>.
''')
    return {
        'schema_version':'pages-library-snapshot.v1', 'truth_release_digest':'sha256:'+'1'*64,
        'atlas_graph_digest':'sha256:'+'2'*64,
        'graph':{'source_snapshot':{'truth_release_digest':'sha256:'+'1'*64, 'source_commit':'a'*40},
          'nodes':[
            {'id':'root','kind':'truth','domain':'Observation','human_title':'Observer foundations',
             'human_abstract':'An authored explanation.', 'literature':refs},
            {'id':'b','kind':'truth','domain':'Observation','human_title':'Retained information'},
            {'id':'c','kind':'truth','domain':'Arithmetic','human_title':'Canonical representation'},
            {'id':'d','kind':'truth','domain':'Arithmetic','human_title':'A general conclusion'},
            {'id':'e','kind':'truth','domain':'Dynamics','human_title':'A dynamic observation'},
            {'id':'doc','kind':'blueprint','domain':'Observation','human_title':'An authored document'},
          ], 'edges':[{'source':a,'target':b,'layer':'truth-dependency'} for a,b in
                      [('root','b'),('root','c'),('b','d'),('c','d'),('b','e')]]},
        'problems':[{'slug':'own-question','title':'An independently proposed question',
                     'url':'https://example.org/questions/one','triage':'window',
                     'motivation_gids':['d','missing'], 'literature_status':'not-rechecked'}],
        'quarantined_problems':[],
    }


class KnowledgeSpacesTests(unittest.TestCase):
    def test_all_domains_without_problem_catalog(self):
        s=fixture();s['problems']=[]
        c=build_catalog(s)
        self.assertEqual({'Observation','Arithmetic','Dynamics'}, {x['key'] for x in c['spaces'] if x['kind']=='domain'})
        self.assertEqual(6,len(c['records']))

    def test_scribe_attribution_survives(self):
        c=build_catalog(fixture());r=next(r for r in c['records'] if r['id']=='root')
        self.assertEqual(2,len(r['references']))
        self.assertTrue(all(x['declaration_gid']=='D5/Observation/Root.theorem' for x in r['references']))
        self.assertNotIn('verified',r['references'][0])
        self.assertEqual({'citation','acknowledgement'},{r['role'] for r in r['references']})

    def test_new_domain_and_host_need_no_code(self):
        s=fixture();s['graph']['nodes'].append({'id':'new','kind':'truth','domain':'PreviouslyUnknownField'})
        s['problems'][0]['url']='https://new-source.example/q/1'
        c=build_catalog(s)
        self.assertTrue(any(x['key']=='PreviouslyUnknownField' for x in c['spaces']))
        self.assertTrue(any(x['key']=='new-source.example' for x in c['spaces']))

    def test_unknown_anchors_remain_unknown(self):
        t=build_catalog(fixture())['targets'][0]
        self.assertEqual(['missing'],t['missing_anchor_ids'])
        self.assertEqual('unresolved-in-release',t['result'])

    def test_open_module_is_not_a_scientific_conjecture(self):
        s=fixture();s['problems']=[];s['graph']['nodes'][0]['state']='open'
        self.assertEqual([],build_catalog(s)['targets'])

    def test_resolution_needs_existing_gate(self):
        s=fixture();s['problems'][0]['resolution']={'kind':'proved','declaration_gid':'D5/Observation/Root.theorem'}
        with self.assertRaisesRegex(ValueError,'gate'):build_catalog(s)

    def test_resolution_module_join(self):
        s=fixture();s['graph']['nodes'][0]['repo_path']='D5/Observation/Root.lean'
        s['problems'][0]['resolution']={'kind':'refuted','declaration_gid':'D5/Observation/Root.theorem',
          'source_path':'Blueprint/D5/Observation/Root.md','kernel_verified':{'frozen_node_id':'sha256:'+'3'*64}}
        t=build_catalog(s)['targets'][0]
        self.assertEqual('refuted',t['result']);self.assertIn('root',t['member_ids'])

    def test_deterministic_no_mutation(self):
        s=fixture();before=copy.deepcopy(s)
        self.assertEqual(canonical(build_catalog(s)),canonical(build_catalog(s)))
        self.assertEqual(before,s)

    def test_repeated_citation_deduplicated(self):
        s=fixture();s['graph']['nodes'][0]['literature']*=2
        c=build_catalog(s)
        self.assertEqual(2,len(next(r for r in c['records'] if r['id']=='root')['references']))

    def test_source_shared_by_problem_and_scribe(self):
        s=fixture();s['problems'][0].pop('url');s['problems'][0]['doi']='10.1234/example'
        spaces=build_catalog(s)['spaces']
        found=[x for x in spaces if x['kind']=='source' and x['key']=='doi:10.1234/example']
        self.assertEqual(1,len(found));self.assertEqual(['d','root'],found[0]['member_ids'])
        self.assertEqual('Observation foundations',found[0]['title'])

    def test_empty_graph_not_fabricated(self):
        s=fixture();s['graph']['nodes']=[];s['graph']['edges']=[];s['problems']=[]
        self.assertEqual([],build_catalog(s)['spaces'])

    def test_wrong_schema_release_and_commit(self):
        for key,val in [('schema_version','other'),('truth_release_digest','bad'),('atlas_graph_digest','bad')]:
            with self.subTest(key=key):
                s=fixture();s[key]=val
                with self.assertRaises(ValueError):build_catalog(s)
        s=fixture();s['graph']['source_snapshot']['source_commit']='dev'
        with self.assertRaises(ValueError):build_catalog(s)
        s=fixture();s['graph']['source_snapshot']['truth_release_digest']='sha256:'+'3'*64
        with self.assertRaises(ValueError):build_catalog(s)

    def test_duplicate_nodes_and_slugs(self):
        s=fixture();s['graph']['nodes'].append(s['graph']['nodes'][0])
        with self.assertRaises(ValueError):build_catalog(s)
        s=fixture();s['problems']*=2
        with self.assertRaises(ValueError):build_catalog(s)

    def test_unsafe_sources_and_slug(self):
        for url in ['javascript:alert(1)','https://u:p@example.org/a','https://example.org:99999/a','https://example.org/ x']:
            with self.subTest(url=url):
                s=fixture();s['problems'][0]['url']=url
                with self.assertRaises(ValueError):build_catalog(s)
        s=fixture();s['problems'][0]['slug']='../outside'
        with self.assertRaises(ValueError):build_catalog(s)

    def test_summary_escapes_source_labels(self):
        s=fixture();s['graph']['nodes'][0]['domain']='<script>alert(1)</script>'
        out=overview_html(build_catalog(s))
        self.assertNotIn('<script>',out);self.assertIn('&lt;script&gt;',out)

    def test_emission_immutable_payload_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);render_spaces(p,fixture());m=json.loads((p/'data/knowledge-spaces.v1.json').read_bytes())
            raw=(p/m['catalog_path']).read_bytes();self.assertEqual(m['catalog_sha256'],digest(raw))
            before={str(f):f.read_bytes() for f in p.rglob('*.json')}
            render_spaces(p,fixture());self.assertEqual(before,{str(f):f.read_bytes() for f in p.rglob('*.json')})

    def _archive(self,p):
        s=fixture();raw=gzip.compress(canonical(s),mtime=0);key=digest(raw)
        path='data/library/'+key[7:]+'.json.gz';(p/path).parent.mkdir(parents=True);(p/path).write_bytes(raw)
        entry={'digest':key,'path':path,'source_commit':'a'*40,'truth_release_digest':s['truth_release_digest'],'atlas_graph_digest':s['atlas_graph_digest']}
        h={'schema_version':'pages-library-history.v1','current_truth_release_digest':s['truth_release_digest'],'entries':[entry]}
        (p/'data/library-history.v1.json').write_bytes(canonical(h))
        (p/'data/pages-atlas-manifest.v1.json').write_bytes(canonical({**entry,'schema_version':'pages-atlas-manifest.v1'}))
        return s,entry

    def test_renderer_replay_does_not_append_truth_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);self._archive(p);before=(p/'data/library-history.v1.json').read_bytes()
            rebuild_site(p);self.assertEqual(before,(p/'data/library-history.v1.json').read_bytes())
            self.assertTrue((p/'data/knowledge-spaces.v1.json').exists())

    def test_replay_rejects_corrupt_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);_,e=self._archive(p);(p/e['path']).write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError,'verification'):rebuild_site(p)

    def test_replay_rejects_mixed_atlas(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);_,e=self._archive(p);e['atlas_graph_digest']='sha256:'+'4'*64
            (p/'data/pages-atlas-manifest.v1.json').write_bytes(canonical(e))
            with self.assertRaises(ValueError):rebuild_site(p)

    def _news_module(self, root):
        # Exercise the actual news integration with unrelated theme/result-file emitters doubled.
        knowledge = types.ModuleType('lib.knowledge_pages')
        knowledge.esc = lambda value: html.escape(str(value), quote=True)
        knowledge.write = lambda path, value: path.write_text(value)
        results = types.ModuleType('lib.research_results')
        results.STORIES = root/'stories.json';results.STORIES.write_text('{}')
        results.render_result_pages = lambda *args: None
        spec = importlib.util.spec_from_file_location('isolated_news', Path(__file__).resolve().parents[1]/'lib/research_news.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'lib.knowledge_pages':knowledge, 'lib.research_results':results}):
            spec.loader.exec_module(module)
        module.CATALOG = root/'news.json'
        entries = [dict(id=f'result-{i}', title=f'Result {i}', field='A field', kind='proved',
                        module=f'D5/Example{i}', declaration='result', source_commit='a'*40,
                        source_url='https://example.org/q', summary='An exact result', scope='Exact scope') for i in range(9)]
        module.CATALOG.write_text(json.dumps({'results':entries,'publications':[]}))
        return module

    def test_news_build_emits_spaces_and_preserves_all_result_anchors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);module=self._news_module(root);s=fixture()
            s['problems'][0]['sections']={'Gap':'A missing bridge'}
            module.render_news(root,s,lambda title,relative,body,**kwargs:body)
            body=(root/'research.html').read_text()
            self.assertTrue((root/'data/knowledge-spaces.v1.json').exists())
            self.assertIn('id="knowledge-spaces"',body)
            self.assertIn('id="result-archive"',body)
            self.assertIn('id="resolved-questions-archive"',body)
            self.assertEqual(9,body.count('class="news-result"'))
            for i in range(9):
                self.assertIn(f'id="result-{i}"',body)
                self.assertIn(f'id="resolved-result-{i}"',body)
            self.assertNotIn('What we are working on now',body)

    def test_legacy_news_renderer_does_not_create_verified_spaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);module=self._news_module(root);s=fixture();s.pop('schema_version');s['problems']=[]
            module.render_news(root,s,lambda title,relative,body,**kwargs:body)
            self.assertFalse((root/'data/knowledge-spaces.v1.json').exists())
            self.assertTrue((root/'research.html').exists())

    def test_unknown_contract_fails_news_projection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);module=self._news_module(root);s=fixture();s['schema_version']='unknown'
            with self.assertRaises(ValueError):module.render_news(root,s,lambda *a,**k:'')

    def test_javascript_suite(self):
        subprocess.run(['node','--test','tests/js/knowledge-spaces.test.mjs'],check=True,
                       cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)


if __name__=='__main__': unittest.main()
