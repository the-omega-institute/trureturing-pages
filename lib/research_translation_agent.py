"""Independent, bounded Chinese translation tasks for a published Pages source.

The trusted planner reserves work before model execution. The model worker has
no GitHub writer credential; a separate job validates and publishes its output.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import subprocess

from lib import research_translations as tr

SCHEMA = 'research-translation-agent.v1'
STATE_PATH = 'data/research-translation-agent.v1.json'
MAX_TASKS = 16
DAILY_REQUESTS = 128
MAX_ATTEMPTS = 3
RETRY_HOURS = 6
REQUEST_BYTES = 96 * 1024
OUTPUT_TOKENS = 8192


def now_utc():
    return datetime.now(timezone.utc)


def content_key(item):
    # Source/commit changes cannot reset the cost bound for identical prose.
    return tr.digest({'policy':tr.POLICY, 'kind':item['kind'], 'fields':item['fields']})


def empty_state(repository):
    return {'schema_version':SCHEMA, 'repository':repository, 'tasks':{}, 'daily_requests':{}}


def validate_state(state, repository):
    if (state.get('schema_version')!=SCHEMA or state.get('repository')!=repository
            or not isinstance(state.get('tasks'),dict) or not isinstance(state.get('daily_requests'),dict)
            or len(state['tasks'])>50000):
        raise ValueError('Translation agent history is invalid; no model work is admitted')
    for key, attempts in state['tasks'].items():
        if not tr.HASH.fullmatch(key) or not isinstance(attempts,list) or not 1<=len(attempts)<=MAX_ATTEMPTS:
            raise ValueError('Invalid translation task attempts')
        for row in attempts:
            if (set(row)!= {'run_id','source_digest','at'} or not re.fullmatch(r'[1-9]\d*',row['run_id'])
                    or not tr.HASH.fullmatch(row['source_digest'])
                    or datetime.fromisoformat(row['at']).tzinfo is None):
                raise ValueError('Invalid translation task reservation')
    for day, count in state['daily_requests'].items():
        if (datetime.fromisoformat(day).isoformat()[:10]!=day or type(count) is not int
                or not 0<=count<=DAILY_REQUESTS):
            raise ValueError('Invalid translation daily allowance')
    return state


def plan(source, previous, state, repository, run_id, attempt, *, now=None):
    tr.validate_source(source)
    tr.validate_cache(previous)
    state=deepcopy(validate_state(state,repository))
    now=now or now_utc()
    if now.tzinfo is None or not re.fullmatch(r'[1-9]\d*',str(run_id)):
        raise ValueError('Translation agent requires an exact run and UTC clock')
    current=tr.admit_source_cache(source,previous)
    pending=[item for item in source['results'] if item['source_digest'] not in current['entries']]
    today=now.date().isoformat()
    selected, deferred, seen=[],[],set()
    already_reserved=any(row['run_id']==str(run_id) for rows in state['tasks'].values() for row in rows)
    for item in pending:
        key=content_key(item)
        attempts=state['tasks'].get(key,[])
        if str(attempt)!='1':reason='workflow reruns cannot repeat paid work'
        elif already_reserved:
            reason='this original run already reserved its work'
        elif key in seen:reason='identical text already reserved in this batch'
        elif len(attempts)>=MAX_ATTEMPTS:reason='three attempts exhausted for unchanged text'
        elif attempts and datetime.fromisoformat(attempts[-1]['at'])>now-timedelta(hours=RETRY_HOURS):
            reason='unchanged text is in the six-hour retry cooldown'
        elif len(selected)>=MAX_TASKS:reason='next bounded batch'
        elif state['daily_requests'].get(today,0)+2>DAILY_REQUESTS:reason='daily request allowance exhausted'
        else:reason=None
        if reason:
            deferred.append({'id':item['id'],'reason':reason})
            continue
        state['tasks'].setdefault(key,[]).append({'run_id':str(run_id),
            'source_digest':item['source_digest'],'at':now.isoformat()})
        state['daily_requests'][today]=state['daily_requests'].get(today,0)+2
        selected.append(item['source_digest']);seen.add(key)
    state['daily_requests']={day:n for day,n in state['daily_requests'].items()
                             if day>=(now-timedelta(days=7)).date().isoformat()}
    task={'schema_version':SCHEMA, 'repository':repository, 'run_id':str(run_id), 'attempt':str(attempt),
          'source':source, 'previous':previous, 'selected':selected,
          'summary':{'total':len(source['results']),'already_translated':len(current['entries']),
                     'selected':len(selected),'pending':len(pending),'deferred':deferred}}
    return task,validate_state(state,repository)


class BoundedClient:
    def __init__(self, client):
        self.client,self.calls,self.input_bytes=client,0,0

    def complete(self, messages, *, review=False):
        size=len(tr.canonical(messages))
        if self.calls>=2 or size>REQUEST_BYTES or self.input_bytes+size>2*REQUEST_BYTES:
            raise ValueError('Translation task request/context allowance exhausted')
        self.calls+=1;self.input_bytes+=size
        return self.client.complete(messages,review=review)


def validate_task(task, run_id, attempt):
    if (task.get('schema_version')!=SCHEMA or task.get('run_id')!=str(run_id)
            or task.get('attempt')!=str(attempt) or str(attempt)!='1'):
        raise ValueError('Translation task does not belong to this original run attempt')
    tr.validate_source(task['source']);tr.validate_cache(task['previous'])
    keys={row['source_digest'] for row in task['source']['results']}
    if (not isinstance(task['selected'],list) or len(task['selected'])>MAX_TASKS
            or len(set(task['selected']))!=len(task['selected']) or not set(task['selected'])<=keys):
        raise ValueError('Invalid translation task inventory')
    return task


def work(task, client, run_id, attempt, checkpoint=None):
    validate_task(task,run_id,attempt)
    rows={r['source_digest']:r for r in task['source']['results']}
    result={'schema_version':SCHEMA, 'run_id':str(run_id), 'attempt':str(attempt),
            'entries':{}, 'failed':[], 'requests':0}
    for key in task['selected']:
        bounded=BoundedClient(client)
        try:
            # One fresh translation and one fresh independent review. No tools,
            # accumulated conversation, transport retry or recursive agent.
            result['entries'].update(tr.translate_batch([rows[key]],bounded,task['source']))
        except (OSError,HTTPException,ValueError,KeyError,TypeError) as error:
            result['failed'].append({'id':rows[key]['id'],'error':type(error).__name__})
        result['requests']+=bounded.calls
        if checkpoint:checkpoint(result)
    return result


def finish(task, result, state, previous, run_id, attempt):
    validate_task(task,run_id,attempt)
    validate_state(state,task['repository']);tr.validate_cache(previous)
    if (result.get('schema_version')!=SCHEMA or result.get('run_id')!=str(run_id)
            or result.get('attempt')!=str(attempt) or not set(result.get('entries',{}))<=set(task['selected'])):
        raise ValueError('Foreign translation agent result')
    rows={r['source_digest']:r for r in task['source']['results']}
    accepted=tr.admit_source_cache(task['source'],{**tr.empty_cache(),'entries':result['entries']})['entries']
    if set(accepted)!=set(result['entries']):raise ValueError('Translation result lacks full-source review')
    for key,entry in accepted.items():
        item=rows[key]
        if (not any(r['run_id']==str(run_id) and r['source_digest']==key
                    for r in state['tasks'].get(content_key(item),[]))
                or entry.get('id')!=item['id'] or entry.get('source_binding')!=item['source_binding']
                or entry.get('source_commit')!=task['source']['source_commit']
                or entry.get('truth_release_digest')!=task['source']['truth_release_digest']
                or entry['review'].get('model')!=tr.MODEL or entry.get('generation',{}).get('model')!=tr.MODEL):
            raise ValueError('Translation result differs from its reserved source and model')
    cache={**tr.empty_cache(),'entries':{**previous['entries'],**accepted}}
    tr.validate_cache(cache)
    wanted={r['source_digest'] for r in task['source']['results']}
    pending=wanted-tr.admit_source_cache(task['source'],cache)['entries'].keys()
    return cache,{'accepted_now':len(accepted),'pending':len(pending),'failed':result['failed'],
                  'requests':result['requests'],'changed':cache!=previous}


class Store:
    def __init__(self,repository):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repository):raise ValueError('Invalid repository')
        self.repository=repository

    def api(self,path,body=None,missing=False):
        command=['gh','api',f'repos/{self.repository}/'+path]
        if body is not None:command+=['--method','PUT','--input','-']
        result=subprocess.run(command,input=json.dumps(body) if body is not None else None,
            capture_output=True,text=True,timeout=60)
        if result.returncode:
            if missing and '(HTTP 404)' in result.stderr:return None
            raise RuntimeError('Translation agent store unavailable; no new work is admitted')
        return json.loads(result.stdout)

    def load(self):
        import base64
        record=self.api(f'contents/{STATE_PATH}?ref={tr.BRANCH}',missing=True)
        if record is None:return None,None
        return validate_state(json.loads(base64.b64decode(record['content'])),self.repository),record['sha']

    def save(self,state,sha):
        import base64
        body={'branch':tr.BRANCH,'message':'Reserve bounded Chinese translation agent work',
              'content':base64.b64encode(tr.canonical(state)+b'\n').decode()}
        if sha:body['sha']=sha
        self.api('contents/'+STATE_PATH,body)


def write(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(tr.canonical(value)+b'\n')


def outputs(path,**values):
    if path:
        with Path(path).open('a') as stream:
            for key,value in values.items():stream.write(f'{key}={str(value).lower()}\n')


def report(stats):
    print(json.dumps(stats),flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as stream:
            stream.write('Independent Chinese translation agent\n\n```json\n'+
                         json.dumps(stats,ensure_ascii=False,indent=2)+'\n```\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','work','finish'])
    parser.add_argument('--repository',default='the-omega-institute/trureturing-pages')
    parser.add_argument('--expected-release-digest')
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--task',type=Path)
    parser.add_argument('--github-output',type=Path)
    args=parser.parse_args()
    if os.environ.get('GITHUB_REPOSITORY',args.repository)!=args.repository:
        raise ValueError('Translation agent called from a different repository')
    run_id,attempt=os.environ['GITHUB_RUN_ID'],os.environ['GITHUB_RUN_ATTEMPT']
    directory=args.directory;directory.mkdir(parents=True,exist_ok=True)
    if args.action=='prepare':
        source=tr.published_source('https://www.trureturing.org/',args.expected_release_digest)
        previous=tr.fetch_cache(args.repository,'https://www.trureturing.org/',include_candidates=True)
        store=Store(args.repository);state,sha=store.load()
        if state is None:
            admitted=tr.admit_source_cache(source,previous)['entries']
            if any(r['source_digest'] not in admitted for r in source['results']):
                raise ValueError('Translation agent ledger is missing with pending work; reconcile history first')
            state=empty_state(args.repository)
        task,updated=plan(source,previous,state,args.repository,run_id,attempt)
        if updated!=state or sha is None:store.save(updated,sha)
        # Only after the remote reservation succeeds may a model job be admitted.
        write(directory/'task.json',task)
        outputs(args.github_output,has_work=bool(task['selected']),pending=task['summary']['pending'])
        report(task['summary'])
    elif args.action=='work':
        task=json.loads(args.task.read_text())
        client=tr.ModelClient(os.environ.get('RESEARCH_TRANSLATION_API_KEY'),attempts=1,
                              output_tokens=OUTPUT_TOKENS,request_bytes=REQUEST_BYTES)
        result=work(task,client,run_id,attempt,lambda value:write(directory/'result.json',value))
        write(directory/'result.json',result)
        report({'accepted':len(result['entries']),'failed':result['failed'],'requests':result['requests']})
    else:
        task=json.loads(args.task.read_text());result=json.loads((directory/'result.json').read_text())
        state,_=Store(args.repository).load()
        if state is None:raise ValueError('Translation agent reservation disappeared')
        previous=tr.fetch_cache(args.repository,'https://www.trureturing.org/',include_candidates=True)
        cache,stats=finish(task,result,state,previous,run_id,attempt)
        if stats['changed']:tr.publish_cache(args.repository,cache,os.environ['GITHUB_SHA'])
        outputs(args.github_output,changed=stats['changed'],pending=stats['pending'])
        report(stats)


if __name__=='__main__':main()
