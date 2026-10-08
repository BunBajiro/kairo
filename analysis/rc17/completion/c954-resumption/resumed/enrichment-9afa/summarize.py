"""Derive tables from immutable matched files; never run application code."""
import hashlib, json, pathlib, statistics
ROOT=pathlib.Path(__file__).resolve().parent
run=ROOT/'matched-attempt1'
receipt=json.loads((run/'receipt.json').read_text())
assert receipt['complete'] and receipt['sourceVerified'] and len(receipt['runs'])==8
rows=[]
for delay in [0,50]:
    arms=[]
    for index,arm in enumerate(['baseline','candidate','candidate','baseline']):
        name=f'delay{delay}-{index+1}-{arm}'
        raw=(run/(name+'.json')).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==next(r for r in receipt['runs'] if r['name']==name)['resultSha256']
        packet=json.loads(raw);assert len(packet['cases'])==12 and packet['delayMs']==delay
        expected=json.loads((ROOT/(arm+'-source.json')).read_text())['files']
        assert packet['harnessSha256']==receipt['harnesses']['enrichment-trial.mjs']
        for file,digest in packet['sourceHashes'].items():assert digest==expected.get(file,{}).get('sha256'),(arm,file)
        assert {(row['kind'],row['count']) for row in packet['cases']}=={(kind,count) for kind in ['stations','structures','planets'] for count in [0,1,6,10]}
        arms.append({(row['kind'],row['count']):row for row in packet['cases']})
    for key in arms[0]:
        cases=[a[key] for a in arms]
        assert len({r['dataSha256'] for r in cases})==1
        assert len({r['coldProviderCalls'] for r in cases})==1
        assert all(r['warmProviderCalls']==0 and r['equal'] for r in cases)
        assert all(r['maxConcurrentCold']<=4 for r in cases)
        measurements={}
        for metric in ['coldMs','warmMs','coldCPU']:
            values=[sum(r['measurement'][metric].values())/1000 if metric=='coldCPU' else r['measurement'][metric] for r in cases]
            baseline=[values[0],values[3]];candidate=[values[1],values[2]]
            bm=statistics.mean(baseline);cm=statistics.mean(candidate)
            measurements[metric]={'baseline':baseline,'candidate':candidate,'baselineMean':bm,'candidateMean':cm,'delta':cm-bm,'percent':100*(cm-bm)/bm if bm else None,'pairedDeltas':[values[1]-values[0],values[2]-values[3]]}
        rows.append({'kind':key[0],'count':key[1],'delayMs':delay,'measurements':measurements,'coldProviderCalls':cases[0]['coldProviderCalls'],'warmProviderCalls':0,'baselineConcurrency':[cases[0]['maxConcurrentCold'],cases[3]['maxConcurrentCold']],'candidateConcurrency':[cases[1]['maxConcurrentCold'],cases[2]['maxConcurrentCold']],'dataSha256':cases[0]['dataSha256']})
summary={'complete':True,'sourceVerified':True,'baseCommit':receipt['baseCommit'],'matchedRuns':8,'cases':96,'rows':rows,'scope':'actual Core and ESI over controlled0/50ms provider responses; output-order parity, not chronological request completion; PI10 stress, PI6 ordinary fully trained pilot','adverseRows':[{'kind':r['kind'],'count':r['count'],'delayMs':r['delayMs'],'metric':metric,**m} for r in rows for metric,m in r['measurements'].items() if m['delta']>0]}
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for row in rows:
    m=row['measurements']['coldMs'];w=row['measurements']['warmMs'];cpu=row['measurements']['coldCPU']
    print(f"{row['delayMs']:2}ms {row['kind']:10} {row['count']:2} cold {m['baselineMean']:.3f}->{m['candidateMean']:.3f} ({m['percent']:+.1f}%) warm {w['baselineMean']:.3f}->{w['candidateMean']:.3f} cpu {cpu['baselineMean']:.3f}->{cpu['candidateMean']:.3f}")
