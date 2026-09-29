"""Reproduce the pinned frozen-theorem census without running Lean.

Usage: python tools/verify_open_math_growth.py /path/to/trureturing
Requires source commits in the local Git object database.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile


def count_snapshot(repo, commit):
    archive = subprocess.check_output(['git', 'archive', commit, 'Golden/Frozen/accepted'], cwd=repo)
    statements, records = set(), 0
    with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
        for entry in tf:
            if not entry.isfile() or not entry.name.endswith('.json'):
                continue
            record = json.load(tf.extractfile(entry))
            if record['schema_version'] != 5:
                raise ValueError('Census requires schema-v5 records')
            if record['event_type'] != 'Freeze':
                continue
            records += 1
            for declaration in record['payload']['declaration_statement_ids']:
                if declaration['kind'] == 'theorem':
                    statements.add(declaration['statement_id'])
    digest = hashlib.sha256(('\n'.join(sorted(statements)) + '\n').encode()).hexdigest()
    return len(statements), records, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_repo', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    data = json.loads((root / 'site/assets/open-math/theorem-growth.json').read_text())
    for point in data['points']:
        actual = count_snapshot(args.source_repo, point['source_commit'])
        expected = (point['theorems'], point['freeze_records'], point['statement_ids_sha256'])
        if actual != expected:
            raise ValueError(f"Census mismatch at {point['source_commit']}: {actual} != {expected}")
        print(f"{point['date']}: {actual[0]:,} theorem statements", flush=True)


if __name__ == '__main__':
    main()
