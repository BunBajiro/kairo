"""Two original ordinary browser phases, exact c9d component baseline versus integrated70."""
from pathlib import Path
import argparse,datetime,fcntl,hashlib,json,math,os,signal,subprocess,sys,time
HERE=Path(__file__).resolve().parent
BASE=Path('/workspace/scratch/a2f3334402fc')
ANALYSIS=BASE/'kairo-analysis-restored'
MERGED=ANALYSIS/'analysis/rc17/completion/c954-resumption/resumed/oct8/final-merged-frontend'
sys.path.insert(0,str(MERGED))
from ownership import NamespaceCensus
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
out=Path(args.output).resolve();out.mkdir(exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report={'schemaVersion':1,'purpose':'Original names component baseline versus final integrated source; only initial Overview and first Assets open','comparison':'c9d04ef-to-70cd12f, not RC16','startedAt':stamp(),'complete':False,'releaseReady':False,'runs':[],'workers':[],'limitations':['Two fresh observations per arm on one host; no population-percentile or isolated-cause claim.','Renderer metrics exclude browser/GPU/worker CPU.','SIGKILL or host loss can prevent final receipts; atomic progress and raw outputs remain.']}
locks=[];prep=None;sources={};interrupted=[];CHROME=Path('/tmp/kairo-chrome-runtime/chromium')
def save(path,value):
 temporary=path.with_suffix(path.suffix+'.tmp')
 with temporary.open('w') as handle:
  handle.write(json.dumps(value,indent=2)+'\n');handle.flush();os.fsync(handle.fileno())
 os.replace(temporary,path)
def dump():save(out/'progress.json',report)
dump()
def handle_signal(signum,_frame):interrupted.append(signum)
for signum in (signal.SIGINT,signal.SIGTERM):signal.signal(signum,handle_signal)
def check_interruption():
 if interrupted:raise RuntimeError('Coordinator interrupted by signal '+str(interrupted[-1]))
census=None
def members(group):
 global census
 if census is None:census=NamespaceCensus()
 return census.members(group)
def signal_group(child,signum,row):
 try:os.killpg(child.pid,signum);row.setdefault('forwardedSignals',[]).append({'signal':int(signum),'at':stamp()})
 except ProcessLookupError:pass
 except OSError as error:row.setdefault('signalFailures',[]).append({'signal':int(signum),'failure':repr(error),'at':stamp()})
def drain_group(child,row):
 receipt={};row['processGroupCleanup']=receipt
 def blocked_receipt(message=None):
  try:dump()
  except OSError as error:receipt['blockedReceiptWriteFailure']=repr(error)
  if message:
   try:print(message,flush=True)
   except OSError as error:receipt['blockedNoticeWriteFailure']=repr(error)
 def observe():
  while True:
   try:
    observed=members(child.pid)
    if receipt.get('observationFailure'):
     receipt['observationRecoveredAt']=stamp();report.pop('lockReleaseBlockedByUnknownGroup',None)
    return observed
   except Exception as error:
    if not receipt.get('observationFailure'):
     receipt['observationFailure']={'firstAt':stamp(),'failure':repr(error)}
     blocked_receipt('Cleanup process-group observation failed; shared lock remains held')
    report['lockReleaseBlockedByUnknownGroup']={'group':child.pid,'failure':repr(error)}
    signal_group(child,signal.SIGKILL,row);blocked_receipt();time.sleep(1)
 child.poll();observed=observe();receipt['initialMembers']=observed
 if observed:
  receipt['unexpectedAfterLeaderClose']=not interrupted and row.get('exitCode')==0
  for signum in (signal.SIGTERM,signal.SIGKILL):
   signal_group(child,signum,row);deadline=time.monotonic()+5
   while time.monotonic()<deadline:
    child.poll();observed=observe()
    if not observed:break
    time.sleep(.05)
   if not observed:break
 live=[r for r in observed if r['state'] not in ('Z','X')]
 if live:
  receipt['boundedShutdownIncomplete']=True;report['lockReleaseBlockedByLiveProcesses']=live
  blocked_receipt('Cleanup blocked by live processes; shared lock remains held')
  while live:
   time.sleep(1);child.poll();observed=observe();live=[r for r in observed if r['state'] not in ('Z','X')]
  report.pop('lockReleaseBlockedByLiveProcesses',None);receipt['liveProcessesEventuallyExitedAt']=stamp()
 receipt['finalMembers']=observed;receipt['complete']=not observed and not receipt.get('unexpectedAfterLeaderClose',False) and not receipt.get('boundedShutdownIncomplete',False) and not receipt.get('observationFailure') and not row.get('signalFailures')
 return receipt['complete']
def command(command,cwd,log,env=None,final=False):
 if not final:check_interruption()
 signals_before=len(interrupted);child=None;deadline=time.monotonic()+prep['commandTimeoutSeconds']
 row={'command':command,'cwd':str(cwd),'start':stamp(),'log':log,'state':'starting','cleanupFailures':[]};report['runs'].append(row);dump()
 try:
  with (out/log).open('xb') as file:
   try:
    child=subprocess.Popen(command,cwd=cwd,env=env,stdout=file,stderr=subprocess.STDOUT,start_new_session=True)
    row.update(pid=child.pid,processGroup=child.pid,state='running');dump()
    while child.poll() is None:
     if time.monotonic()>deadline:raise TimeoutError('Owned command exceeded '+str(prep['commandTimeoutSeconds'])+' seconds')
     if len(interrupted)>signals_before:raise RuntimeError('Command interrupted by signal '+str(interrupted[-1]))
     time.sleep(.1)
    row.update(exitCode=child.returncode,state='closed')
   finally:
    if child is not None:
     if child.poll() is None:
      signal_group(child,signal.SIGTERM,row)
      try:child.wait(timeout=5)
      except subprocess.TimeoutExpired:
       signal_group(child,signal.SIGKILL,row)
       try:child.wait(timeout=5)
       except subprocess.TimeoutExpired:row['cleanupFailures'].append('Leader did not exit within bounded shutdown')
     if not drain_group(child,row):row['cleanupFailures'].append('Process group cleanup did not fully pass')
     child.poll();row['exitCode']=child.returncode
    file.flush();os.fsync(file.fileno())
 except BaseException as error:row['failure']=repr(error);raise
 finally:
  row['end']=stamp()
  if (out/log).exists():row['logSha256']=sha((out/log).read_bytes());row['logBytes']=(out/log).stat().st_size
  dump()
 if not final:check_interruption()
 assert child is not None and child.returncode==0 and not row['cleanupFailures'],row

def guard():
 assert prep is not None,'Preparation not loaded'
 assert sha((HERE/'PREPARED.json').read_bytes())==report['preparationSha256']
 for name,digest in prep['bindings'].items():assert sha(Path(name).read_bytes())==digest,'Bound file changed: '+name

def verify(arm,label,final=False):
 command(['node',prep['sourceHelper'],'verify',prep['arms'][arm]['built']],ANALYSIS,label+'.log',final=final)

def check_source(arm):
 config=prep['arms'][arm];pre=json.loads(Path(config['prebuild']).read_text());source=json.loads(Path(config['built']).read_text())
 for manifest in [pre,source]:
  assert manifest['root']==config['root'] and manifest['sourceCommit']==config['commit'] and manifest['expectedCommit']==config['commit'] and manifest['requireClean'] is True and not manifest['dirty'] and manifest['status']==''
 assert not pre['builtFiles'] and source['builtFiles'] and pre['files']==source['files']
 assert source['fingerprint']==config['fingerprint']
 if arm=='baseline':
  historical=json.loads(Path(prep['historicalBaselineManifest']).read_text())['files']
  assert {row['path']:{k:row[k] for k in ['bytes','sha256']} for row in source['files']}==historical
 build=json.loads(Path(config['buildReceipt']).read_text())
 if arm=='baseline':
  assert build['complete'] and len(build['roots'])==1 and build['roots'][0]['complete']
  row=build['roots'][0];assert row['commit']==config['commit'] and row['fingerprint']==source['fingerprint']
  builds=[r for r in row['commands'] if r['command']==['npm','run','build']];assert len(builds)==1
  assert builds[0]['exitCode']==0 and builds[0]['startedUtc'] and builds[0]['finishedUtc']
  assert sha(Path(builds[0]['log']).read_bytes())==builds[0]['logSha256']
 else:
  assert build['sourceCommit']==config['commit'] and build['sourceFingerprint']==source['fingerprint'] and build['exitCode']==0 and build['buildCommand']=='npm run build'
  assert build['startedAt'] and build['completedAt'] and sha(Path(build['buildLog']).read_bytes())==build['logSha256']
 sources[arm]=source
 for kind,path in [('prebuild',config['prebuild']),('built',config['built']),('build-receipt',config['buildReceipt'])]:
  raw=Path(path).read_bytes();assert sha(raw)==prep['bindings'][path]
  name=arm+'-'+kind+'.json';(out/name).write_bytes(raw)
  report.setdefault('copiedInputs',[]).append({'path':name,'original':path,'bytes':len(raw),'sha256':sha(raw)})

try:
 assert os.environ.get('KAIRO_FINAL_NAMES_GRANTED')=='1','Coordinator runtime grant required'
 assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE'),'Ordinary comparison refuses inherited Node instrumentation'
 prep=json.loads((HERE/'PREPARED.json').read_text());report['preparationSha256']=sha((HERE/'PREPARED.json').read_bytes());report['preparation']=prep;dump()
 for path in ['/tmp/kairo-performance.lock','/tmp/kairo-rc16-benchmark.lock']:
  lock=open(path,'a');locks.append(lock)
  while True:
   check_interruption()
   try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);break
   except BlockingIOError:time.sleep(.1)
 guard()
 for arm in ['baseline','candidate']:check_source(arm);verify(arm,arm+'-initial')
 env=dict(os.environ,KAIRO_MODELS_LOCKED='1',KAIRO_CHROME_PATH=str(CHROME),LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime')
 packets=[]
 for index,arm in enumerate(['baseline','candidate','candidate','baseline'],1):
  label=str(index)+'-'+arm;verify(arm,label+'-before');guard();output=out/(label+'.json');print('START',label,flush=True)
  command(['node',str(HERE/'browser-bootstrap.mjs'),prep['arms'][arm]['root'],str(output),prep['arms'][arm]['built'],'--timing'],Path(prep['arms'][arm]['root']),label+'.log',env)
  raw=output.read_bytes();packet=json.loads(raw)
  assert packet['complete'] and packet['sourceVerified'] and packet['cleanupVerified'] and not packet.get('failure') and not packet.get('finalGuardFailure')
  assert packet['source']['commit']==prep['arms'][arm]['commit'] and packet['source']['fingerprint']==sources[arm]['fingerprint']
  assert packet['mode']=='ordinary-browser' and packet['harnessSha256']==prep['bindings'][str(HERE/'browser-bootstrap.mjs')]
  assert packet['node']==prep['node']
  assert packet['runtimeInstrumentation']=={'execArgv':[],'nodeOptionsAbsent':True,'nodeV8CoverageAbsent':True}
  assert packet['fixtureHarnessSha256']==prep['bindings'][prep['fixture']] and packet['protocol']==(arm=='candidate')
  assert len(packet['checks'])==1 and all(r['passed'] for r in packet['checks']) and not packet['errors'] and not packet['unexpected'] and not packet['cleanupFailures']
  assert packet['cleanup']['browser']['processExitVerified'] and packet['cleanup']['browser']['temporaryDirectoryRemoved'] and packet['cleanup']['fixture']['complete']
  assert all(packet['browser'][k]==v for k,v in prep['browser'].items())
  assert packet['fixture']['pilots']==2 and packet['fixture']['rowsPerLargeDataset']==10000 and packet['fixture']['namesJsonBytes']==550001
  assert packet['provider']==[] and packet['clockLedger']==[] and packet['wire']==[] and packet['requests']==[]
  assert [r['label'] for r in packet['samples']]==['initial-overview-bootstrap','assets-first-open']
  for row in packet['samples']:
   for key in ['windowMs','taskMs','scriptMs','layoutMs','recalcMs','heapBefore','heapAfter']:
    assert isinstance(row[key],(float,int)) and not isinstance(row[key],bool) and math.isfinite(row[key]) and row[key]>=0
  if packets:assert packet['fixture']==packets[0]['fixture']
  verify(arm,label+'-after');guard();packets.append(packet);report['workers'].append({'arm':arm,'filename':output.name,'bytes':len(raw),'sha256':sha(raw),'samples':packet['samples'],'sourceFingerprint':sources[arm]['fingerprint'],'cleanupVerified':True});dump();print('DONE',label,flush=True)
 report['fixtureAndProviderParity']=True;report['complete']=True
except BaseException as error:report['failure']=repr(error);report['complete']=False;raise
finally:
 report['finalGuards']=[]
 checks=[('bound-harness-inputs-browser',guard)]
 for arm in sources:checks.append((arm+'-full-source-assets',lambda arm=arm:verify(arm,arm+'-final',final=True)))
 checks.append(('bound-harness-inputs-browser-after-verification',guard))
 for label,check in checks:
  try:check();report['finalGuards'].append({'label':label,'passed':True})
  except BaseException as error:report['finalGuards'].append({'label':label,'passed':False,'failure':repr(error)});report['complete']=False
 report['finalGuardsVerified']=len(sources)==2 and all(row['passed'] for row in report['finalGuards'])
 if not report['finalGuardsVerified'] or interrupted:report['complete']=False
 if interrupted:report['interruptedSignals']=interrupted
 report['artifacts']=[]
 try:
  for path in sorted(out.rglob('*')):
   if path.is_file() and path.name not in ('progress.json','completed.json'):
    data=path.read_bytes();report['artifacts'].append({'path':str(path.relative_to(out)),'bytes':len(data),'sha256':sha(data)})
 except BaseException as error:report['artifactReceiptFailure']=repr(error);report['complete']=False
 report['artifactCrossBinding']={'passed':False,'checked':[],'failures':[]}
 try:
  inventory={row['path']:row for row in report['artifacts']};pins=[]
  for row in report['runs']:
   if 'logSha256' in row:pins.append({'path':row['log'],'bytes':row['logBytes'],'sha256':row['logSha256'],'owner':'closed-command-log'})
   elif row.get('exitCode')==0:report['artifactCrossBinding']['failures'].append({'path':row['log'],'failure':'Successful command lacks a captured closed-log tuple'})
  for row in report['workers']:pins.append({'path':row['filename'],'bytes':row['bytes'],'sha256':row['sha256'],'owner':'consumed-worker-json'})
  for row in report.get('copiedInputs',[]):
   pins.append({**row,'owner':'copied-input'})
   if row['sha256']!=prep['bindings'][row['original']]:report['artifactCrossBinding']['failures'].append({'path':row['path'],'failure':'Copied input pin differs from reviewed original binding'})
  for pin in pins:
   actual=inventory.get(pin['path']);passed=actual is not None and actual['bytes']==pin['bytes'] and actual['sha256']==pin['sha256']
   report['artifactCrossBinding']['checked'].append({'path':pin['path'],'owner':pin['owner'],'passed':passed})
   if not passed:report['artifactCrossBinding']['failures'].append({'path':pin['path'],'expected':pin,'actual':actual})
  report['artifactCrossBinding']['passed']=not report['artifactCrossBinding']['failures']
 except BaseException as error:report['artifactCrossBinding']['failures'].append({'failure':repr(error)})
 if not report['artifactCrossBinding']['passed']:report['complete']=False
 report['endedAt']=stamp();dump();save(out/'completed.json',report)
 for lock in reversed(locks):lock.close()
 if not report['complete']:sys.exit(1)
