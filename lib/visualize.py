"""Mount the pinned Visualize publication under the Pages domain."""
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import shutil

ROOT = Path(__file__).resolve().parents[1]


def mount_visualize(output: Path, root: Path = ROOT) -> dict:
    source = root / 'vendor/visualize'
    publication = json.loads((source / 'publication.v1.json').read_text())
    if publication.get('schema_version') != 'pages-visualize-publication.v1':
        raise ValueError('Unsupported Visualize publication')
    records = publication['files']
    if any(p.is_symlink() for p in (source / 'site').rglob('*')):
        raise ValueError('Invalid Visualize publication path')
    files = {p.relative_to(source / 'site').as_posix(): p
             for p in (source / 'site').rglob('*') if p.is_file()}
    if files.keys() != records.keys():
        raise ValueError('Visualize publication file inventory changed')
    for name, path in files.items():
        relative = PurePosixPath(name)
        if path.is_symlink() or relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Invalid Visualize publication path')
        if 'sha256:' + sha256(path.read_bytes()).hexdigest() != records[name]:
            raise ValueError('Visualize publication digest mismatch: ' + name)
    license_path = source / 'LICENSE'
    if 'sha256:' + sha256(license_path.read_bytes()).hexdigest() != publication['license_sha256']:
        raise ValueError('Visualize license digest mismatch')
    destination = Path(output) / 'visualize'
    shutil.copytree(source / 'site', destination)
    shutil.copyfile(license_path, destination / 'LICENSE')
    shutil.copyfile(source / 'publication.v1.json', destination / 'publication.v1.json')
    shutil.copyfile(root / 'site/assets/visualize-bridge.js', destination / 'assets/pages-bridge.js')
    for path in destination.rglob('*.html'):
        text = path.read_text()
        # Adapt the downstream copy while retaining the original publication.
        # The shared runtime sets up the visualization's own language controls.
        depth = len(path.relative_to(destination).parts) - 1
        bridge = '../' * depth + 'assets/pages-bridge.js'
        text = text.replace('</head>', f'<script defer src="{bridge}?v=domain-v1"></script>\n</head>', 1)
        path.write_text(text)
    return publication
