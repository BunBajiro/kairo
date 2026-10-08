"""Existing correctness fixtures on one frozen merged build; no build or performance matrix."""
from pathlib import Path
import argparse,datetime,fcntl,hashlib,json,os,signal,subprocess,sys,time
HERE=Path(__file__).resolve().parent
ANALYSIS=HERE.parents[6]
parser=argparse.ArgumentParser()
for name in ['root','commit','prebuild','built','output']:parser.add_argument('--'+name,required=True)
args=parser.parse_args();root=Path(args.root).resolve();out=Path(args.output).resolve();out.mkdir(exist_ok=False)
prepath=Path(args.prebuild).resolve();builtpath=Path(args.built).resolve()
sha=lambda b:hashlib.sha256(b).hexdigest()
stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report={'schemaVersion':2,'purpose':'Final merged frontend correctness only','startedAt':stamp(),'complete':False,'performanceAcceptance':False,'releaseReady':False,'root':str(root),'expectedCommit':args.commit,'runs':[],'workers':[],'inputs':{'prebuild':{'path':str(prepath)},'built':{'path':str(builtpath)}},'limitations':['SIGKILL or host loss cannot guarantee final receipts; atomically saved progress and existing raw files remain.']}
lock=None;source=None;prep=None;interrupted=[]
CHROME=Path('/tmp/kairo-chrome-runtime/chromium')
BROWSER={'product':'HeadlessChrome/138.0.7204.0','protocolVersion':'1.3','revision':'@d5de512dc9dc8ddfe4e6d71b0637578bb6158683','jsVersion':'13.8.258'}
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
def members(group):
 rows=[]
 for directory in Path('/proc').iterdir():
  if not directory.name.isdigit():continue
  try:fields=(directory/'stat').read_text().rsplit(')',1)[1].split()
  except (FileNotFoundError,ProcessLookupError):continue
  if int(fields[2])==group:rows.append({'pid':int(directory.name),'state':fields[0]})
 return sorted(rows,key=lambda row:row['pid'])
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
 signals_before=len(interrupted);child=None
 row={'command':command,'cwd':str(cwd),'start':stamp(),'log':log,'state':'starting','cleanupFailures':[]};report['runs'].append(row);dump()
 try:
  with (out/log).open('xb') as file:
   try:
    child=subprocess.Popen(command,cwd=cwd,env=env,stdout=file,stderr=subprocess.STDOUT,start_new_session=True)
    row.update(pid=child.pid,processGroup=child.pid,state='running');dump()
    while child.poll() is None:
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
 assert prep is not None,'Preparation/input validation did not complete'
 assert sha((HERE/'PREPARED.json').read_bytes())==report['preparationSha256']
 assert sha(CHROME.read_bytes())==prep['chromeSha256']
 assert all(sha((HERE/path).resolve().read_bytes())==digest for path,digest in prep['harnesses'].items())
 assert all(sha((root/path).read_bytes())==digest for path,digest in prep['acceptedFiles'].items())
 assert sha(prepath.read_bytes())==report['inputs']['prebuild']['sha256'] and sha(builtpath.read_bytes())==report['inputs']['built']['sha256']

def verify(label,final=False):command(['node',str(HERE/'capture-source.mjs'),'verify',str(builtpath)],ANALYSIS,label+'.log',final=final)
try:
 prep=json.loads((HERE/'PREPARED.json').read_text());report['harnesses']=prep['harnesses'];report['preparationSha256']=sha((HERE/'PREPARED.json').read_bytes())
 for label,path in [('prebuild',prepath),('built',builtpath)]:report['inputs'][label]['sha256']=sha(path.read_bytes())
 dump()
 assert os.environ.get('KAIRO_FINAL_FRONTEND_GRANTED')=='1','Coordinator runtime grant required'
 assert len(args.commit)==40 and all(c in '0123456789abcdef' for c in args.commit)
 lock=open('/tmp/kairo-performance.lock','a')
 while True:
  check_interruption()
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);break
  except BlockingIOError:time.sleep(.1)
 guard()
 pre=json.loads(prepath.read_text());source=json.loads(builtpath.read_text())
 for manifest in [pre,source]:assert manifest['root']==str(root) and manifest['sourceCommit']==args.commit and not manifest['dirty'] and manifest['status']==''
 assert not pre['builtFiles'],'Prebuild manifest must precede a fresh compiled output'
 assert source['builtFiles'] and source['files']==pre['files']
 report['sourceFingerprint']=source['fingerprint'];report['sourceFileCount']=len(source['files']);report['builtFileCount']=len(source['builtFiles'])
 (out/'input-prebuild.json').write_bytes(prepath.read_bytes());(out/'input-built.json').write_bytes(builtpath.read_bytes())
 verify('source-initial');guard()
 jobs=[('assets','assets-semantics.mjs',31,'diagnostic-counts',[]),('names-core','names-protocol.mjs',10,'diagnostic-browser',[]),('names-races','names-races.mjs',10,'compiled-race-diagnostics',[]),('clock','../frontend-clock/compiled-clock-trial.mjs',13,'correctness',['correctness']),('focus','focus-browser.mjs',25,'full',[])]
 env=dict(os.environ,KAIRO_MODELS_LOCKED='1',KAIRO_CHROME_PATH=str(CHROME),LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime',KAIRO_MODEL_ROWS='10000',KAIRO_ARCHIVE_LOCKED='1')
 for label,worker,expected_checks,mode,flags in jobs:
  verify(label+'-before');guard();output=out/(label+'.json');print('START',label,flush=True)
  command(['node',str((HERE/worker).resolve()),str(root),str(output),str(builtpath),*flags],root,label+'.log',env)
  raw=output.read_bytes();data=json.loads(raw)
  assert data['complete'] and data['sourceVerified'] and data['cleanupVerified'] and not data.get('failure')
  if label=='focus':assert data['sourceFingerprint']==source['fingerprint']
  else:assert data['source']['commit']==args.commit and data['source']['fingerprint']==source['fingerprint']
  assert data['mode']==mode and data['harnessSha256']==prep['harnesses'][worker]
  assert len(data['checks'])==expected_checks and all(row['passed'] for row in data['checks']) and not data['errors']
  browser=data['environment']['browser'] if label=='clock' else data['browser'];assert all(browser[k]==v for k,v in BROWSER.items())
  assert not data.get('external',[]) and not data.get('unexpected',[]) and not data.get('cleanupFailures',[])
  if label.startswith('names-'):
   assert data['protocol'] is True and data['fixtureHarnessSha256']==prep['harnesses']['browser-fixture.mjs']
   assert data['fixture']['rowsPerLargeDataset']==10000 and data['fixture']['namesJsonBytes']==550001
  if label=='names-core':
   phase=next(r for r in data['samples'] if r['label']=='assets-actual-core-20-wallet-events');packets=phase['wire'];snapshots=[r for r in packets if r['type']=='snapshot']
   assert len(snapshots)==20 and all(r['key']=='wallet' and r['characterId']==42 and r['value']==110000+i and r['namesCount']==0 and r['namesRevision'] for i,r in enumerate(snapshots))
   assert not any(r['type']=='names' for r in packets) and data['receiverCompletion']['after']-data['receiverCompletion']['before']==20
   assert len(data['provider'])==26 and len(data['clockLedger'])==26
   report['unchangedNamesWire']={'snapshots':20,'snapshotJsonBytes':sum(r['bytes'] for r in snapshots),'fullDirectories':0,'completion':data['receiverCompletion']}
  if label=='focus':assert data['reportFocusAcceptance'] and data['namingFocusAcceptance'] and not data['adjacentFindings'] and len(data['namingControls'])==2 and all(r['sameOpener'] for r in data['namingControls'])
  if label=='assets':assert data['baseline'] is False and data['fixture']['rowsPerLargeDataset']==10000 and not data['samples']
  if label=='clock':
   assert len(data['samples'])==24 and data['helperSha256']==prep['harnesses']['../frontend-clock/chrome-strict.mjs']
   positions={str(s['nodes']):s['actionResult'] for s in data['samples'] if s['label']=='native-node-drag-save'}
   assert positions==prep['clockDragPositions']
   built={r['path']:r['sha256'] for r in source['builtFiles']}
   for script in data['scripts']:
    assert script['sha256']==built['dist/client/assets/'+script['url'].split('/assets/',1)[-1]]
    assert sha((out/script['path']).read_bytes())==script['sha256']
  verify(label+'-after');guard();report['workers'].append({'label':label,'filename':output.name,'sha256':sha(raw),'checks':expected_checks,'mode':mode,'cleanupVerified':True});dump();print('DONE',label,flush=True)
 report['complete']=True;report['totalChecks']=sum(r['checks'] for r in report['workers']);assert report['totalChecks']==89
except BaseException as error:report['failure']=repr(error);report['complete']=False;raise
finally:
 report['finalGuards']=[]
 for label,check in [('harness-inputs-source-hashes',guard),('full-source-assets',lambda:verify('source-final',final=True) if source is not None else (_ for _ in ()).throw(RuntimeError('No validated final source manifest')))]:
  try:check();report['finalGuards'].append({'label':label,'passed':True})
  except BaseException as error:report['finalGuards'].append({'label':label,'passed':False,'failure':repr(error)});report['complete']=False
 report['finalGuardsVerified']=all(row['passed'] for row in report['finalGuards'])
 if interrupted:report['interruptedSignals']=interrupted;report['complete']=False
 report['artifacts']=[]
 try:
  for path in sorted(out.rglob('*')):
   if path.is_file() and path.name not in ('progress.json','completed.json'):
    data=path.read_bytes();report['artifacts'].append({'path':str(path.relative_to(out)),'bytes':len(data),'sha256':sha(data)})
 except BaseException as error:report['artifactReceiptFailure']=repr(error);report['complete']=False
 report['endedAt']=stamp();dump();save(out/'completed.json',report)
 if lock is not None:lock.close()
 if not report['complete']:sys.exit(1)
