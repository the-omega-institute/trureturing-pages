import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from lib.research_translations import (
    FIELDS, POLICY, SOURCE_SCHEMA, build_source, canonical, digest, empty_cache, protect,
    restore, segments, source_item, translate_batch, translate_source, validate_cache, validate_source, fetch_cache,
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
