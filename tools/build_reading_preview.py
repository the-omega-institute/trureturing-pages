"""Generate a PR-only reading preview from the actual served immutable data.

No Base checkout, workflow dispatch, ledger edit, or deployment is performed.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil
import sys
from urllib.request import urlopen
from urllib.parse import urljoin

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib.living_library import validate_index, archive_json, render_research
from lib.knowledge_pages import render_knowledge_site

BASE='https://the-omega-institute.github.io/trureturing-pages/'


def build(output):
    if output.exists():raise ValueError('Preview directory already exists')
    shutil.copytree(ROOT/'site',output)
    total=0
    def acquire(path,expected=None):
        nonlocal total
        if path.startswith('/') or '..' in path.split('/') or ':' in path:
            raise ValueError('Unsafe preview artifact path')
        with urlopen(urljoin(BASE,path),timeout=60) as response:
            raw=response.read(64*1024*1024+1)
        total+=len(raw)
        if len(raw)>64*1024*1024 or total>384*1024*1024:raise ValueError('Preview input budget exceeded')
        if expected and 'sha256:'+sha256(raw).hexdigest()!=expected:raise ValueError('Artifact digest mismatch: '+path)
        destination=output/path;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        return raw
    index=validate_index(json.loads(acquire('data/library-history.v1.json')))
    current=index['entries'][-1]
    manifest=json.loads(acquire('data/pages-atlas-manifest.v1.json'))
    if manifest.get('schema_version')!='pages-atlas-manifest.v1' or any(manifest.get(k)!=current[k] for k in ('truth_release_digest','atlas_graph_digest')):
        raise ValueError('The served Library and Atlas disagree')
    graph=json.loads(acquire('data/pages-atlas-view.v1.json',current['atlas_graph_digest']))
    if graph['source_snapshot']['truth_release_digest']!=current['truth_release_digest']:raise ValueError('Graph release mismatch')
    snapshots=[]
    for entry in index['entries']:
        snapshot=archive_json(entry,acquire(entry['path'],entry['digest']))
        if snapshot.get('truth_release_digest')!=entry['truth_release_digest'] or snapshot.get('atlas_graph_digest')!=entry['atlas_graph_digest']:
            raise ValueError('Archived snapshot binding mismatch')
        snapshots.append(snapshot)
    if index.get('timeline'):
        timeline=index['timeline'];acquire(timeline['path'],timeline['digest'])
    snapshot=snapshots[-1]
    render_research(snapshot,output,current)
    render_knowledge_site(graph,output)
    # Startup data is optional in production but copied and checked in this preview.
    startup=json.loads(acquire('data/atlas-startup.v1.json'))
    for key in ('truth_release_digest','atlas_graph_digest'):
        if startup.get(key)!=manifest.get(key):raise ValueError('Startup binding mismatch')
    for key in ('graph','layout'):
        entry=startup[key];acquire(entry['path'],entry['digest'])
    report={'source':'published-pages-data','truth_release_digest':current['truth_release_digest'],
        'atlas_graph_digest':current['atlas_graph_digest'],'source_commit':current['source_commit'],
        'snapshot_count':len(snapshots),'problem_count':len(snapshot['problems']),
        'network_bytes':total,'deployment':False}
    (output/'preview-inputs.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('output',type=Path)
    print(json.dumps(build(parser.parse_args().output),indent=2))
