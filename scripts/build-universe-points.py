#!/usr/bin/env python3
"""Normalize the pinned SMT CSV reference markers against Kairo's bundled atlas.

Usage: python scripts/build-universe-points.py /path/to/SMT/EVEData/data
Input files must come from the revision recorded below; no network is performed.
"""
import csv
import gzip
import hashlib
import json
from pathlib import Path
import sys

REVISION = '6b3b4c6a213a349549ef737c89584fc3f048033b'
FILES = ['POI.csv', 'iceSystems.csv', 'JoveSystems.csv', 'trigInvasionSystems.csv', 'joveGates.csv']
ROOT = Path(__file__).resolve().parents[1]


# Return markers plus provenance/unmatched names; only the CLI writes output.
# REVISION states the required checkout, while file hashes record what was read
# (unlike the Wanderer importers, this tool does not compare pinned input hashes).
# Unknown historical systems are reported and skipped, not invented in the atlas.
def build(source):
    atlas = json.loads(gzip.decompress((ROOT / 'server/data/universe.json.gz').read_bytes()))
    by_name = {row['name']: row for row in atlas['systems']}
    by_id = {row['system_id']: row for row in atlas['systems']}
    items, unmatched = [], []

    def add(system, name, kind, description='', classification=None):
        row = by_id.get(system) if isinstance(system, int) else by_name.get(system)
        if row is None:
            unmatched.append(system)
            return
        item = {'id': f'smt:{kind}:{row["system_id"]}:{len(items)}', 'system_id': row['system_id'],
                'name': name, 'kind': kind, 'description': description, 'source': 'SMT historical dataset'}
        if classification:
            item['classification'] = classification
        items.append(item)

    with (source / 'POI.csv').open(encoding='utf-8-sig') as handle:
        for row in list(csv.reader(handle))[1:]:
            if len(row) >= 4:
                kind = {'Market Hub': 'market_hub', 'Jove': 'jove_gate', 'Monument': 'monument'}.get(row[1], 'point_of_interest')
                add(row[0], row[2], kind, row[3])
    for name in (source / 'iceSystems.csv').read_text().splitlines():
        if name.strip():
            add(name.strip(), 'Ice belt system', 'ice', 'Historical ice-bearing system; current anomaly availability is not supplied.')
    with (source / 'JoveSystems.csv').open() as handle:
        for row in list(csv.reader(handle, delimiter=';'))[1:]:
            if row:
                add(row[0], 'Jove Observatory', 'observatory', 'Historical observatory location; not a current site report.')
    with (source / 'trigInvasionSystems.csv').open(encoding='utf-8-sig') as handle:
        for row in csv.DictReader(handle):
            add(int(row['system_id']), row['status'].replace('_', ' ').title(), 'triglavian',
                'Historical Triglavian invasion classification; current sovereignty is shown separately.', row['status'])
    existing = {(row['system_id'], row['kind']) for row in items}
    for name in (source / 'joveGates.csv').read_text().splitlines():
        name = name.strip()
        if name and name in by_name and (by_name[name]['system_id'], 'jove_gate') not in existing:
            add(name, 'Ancient Jove Stargate', 'jove_gate', 'Historical gate location; not a traversability guarantee.')
    # A0 star references come from Kairo's existing official SDE detail shards.
    # This records the star type, not an ore/site availability claim.
    details = b''.join((ROOT / 'server/data' / part['name']).read_bytes() for part in atlas['metadata']['detailsFiles'])
    for system_id, (offset, length) in atlas['detailIndex'].items():
        record = json.loads(gzip.decompress(details[offset:offset+length]))
        star = record.get('star') or {}
        if (star.get('type_name') or '').startswith('Sun A0'):
            items.append({'id': f'sde:a0_star:{system_id}', 'system_id': int(system_id), 'name': star['type_name'],
                          'kind': 'a0_star', 'description': 'Bundled SDE star type; no current resource or anomaly availability is implied.',
                          'source': 'CCP SDE', 'type_id': star.get('type_id')})
    return {'metadata': {'source': 'Slazanger/SMT', 'source_url': 'https://github.com/Slazanger/SMT',
                         'revision': REVISION, 'license': 'MIT (SMT references); CCP SDE notice applies to star records', 'sde_build': atlas['metadata'].get('build'),
                         'notice': 'Historical reference markers from SMT. These do not report current resources, site availability, access or ownership.',
                         'files': {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in FILES},
                         'unmatched_systems': unmatched}, 'items': items}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    dataset = build(Path(sys.argv[1]))
    target = ROOT / 'server/data/universe-points.json'
    target.write_text(json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(dataset["items"])} markers; {len(dataset["metadata"]["unmatched_systems"])} unmatched historical names')
