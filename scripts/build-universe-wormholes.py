#!/usr/bin/env python3
"""Normalize the pinned Wanderer wormhole reference against Kairo's CCP SDE.

Usage: python scripts/build-universe-wormholes.py /path/to/wanderer/priv/repo/data
The five input files must match the recorded revision. No network is performed.
Static types describe respawning destination classes, never current graph edges.
"""
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REVISION = '6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a'
SOURCE_FILES = {
    'wormholeSystems.json': 'e0f8b31d3fa2f44a7aa5c039bf096e4a0c5acfe0736968d91f79029ebdb2719d',
    'wormholeClasses.json': '60576a04f15ebd89c95cc388b32ae9ba1537ee7eab7d65e0e14460e6bddaaeeb',
    'wormholes.json': 'c4915a93b776814a78c74c18f5b7555a13ff526283e4be976d675ce5017f647e',
    'effects.json': '706ce86bbc4da5a21586059785680a28215c67819279c8f7eab41fac242c83a8',
    'shatteredConstellations.json': 'da9d632b832f0a3c794883fcfeafd182b7345747b228cbbaf5f9b1d87292b038',
}
SHATTERED_SOURCE = 'https://www.eveonline.com/news/view/thera-and-the-shattered-wormholes'
EFFECT_SOURCE = 'https://www.eveonline.com/news/view/into-the-known-unknowns'
WORMHOLE_EFFECTS = {'Red Giant', 'Black Hole', 'Cataclysmic Variable', 'Pulsar', 'Magnetar', 'Wolf-Rayet Star'}


def number(value):
    # Empty K162 cells and null Drifter regeneration are unknown, not zero.
    if value is None or value == '':
        return None
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError(f'Invalid nominal value {value!r}')
    return int(result) if result.is_integer() else result


def build(source):
    inputs = {}
    for filename, expected in SOURCE_FILES.items():
        raw = (source / filename).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError(f'{filename} does not match pinned Wanderer revision {REVISION}')
        inputs[filename] = json.loads(raw)
    atlas_bytes = (ROOT / 'server/data/universe.json.gz').read_bytes()
    atlas = json.loads(gzip.decompress(atlas_bytes))
    by_id = {s['system_id']: s for s in atlas['systems']}
    classes = [{
        'id': c['wormholeClassID'], 'code': c['id'],
        'label': ('Thera' if c['wormholeClassID'] == 12 else
                  'Drifter' if 14 <= c['wormholeClassID'] <= 18 else c['shortTitle']),
        'name': c['title'], 'effectPower': c.get('effectPower'),
    } for c in inputs['wormholeClasses.json']]
    class_ids = {c['code']: c['id'] for c in classes}
    types = [{
        'type': t['name'],
        'destinationClassIds': [class_ids[x] for x in t['dest']] if t['dest'] is not None else None,
        'sourceClasses': list(t['src']),
        'static': t['static'], 'respawn': t['respawn'],
        'maxJumpMassKg': number(t['max_mass_per_jump']),
        'totalMassKg': number(t['total_mass']),
        'lifetimeHours': number(t['lifetime']),
        'massRegenerationKg': number(t['mass_regen']),
    } for t in inputs['wormholes.json']]
    type_names = {t['type'] for t in types}
    corrections = []
    effects = []
    for effect in inputs['effects.json']:
        if effect['name'] not in WORMHOLE_EFFECTS:
            continue
        modifiers = []
        for modifier in effect['modifiers']:
            powers = list(modifier['power'])
            # Pinned source omits only this percent sign. CCP's effect table
            # explicitly gives +100%; do not generally guess malformed units.
            if effect['name'] == 'Black Hole' and modifier['name'] == 'Ship Velocity':
                if powers[5] != '+100':
                    raise ValueError('Review Black Hole modifier normalization')
                powers[5] = '+100%'
                corrections.append({'kind': 'modifier_unit', 'effect': effect['name'],
                                    'modifier': modifier['name'], 'from': '+100', 'to': '+100%',
                                    'source': EFFECT_SOURCE})
            if len(powers) != 6 or not all(re.fullmatch(r'[+-]\d+(?:\.\d+)?%', p) for p in powers):
                raise ValueError('Invalid wormhole effect modifier')
            modifiers.append({'name': modifier['name'], 'positive': modifier['positive'], 'powers': powers})
        effects.append({'name': effect['name'], 'modifiers': modifiers})
    systems = []
    shattered_constellations = inputs['shatteredConstellations.json']
    for w in inputs['wormholeSystems.json']:
        system = by_id[w['solarSystemID']]
        if system['space'] != 'wormhole':
            raise ValueError(f"Reference includes non-J-space system {system['name']}")
        class_id = system['wormhole_class']
        if not set(w['statics'] + w['wanderers']) <= type_names:
            raise ValueError('Unknown static or wandering type')
        match = re.fullmatch(r'Class ([1-6]) (.+) Effects', system['effect'] or '')
        if system['effect'] and not match:
            raise ValueError(f"Unrecognized official system effect {system['effect']}")
        effect_name = match[2].replace('Wolf Rayet', 'Wolf-Rayet Star') if match else None
        effect_power = int(match[1]) if match else None
        if effect_name and effect_name not in WORMHOLE_EFFECTS:
            raise ValueError('Unknown official effect name')
        if effect_name != w['effectName']:
            corrections.append({'kind': 'effect_identity', 'systemId': system['system_id'],
                                'name': system['name'], 'from': w['effectName'], 'to': effect_name,
                                'source': 'CCP SDE mapSolarSystems effect'})
        upstream_shattered = str(system['constellation_id']) in shattered_constellations
        shattered = upstream_shattered or class_id in [12, 13]
        if shattered != upstream_shattered:
            corrections.append({'kind': 'shattered_class', 'systemId': system['system_id'],
                                'name': system['name'], 'classId': class_id, 'source': SHATTERED_SOURCE})
        systems.append({
            'systemId': system['system_id'], 'name': system['name'], 'classId': class_id,
            'shattered': shattered, 'frigateOnly': class_id == 13,
            'drifter': 14 <= class_id <= 18, 'hub': class_id == 12,
            'staticTypes': sorted(w['statics']), 'wanderingTypes': sorted(w['wanderers']),
            'effectName': effect_name, 'effectPower': effect_power,
        })
    if len({s['systemId'] for s in systems}) != len(systems):
        raise ValueError('Duplicate system references')
    expected = {s['system_id'] for s in atlas['systems'] if s['space'] == 'wormhole'}
    if {s['systemId'] for s in systems} != expected:
        raise ValueError('Reference does not cover the bundled J-space atlas')
    return {
        'metadata': {
            'schema': 1, 'source': 'wanderer-industries/wanderer',
            'sourceUrl': 'https://github.com/wanderer-industries/wanderer',
            'revision': REVISION, 'license': 'MIT; CCP intellectual-property notice applies to EVE data',
            'sdeBuild': atlas['metadata']['build'], 'sdeSource': atlas['metadata']['source'],
            'atlasSha256': hashlib.sha256(atlas_bytes).hexdigest(), 'files': SOURCE_FILES,
            'notice': 'Static types are respawning destination classes, not discovered live connections. Type limits are nominal; current endpoints, remaining mass, expiry and access require observations.',
            'corrections': sorted(corrections, key=lambda c: (c['kind'], c.get('systemId', 0))),
            'counts': {'systems': len(systems), 'types': len(types), 'effects': len(effects),
                       'shattered': sum(s['shattered'] for s in systems)},
        },
        'classes': sorted(classes, key=lambda c: c['id']),
        'types': sorted(types, key=lambda t: t['type']),
        'effects': sorted(effects, key=lambda e: e['name']),
        'systems': sorted(systems, key=lambda s: s['systemId']),
    }


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    dataset = build(Path(sys.argv[1]))
    target = ROOT / 'server/data/universe-wormholes.json'
    target.write_text(json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(dataset['metadata']['counts']))
