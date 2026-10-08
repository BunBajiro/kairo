import json,pathlib,hashlib,statistics,math,sys
root=pathlib.Path(sys.argv[1]).resolve();completion=json.loads((root/'completed.json').read_text());assert completion['complete'];runs={}
for row in completion['runs']:
 p=pathlib.Path(row['file']);raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256'];d=json.loads(raw);assert d['complete'] and d['sourceVerified'] and d['cleanupVerified'] and all(x['passed'] for x in d['checks']);runs[(row['pair'],row['arm'])]=d
pairs=completion['pairs'];assert len(runs)==pairs*2 and len(completion['pairedParity'])==pairs
stats=lambda xs:{'median':statistics.median(xs),'min':min(xs),'max':max(xs),'n':len(xs)}
def metric(fn):
 arms={a:[fn(runs[(i,a)]) for i in range(1,pairs+1)] for a in ['baseline','candidate']};ratios=[b/a for a,b in zip(arms['baseline'],arms['candidate']) if a]
 return {**{a:stats(v) for a,v in arms.items()},'pairedCandidateOverBaseline':stats(ratios) if ratios else None}
def row(d,n):return next(x for x in d['prefixes'] if x['prefix']==n)
def values(d,n,kind,key):return statistics.median([x['work'][key]*1000 if key in x.get('work',{}) else x[key] for x in row(d,n)[kind]])
def p95(v):return sorted(v)[max(0,math.ceil(len(v)*.95)-1)]
summary={'complete':True,'adoption':False,'productionAcceptance':False,'screeningOnly':pairs==1,'pairs':pairs,'sourceFingerprints':completion['sourceFingerprints'],'sourceDifferences':completion['sourceDifferences'],'limits':['One within-process median per paired fresh process; paired ratios retain process pairing.','Focus correction common to both arms; only card memo source differs.','Unchanged complete DOM and native Find runtime limitation retained.','No app-wide speed or memory-leak claim.'],'prefixes':[],'append':[],'retention':[]}
for n in [30,300,1500]:
 r={'loadedCards':n}
 for name,kind,key in [('refreshElapsedMs','refresh','ms'),('refreshTaskMs','refresh','TaskDuration'),('refreshScriptMs','refresh','ScriptDuration'),('refreshStyleMs','refresh','RecalcStyleDuration'),('reportOpenElapsedMs','selection','ms'),('reportOpenTaskMs','selection','TaskDuration'),('reportOpenScriptMs','selection','ScriptDuration'),('reportOpenStyleMs','selection','RecalcStyleDuration'),('scrollTaskMs','scroll','TaskDuration')]:r[name]=metric(lambda d,k=kind,key=key:values(d,n,k,key))
 r['scrollFrameP95Ms']=metric(lambda d:statistics.median([p95(x['frameIntervals']) for x in row(d,n)['scroll']]))
 r['refreshLongTasks']={a:[] for a in ['baseline','candidate']}
 for a in r['refreshLongTasks']:
  for i in range(1,pairs+1):
   d=runs[(i,a)];tasks=[t for sample in row(d,n)['refresh'] for t in d['longtasks'] if sample['start']<=t['start']<sample['end']];r['refreshLongTasks'][a].append({'pair':i,'count':len(tasks),'maxMs':max([t['duration'] for t in tasks],default=0),'totalMs':sum(t['duration'] for t in tasks)})
 summary['prefixes'].append(r)
for n in [60,300,1500]:summary['append'].append({'loadedAfter':n,'elapsedMs':metric(lambda d:next(x for x in d['pageLoads'] if x['to']==n)['ms']),'taskMs':metric(lambda d:next(x for x in d['pageLoads'] if x['to']==n)['work']['TaskDuration']*1000)})
for phase in ['mounted','unmounted','remounted','unmountedAgain']:summary['retention'].append({'phase':phase,'collectedJsHeapMiB':metric(lambda d:d['retention'][phase]['heap']['usedSize']/2**20),'domNodes':metric(lambda d:d['retention'][phase]['dom']['nodes'])})
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'pairs':pairs,'screeningOnly':summary['screeningOnly'],'summary':str(root/'summary.json')}))
