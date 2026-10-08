import json,pathlib,hashlib,statistics,sys,math
root=pathlib.Path(sys.argv[1]).resolve();completion=json.load(open(root/'completed.json'));assert completion['complete'];runs=[]
for row in completion['runs']:
 p=pathlib.Path(row['file']);b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==row['sha256'];d=json.loads(b);assert d['complete'] and d['sourceVerified'] and d['cleanupVerified'];assert all(c['passed'] for c in d['checks'] if c['gate']=='hard');assert all(c['gate']=='hard' or c.get('finding')=='F6-focus-return' for c in d['checks']);runs.append(d)
assert len(runs)==3 and len({d['fixtureSha256'] for d in runs})==1
stats=lambda xs:{'median':statistics.median(xs),'min':min(xs),'max':max(xs),'n':len(xs)}
def per_process(prefix,kind,key,scale=1):
 values=[]
 for d in runs:
  row=next(r for r in d['prefixes'] if r['prefix']==prefix);samples=row[kind]
  values.append(statistics.median([(s['work'][key] if key in s.get('work',{}) else s[key])*scale for s in samples]))
 return stats(values)
def p95(xs):
 return sorted(xs)[max(0,math.ceil(len(xs)*.95)-1)]
summary={'complete':True,'performanceComparison':False,'productionAcceptance':False,'contractAcceptance':False,'knownFindings':[{'process':i+1,'observations':d['knownFindings']} for i,d in enumerate(runs)],'sourceFingerprint':completion['sourceFingerprint'],'fixture':runs[0]['fixture'],'processes':3,'checksPerProcess':[len(d['checks']) for d in runs],'prefixes':[],'append':[],'retention':[],'limits':['Current-source cardinality diagnostic, no baseline-versus-change performance claim.','F6-focus-return is a separately recorded open baseline defect; diagnostic completion does not close it. Native Find remains unverified in this browser.','Each distribution uses one median per independent process, avoiding pooled within-process pseudo-replication.','Page CDP work includes whole renderer and diagnostic bookkeeping; elapsed refresh also includes real serialized HTTP.','Collected heap follows ordinary measurements and is neither process RSS nor leak evidence.']}
for n in runs[0]['fixture']['prefixes']:
 r={'loadedCards':n,'archiveDescendants':stats([next(x for x in d['prefixes'] if x['prefix']==n)['before']['layout']['archiveElements'] for d in runs]),'refreshElapsedMs':per_process(n,'refresh','ms'),'refreshScriptMs':per_process(n,'refresh','ScriptDuration',1000),'refreshTaskMs':per_process(n,'refresh','TaskDuration',1000),'refreshLayoutMs':per_process(n,'refresh','LayoutDuration',1000),'refreshStyleMs':per_process(n,'refresh','RecalcStyleDuration',1000),'reportOpenElapsedMs':per_process(n,'selection','ms'),'reportOpenTaskMs':per_process(n,'selection','TaskDuration',1000),'scrollTaskMs':per_process(n,'scroll','TaskDuration',1000),'scrollFrameP95Ms':stats([statistics.median([p95(x['frameIntervals']) for x in next(row for row in d['prefixes'] if row['prefix']==n)['scroll']]) for d in runs]),'refreshHttpRequestsPerSample':sorted(set(len(x['reads']) for d in runs for x in next(row for row in d['prefixes'] if row['prefix']==n)['refresh'])),'refreshLongTasks':[]}
 for d in runs:
  row=next(row for row in d['prefixes'] if row['prefix']==n)
  relevant=[task for sample in row['refresh'] for task in d['longtasks'] if sample['start']<=task['start']<sample['end']]
  r['refreshLongTasks'].append({'count':len(relevant),'maxMs':max([x['duration'] for x in relevant],default=0),'totalMs':sum(x['duration'] for x in relevant)})
 summary['prefixes'].append(r)
for target in [60,300,1500]:
 items=[next(x for x in d['pageLoads'] if x['to']==target) for d in runs];summary['append'].append({'loadedAfter':target,'elapsedMs':stats([x['ms'] for x in items]),'taskMs':stats([x['work']['TaskDuration']*1000 for x in items]),'scriptMs':stats([x['work']['ScriptDuration']*1000 for x in items]),'layoutMs':stats([x['work']['LayoutDuration']*1000 for x in items]),'styleMs':stats([x['work']['RecalcStyleDuration']*1000 for x in items])})
for phase in ['mounted','unmounted','remounted','unmountedAgain']:
 summary['retention'].append({'phase':phase,'collectedJsHeapMiB':stats([d['retention'][phase]['heap']['usedSize']/2**20 for d in runs]),'domNodes':stats([d['retention'][phase]['dom']['nodes'] for d in runs]),'listeners':stats([d['retention'][phase]['dom']['jsEventListeners'] for d in runs])})
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
