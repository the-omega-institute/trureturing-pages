"""Verified reuse of generated Pages artifacts across presentation-only changes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

from lib import reconcile_releases as reconcile, vertical_smoke

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 'pages-build-cache.v1'
BUILD_ROOTS = ('lib/', 'tools/', 'src/', 'contracts/', 'schemas/', 'config/', 'content/', 'pipeline/')
BUILD_FILES = {'Makefile', 'requirements.txt', 'global.json', 'Directory.Build.props', 'nuget.config',
               'Trureturing.Pages.slnx', '.github/workflows/pages.yml'}
MEDIA = {'.css', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf'}


def sha(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def tracked(root):
    raw = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    return sorted({p for p in raw.decode().split('\0') if p and (root / p).is_file()})


def build_modules(root):
    """Include transitive local JS inputs to offline layout/history tools."""
    pending = list((root / 'tools').glob('*.mjs')) + list((root / 'tools').glob('*.js'))
    seen = set()
    while pending:
        path = pending.pop().resolve()
        if path in seen or not path.is_file():
            continue
        path.relative_to(root.resolve())
        seen.add(path)
        for ref in re.findall(r'''["'](\.{1,2}/[^"']+\.(?:mjs|js))["']''', path.read_text()):
            pending.append(path.parent / ref)
    return {p.relative_to(root.resolve()).as_posix() for p in seen}


def inputs(root=ROOT):
    root = Path(root)
    modules = build_modules(root)
    source, build = {}, {}
    for name in tracked(root):
        path = Path(name)
        if name.startswith('site/'):
            source[path.relative_to('site').as_posix()] = sha(root / name)
            presentation = (path.suffix in MEDIA or path.parent == Path('site') and path.suffix == '.html'
                            or name.startswith(('site/assets/locales/', 'site/assets/open-math/'))
                            or path.suffix in {'.js', '.mjs'} and name not in modules)
            if not presentation:
                build[name] = source[path.relative_to('site').as_posix()]
        elif name.startswith(BUILD_ROOTS) or name in BUILD_FILES:
            build[name] = sha(root / name)
    key = hashlib.sha256(json.dumps(build, sort_keys=True).encode()).hexdigest()
    return key, source


def inventory(site):
    records = {}
    for file in sorted(Path(site).rglob('*')):
        if file.is_symlink():
            raise ValueError('Pages cache cannot contain symlinks')
        if file.is_file():
            records[file.relative_to(site).as_posix()] = sha(file)
    return records


def relative(name):
    p = Path(name)
    if p.is_absolute() or '..' in p.parts or p.as_posix() != name or not p.parts:
        raise ValueError('invalid Pages cache path')
    return p


def seal(site, manifest, root=ROOT):
    site, manifest, root = Path(site), Path(manifest), Path(root)
    build_key, source = inputs(root)
    deployment = reconcile.read_json((site / 'deployment-manifest.v1.json').read_bytes())
    reconcile.check_checkpoint(site, deployment['release_digest'])
    data = {'schema': SCHEMA, 'build_key': build_key, 'release_digest': deployment['release_digest'],
            'source_files': source, 'files': inventory(site)}
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(data, sort_keys=True, separators=(',', ':')) + '\n')
    return data


def restore(site, manifest, digest, previous_url=None, root=ROOT):
    site, manifest, root = Path(site), Path(manifest), Path(root)
    if not manifest.exists() or not site.exists():
        return False
    data = reconcile.read_json(manifest.read_bytes())
    key, source = inputs(root)
    if data.get('schema') != SCHEMA or data.get('build_key') != key or data.get('release_digest') != digest:
        return False
    for name in data['files']:
        relative(name)
    if inventory(site) != data['files']:
        raise ValueError('Pages cache contents failed verification')
    # A source file overwritten by generation cannot be overlaid safely. Fall back
    # to the normal producer path if such an input changes, including deletions.
    old_source = data['source_files']
    changed = {name for name in source.keys() | old_source.keys() if source.get(name) != old_source.get(name)}
    for name in changed:
        relative(name)
        if name in old_source and data['files'].get(name) != old_source[name]:
            return False
        if name not in old_source and name in data['files']:
            return False
    # Recheck live history/receipts and release bindings before any modifications.
    reconcile.check_checkpoint(site, digest, previous_url)
    for name in sorted(changed):
        target = site / name
        if name in source:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / 'site' / name, target)
        else:
            target.unlink(missing_ok=True)
    commit = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    tree = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD^{tree}'], text=True).strip()
    vertical_smoke.write_deployment_manifest(site, site / 'data/certified-topology.v1.json', commit, tree)
    print(json.dumps({'mode': 'reuse-generated', 'changed_presentation_files': len(changed),
                      'release_digest': digest, 'pages_commit': commit}))
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['key', 'seal', 'restore'])
    parser.add_argument('--site', type=Path, default=Path('_site'))
    parser.add_argument('--manifest', type=Path, default=Path('_pages_cache/manifest.json'))
    parser.add_argument('--digest')
    parser.add_argument('--previous-url')
    parser.add_argument('--github-output', type=Path)
    args = parser.parse_args(argv)
    if args.command == 'key':
        key, _ = inputs()
        output = f'build_key={key}\n'
    elif args.command == 'seal':
        data = seal(args.site, args.manifest)
        output = f"sealed_files={len(data['files'])}\n"
    else:
        reconcile.require_digest(args.digest)
        hit = restore(args.site, args.manifest, args.digest, args.previous_url)
        if not hit:
            # Dedicated build output only: the original producer requires a fresh tree.
            shutil.rmtree(args.site, ignore_errors=True)
            shutil.rmtree(args.manifest.parent, ignore_errors=True)
        output = f'cache-hit={str(hit).lower()}\n'
    print(output, end='')
    if args.github_output:
        with args.github_output.open('a') as handle:
            handle.write(output)


if __name__ == '__main__':
    main()
