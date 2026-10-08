"""Post-run description of frozen S3 ordinary gates; no adoption threshold."""
from pathlib import Path
import hashlib
import json
import math
import statistics
import sys

directory = Path(sys.argv[1]).resolve()


def load(path):
    return json.loads(path.read_text())


def digest(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def compare(a, b):
    return {'baseline': a, 'candidate': b, 'difference': b - a,
            'percent': (b / a - 1) * 100 if a else None}


def scalars(value, prefix=''):
    result = {}
    for key, item in value.items():
        path = prefix + key
        if isinstance(item, dict):
            result.update(scalars(item, path + '.'))
        elif isinstance(item, (int, float)) and not isinstance(item, bool):
            result[path] = item
    return result


outer = load(directory / 'completed.json')
assert outer['complete'] and outer['sourceAndHarnessVerified'] and outer['finalGuardComplete']
assert not outer['artifactInventoryFailures'] and len(outer['processes']) == 2
for artifact in outer['artifacts']:
    assert digest(directory / artifact['path']) == {key: artifact[key] for key in ('bytes', 'sha256')}, artifact['path']
for process in outer['processes']:
    assert process['exitCode'] == 0 and process['artifactsVerified']
    assert not process['cleanupFailures'] and process['processGroupCleanup']['complete']

result = {'schemaVersion': 1, 'complete': True, 'acceptance': False,
    'sourceAndRawArtifactsVerified': True, 'outerReceipt': digest(directory / 'completed.json'),
    'sourceCommit': outer['sourceCommit'], 'sources': outer['sources'],
    'pairOrder': ['baseline worker 1 / candidate worker 2', 'baseline worker 4 / candidate worker 3'],
    'notes': ['Both observations per arm remain separate; no pass threshold or confidence interval is invented.',
        'Total cadence elapsed includes intentional waits. Sum of tickWorkMs describes work in the real collector calls.',
        'Tick quantiles describe a single process, not independent replications. p95 is nearest-rank over 41 ticks.',
        'Point memory and cumulative maxRSS retain their raw meanings; neither establishes retained memory.',
        'Storage observations include equal checkpoints; WAL snapshots are not cumulative bytes written.',
        'Only two ordinary cadence endpoints ran. The four interior shapes remain unexecuted.',
        'Calls await each pilot serially; this does not establish production Core concurrent dispatch performance.'],
    'write': [], 'cadence': []}

for mode, shapes, count in [('write', [(n, p) for n in (100, 1000, 10000) for p in (1, 4)], 25),
                            ('cadence', [(100, 1), (10000, 4)], 9)]:
    receipt = load(directory / mode / 'completed.json')
    assert receipt['complete'] and receipt['sourceAndHarnessVerified'] and len(receipt['children']) == count
    assert receipt['parity']['complete'] and len(receipt['parity']['groups']) == len(shapes)
    for archived, pilots in shapes:
        shape = f'{archived}-{pilots}'
        paths = {index: directory / mode / f'{mode}-{shape}-{index}-{role}.json'
                 for index, role in enumerate(['baseline', 'candidate', 'candidate', 'baseline'], 1)}
        arms = {index: load(path) for index, path in paths.items()}
        assert all(arm['complete'] and arm['sourceVerified'] for arm in arms.values())
        assert all(arm['parity'] == arms[1]['parity'] for arm in arms.values())
        entry = {'id': shape, 'archivedPerPilot': archived, 'pilots': pilots,
                 'raw': {str(index): {'path': str(path.relative_to(directory)), **digest(path)} for index, path in paths.items()}}
        pairs = [(1, 2), (4, 3)]
        if mode == 'write':
            phases = [key for key, value in arms[1].items() if isinstance(value, dict) and 'elapsedMs' in value]
            entry['phases'] = {}
            for phase in phases:
                values = {index: scalars(arm[phase]) for index, arm in arms.items()}
                assert all(set(value) == set(values[1]) for value in values.values())
                entry['phases'][phase] = {key: [compare(values[a][key], values[b][key]) for a, b in pairs] for key in values[1]}
            entry['storage'] = {}
            for stage in arms[1]['storage']:
                values = {index: scalars(arm['storage'][stage]) for index, arm in arms.items()}
                assert all(set(value) == set(values[1]) for value in values.values())
                entry['storage'][stage] = {key: [compare(values[a][key], values[b][key]) for a, b in pairs] for key in values[1]}
        else:
            values = {}
            entry['controls'] = {}
            for index, arm in arms.items():
                ticks = arm['tickWorkMs']
                assert len(ticks) == 41 and arm['measurement']['elapsedMs'] >= 120000
                assert arm['actualTickOffsetsMs'][-1] >= arm['schedule']['firstLiveDueOffsetMs']
                assert arm['eligibleIds'] is None and arm['sqlCounts'] is None
                values[index] = {**scalars(arm['measurement']), 'tickWorkTotalMs': sum(ticks),
                    'tickWorkMedianMs': statistics.median(ticks), 'tickWorkP95Ms': sorted(ticks)[math.ceil(len(ticks) * .95) - 1],
                    'tickWorkMaxMs': max(ticks), 'tickLatenessMaxMs': max(arm['tickLatenessMs'])}
                entry['controls'][str(index)] = {'counts': arm['counts'], 'schedule': arm['schedule'],
                    'actualTickOffsetsMs': arm['actualTickOffsetsMs'], 'tickWorkMs': ticks, 'tickLatenessMs': arm['tickLatenessMs']}
            assert all(set(value) == set(values[1]) for value in values.values())
            entry['measurement'] = {key: [compare(values[a][key], values[b][key]) for a, b in pairs] for key in values[1]}
        result[mode].append(entry)

target = directory / 'summary.json'
with target.open('x') as handle:
    json.dump(result, handle, indent=2)
    handle.write('\n')
print(str(target))
