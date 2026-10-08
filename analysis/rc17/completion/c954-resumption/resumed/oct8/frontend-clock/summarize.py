from pathlib import Path
import hashlib,json,statistics
HERE=Path(__file__).resolve().parent
OUT=HERE/'attempt1'
receipt=json.loads((OUT/'completed.json').read_text());assert receipt['complete'] and receipt['finalGuardsVerified'] and receipt['cleanupVerified']
files=[OUT/f'ordinary-{i}-{arm}.json' for i,arm in enumerate(receipt['order'],1)]
runs=[json.loads(p.read_text())for p in files]
labels=[(s['nodes'],s['label'])for s in runs[0]['samples']]
assert all([(s['nodes'],s['label'])for s in r['samples']]==labels for r in runs)
summary={'commit':receipt['commit'],'fingerprints':receipt['fingerprints'],'ordinaryFiles':[{'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in files],'rows':[],'repeatedMaterialTaskRegressions':[],'dragPositions':receipt['dragPositions'],'limits':['Two fresh process observations per arm, fixed ABBA. Means equal two-point medians, not population percentiles.','Renderer Performance counters exclude browser/GPU/worker and server CPU. No React hooks/coverage/profiles/forced GC.','Map-open includes API readiness, fixed settles and fit; 600-node open follows the same100-node action history in each fresh process.','Real deadline window ends at the native transition; wall durations can vary with work before that deadline.','All adverse rows and nearest pairs retained; no optional replacement workers.']}
for k,(nodes,label) in enumerate(labels):
 row={'nodes':nodes,'label':label,'metrics':{},'samples':[r['samples'][k]for r in runs]}
 for field in ['taskMs','scriptMs','layoutMs','recalcMs','layouts','recalcs','heapUsed','domNodes','windowMs']:
  v=[s[field]for s in row['samples']];baseline=(v[0]+v[3])/2;candidate=(v[1]+v[2])/2
  row['metrics'][field]={'valuesABBA':v,'baselineMean':baseline,'candidateMean':candidate,'delta':candidate-baseline,'percent':(candidate/baseline-1)*100 if baseline else None,'pairs':[{'baseline':b,'candidate':c,'delta':c-b,'percent':(c/b-1)*100 if b else None}for b,c in [(v[0],v[1]),(v[3],v[2])]]}
 row['repeatedMaterialTaskRegression']=all(p['delta']>1 and p['percent']>10 for p in row['metrics']['taskMs']['pairs'])
 if row['repeatedMaterialTaskRegression']:summary['repeatedMaterialTaskRegressions'].append({'nodes':nodes,'label':label})
 summary['rows'].append(row)
 t=row['metrics']['taskMs'];s=row['metrics']['scriptMs'];print(f"|{nodes}|{label}|{t['baselineMean']:.3f}|{t['candidateMean']:.3f}|{t['percent']:+.2f}%|{t['pairs'][0]['percent']:+.2f}% / {t['pairs'][1]['percent']:+.2f}%|{s['percent']:+.2f}%|")
summary['unchangedRefreshTotals']=[]
for n in [100,600]:
 rows=[r for r in summary['rows']if r['nodes']==n and r['label'].startswith('unchanged-refresh')];v=[sum(r['metrics']['taskMs']['valuesABBA'][i]for r in rows)for i in range(4)];b=(v[0]+v[3])/2;c=(v[1]+v[2])/2
 summary['unchangedRefreshTotals'].append({'nodes':n,'valuesABBA':v,'baselineMean':b,'candidateMean':c,'delta':c-b,'percent':(c/b-1)*100,'pairs':[{'delta':cc-bb,'percent':(cc/bb-1)*100}for bb,cc in [(v[0],v[1]),(v[3],v[2])]]})
(HERE/'SUMMARY.json').write_text(json.dumps(summary,indent=2)+'\n')
print('REPEATED',summary['repeatedMaterialTaskRegressions']);print('UNCHANGED_TOTALS',summary['unchangedRefreshTotals'])
