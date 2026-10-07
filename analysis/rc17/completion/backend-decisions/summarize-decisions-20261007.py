"""Summarize complete independent ordinary trials; fail on missing arms/controls."""
import pathlib,json,statistics,hashlib
HERE=pathlib.Path(__file__).resolve().parent; RAW=HERE/'timed-20261007'; summary={'enrichment':[],'goals':[]}
for delay in [0,50,200]:
 arms={arm:[json.loads((RAW/f'enrichment-delay{delay}-{i}-{arm}.json').read_text()) for i in ([1,4] if arm=='baseline' else [2,3])] for arm in ['baseline','candidate']}
 for kind in ['stations','structures','planets']:
  for count in [0,1,10,50]:
   samples={arm:[next(x for x in run['cases'] if x['kind']==kind and x['count']==count) for run in runs] for arm,runs in arms.items()}
   assert len({s['dataSha256'] for xs in samples.values() for s in xs})==1
   assert len({s['coldProviderCalls'] for xs in samples.values() for s in xs})==1
   assert all(s['warmProviderCalls']==0 and s['equal'] and s['maxConcurrentCold']<=4 for xs in samples.values() for s in xs)
   record={'delayMs':delay,'kind':kind,'count':count,'equal':True,'arms':{}}
   for arm,xs in samples.items():
    record['arms'][arm]={key:{'values':[s['measurement'][key] for s in xs],'mean':statistics.mean(s['measurement'][key] for s in xs)} for key in ['coldMs','warmMs']}
   record['coldImprovementPct']=100*(1-record['arms']['candidate']['coldMs']['mean']/record['arms']['baseline']['coldMs']['mean'])
   summary['enrichment'].append(record)
for retained in [100,10000,100000]:
 samples=[next(x for x in json.loads((RAW/f'goals-{i}.json').read_text())['cases'] if x['retained']==retained) for i in range(1,5)]
 assert all(s['unchanged']['databaseWrites']==0 and s['unchanged']['loops']==100 and s['publishedEvents']==0 and s['after']['progress']-s['before']['progress']==52 for s in samples)
 assert len({s['ledgerSha256'] for s in samples})==1
 values=[s['unchanged']['elapsedMs']/100 for s in samples]
 summary['goals'].append({'retained':retained,'perRefreshMs':values,'medianMs':statistics.median(values),'minMs':min(values),'maxMs':max(values),'additionMs':[s['addition']['elapsedMs'] for s in samples],'unchangedDatabaseWrites':0,'progressDelta':52,'ledgerEqual':True})
(HERE/'summary-20261007.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary['goals'],indent=2))
