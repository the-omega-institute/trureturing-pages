"""Generate a PR-only preview from verified public release data. Never deploy."""
import argparse
import gzip
from hashlib import sha256
import io
import json
from pathlib import Path
import shutil
import sys
from urllib.request import Request, urlopen
from urllib.parse import urljoin

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib.living_library import validate_index, archive_json, render_research
from lib.knowledge_pages import render_knowledge_site
from lib.vertical_smoke import MAX_FILE_BYTES
BASE='https://the-omega-institute.github.io/trureturing-pages/'
MAX_TRANSFER_BYTES=64*1024*1024


def download(path):
    """Decode HTTP gzip while hashing/storing the original artifact bytes.

    Keep the existing 64 MiB transfer budget and the production consumer's
    expanded-file bound. A .gz artifact can itself have HTTP gzip encoding;
    decoding the transport must preserve that artifact's own compression.
    """
    # The Pages custom-domain redirect is served through a CDN that rejects
    # Python's default ``Python-urllib`` user agent. Identify this bounded
    # read-only preview client explicitly so immutable public artifacts remain
    # fetchable after the redirect.
    request=Request(urljoin(BASE,path),headers={
        'Accept-Encoding': 'gzip',
        'User-Agent': 'trureturing-pages-preview/1.0',
    })
    with urlopen(request,timeout=60) as response:
        raw=response.read(MAX_TRANSFER_BYTES+1)
        encoding=response.headers.get('Content-Encoding','identity').strip().lower()
    transferred=len(raw)
    if transferred>MAX_TRANSFER_BYTES:
        raise ValueError('Preview input budget exceeded: '+path)
    if encoding=='gzip':
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            raw=stream.read(MAX_FILE_BYTES+1)
        if len(raw)>MAX_FILE_BYTES:
            raise ValueError('Preview expanded artifact budget exceeded: '+path)
    elif encoding!='identity':
        raise ValueError('Unsupported preview HTTP content encoding: '+encoding)
    return raw,transferred

def build(output):
    if output.exists():raise ValueError('Preview directory already exists')
    shutil.copytree(ROOT/'site',output)
    total=0
    def acquire(path,expected=None):
        nonlocal total
        if path.startswith('/') or '..' in path.split('/') or ':' in path:
            raise ValueError('Unsafe preview artifact path')
        raw,transferred=download(path)
        total+=transferred
        if total>384*1024*1024:raise ValueError('Preview input budget exceeded: '+path)
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
    # A PR preview needs the current release, adjacent comparisons and baseline.
    # Keep the real history index, but bound downloaded Library observations as
    # the public archive grows. Production publication still retains all history.
    preview_entries = [index['entries'][0]] + index['entries'][-16:]
    preview_entries = list({entry['digest']: entry for entry in preview_entries}.values())
    for entry in preview_entries:
        snapshot=archive_json(entry,acquire(entry['path'],entry['digest']))
        if snapshot.get('truth_release_digest')!=entry['truth_release_digest'] or snapshot.get('atlas_graph_digest')!=entry['atlas_graph_digest']:
            raise ValueError('Archived snapshot binding mismatch')
        snapshots.append(snapshot)
    if index.get('timeline'):
        timeline=index['timeline'];acquire(timeline['path'],timeline['digest'])
    # Restore the actual original Evolution input rather than testing a replacement list.
    architecture=json.loads(acquire('data/architecture-history.v1.json'))
    if (architecture.get('schema_version')!='pages-architecture-history.v1'
            or architecture.get('current_truth_release_digest')!=current['truth_release_digest']
            or not architecture.get('entries')
            or architecture['entries'][-1].get('atlas_graph_digest')!=current['atlas_graph_digest']):
        raise ValueError('Architecture history binding mismatch')
    for entry in architecture['entries']:
        payload=json.loads(acquire(entry['path'],entry['digest']))
        if any(payload.get(k)!=entry.get(k) for k in ('truth_release_digest','atlas_graph_digest')):
            raise ValueError('Architecture snapshot binding mismatch')
    # Optional diagnostics are still validated by their existing client boundary.
    from urllib.error import HTTPError
    try:acquire('data/version-status.v1.json')
    except HTTPError as error:
        if error.code!=404:raise
    render_knowledge_site(graph,output)
    render_research(snapshots[-1],output,current)
    startup=json.loads(acquire('data/atlas-startup.v1.json'))
    for key in ('truth_release_digest','atlas_graph_digest'):
        if startup.get(key)!=manifest.get(key):raise ValueError('Startup binding mismatch')
    for key in ('graph','layout'):
        entry=startup[key];acquire(entry['path'],entry['digest'])
    if fast:=startup.get('fast'):
        for entry in [fast['graph'],fast['layout'],*fast['details']]:
            acquire(entry['path'],entry['digest'])
    report={'source':'published-pages-data','truth_release_digest':current['truth_release_digest'],
        'atlas_graph_digest':current['atlas_graph_digest'],'source_commit':current['source_commit'],
        'snapshot_count':len(snapshots),'architecture_count':len(architecture['entries']),
        'library_preview_paths':[entry['path'] for entry in preview_entries],
        'problem_count':len(snapshots[-1]['problems']),'network_bytes':total,'deployment':False}
    (output/'preview-inputs.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('output',type=Path)
    print(json.dumps(build(parser.parse_args().output),indent=2))
