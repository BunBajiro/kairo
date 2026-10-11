"""Read-only original names attempt audit; no application imports or execution."""
from pathlib import Path
import datetime,hashlib,json,math,os,re,subprocess
HERE=Path(__file__).resolve().parent
ATTEMPT=HERE.parent/'names-bootstrap-attempt1'
PREPARED=HERE.parents[1]/'names-bootstrap-prepared'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
r=load(ATTEMPT/'completed.json');prep=load(PREPARED/'PREPARED.json')
assert r['complete'] is False and r['releaseReady'] is False and r['finalGuardsVerified'] and all(x['passed'] for x in r['finalGuards'])
assert r==load(ATTEMPT/'progress.json')
assert r['preparation']==prep and r['preparationSha256']==sha((PREPARED/'PREPARED.json').read_bytes())
assert len(r['runs'])==16 and len(r['workers'])==4 and len(r['artifacts'])==26
inv={x['path']:x for x in r['artifacts']};actual={str(p.relative_to(ATTEMPT)) for p in ATTEMPT.rglob('*') if p.is_file()}
assert actual==set(inv)|{'completed.json','progress.json'}
for f in inv.values():
 data=(ATTEMPT/f['path']).read_bytes();assert len(data)==f['bytes'] and sha(data)==f['sha256']
bindings=[]
for name,pin in prep['bindings'].items():
 data=Path(name).read_bytes();assert sha(data)==pin;bindings.append({'path':name,'sha256':pin,'bytes':len(data)})
logs=[]
for row in r['runs']:
 assert row['exitCode']==0 and row['state']=='closed' and not row['cleanupFailures'] and not row.get('forwardedSignals') and not row.get('failure')
 assert row['processGroupCleanup']=={'initialMembers':[],'finalMembers':[],'complete':True}
 data=(ATTEMPT/row['log']).read_bytes();passed=len(data)==row['logBytes'] and sha(data)==row['logSha256']
 logs.append({'path':row['log'],'passed':passed,'expectedBytes':row['logBytes'],'expectedSha256':row['logSha256'],'actualBytes':len(data),'actualSha256':sha(data),'commandClosedAt':row['end']})
assert [x['path'] for x in logs if not x['passed']]==['3-candidate-after.log']
assert [x['path'] for x in r['artifactCrossBinding']['failures']]==['3-candidate-after.log']
for row in r['copiedInputs']:
 data=(ATTEMPT/row['path']).read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256']==prep['bindings'][row['original']]
sources={}
for arm,config in prep['arms'].items():
 source=load(Path(config['built']));root=Path(config['root']);head=subprocess.check_output(['git','--no-optional-locks','-C',str(root),'rev-parse','HEAD'],text=True).strip();status=subprocess.check_output(['git','--no-optional-locks','-C',str(root),'status','--porcelain','--untracked-files=all'],text=True)
 assert head==config['commit'] and not status
 for f in source['files']+source['builtFiles']:
  data=(root/f['path']).read_bytes();assert len(data)==f['bytes'] and sha(data)==f['sha256']
 sources[arm]={'commit':head,'clean':True,'fingerprint':source['fingerprint'],'sourceFiles':len(source['files']),'builtFiles':len(source['builtFiles'])}
packets=[]
for row,expectedArm in zip(r['workers'],['baseline','candidate','candidate','baseline']):
 assert row['arm']==expectedArm
 data=(ATTEMPT/row['filename']).read_bytes();p=json.loads(data);assert len(data)==row['bytes'] and sha(data)==row['sha256']
 assert p['samples']==row['samples'] and p['complete'] and p['workloadComplete'] and p['sourceVerified'] and p['cleanupVerified'] and not p.get('failure') and not p.get('finalGuardFailure')
 assert p['source']=={'commit':sources[row['arm']]['commit'],'fingerprint':sources[row['arm']]['fingerprint']}
 assert p['mode']=='ordinary-browser' and p['node']==prep['node'] and p['runtimeInstrumentation']=={'execArgv':[],'nodeOptionsAbsent':True,'nodeV8CoverageAbsent':True}
 assert p['harnessSha256']==prep['bindings'][str(PREPARED/'browser-bootstrap.mjs')] and p['fixtureHarnessSha256']==prep['bindings'][prep['fixture']]
 assert p['protocol']==(row['arm']=='candidate') and p['checks']==[{'label':'first Assets page contains 30 rows','passed':True}]
 assert all(not p[k] for k in ['wire','requests','errors','provider','clockLedger','unexpected','cleanupFailures'])
 assert p['cleanup']['browser']=={'complete':True,'processExitVerified':True,'code':0,'signal':None,'temporaryDirectoryRemoved':True} and p['cleanup']['fixture']=={'complete':True}
 assert all(p['browser'][k]==v for k,v in prep['browser'].items())
 if packets:assert p['fixture']==packets[0]['fixture']
 packets.append(p)
assert [x['label'] for p in packets for x in p['samples']]==prep['phaseLabels']*4
summary={};positive=[]
for phaseIndex,label in enumerate(prep['phaseLabels']):
 summary[label]={}
 for metric in ['windowMs','taskMs','scriptMs','layoutMs','recalcMs','heapBefore','heapAfter']:
  pairs=[]
  for a,b in [(0,1),(3,2)]:
   x,y=packets[a]['samples'][phaseIndex][metric],packets[b]['samples'][phaseIndex][metric];assert all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>=0 for v in [x,y]);delta=y-x
   pair={'baseline':r['workers'][a]['filename'],'candidate':r['workers'][b]['filename'],'baselineValue':x,'candidateValue':y,'delta':delta,'percent':None if x==0 else (y/x-1)*100};pair['diagnosticOver1MsAnd10Percent']=metric.endswith('Ms') and delta>1 and pair['percent'] is not None and pair['percent']>10;pairs.append(pair)
   if delta>0:positive.append({'phase':label,'metric':metric,**pair})
  a=sum(x['baselineValue'] for x in pairs)/2;b=sum(x['candidateValue'] for x in pairs)/2
  summary[label][metric]={'pairs':pairs,'meanBaseline':a,'meanCandidate':b,'meanDelta':b-a,'meanPercent':None if a==0 else (b/a-1)*100,'bothPairsPositive':all(p['delta']>0 for p in pairs)}
log=ATTEMPT/'3-candidate-after.log';st=log.stat();sv=subprocess.check_output(['stat','--printf','%W|%w|%Y|%y|%Z|%z|%i|%d|%s',str(log)],text=True).split('|');frac=re.search(r'\.(\d+) ',sv[1]);birth_ns=int(sv[0])*10**9+int(frac.group(1).ljust(9,'0'));closed=next(x['commandClosedAt'] for x in logs if not x['passed']);closed_dt=datetime.datetime.fromisoformat(closed)
stat={'path':str(log),'bytes':st.st_size,'inode':st.st_ino,'device':st.st_dev,'birthTimeNs':birth_ns,'birthTimeRaw':sv[1],'mtimeNs':st.st_mtime_ns,'ctimeNs':st.st_ctime_ns,'mtimeRaw':sv[3],'ctimeRaw':sv[5],'commandClosedAt':closed,'birthAfterCommandClosed':birth_ns>int(closed_dt.timestamp()*1e6)*1000,'mtimeBeforeBirth':st.st_mtime_ns<birth_ns,'rawStat':'|'.join(sv)}
visible=[]
for entry in Path('/proc').iterdir():
 if not entry.name.isdecimal() or int(entry.name)==os.getpid():continue
 try:
  comm=(entry/'comm').read_text().strip();args=[a.decode(errors='replace') for a in (entry/'cmdline').read_bytes().split(b'\0') if a]
  if args and (comm in ['node','npm','chrome','chromium','chrome_crashpad'] or (comm.startswith('python') and any(x.endswith('/run.py') and ('kairo' in x or 'names-bootstrap' in x) for x in args))):visible.append({'visiblePid':int(entry.name),'comm':comm,'executable':args[0],'script':args[1] if len(args)>1 else None})
 except (FileNotFoundError,ProcessLookupError,PermissionError):continue
locklines=Path('/proc/locks').read_text().splitlines();locks=[]
for name in ['/tmp/kairo-performance.lock','/tmp/kairo-rc16-benchmark.lock']:
 st=Path(name).stat();key=f'{os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}:{st.st_ino}';locks.append({'path':name,'visibleKernelEntries':[x for x in locklines if key in x.split()]})
result={'schemaVersion':1,'auditCompleted':True,'complete':False,'performanceAcceptance':False,'scope':'Independent read-only failed names envelope and raw numerical audit; no runtime','attempt':str(ATTEMPT),'comparison':r['comparison'],'receiptBindings':{n:sha((ATTEMPT/n).read_bytes()) for n in ['completed.json','progress.json']},'artifactCount':len(inv),'completeAttemptFileCount':len(actual),'artifactBytes':sum(x['bytes'] for x in inv.values()),'verifiedPreparationBindings':bindings,'sourceBindings':sources,'all16RecordedCommandsExitedZeroWithCompleteGroupCleanup':True,'commandLogs':logs,'damagedLogStat':stat,'workerBindings':[{k:x[k] for k in ['arm','filename','bytes','sha256']} for x in r['workers']],'allWorkerResultsAndInputsVerified':True,'rawMetricValueCount':56,'summaryMetricCount':14,'matchedMetricPairs':28,'rawSamples':[{'arm':x['arm'],'file':x['filename'],'samples':p['samples']} for x,p in zip(r['workers'],packets)],'numericSummary':summary,'allPositivePairs':positive,'preflight':{'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bindingAndSourceChecksPassed':True,'visibleWorkloads':visible,'sharedLocks':locks,'readyForRootControlledSingleRun':not visible and not any(x['visibleKernelEntries'] for x in locks),'limits':'Read-only visible /proc observation; runner must acquire both locks. No locks acquired or signals sent by audit.'},'caveats':['Failed source-verification log must not be reconstructed or dismissed; no clean acceptance claim.','Current damaged log birth follows recorded command close, while mtime precedes birth; this supports replacement preserving older metadata but does not identify actor.','This is c9d component baseline versus integrated70, not RC16 or isolated names causality.','Only two observations per arm; no population percentile claim.','Window metrics include original settle waits; Assets row30 assertion is outside its phase timing.','Renderer counters exclude browser/GPU/worker CPU. Heap snapshots are not allocation totals.','Every positive paired delta is retained. The >1ms AND >10% diagnostic marker is borrowed for comparison with backend reporting; it is not a new names acceptance threshold.']}
(HERE/'NUMERIC-AUDIT.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'auditCompleted':True,'complete':False,'artifacts':len(inv),'files':len(actual),'bindings':len(bindings),'pairs':28,'positivePairs':len(positive),'damagedLogStat':stat,'preflight':result['preflight'],'summary':{phase:{metric:{k:v[k] for k in ['meanBaseline','meanCandidate','meanDelta','meanPercent','bothPairsPositive']} for metric,v in metrics.items()} for phase,metrics in summary.items()}},indent=2))
