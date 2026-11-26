import copy
from datetime import datetime, timedelta, timezone
from http.client import IncompleteRead
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

from lib import research_translation_agent as agent
from lib import research_translations as tr
from tests.test_research_translations import Client, example

REPO='the-omega-institute/trureturing-pages'
NOW=datetime(2026,11,27,12,tzinfo=timezone.utc)


def source(count=1):
    value=example()
    first=value['results'][0]
    value['results']=[]
    for n in range(count):
        row=copy.deepcopy(first);row['id']='result-'+str(n)
        row['fields']['formal_title']='A uniform bound '+str(n)
        row['source_digest']=tr.digest({'policy':tr.POLICY,**{k:row[k] for k in ('id','kind','source_binding','fields')}})
        value['results'].append(row)
    value['source_set_digest']=tr.digest(value['results'])
    return value


class Model(Client):
    def complete(self,messages,review=False):
        result,receipt=super().complete(messages,review)
        return result,{**receipt,'model':tr.MODEL}


class TranslationAgentTests(unittest.TestCase):
    def plan(self,value=None,cache=None,state=None,run=100,attempt=1,now=NOW):
        return agent.plan(value or source(),cache or tr.empty_cache(),state or agent.empty_state(REPO),
                          REPO,run,attempt,now=now)

    def test_full_lifecycle_and_duplicate_wakeup_reuses_reviewed_cache_without_model_calls(self):
        task,state=self.plan(value=source(2))
        self.assertEqual(len(task['selected']),2)
        model=Model();checkpoints=[]
        result=agent.work(task,model,100,1,checkpoints.append)
        self.assertEqual(model.calls,[False,True,False,True])
        cache,stats=agent.finish(task,result,state,tr.empty_cache(),100,1)
        self.assertEqual(stats['pending'],0)
        self.assertTrue(stats['changed'])
        again,saved=self.plan(value=task['source'],cache=cache,state=state,run=101)
        self.assertEqual(again['selected'],[])
        self.assertEqual(saved,state)
        self.assertEqual(again['summary']['pending'],0)

    def test_failure_reserves_before_work_and_cannot_restart_on_each_wakeup(self):
        task,state=self.plan()
        model=Model(reject=True)
        result=agent.work(task,model,100,1)
        self.assertEqual(model.calls,[False,True])
        self.assertEqual(result['entries'],{})
        again,_=self.plan(state=state,run=101)
        self.assertEqual(again['selected'],[])
        self.assertIn('cooldown',again['summary']['deferred'][0]['reason'])
        # Source pin changes do not reset cost reservations for the same prose.
        changed=copy.deepcopy(task['source']);row=changed['results'][0]
        row['source_binding']='c'*64
        row['source_digest']=tr.digest({'policy':tr.POLICY,**{k:row[k] for k in ('id','kind','source_binding','fields')}})
        changed['source_set_digest']=tr.digest(changed['results'])
        again,_=self.plan(value=changed,state=state,run=102)
        self.assertEqual(again['selected'],[])

    def test_three_attempts_are_permanent_for_unchanged_text(self):
        state=agent.empty_state(REPO)
        for n in range(3):
            task,state=self.plan(state=state,run=100+n,now=NOW+timedelta(hours=7*n))
            self.assertEqual(len(task['selected']),1)
        task,saved=self.plan(state=state,run=104,now=NOW+timedelta(days=40))
        self.assertFalse(task['selected'])
        self.assertIn('exhausted',task['summary']['deferred'][0]['reason'])
        self.assertEqual(saved['tasks'],state['tasks'])

    def test_new_source_prose_gets_a_new_task_and_backlog_shares_a_daily_limit(self):
        state=agent.empty_state(REPO);value=source(80)
        selected=[]
        for n in range(4):
            task,state=self.plan(value=value,state=state,run=100+n)
            self.assertEqual(len(task['selected']),16)
            selected+=task['selected']
        self.assertEqual(len(set(selected)),64)
        task,state=self.plan(value=value,state=state,run=105)
        self.assertEqual(task['selected'],[])
        self.assertEqual(state['daily_requests'][NOW.date().isoformat()],128)
        self.assertTrue(any('daily' in d['reason'] for d in task['summary']['deferred']))

    def test_reruns_and_repeat_planning_of_original_run_cannot_spend_again(self):
        task,state=self.plan()
        self.assertFalse(self.plan(state=state,run=100,now=NOW+timedelta(days=1))[0]['selected'])
        self.assertFalse(self.plan(state=state,attempt=2)[0]['selected'])
        with self.assertRaises(ValueError):agent.work(task,Model(),100,2)
        with self.assertRaises(ValueError):agent.work(task,Model(),101,1)

    def test_context_and_request_budget_are_checked_before_transport(self):
        model=Model();client=agent.BoundedClient(model)
        with self.assertRaisesRegex(ValueError,'allowance'):
            client.complete([{'role':'user','content':'x'*agent.REQUEST_BYTES}])
        self.assertEqual(model.calls,[])
        with patch.object(model,'complete',return_value=({},{})):
            client.complete([]);client.complete([],review=True)
            with self.assertRaisesRegex(ValueError,'allowance'):client.complete([])

    def test_one_failed_task_cannot_discard_a_successful_sibling_checkpoint(self):
        task,state=self.plan(value=source(2))
        class Partial(Model):
            def complete(self,messages,review=False):
                if not self.calls:
                    self.calls.append(False)
                    raise IncompleteRead(b'')
                return super().complete(messages,review)
        model=Partial();saved=[]
        result=agent.work(task,model,100,1,lambda r:saved.append(copy.deepcopy(r)))
        self.assertEqual(len(saved),2)
        self.assertEqual(len(result['entries']),1)
        self.assertEqual(len(result['failed']),1)
        cache,stats=agent.finish(task,result,state,tr.empty_cache(),100,1)
        self.assertEqual(stats['pending'],1)
        self.assertEqual(len(cache['entries']),1)

    def test_publication_requires_exact_reserved_source_review_and_fixed_model(self):
        task,state=self.plan();result=agent.work(task,Model(),100,1)
        key=task['selected'][0]
        for field,value in [('id','other'),('source_binding','c'*64),('source_commit','c'*40),
                            ('truth_release_digest','sha256:'+'c'*64)]:
            changed=copy.deepcopy(result);changed['entries'][key][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                agent.finish(task,changed,state,tr.empty_cache(),100,1)
        changed=copy.deepcopy(result);changed['entries'][key]['review']['model']='other-model'
        with self.assertRaises(ValueError):agent.finish(task,changed,state,tr.empty_cache(),100,1)
        with self.assertRaises(ValueError):agent.finish(task,result,agent.empty_state(REPO),tr.empty_cache(),100,1)

    def test_model_stream_interruption_is_not_replayed_by_agent_client(self):
        class Interrupted(io.BytesIO):
            headers={'Content-Type':'text/event-stream'}
            def __iter__(self):raise IncompleteRead(b'');yield
        with patch('lib.research_translations.urlopen',return_value=Interrupted()) as request:
            with self.assertRaises(IncompleteRead):
                tr.ModelClient('fixture',attempts=1,output_tokens=8192,request_bytes=agent.REQUEST_BYTES).complete([])
        self.assertEqual(request.call_count,1)

    def test_output_and_context_limits_are_enforced_in_the_actual_http_payload(self):
        response=io.BytesIO(json.dumps({'model':tr.MODEL,'choices':[{'message':{'content':'{}'}}]}).encode())
        response.headers={'Content-Type':'application/json'}
        def transport(request,timeout):
            value=json.loads(request.data)
            self.assertEqual(value['max_tokens'],8192)
            self.assertNotIn('tools',value)
            self.assertNotIn('previous_response_id',value)
            return response
        with patch('lib.research_translations.urlopen',side_effect=transport):
            self.assertEqual(tr.ModelClient('fixture',attempts=1,output_tokens=8192).complete([])[0],{})

    def test_foreign_or_corrupt_history_cannot_admit_work(self):
        for change in [{'repository':'other/repo'},{'tasks':{'bad':[]}}, {'daily_requests':{'2026-11-27':129}}]:
            with self.subTest(change=change),self.assertRaises(ValueError):
                self.plan(state={**agent.empty_state(REPO),**change})

    def test_missing_remote_reservation_is_never_followed_by_model_work(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ,{'GITHUB_RUN_ID':'100','GITHUB_RUN_ATTEMPT':'1'}), \
             patch('sys.argv',['agent','prepare','--directory',d]), \
             patch.object(tr,'published_source',return_value=source()), \
             patch.object(tr,'fetch_cache',return_value=tr.empty_cache()), \
             patch.object(agent.Store,'load',return_value=(None,None)):
            with self.assertRaisesRegex(ValueError,'ledger is missing'):agent.main()
            self.assertFalse((Path(d)/'task.json').exists())

    def test_reservation_write_failure_never_publishes_a_task_for_model_job(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ,{'GITHUB_RUN_ID':'100','GITHUB_RUN_ATTEMPT':'1'}), \
             patch('sys.argv',['agent','prepare','--directory',d]), \
             patch.object(tr,'published_source',return_value=source()), \
             patch.object(tr,'fetch_cache',return_value=tr.empty_cache()), \
             patch.object(agent.Store,'load',return_value=(agent.empty_state(REPO),'old-sha')), \
             patch.object(agent.Store,'save',side_effect=RuntimeError('SHA changed')):
            with self.assertRaisesRegex(RuntimeError,'SHA changed'):agent.main()
            self.assertFalse((Path(d)/'task.json').exists())

    def test_paid_planning_never_uses_stale_served_cache_when_authoritative_cache_is_unavailable(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ,{'GITHUB_RUN_ID':'100','GITHUB_RUN_ATTEMPT':'1'}), \
             patch('sys.argv',['agent','prepare','--directory',d]), \
             patch.object(tr,'published_source',return_value=source()), \
             patch.object(tr,'fetch_cache',side_effect=ValueError('Authoritative cache unavailable')) as fetch, \
             patch.object(agent.Store,'save') as save:
            with self.assertRaisesRegex(ValueError,'unavailable'):agent.main()
            fetch.assert_called_once_with(REPO,include_candidates=True)
            save.assert_not_called()
            self.assertFalse((Path(d)/'task.json').exists())

    def test_workflow_keeps_inspection_translation_and_publication_independent(self):
        root=Path(__file__).resolve().parents[1]
        workflow=yaml.load((root/'.github/workflows/research-translations.yml').read_text(),Loader=yaml.BaseLoader)
        self.assertNotEqual(workflow['concurrency']['group'],'display-monitor')
        jobs=workflow['jobs'];self.assertEqual(set(jobs),{'prepare','translate','publish'})
        self.assertEqual(jobs['translate']['permissions'],{'contents':'read'})
        for name,job in jobs.items():
            for step in job['steps']:
                env=step.get('env',{})
                if 'RESEARCH_TRANSLATION_API_KEY' in env:
                    self.assertEqual(name,'translate')
                    self.assertNotIn('GH_TOKEN',env)
                if name!='translate':self.assertNotIn('RESEARCH_TRANSLATION_API_KEY',env)
        for step in jobs['translate']['steps']:
            if 'actions/checkout' in step.get('uses',''):
                self.assertEqual(step['with']['persist-credentials'],'false')


if __name__=='__main__':unittest.main()
