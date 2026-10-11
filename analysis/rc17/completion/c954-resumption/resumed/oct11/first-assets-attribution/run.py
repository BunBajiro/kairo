"""One bounded diagnostic, baseline then candidate; no ordinary timing claims."""
from pathlib import Path
import argparse,datetime,fcntl,hashlib,json,math,os,signal,subprocess,sys,time
HERE=Path(__file__).resolve().parent
BASE=Path('/workspace/scratch/a2f3334402fc')
ANALYSIS=BASE/'kairo-analysis-restored'
MERGED=ANALYSIS/'analysis/rc17/completion/c954-resumption/resumed/oct8/final-merged-frontend'
sys.dont_write_bytecode=True
sys.path.insert(0,str(MERGED))
from ownership import NamespaceCensus
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--setup-receipt',required=True);args=parser.parse_args()
out=Path(args.output).resolve();out.mkdir(exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report={'schemaVersion':1,'purpose':'One bounded diagnostic for duplicate work, original Overview and first Assets actions','comparison':'c9d04ef-to-70cd12f, not RC16','startedAt':stamp(),'complete':False,'releaseReady':False,'runs':[],'workers':[],'limitations':['Exactly one fresh browser per arm; diagnostic operation counts are not React commits or causal proof.','No timings emitted; accepted initial-versus-ongoing-use tradeoffs are not reopened by this check.','SIGKILL or host loss can prevent final receipts; atomic progress and raw outputs remain.']}
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

def prepare_inputs():
 setup_path=Path(args.setup_receipt).resolve();setup=json.loads(setup_path.read_text());assert setup['complete'] is True
 prep={'commandTimeoutSeconds':180,'sourceHelper':str(ANALYSIS/'analysis/rc17/harness/source-manifest.mjs'),'arms':{},'bindings':{},'byteSizes':{},'setupReceipt':str(setup_path)}
 report['setupReceipt']=setup
 setup_inventory=json.loads((setup_path.parent/'inventory.json').read_text());assert setup_inventory['complete'] is True
 for pin in setup_inventory['files']:
  raw=(setup_path.parent/pin['path']).read_bytes();assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256']
 runner_pin=setup_inventory['runner'];setup_runner=Path(runner_pin['path']);raw=setup_runner.read_bytes()
 assert len(raw)==runner_pin['bytes'] and sha(raw)==runner_pin['sha256']
 copy=out/'inputs/setup-runtime.py';copy.parent.mkdir(parents=True,exist_ok=True);copy.write_bytes(raw)
 report.setdefault('copiedInputs',[]).append({'path':str(copy.relative_to(out)),'original':str(setup_runner),'bytes':len(raw),'sha256':sha(raw)})
 assert setup['helperSha256']==sha(Path(prep['sourceHelper']).read_bytes())
 for row in setup['commands']:
  assert row['exitCode']==0 and row['remainingProcessGroupMembers']==[] and row['start'] and row['end'],row
  raw=(setup_path.parent/row['log']).read_bytes();assert len(raw)==row['logBytes'] and sha(raw)==row['logSha256']
 for arm,name,commit in [('baseline','kairo-names-c9d-baseline','c9d04ef62cb8a18292b309a2452fcab851185a7d'),('candidate','kairo-rc17-c954-continuation','70cd12f9a4d014e7e2cf931b9681c4bdc7f18789')]:
  root=str(BASE/name);rows=[r for r in setup['roots'] if r['label']==arm];assert len(rows)==1;row=rows[0]
  assert row['complete'] and row['root']==root and row['commit']==commit
  build=[r for r in setup['commands'] if r['cwd']==root and r['args']==['npm','run','build']];assert len(build)==1
  prep['arms'][arm]={'root':root,'commit':commit,'prebuild':str(setup_path.parent/(arm+'-prebuild.json')),'built':str(setup_path.parent/(arm+'-source.json')),'fingerprint':row['fingerprint']}
  assert row['manifest']==prep['arms'][arm]['built']
 paths=[setup_runner,HERE/'run.py',HERE/'browser-first-assets-counts.mjs',HERE/'static-check.py',HERE/'probe-initialization-control.mjs',HERE/'attempt1-harness/browser-first-assets-counts.mjs',HERE/'attempt1-harness/MANIFEST.json',HERE/'STATIC-CHECK.json',HERE/'README.md',HERE/'INDEPENDENT-REVIEW.md',Path(__file__).resolve(),MERGED/'ownership.py',MERGED/'chrome-strict.mjs',MERGED/'assets-semantics.mjs',Path(prep['sourceHelper']),HERE.parent.parent/'names-protocol-227/browser-fixture.mjs',HERE.parent/'names-bootstrap-prepared/browser-bootstrap.mjs']
 for row in setup['chromium']['files']:
  path=CHROME.parent/row['path'];raw=path.read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256'];paths.append(path)
 assert setup['chromium']['reportedVersion']=='Chromium 138.0.7204.0'
 prep['node']=(setup_path.parent/'node-version.log').read_text().strip();assert prep['node']=='v24.19.0'
 for path in sorted(setup_path.parent.rglob('*')):
  if path.is_file() and path.name not in ('progress.json',):
   raw=path.read_bytes();relative=Path('inputs/setup')/path.relative_to(setup_path.parent);copy=out/relative;copy.parent.mkdir(parents=True,exist_ok=True);copy.write_bytes(raw)
   report.setdefault('copiedInputs',[]).append({'path':str(relative),'original':str(path),'bytes':len(raw),'sha256':sha(raw)});paths.append(path)
 assert setup_path in paths
 for path in paths:
  raw=path.read_bytes();prep['bindings'][str(path)]=sha(raw);prep['byteSizes'][str(path)]=len(raw)
 return prep

def guard():
 assert prep is not None,'Preparation not loaded'
 for name,digest in prep['bindings'].items():
  raw=Path(name).read_bytes();assert len(raw)==prep['byteSizes'][name] and sha(raw)==digest,'Bound file changed: '+name

def verify(arm,label,final=False):
 command(['node',prep['sourceHelper'],'verify',prep['arms'][arm]['built']],ANALYSIS,label+'.log',final=final)

def check_source(arm):
 config=prep['arms'][arm];pre=json.loads(Path(config['prebuild']).read_text());source=json.loads(Path(config['built']).read_text())
 for manifest in [pre,source]:
  assert manifest['root']==config['root'] and manifest['sourceCommit']==config['commit'] and manifest['expectedCommit']==config['commit'] and manifest['requireClean'] is True and not manifest['dirty'] and manifest['status']==''
 assert not pre['builtFiles'] and len(source['builtFiles'])==20 and pre['files']==source['files']
 assert source['fingerprint']==config['fingerprint'];sources[arm]=source

def temporary_paths_absent():
 for entry in report.get('temporaryRoots',[]):
  path=Path(entry['path'])
  assert entry['removed'] is True,'Worker temporary root removal not recorded after failed/incomplete command: '+str(path)
  try:path.lstat()
  except FileNotFoundError:continue
  raise AssertionError('Removed worker temporary root reappeared: '+str(path))

try:
 assert os.environ.get('KAIRO_FIRST_ASSETS_DIAGNOSTIC_GRANTED')=='1','Coordinator runtime grant required'
 assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE'),'Diagnostic refuses undeclared inherited Node instrumentation'
 prep=prepare_inputs();report['preparation']=prep;dump()
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
 for index,arm in enumerate(['baseline','candidate'],1):
  label=str(index)+'-'+arm;verify(arm,label+'-before');guard();output=out/(label+'.json');print('START',label,flush=True)
  temporary=out/(label+'-tmp');temporary.mkdir();worker_env=dict(env,TMPDIR=str(temporary));temporary_state={'path':str(temporary),'createdAt':stamp(),'removed':False};report.setdefault('temporaryRoots',[]).append(temporary_state);dump()
  command(['node',str(HERE/'browser-first-assets-counts.mjs'),prep['arms'][arm]['root'],str(output),prep['arms'][arm]['built']],Path(prep['arms'][arm]['root']),label+'.log',worker_env)
  assert list(temporary.iterdir())==[],'Worker scratch/profile directory remains';temporary.rmdir();temporary_state.update(removed=True,removedAt=stamp());dump()
  raw=output.read_bytes();packet=json.loads(raw)
  assert packet['complete'] and packet['sourceVerified'] and packet['cleanupVerified'] and not packet.get('failure') and not packet.get('finalGuardFailure')
  assert packet['source']['commit']==prep['arms'][arm]['commit'] and packet['source']['fingerprint']==sources[arm]['fingerprint']
  assert packet['mode']=='diagnostic-shape-counts-and-scalar-receipts' and packet['node']==prep['node']
  for binding in packet['bindings']:
   assert binding['sha256']==prep['bindings'][binding['path']] and binding['bytes']==prep['byteSizes'][binding['path']]
  assert len(packet['bindings'])==6 and packet['protocol']==(arm=='candidate')
  assert len(packet['checks'])==1 and all(r['passed'] for r in packet['checks']) and not packet['errors'] and not packet['unexpected'] and not packet['cleanupFailures']
  assert packet['cleanup']['browser']['processExitVerified'] and packet['cleanup']['browser']['temporaryDirectoryRemoved'] and packet['cleanup']['fixture']['complete']
  assert packet['browser']['product']=='HeadlessChrome/138.0.7204.0' and packet['browser']['revision']=='@d5de512dc9dc8ddfe4e6d71b0637578bb6158683' and packet['browser']['jsVersion']=='13.8.258'
  assert packet['fixture']['pilots']==2 and packet['fixture']['rowsPerLargeDataset']==10000 and packet['fixture']['namesJsonBytes']==550001
  assert packet['provider']==[] and packet['clockLedger']==[]
  assert [r['label'] for r in packet['phases']]==['initial-overview-bootstrap','assets-first-open']
  for phase in packet['phases']:
   assert phase['after']['receipts']['dropped']==0
   for key in ['searchRows','numberFormat','dateFormat']:
    assert isinstance(phase['delta'][key],int) and phase['delta'][key]>=0
   for count in phase['delta']['map'].values():
    assert all(isinstance(value,int) and value>=0 for value in count.values())
  assert packet['afterRowAssertion']['receipts']['dropped']==0
  if packets:assert packet['fixture']==packets[0]['fixture']
  verify(arm,label+'-after');guard();packets.append(packet);report['workers'].append({'arm':arm,'filename':output.name,'bytes':len(raw),'sha256':sha(raw),'phaseCounts':[{'label':p['label'],'delta':p['delta']} for p in packet['phases']],'sourceFingerprint':sources[arm]['fingerprint'],'cleanupVerified':True,'temporaryRoot':str(temporary)});dump();print('DONE',label,flush=True)
 assert len(report['workers'])==2;report['fixtureAndProviderParity']=True;report['complete']=True
except BaseException as error:report['failure']=repr(error);report['complete']=False;raise
finally:
 report['finalGuards']=[]
 checks=[('bound-harness-inputs-browser',guard),('removed-worker-temporary-roots',temporary_paths_absent)]
 for arm in sources:checks.append((arm+'-full-source-assets',lambda arm=arm:verify(arm,arm+'-final',final=True)))
 checks.append(('bound-harness-inputs-browser-after-verification',guard));checks.append(('removed-worker-temporary-roots-after-verification',temporary_paths_absent))
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
