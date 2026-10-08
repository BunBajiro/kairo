from pathlib import Path
import datetime,fcntl,hashlib,json,os,subprocess,sys
HERE=Path(__file__).resolve().parent
ANALYSIS=HERE.parents[6]
WORK=ANALYSIS.parent
COMMIT='a7b1bf97b0073695926c443e52d523638e59e48d'
ROOTS={'baseline':WORK/'kairo-frontend-scene-a7-oct8','candidate':WORK/'kairo-frontend-clock-a7-candidate'}
CHROME=Path('/tmp/kairo-chrome-runtime/chromium')
CHROME_SHA='7ddc6837ec0e0c9ff488cf8c8fa64d8eef71cc3fa7c79752c52367bddbfe94dd'
BROWSER={'product':'HeadlessChrome/138.0.7204.0','protocolVersion':'1.3','revision':'@d5de512dc9dc8ddfe4e6d71b0637578bb6158683','jsVersion':'13.8.258'}
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
PREP=json.loads((HERE/'prepared.json').read_text())
OUT=HERE/(sys.argv[1] if len(sys.argv)>1 else 'attempt1');OUT.mkdir(exist_ok=False)
report={'commit':COMMIT,'startedAt':now(),'complete':False,'releaseReady':False,'cleanupVerified':False,'commands':[],'workers':[],'order':['baseline','candidate','candidate','baseline'],'browserPin':{'sha256':CHROME_SHA,'cdp':BROWSER},'baselineBuild':'Reused independently frozen fresh-a7 frontend-scene diagnostic build; full fingerprint is verified before/after.'}
harnesses=['run.py','compiled-clock-trial.mjs','chrome-strict.mjs','capture-source.mjs'];report['harnesses']={p:sha((HERE/p).read_bytes()) for p in harnesses}
def dump(): (OUT/'progress.json').write_text(json.dumps(report,indent=2)+'\n')
def command(args,cwd,log,env=None):
 start=now()
 with (OUT/log).open('xb') as file:p=subprocess.run(args,cwd=cwd,stdout=file,stderr=subprocess.STDOUT,env=env)
 report['commands'].append({'args':args,'cwd':str(cwd),'startedAt':start,'endedAt':now(),'exitCode':p.returncode,'log':log,'logSha256':sha((OUT/log).read_bytes())});dump();assert p.returncode==0,report['commands'][-1]
def capture(root,name):
 file=OUT/name;command(['node',str(HERE/'capture-source.mjs'),'capture',str(root),str(file)],ANALYSIS,name+'.log');return file,json.loads(file.read_text())
def verify(file,label):command(['node',str(HERE/'capture-source.mjs'),'verify',str(file)],ANALYSIS,label+'.log')
lock_handle=None
def guard():
 assert sha(CHROME.read_bytes())==CHROME_SHA
 assert report['harnesses']==PREP['harnesses']
 assert all(sha((HERE/p).read_bytes())==h for p,h in report['harnesses'].items())
 assert all(sha((ROOTS['candidate']/r['path']).read_bytes())==r['sha256'] for r in PREP['files'])
try:
 assert os.environ.get('KAIRO_CLOCK_GRANTED')=='1','Coordinator runtime grant is required'
 lock_handle=open('/tmp/kairo-performance.lock','w')
 fcntl.flock(lock_handle,fcntl.LOCK_EX);guard()
 prior=HERE.parent/'frontend-scene/attempt1/source.json';verify(prior,'baseline-original-verify')
 baseline_path,baseline=capture(ROOTS['baseline'],'baseline-source.json');assert baseline['fingerprint']==json.loads(prior.read_text())['fingerprint'] and baseline['status']=='' and baseline['sourceCommit']==COMMIT
 prepath,pre=capture(ROOTS['candidate'],'candidate-prebuild.json');assert pre['sourceCommit']==COMMIT and pre['dirty'] and not pre['builtFiles']
 expected_status=''.join(' M '+r['path']+'\n' for r in PREP['files']);assert pre['status']==expected_status
 a={r['path']:r for r in baseline['files']};b={r['path']:r for r in pre['files']};assert a.keys()==b.keys() and sorted(p for p in a if a[p]!=b[p])==sorted(r['path'] for r in PREP['files'])
 for file in ['compiled-clock-trial.mjs','chrome-strict.mjs']:command(['node','--check',str(HERE/file)],ANALYSIS,file+'.syntax.log')
 command(['node','--test','tests/kairo/jspace-clock.test.mjs','tests/kairo/jspace-workspace-model.test.mjs','tests/kairo/map-display-model.test.mjs','tests/kairo/scoped-refresh.test.mjs'],ROOTS['candidate'],'targeted-tests.log')
 command(['npm','run','check:kairo'],ROOTS['candidate'],'candidate-types.log');command(['npm','run','build'],ROOTS['candidate'],'candidate-build.log')
 candidate_path,candidate=capture(ROOTS['candidate'],'candidate-source.json');assert candidate['files']==pre['files'] and candidate['status']==expected_status and candidate['builtFiles']
 manifests={'baseline':baseline_path,'candidate':candidate_path};sources={'baseline':baseline,'candidate':candidate};report['fingerprints']={a:s['fingerprint'] for a,s in sources.items()};dump()
 jobs=[('candidate-correctness','candidate','correctness')]+[(f'ordinary-{i}-{arm}',arm,'ordinary')for i,arm in enumerate(report['order'],1)]
 for name,arm,mode in jobs:
  guard();verify(manifests[arm],name+'-before');print('START',name,flush=True)
  output=OUT/(name+'.json');env=dict(os.environ,KAIRO_MODELS_LOCKED='1',KAIRO_CHROME_PATH=str(CHROME),LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime')
  command(['node',str(HERE/'compiled-clock-trial.mjs'),str(ROOTS[arm]),str(output),str(manifests[arm]),mode],ANALYSIS,name+'.log',env)
  raw=output.read_bytes();result=json.loads(raw)
  assert result['complete'] and result['sourceVerified'] and result['cleanupVerified'] and not result.get('failure')
  assert result['mode']==mode and result['harnessSha256']==report['harnesses']['compiled-clock-trial.mjs'] and result['helperSha256']==report['harnesses']['chrome-strict.mjs']
  assert result['source']['fingerprint']==sources[arm]['fingerprint'] and all(result['environment']['browser'][k]==v for k,v in BROWSER.items())
  assert not result['errors'] and not result['external'] and all(c['passed'] for c in result['checks']) and len(result['checks'])==13
  assert len(result['samples'])==24 and all(sum(s['nodes']==n for s in result['samples'])==12 for n in [100,600])
  built={p['path']:p['sha256'] for p in sources[arm]['builtFiles']}
  for script in result['scripts']:
   suffix=script['url'].split('/assets/',1)[-1];assert script['sha256']==built['dist/client/assets/'+suffix]
   artifact=OUT/script['path'];assert sha(artifact.read_bytes())==script['sha256']
  for sample in result['samples']:assert sample['observed']['nodes']==sample['nodes'] and sample['taskMs']>=0 and not sample.get('failure')
  positions={str(sample['nodes']):sample['actionResult'] for sample in result['samples'] if sample['label']=='native-node-drag-save'}
  assert len(positions)==2 and all(p['beforePosition']!=p['afterPosition'] for p in positions.values())
  if 'dragPositions' in report:assert positions==report['dragPositions'],{'expected':report['dragPositions'],'actual':positions}
  else:report['dragPositions']=positions
  verify(manifests[arm],name+'-after');guard();report['workers'].append({'name':name,'arm':arm,'mode':mode,'sha256':sha(raw),'checks':len(result['checks']),'samples':len(result['samples']),'cleanupVerified':True,'sourceVerified':True});dump();print('DONE',name,flush=True)
 report['cleanupVerified']=all(r['cleanupVerified'] for r in report['workers']);report['complete']=True
except BaseException as error:report['failure']=repr(error);raise
finally:
 try:
  guard()
  for arm,path in locals().get('manifests',{}).items():verify(path,arm+'-final')
  for arm,root in ROOTS.items():
   _,final=capture(root,arm+'-final-source.json')
   expected=locals().get('baseline') if arm=='baseline' else locals().get('pre')
   if expected:assert final['files']==expected['files'] and final['sourceCommit']==COMMIT and final['status']==expected['status']
  report['finalGuardsVerified']=True
 except BaseException as error:
  report['finalGuardFailure']=repr(error);report['complete']=False
 report['endedAt']=now();dump();(OUT/'completed.json').write_text(json.dumps(report,indent=2)+'\n')
 if lock_handle is not None:lock_handle.close()
 if not report['complete']:sys.exit(1)
