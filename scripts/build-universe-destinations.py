#!/usr/bin/env python3
"""Normalize pinned Wanderer destination references; no live availability claims."""
import hashlib
import json
from pathlib import Path
import sys

REVISION = '6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a'
FILES = {
    'blue_loot': 'blueloot.json',
    'red_loot': 'redloot.json',
    'security_status': 'ss_cleaning.json',
    'trade_hubs': 'trade_hubs.json',
}
HASHES = {
    'blueloot.json': 'c303789b835089b1580719b050c47e1af6de4be2927efd1f2301b0280b9a03e7',
    'redloot.json': '0295a346d7e50d632484611deb2cbc0f46ee631bb810b8afe3ef269ee865c276',
    'ss_cleaning.json': '31581c7ee960089f9c0ea1594c952a43dc3f62b23d7856b25427831248f7a527',
    'trade_hubs.json': 'c25b929c416f743f0a9ac86cb809abc443b5b4879331b6cdcc28d9950525e5d4',
}

# Read only hash-pinned local reference inputs and return the normalized value.
# The CLI below writes the bundled file after validation; no live access check or
# network request occurs. See docs/WANDERER-DESTINATIONS-NOTICE.md for provenance.
def build(source):
    categories, hashes = {}, {}
    for category, name in FILES.items():
        raw = (source / name).read_bytes()
        hashes[name] = hashlib.sha256(raw).hexdigest()
        if hashes[name] != HASHES[name]:
            raise ValueError(f'{name} does not match the pinned source revision')
        data = json.loads(raw)
        ids = data.get('system_ids', []) + sum(data.get('system_ids_by_band', {}).values(), [])
        rows = []
        for system_id in sorted(set(ids)):
            stations = data.get('system_stations', {}).get(str(system_id), [])
            rows.append({'systemId': system_id, 'stations': [
                {'stationId': row['station_id'], 'name': row['name'], 'primary': row.get('special') is True}
                for row in sorted(stations, key=lambda row: (not row.get('special', False), row['station_id']))
            ]})
        categories[category] = {'generatedAt': data.get('generated_at'), 'typeId': data.get('type_id'), 'systems': rows}
    return {'schema': 1, 'source': 'Wanderer destination references', 'sourceRevision': REVISION,
            'sourceUrl': 'https://github.com/wanderer-industries/wanderer/tree/' + REVISION + '/priv/repo/data/route_by_systems',
            'license': 'MIT', 'inputHashes': hashes, 'referenceOnly': True, 'categories': categories}

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/build-universe-destinations.py /path/to/wanderer/priv/repo/data/route_by_systems')
    target = Path(__file__).resolve().parents[1] / 'server/data/universe-destinations.json'
    result = build(Path(sys.argv[1]))
    target.write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(f'Wrote {target}: {sum(len(c["systems"]) for c in result["categories"].values())} category/system references')
