import copy
from http.client import IncompleteRead
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from lib.research_translations import (
    FIELDS, MODEL, POLICY, REVIEW_CONTEXT, SOURCE_SCHEMA, ModelClient, admitted_cache, build_source,
    canonical, digest, empty_cache, protect,
    restore, segments, source_item, translate_batch, translate_source, translate_with_recovery,
    validate_cache, validate_source, fetch_cache,
)


def example():
    story = {key: '' for key in FIELDS}
    story.update(headline='A uniform bound', finding=r'For every $n>5040$, the bound $H(n)<\tau(n)$ holds.',
                 boundary='The assertion for unitary maps remains open.', binding='b'*64)
    item = source_item({'id':'a-bound','kind':'proved'}, story, 'A uniform bound')
    return {'schema_version':SOURCE_SCHEMA,'policy':POLICY,'source_commit':'a'*40,
            'truth_release_digest':'sha256:'+'a'*64,'source_set_digest':digest([item]),'results':[item]}


class Client:
    def __init__(self, reject=False):self.calls=[];self.reject=reject
    def complete(self,messages,review=False):
        self.calls.append(review)
        if review:
            return ({'passed':not self.reject,'issues':[] if not self.reject else [{'field':'finding','reason':'Quantifier changed'}]},
                    {'model':'test-reviewer','response_digest':'sha256:'+'d'*64})
        source=json.loads(messages[-1]['content'])['strings']
        translated={key: text.replace('For every','对每个').replace('the bound','这个界').replace('holds.','成立。')
                    .replace('The assertion for unitary maps remains open.','关于酉映射的断言仍未解决。')
                    .replace('A uniform bound','一个一致的界') for key,text in source.items()}
        return {'translations':translated},{'model':'test-translator','response_digest':'sha256:'+'c'*64}


class ResearchTranslationTests(unittest.TestCase):
    def test_generation_and_review_receive_complete_unmasked_definitions(self):
        source=example()
        item=source['results'][0]
        item['fields']['question']='Here `H(n) = sum 1/(d_j-d_i)` defines the reciprocal of each divisor difference.'
        item['source_digest']=digest({'policy':POLICY,**{k:item[k] for k in ['id','kind','source_binding','fields']}})
        source['source_set_digest']=digest(source['results'])
        self_test=self
        class InspectContext(Client):
            def complete(self,messages,review=False):
                request=json.loads(messages[-1]['content'])
                row=request['results'][0]
                if review:
                    self_test.assertEqual(row['english'],item['fields'])
                    self_test.assertIn('1/(d_j-d_i)',row['english']['question'])
                    self_test.assertIn('$n>5040$',row['chinese']['finding'])
                    self_test.assertNotIn('__LITERAL_',json.dumps(row))
                else:
                    self_test.assertEqual(row['original'],item['fields'])
                    self_test.assertIn('__LITERAL_',request['strings'][row['fields']['finding']])
                return super().complete(messages,review)
        # This client only translates the surrounding English needed by this fixture.
        class TranslateQuestion(InspectContext):
            def complete(self,messages,review=False):
                response,receipt=super().complete(messages,review)
                if not review:
                    response['translations']={k:v.replace('Here ','这里 ').replace(
                        ' defines the reciprocal of each divisor difference.',' 定义每个约数之差的倒数。')
                        for k,v in response['translations'].items()}
                return response,receipt
        accepted=translate_batch(source['results'],TranslateQuestion(),source)
        self.assertEqual(accepted[item['source_digest']]['review']['source_context'],REVIEW_CONTEXT)

    def test_legacy_candidates_are_rereviewed_without_regeneration(self):
        source=example()
        legacy={**empty_cache(),'entries':translate_batch(source['results'],Client(),source)}
        for entry in legacy['entries'].values():entry['review'].pop('source_context')
        self.assertEqual(admitted_cache(legacy)['entries'],{})
        client=Client()
        current,stats=translate_source(source,legacy,client)
        self.assertEqual(client.calls,[True])
        self.assertEqual(stats['pending'],0)
        self.assertEqual(len(admitted_cache(current)['entries']),1)
        self.assertEqual(next(iter(current['entries'].values()))['fields'],next(iter(legacy['entries'].values()))['fields'])
        client=Client()
        same,stats=translate_source(source,current,client)
        self.assertEqual(same,current)
        self.assertFalse(stats['changed'])
        self.assertEqual(client.calls,[])

    def test_rejected_legacy_candidate_is_corrected_and_independently_reviewed(self):
        source=example()
        legacy={**empty_cache(),'entries':translate_batch(source['results'],Client(),source)}
        for entry in legacy['entries'].values():entry['review'].pop('source_context')
        class InitiallyRejected(Client):
            def complete(self,messages,review=False):
                self.reject=review and self.calls.count(True)==0
                return super().complete(messages,review)
        client=InitiallyRejected()
        current,stats=translate_source(source,legacy,client)
        self.assertEqual(client.calls,[True,False,True])
        self.assertEqual(stats['pending'],0)
        self.assertEqual(len(admitted_cache(current)['entries']),1)

    def test_interrupted_rereview_preserves_candidate_without_admitting_it(self):
        source=example()
        legacy={**empty_cache(),'entries':translate_batch(source['results'],Client(),source)}
        for entry in legacy['entries'].values():entry['review'].pop('source_context')
        class Interrupted(Client):
            def complete(self,*args,**kwargs):raise IncompleteRead(b'')
        current,stats=translate_source(source,legacy,Interrupted())
        self.assertEqual(current,legacy)
        self.assertEqual(stats['pending'],1)
        self.assertEqual(admitted_cache(current)['entries'],{})

    def test_cached_candidate_still_needs_exact_source_literals(self):
        source=example()
        legacy={**empty_cache(),'entries':translate_batch(source['results'],Client(),source)}
        entry=next(iter(legacy['entries'].values()))
        entry['review'].pop('source_context')
        entry['fields']['finding']=entry['fields']['finding'].replace('5040','1')
        entry['segments']={k:segments(v) for k,v in entry['fields'].items()}
        entry['content_digest']=digest({'fields':entry['fields'],'segments':entry['segments']})
        entry['review']['content_digest']=entry['content_digest']
        validate_cache(legacy)
        client=Client()
        current,stats=translate_source(source,legacy,client)
        self.assertEqual(client.calls,[False,True])
        self.assertEqual(stats['pending'],0)
        self.assertIn('5040',next(iter(current['entries'].values()))['fields']['finding'])

    def test_pages_reads_only_receipts_with_full_source_context(self):
        source=example()
        legacy={**empty_cache(),'entries':translate_batch(source['results'],Client(),source)}
        for entry in legacy['entries'].values():entry['review'].pop('source_context')
        with patch('lib.research_translations.read_json_url',return_value=legacy):
            self.assertEqual(fetch_cache('owner/pages'),empty_cache())
            self.assertEqual(fetch_cache('owner/pages',include_candidates=True),legacy)

    def test_interrupted_stream_is_retried_without_reusing_partial_output(self):
        def event(text):
            return ('data: '+json.dumps({'model':MODEL,'choices':[{'delta':{'content':text}}]})+'\n').encode()
        class Interrupted(io.BytesIO):
            headers={'Content-Type':'text/event-stream'}
            def __iter__(self):
                yield event('{"ok":')
                raise IncompleteRead(b'')
        complete=io.BytesIO(event('{"ok":true}')+b'data: [DONE]\n')
        complete.headers={'Content-Type':'text/event-stream'}
        with patch('lib.research_translations.urlopen',side_effect=[Interrupted(),complete]) as request, \
                patch('lib.research_translations.time.sleep'):
            value,receipt=ModelClient('test-only').complete([])
        self.assertEqual(value,{'ok':True})
        self.assertEqual(request.call_count,2)
        self.assertEqual(receipt['model'],MODEL)

    def test_one_broken_batch_cannot_discard_other_accepted_checkpoints(self):
        source=example()
        other=copy.deepcopy(source['results'][0]);other['id']='another-bound'
        other['source_digest']=digest({'policy':POLICY,**{k:other[k] for k in ['id','kind','source_binding','fields']}})
        source['results'].append(other);source['source_set_digest']=digest(source['results'])
        accepted=translate_batch([other],Client(),source)
        def simulate(items,*args):
            if items[0]['id']=='a-bound':raise IncompleteRead(b'')
            return accepted
        checkpoints=[]
        with patch('lib.research_translations.translate_with_recovery',side_effect=simulate):
            cache,stats=translate_source(source,empty_cache(),Client(),batch_size=1,checkpoint=checkpoints.append)
        self.assertEqual(cache['entries'],accepted)
        self.assertEqual(checkpoints[-1],cache)
        self.assertEqual(stats['failed'],['a-bound'])
        self.assertEqual(stats['pending'],1)

    def test_interrupted_individual_retry_retains_its_accepted_sibling(self):
        source=example()
        other=copy.deepcopy(source['results'][0]);other['id']='another-bound'
        other['source_digest']=digest({'policy':POLICY,**{k:other[k] for k in ['id','kind','source_binding','fields']}})
        source['results'].append(other);source['source_set_digest']=digest(source['results'])
        accepted=translate_batch([source['results'][0]],Client(),source)
        def simulate(items,*args):
            if len(items)>1:raise ValueError('Rejected batch')
            if items[0]['id']=='another-bound':raise IncompleteRead(b'')
            return accepted
        with patch('lib.research_translations.translate_batch',side_effect=simulate):
            self.assertEqual(translate_with_recovery(source['results'],Client(),source),accepted)

    def test_literal_repair_receives_the_candidate_and_exact_missing_tokens(self):
        class CorruptOnce(Client):
            def complete(self,messages,review=False):
                request=json.loads(messages[-1]['content'])
                if not review and self.calls:
                    feedback=request['previous_attempt_issues']
                    issue=feedback['issues'][0]
                    self_test.assertIn(issue['key'],feedback['previous_translations'])
                    self_test.assertTrue(issue['required_literals'])
                    self_test.assertEqual(request['results'][0]['id'],example()['results'][0]['source_digest'])
                response,receipt=super().complete(messages,review)
                if not review and len(self.calls)==1:
                    for key,value in response['translations'].items():
                        _,literals=protect(example()['results'][0]['fields']['finding'])
                        token=next(iter(literals))
                        if token in value:
                            response['translations'][key]=value.replace(token,'')
                return response,receipt
        self_test=self
        client=CorruptOnce()
        accepted=translate_with_recovery(example()['results'],client,example())
        self.assertEqual(len(accepted),1)
        self.assertEqual(client.calls,[False,False,True])

    def test_unavailable_cache_cannot_be_mistaken_for_an_empty_initial_cache(self):
        with patch('lib.research_translations.read_json_url',side_effect=OSError('offline')):
            with self.assertRaisesRegex(ValueError,'refusing to replace'):
                fetch_cache('owner/pages','https://example.org')
        missing=HTTPError('https://example.org',404,'Missing',{},None)
        with patch('lib.research_translations.read_json_url',side_effect=missing):
            self.assertEqual(fetch_cache('owner/pages','https://example.org'),empty_cache())

    def test_formulas_identifiers_numerals_and_order_are_preserved(self):
        text=r'For $n>5040$, c0 = 1 and $H(n)<\tau(n)$; https://example.org/1989.'
        masked,literals=protect(text)
        self.assertEqual(restore(masked,literals),text)
        first=next(iter(literals))
        for bad in [masked.replace(first,''),masked+first,masked+' 42']:
            with self.assertRaises(ValueError):restore(bad,literals)
        keys=list(literals)
        with self.assertRaises(ValueError):restore(' '.join(reversed(keys)),literals)

    def test_cache_admission_needs_fidelity_review_and_integrity(self):
        source=example();item=source['results'][0]
        accepted=translate_batch([item],Client(),source)
        cache={**empty_cache(),'entries':accepted}
        validate_cache(cache)
        entry=accepted[item['source_digest']]
        self.assertIn('$n>5040$',entry['fields']['finding'])
        self.assertIn('仍未解决',entry['fields']['boundary'])
        self.assertTrue(any(p['kind']=='math' for p in entry['segments']['finding']))
        for change in [lambda e:e['fields'].update(finding='假的结论'),
                       lambda e:e['review'].update(passed=False),
                       lambda e:e['review'].update(source_digest='sha256:'+'e'*64),
                       lambda e:e['segments']['finding'].append({'kind':'html','text':'<script>bad()</script>'})]:
            bad=copy.deepcopy(cache);change(bad['entries'][item['source_digest']])
            with self.assertRaises(ValueError):validate_cache(bad)

    def test_semantic_rejection_cannot_be_published(self):
        with self.assertRaisesRegex(ValueError,'fidelity review'):
            translate_batch(example()['results'],Client(reject=True),example())

    def test_rejected_batch_is_isolated_and_rechecked_before_admission(self):
        class InitiallyRejected(Client):
            def complete(self,messages,review=False):
                # Reject the first review, then accept independently checked retries.
                self.reject=review and self.calls.count(True)==0
                return super().complete(messages,review)
        source=example()
        row=copy.deepcopy(source['results'][0]);row['id']='another-bound'
        row['source_digest']=digest({'policy':POLICY,**{k:row[k] for k in ['id','kind','source_binding','fields']}})
        source['results'].append(row);source['source_set_digest']=digest(source['results'])
        client=InitiallyRejected()
        cache,stats=translate_source(source,empty_cache(),client)
        self.assertEqual(stats['pending'],0)
        self.assertEqual(len(cache['entries']),2)
        self.assertEqual(client.calls.count(True),3)

    def test_rebuild_reuses_unchanged_text_and_source_changes_invalidate_it(self):
        source=example();client=Client()
        cache,stats=translate_source(source,empty_cache(),client)
        self.assertTrue(stats['changed']);self.assertEqual(stats['pending'],0)
        calls=len(client.calls)
        same,stats=translate_source(source,cache,client)
        self.assertEqual(same,cache);self.assertFalse(stats['changed']);self.assertEqual(len(client.calls),calls)
        changed=copy.deepcopy(source)
        row=changed['results'][0];row['source_binding']='e'*64
        row['source_digest']=digest({'policy':POLICY,**{k:row[k] for k in ['id','kind','source_binding','fields']}})
        changed['source_set_digest']=digest(changed['results'])
        new,stats=translate_source(changed,cache,client)
        self.assertEqual(stats['pending'],0)
        self.assertNotIn(source['results'][0]['source_digest'],new['entries'])

    def test_changed_raw_text_cannot_reuse_its_original_source_digest(self):
        source=example();source['results'][0]['fields']['finding']='A different theorem.'
        source['source_set_digest']=digest(source['results'])
        with self.assertRaises(ValueError):validate_source(source)

    def test_html_is_only_text_and_math_is_a_typed_node(self):
        parts=segments(r'中文 <img src=x onerror=bad()> 与 $n>5040$。')
        self.assertEqual({p['kind'] for p in parts},{'text','math'})
        self.assertTrue(any('<img' in p['text'] for p in parts))
        self.assertEqual(next(p['text'] for p in parts if p['kind']=='math'),'n>5040')

    def test_workflow_uses_published_pages_and_no_source_write(self):
        import yaml
        root=Path(__file__).resolve().parents[1]
        workflow=yaml.load((root/'.github/workflows/research-translations.yml').read_text(),Loader=yaml.BaseLoader)
        self.assertEqual(set(workflow['on']),{'workflow_dispatch'})
        self.assertIn("refs/heads/dev",workflow['jobs']['translate']['if'])
        pages=yaml.load((root/'.github/workflows/pages.yml').read_text(),Loader=yaml.BaseLoader)
        dispatch=pages['jobs']['request-translations']
        self.assertEqual(dispatch['needs'],'deploy')
        self.assertIn("needs.deploy.result == 'success'",dispatch['if'])
        self.assertEqual(dispatch['permissions'],{'actions':'write','contents':'read'})
        self.assertIn('gh workflow run research-translations.yml',dispatch['steps'][0]['run'])
        text=(root/'.github/workflows/research-translations.yml').read_text()
        self.assertNotIn('git push',text)
        self.assertIn('RESEARCH_TRANSLATION_API_KEY',text)
        self.assertIn('rebuild_current=true',text)


if __name__=='__main__':unittest.main()
