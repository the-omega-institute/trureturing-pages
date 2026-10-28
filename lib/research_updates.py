"""The small public projection of outreach: papers OR confirmed joint work.

The feed is a full replacement. It must never contain private tracker records.
No network access occurs while rendering, and publication identity is canonical.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime
import json
from pathlib import Path
import re
import subprocess
import tempfile

from lib.literature import literature_identity, validate_http_url

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 'research-updates.v1'
EMPTY = {'schema_version': SCHEMA, 'publications': [], 'collaborations': []}
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')


def fields(item, allowed, required):
    if not isinstance(item, dict) or set(item) - set(allowed) or set(required) - set(item):
        raise ValueError('Unexpected or missing public research fields')


def text_field(item, key):
    if not isinstance(item.get(key), str) or not item[key].strip():
        raise ValueError('Missing research text: ' + key)


def validate_feed(feed):
    fields(feed, ('schema_version', 'updated_at', 'publications', 'collaborations'),
           ('schema_version', 'publications', 'collaborations'))
    if feed['schema_version'] != SCHEMA:
        raise ValueError('Unsupported research updates version')
    if feed.get('updated_at'):
        timestamp = datetime.fromisoformat(feed['updated_at'].replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError('Research update timestamp requires a timezone')
    ids, publications = set(), set()
    for kind in ('publications', 'collaborations'):
        if not isinstance(feed[kind], list):
            raise ValueError('Research updates must be arrays')
        for item in feed[kind]:
            common = ('id', 'problem_ids', 'topic', 'evidence_url')
            extra = (('title', 'authors', 'date', 'url', 'venue', 'status', 'summary')
                     if kind == 'publications' else ('status', 'people'))
            fields(item, common + extra, common + extra)
            if not isinstance(item['id'], str) or not SLUG.fullmatch(item['id']) or item['id'] in ids:
                raise ValueError('Invalid or duplicate research identity')
            ids.add(item['id'])
            if (not isinstance(item['problem_ids'], list)
                    or any(not isinstance(p, str) or not SLUG.fullmatch(p) for p in item['problem_ids'])
                    or len(set(item['problem_ids'])) != len(item['problem_ids'])):
                raise ValueError('Invalid explicit problem links')
            text_field(item, 'topic')
            validate_http_url(item['evidence_url'])
            if kind == 'publications':
                for key in ('title', 'authors', 'venue', 'summary'):
                    text_field(item, key)
                date.fromisoformat(item['date'])
                if item['status'] not in ('preprint', 'published'):
                    raise ValueError('A submission or draft is not a public paper')
                identity = literature_identity(item['url'])[0]
                if identity in publications:
                    raise ValueError('Duplicate canonical publication')
                publications.add(identity)
            else:
                if item['status'] != 'confirmed_active' or not item['people'] or not item['problem_ids']:
                    raise ValueError('Only confirmed joint work on a specific problem is public')
                if not isinstance(item['people'], list):
                    raise ValueError('Collaborators must be a list')
                for person in item['people']:
                    fields(person, ('name', 'institution'), ('name', 'institution'))
                    text_field(person, 'name')
                    text_field(person, 'institution')
    return feed


def load_feed(path=None):
    path = Path(path or ROOT / 'site/assets/research-updates.json')
    return validate_feed(json.loads(path.read_text())) if path.exists() else dict(EMPTY)


def merge_publications(existing, feed):
    """Preserve authored illustrations/qualifications; feed owns current paper facts."""
    by_identity = {literature_identity(p['url'])[0]: dict(p) for p in existing}
    for paper in feed['publications']:
        identity = literature_identity(paper['url'])[0]
        previous = by_identity.get(identity, {})
        by_identity[identity] = {**previous, **paper,
            'id': previous.get('id', 'paper-' + paper['id']),
            'status': 'Preprint' if paper['status'] == 'preprint' else 'Published',
            'highlight': previous.get('highlight', ''), 'evidence': paper['evidence_url']}
    return sorted(by_identity.values(), key=lambda p: (p['date'], p['id']), reverse=True)


def refresh_from_release(destination):
    """Fetch only the agreed public asset; failures leave the previous feed intact."""
    repo = 'the-omega-institute/trureturing-pages'
    result = subprocess.run(['gh', 'api', f'repos/{repo}/releases/tags/research-updates'],
                            capture_output=True, text=True)
    if result.returncode:
        if '(HTTP 404)' in result.stderr:
            print('No public research-updates release yet; using the checked-in feed.')
            return
        raise RuntimeError('Unable to read research-updates release: ' + result.stderr)
    with tempfile.TemporaryDirectory() as temp:
        subprocess.run(['gh', 'release', 'download', 'research-updates', '--repo', repo,
                        '--pattern', 'research-updates.v1.json', '--dir', temp], check=True)
        path = Path(temp) / 'research-updates.v1.json'
        if path.stat().st_size > 1024 * 1024:
            raise ValueError('Research feed exceeds 1 MiB')
        feed = validate_feed(json.loads(path.read_text()))
        if not feed.get('updated_at'):
            raise ValueError('Released research feed needs updated_at')
        destination = Path(destination)
        target = destination.with_suffix('.tmp')
        target.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n')
        target.replace(destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', type=Path, required=True)
    refresh_from_release(parser.parse_args().refresh)
