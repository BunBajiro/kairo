"""Summarize final browser data only; exploratory RAF output intentionally excluded."""
import gzip, hashlib, json, pathlib, statistics
root=pathlib.Path(__file__).resolve().parents[3]
raw=root/'analysis/rc16/raw'
def median(items,key): return statistics.median(x[key] for x in items)
b=json.loads((raw/'frontend-browser.json').read_text())
result={'harnessSha256':b['harnessSha256'],'sourceCommit':b['sourceCommit'],'environment':b['environment'],'controls':b['controls'],'idle':[],'interactions':[],'probe':[],'overview':[], 'bundles':{}}
for sample in b['samples']:
 if 'idle' in sample['name'] or 'paused' in sample['name']:
  result['idle'].append({k:sample[k] for k in ['name','taskMs','windowMs','canvasDraws','longTasks','domElementCount']}|{'busyPercent':sample['taskMs']/sample['windowMs']*100,'requests':len(sample['requests'])})
for name in ['atlas-zoom']+[f'maps-zoom-{n}' for n in [25,100,300,600]]:
 samples=[s for s in b['samples'] if s['name']==name]
 result['interactions'].append({'name':name,'repeats':len(samples),'taskMsMedian':median(samples,'taskMs'),'scriptMsMedian':median(samples,'scriptMs'),'styleMsMedian':median(samples,'recalcMs'),'layoutMsMedian':median(samples,'layoutMs'),'windowMsMedian':median(samples,'windowMs'),'longTasksMedian':statistics.median(len(s['longTasks']) for s in samples),'rafP95Range':[min(s['raf']['p95'] for s in samples),max(s['raf']['p95'] for s in samples)],'domElementCount':samples[-1]['domElementCount']})
for sample in b['samples']:
 if sample['name']=='maps-zoom-style-probe': result['probe'].append({k:sample[k] for k in ['phase','index','taskMs','scriptMs','recalcMs','windowMs','raf']})
burst=next(s for s in b['samples'] if s['name']=='maps-identical-refresh-burst-10')
result['burst']={'taskMs':burst['taskMs'],'requests':len(burst['requests']),'responseBytes':sum(s.get('encodedBytes',0) for s in burst['requests']),'requestsByPath':{p:sum(r['url']==p for r in burst['requests']) for p in sorted(set(r['url'] for r in burst['requests']))},'responseHeadersMs':[min(r['responseHeadersMs'] for r in burst['requests']),max(r['responseHeadersMs'] for r in burst['requests'])]}
for phase in ['baseline-1','candidate-1','candidate-2','baseline-2']:
 f=raw/f'frontend-overview-{phase}.json'
 if not f.exists():continue
 v=json.loads(f.read_text());s=v['samples'][0]
 result['overview'].append({'phase':phase,'version':v['version'],'sourceCommit':v['sourceCommit'],'harnessSha256':v['harnessSha256'],'taskMs':s['taskMs'],'windowMs':s['windowMs'],'busyPercent':s['taskMs']/s['windowMs']*100,'domElements':s['domElementCount'],'longTasks':len(s['longTasks']),'requests':len(s['requests']),'heapUsedMB':s['heapUsed']/1048576})
for version,path in [('rc16',root),('v073',root.parent/'kairo-v073')]:
 entries=[]
 for f in sorted((path/'dist/client/assets').glob('*')):
  if not f.is_file():continue
  content=f.read_bytes();entries.append({'file':f.name,'bytes':len(content),'gzipBytes':len(gzip.compress(content,mtime=0)),'sha256':hashlib.sha256(content).hexdigest()})
 result['bundles'][version]=entries
(raw/'frontend-summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['idle','interactions','probe','burst','overview']},indent=2))
