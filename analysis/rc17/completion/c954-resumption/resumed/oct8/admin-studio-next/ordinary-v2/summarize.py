"""Summarize all frozen ordinary arms without pooling historical or recovery runs."""
import hashlib,json,statistics,sys
from collections import Counter
from pathlib import Path
attempt=Path(sys.argv[1]).resolve()
receipt=json.loads((attempt/'completed.json').read_text())
assert receipt['complete'] and receipt['sourceVerified'] and receipt['harnessVerified'] and receipt['finalGuardsVerified']
assert [r['variant'] for r in receipt['runs']]==['baseline','candidate','candidate','baseline']
runs=[]
for row in receipt['runs']:
    path=attempt/row['filename'];raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256']
    d=json.loads(raw);assert d['complete'] and d['sourceVerified'] and d['cleanupVerified']
    assert d['inputRevision']=='explicit-left-v2' and len(d['samples'])==12
    runs.append((row,d))
labels=[s['label'] for s in runs[0][1]['samples']]
for row,d in runs:
    assert [s['label'] for s in d['samples']]==labels
    assert d['fixture']==runs[0][1]['fixture']
    assert d['finalOutput']==runs[0][1]['finalOutput']
    assert len(d['checks'])==len(runs[0][1]['checks'])
    drag=next(c for c in d['checks'] if c['name'].startswith('Three drags'))
    assert len(drag['draft'])==3
    for trace in drag['draft']:
        assert {k:trace['after'][k] for k in ['x','y']}==trace['expected']
phases=[]
for index,label in enumerate(labels):
    values=[]
    for row,d in runs:
        s=d['samples'][index]
        values.append({'file':row['filename'],'variant':row['variant'],**{k:s[k] for k in ['windowMs','taskMs','scriptMs','layoutMs','recalcMs','heapBefore','heapAfter','counterReset']},
            'requests':dict(Counter(r['method']+' '+r['path'] for r in s['requests'])),
            'encodedRequestBytes':sum(r.get('encodedDataLength',0) for r in s['requests']),
            'requestsWithKnownEncodedBytes':sum('encodedDataLength' in r for r in s['requests'])})
    medians={}
    for variant in ['baseline','candidate']:
        v=[r for r in values if r['variant']==variant]
        medians[variant]={k:statistics.median(r[k] for r in v) for k in ['windowMs','taskMs','scriptMs','layoutMs','recalcMs']}
    # Counter reset rows stay visible but never form a claimed negative-work comparison.
    counter_valid=not any(r['counterReset'] for r in values)
    delta={k:medians['candidate'][k]-medians['baseline'][k] for k in medians['baseline']}
    phases.append({'label':label,'observations':values,'medians':medians,'candidateMinusBaseline':delta,'counterComparisonValid':counter_valid})
summary={'schemaVersion':2,'releaseReady':False,'receiptSha256':hashlib.sha256((attempt/'completed.json').read_bytes()).hexdigest(),
    'sourceCommit':receipt['sourceCommit'],'fixture':runs[0][1]['fixture'],'finalOutput':runs[0][1]['finalOutput'],'phases':phases,'nativeRecovery':receipt['nativeRecovery'],
    'limits':['Two fresh process observations per variant; descriptive medians, no significance claim.',
        'Fixed-wait route/update windows are not interaction latency; ordinary renderer counters exclude whole-browser/GPU/OBS CPU.',
        'Heap endpoints are uncollected observations, not retained memory. Counter resets invalidate counter comparisons, while original values remain visible.',
        'Geometry/bound/static output equality is verified here; prior diagnostic freshness/recovery controls retain their exact source boundaries.']}
(attempt/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
lines=['| Phase | Baseline task ms (two processes) | Candidate task ms (two processes) | Median delta ms | Counter reset |',
       '| --- | ---: | ---: | ---: | --- |']
for p in phases:
    b=', '.join(f'{r["taskMs"]:.3f}' for r in p['observations'] if r['variant']=='baseline')
    c=', '.join(f'{r["taskMs"]:.3f}' for r in p['observations'] if r['variant']=='candidate')
    lines.append(f'| {p["label"]} | {b} | {c} | {p["candidateMinusBaseline"]["taskMs"]:.3f} | {not p["counterComparisonValid"]} |')
(attempt/'task-table.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'summary':str(attempt/'summary.json'),'phaseCount':len(phases),'counterResetPhases':[p['label'] for p in phases if not p['counterComparisonValid']]}))
