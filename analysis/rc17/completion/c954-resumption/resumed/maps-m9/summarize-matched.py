from pathlib import Path
import hashlib
import json
import statistics
import sys

root = Path(sys.argv[1]).resolve()


def read(path):
    return json.loads((root / path).read_text())


def median(samples, field):
    return statistics.median(sample[field] for sample in samples)


complete = read('completed.json')
assert complete['complete'] and complete['sourceAndHarnessVerified']
for artifact in complete['artifacts']:
    raw = (root / artifact['path']).read_bytes()
    assert len(raw) == artifact['bytes']
    assert hashlib.sha256(raw).hexdigest() == artifact['sha256']
names = ['baseline-1', 'candidate-1', 'candidate-2', 'baseline-2']
summary = {name: read(f'summary-abba/{name}.json') for name in names}
maps = {name: read(f'maps-matrix/{name}/maps-timings' + ('-reverse' if name.endswith('-2') else '') + '.json') for name in names}
rows = []
for kind, collection in [('summary', summary), ('maps', maps)]:
    indexed = {}
    for name, result in collection.items():
        values = result['cases'] if kind == 'summary' else result['results']
        indexed[name] = {f"{row['fixture']['flavor']}/{row['fixture']['maps']}/{row['action']}" if kind == 'summary' else row['name']: row for row in values}
    assert all(set(values) == set(indexed['baseline-1']) for values in indexed.values())
    for key in indexed['baseline-1']:
        for field in (['serviceMs', 'serializationMs'] if kind == 'summary' else ['wallMs', 'serializeMs']):
            source = {name: indexed[name][key] for name in names}
            medians = {name: median(value['samples'], field) for name, value in source.items()}
            baseline = [medians['baseline-1'], medians['baseline-2']]
            candidate = [medians['candidate-1'], medians['candidate-2']]
            deltas = [candidate[i] - baseline[i] for i in range(2)]
            percentages = [deltas[i] / baseline[i] * 100 for i in range(2)]
            rows.append({'family': kind, 'case': key, 'metric': field, 'baselineRunMediansMs': baseline,
                'candidateRunMediansMs': candidate, 'pairedDeltaMs': deltas, 'pairedDeltaPercent': percentages,
                'repeatedOver10PercentAnd1Ms': all(deltas[i] > 1 and percentages[i] > 10 for i in range(2)),
                'sampleRangesMs': {name: [min(x[field] for x in value['samples']), max(x[field] for x in value['samples'])] for name, value in source.items()}})
counts = {side: read(f'summary-counts-{side}.json') for side in ['baseline', 'candidate']}
counter_rows = []
for a, b in zip(counts['baseline']['cases'], counts['candidate']['cases']):
    assert a['fixture'] == b['fixture'] and a['action'] == b['action']
    counter_rows.append({'case': f"{a['fixture']['flavor']}/{a['fixture']['maps']}/{a['action']}",
        'baseline': a['samples'][0]['diagnostics'], 'candidate': b['samples'][0]['diagnostics'],
        'outputBytes': a['samples'][0]['outputBytes'], 'inputBytes': a['fixture']['inputBytes']})
report = {'complete': True, 'rawArtifactHashesVerified': len(complete['artifacts']),
    'timings': rows, 'counters': counter_rows,
    'flagRule': 'Both paired run medians must exceed baseline by >10% and >1ms; signal for investigation, not universal user-visible threshold.',
    'limitations': ['Two fresh-process timing observations per arm; samples within a process are not independent process replications.',
        'No pooled-host/source statistics or percentile claims.', 'Counters and instrumented phase times are diagnostic-only.']}
with (root / 'summary.json').open('x') as file:
    json.dump(report, file, indent=2); file.write('\n')
for row in rows:
    if row['family'] == 'summary' and row['case'].split('/')[1] == '24' or row['repeatedOver10PercentAnd1Ms']:
        print(row['family'], row['case'], row['metric'], [round(x, 3) for x in row['baselineRunMediansMs']], '->',
            [round(x, 3) for x in row['candidateRunMediansMs']], 'flag', row['repeatedOver10PercentAnd1Ms'])
print('repeated_signals', sum(row['repeatedOver10PercentAnd1Ms'] for row in rows))
