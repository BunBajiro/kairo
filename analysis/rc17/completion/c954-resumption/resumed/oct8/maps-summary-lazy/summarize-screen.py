"""Describe the fixed screen without introducing an acceptance threshold."""
import hashlib
import json
from pathlib import Path
import statistics
import sys

directory = Path(sys.argv[1]).resolve()
receipt = json.loads((directory / 'completed.json').read_text())
assert receipt['complete'] and receipt['sourceAndHarnessVerified']
for artifact in receipt['artifacts']:
    raw = (directory / artifact['path']).read_bytes()
    assert len(raw) == artifact['bytes'], artifact['path']
    assert hashlib.sha256(raw).hexdigest() == artifact['sha256'], artifact['path']

arms = {name: json.loads((directory / (name + '.json')).read_text())
        for name in receipt['order']}
pairs = [('baseline-1', 'candidate-1'), ('baseline-2', 'candidate-2')]


def compare(a, b):
    return {'baseline': a, 'candidate': b, 'difference': b - a,
            'percent': (b / a - 1) * 100 if a else None}


def timings(case):
    rows = {'construction': case['firstOpen']['elapsedMs']}
    rows.update({p['name']: p['elapsedMs'] for p in case['phases']})
    rows['five-steady-median'] = statistics.median(
        p['elapsedMs'] for p in case['phases']
        if p['name'].startswith('steady-summary-'))
    return rows


def cost(case, name):
    value = case[name]
    if name == 'firstOpen':
        value = value['storage']
    return {key: value[key] for key in
            ['databaseBytes', 'walBytes', 'shmBytes', 'allocatedPageBytes',
             'pageCount', 'freelistCount']}


result = {'schemaVersion': 1, 'complete': True, 'acceptance': False,
          'sourceAndRawArtifactsVerified': True, 'pairs': pairs,
          'notes': [
              'Every original arm and phase remains visible in raw outputs.',
              'Paired percentages are descriptive; no pass/fail threshold is imposed.',
              'Five-steady-median is one median within each process, not five independent processes.',
              'Construction includes existing startup work; modules and fixture copy are excluded.',
              'Final storage is after equivalent expiry and WAL checkpoint, not a peak.',
              'Point memory and cumulative process maxRSS remain in raw outputs; they are not retained memory.',
          ], 'cases': []}
for index, case_id in enumerate(receipt['cases']):
    cases = {name: arm['cases'][index] for name, arm in arms.items()}
    assert all(case['id'] == case_id for case in cases.values())
    reference = cases['baseline-1']['parity']
    assert all(case['parity'] == reference for case in cases.values())
    rows = {name: timings(case) for name, case in cases.items()}
    names = list(rows['baseline-1'])
    assert all(list(row) == names for row in rows.values())
    result['cases'].append({
        'id': case_id,
        'phases': {name: [compare(rows[a][name], rows[b][name]) for a, b in pairs]
                   for name in names},
        'storage': {phase: {key: [compare(cost(cases[a], phase)[key],
                                              cost(cases[b], phase)[key])
                                  for a, b in pairs]
                            for key in cost(cases['baseline-1'], phase)}
                    for phase in ['firstOpen', 'finalStorage']},
        'derivatives': {name: {'initial': case['firstOpen']['storage']['derivatives'],
                              'final': case['finalStorage']['derivatives'],
                              'finalStates': case['finalStorage']['states']}
                        for name, case in cases.items()},
        'databaseChanges': {name: {p['name']: p['databaseChanges'] for p in case['phases']}
                            for name, case in cases.items()},
    })
target = directory / 'summary.json'
with target.open('x') as out:
    json.dump(result, out, indent=2)
    out.write('\n')
print(str(target))
