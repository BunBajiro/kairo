import datetime,hashlib,json,pathlib,subprocess,os,sys
here=pathlib.Path(__file__).resolve().parent;analysis=here.parents[5];base=analysis.parent;output=here/(sys.argv[1] if len(sys.argv)>1 else 'attempt1');output.mkdir(exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
roots={'baseline':base/'kairo-m7-9afa-baseline','trial':base/'kairo-m7-9afa-isolated'};proposal=json.load(open(here/'proposal-files.json'));report={'complete':False,'productionAcceptance':False,'startedAt':now(),'baselineCommit':proposal['baseCommit'],'commands':[],'runs':[],'harnessSha256':sha(pathlib.Path(__file__).read_bytes())}
def dump(): (output/'progress.json').write_text(json.dumps(report,indent=2)+'\n')
def call(command,cwd,log,env=None):
 started=now()
 with log.open('xb') as f:r=subprocess.run(command,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 rec={'command':command,'cwd':str(cwd),'startedAt':started,'completedAt':now(),'exitCode':r.returncode,'log':str(log),'logSha256':sha(log.read_bytes())};report['commands'].append(rec);dump();assert r.returncode==0,rec;return rec
try:
 for kind,root in roots.items():
  assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==proposal['baseCommit']
  for row in proposal['files']:
   p=root/row['path'];actual=sha(p.read_bytes()) if p.exists() else None;assert actual==row['baselineSha256' if kind=='baseline' else 'trialSha256']
  folder=output/kind;folder.mkdir();before=folder/'before-source.json';call(['node',str(here/'capture-source.mjs'),str(root),str(before)],analysis,folder/'capture-before.log')
  if kind=='trial':
   tests=['universe-map-layouts','universe-map-math','universe-map-operations','universe-map-navigation','universe-schematic-layout','session-replay','session-replay-sovereignty','session-replay-timeline'];call(['node','--test','--test-concurrency=1']+['tests/kairo/'+p+'.test.mjs' for p in tests],root,folder/'tests.log');call(['npm','run','check:kairo'],root,folder/'types.log')
  assert not (root/'dist').exists(),'fresh build required'
  build=call(['npm','run','build'],root,folder/'build.log');after=folder/'source.json';call(['node',str(here/'capture-source.mjs'),str(root),str(after)],analysis,folder/'capture-after.log');a=json.load(open(before));b=json.load(open(after));assert a['files']==b['files'];assert b['builtFiles']
  receipt={'sourceFingerprint':b['fingerprint'],'exitCode':0,'buildCommand':'npm run build','completedAt':build['completedAt'],'logSha256':build['logSha256'],'buildLog':build['log'],'sourceManifest':str(after)};(folder/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 for kind,root in roots.items():
  folder=output/kind;env={**os.environ,'KAIRO_CHROME_PATH':'/tmp/kairo-chrome-runtime/chromium','KAIRO_BENCH_REPO':str(root),'KAIRO_BROWSER_OUTPUT':str(folder/'browser'),'KAIRO_BROWSER_PORT':'18934','KAIRO_BUILD_RECEIPT':str(folder/'build-receipt.json')};call(['node','analysis/rc17/completion/atlas/lazy-browser.mjs'],analysis,folder/'browser.log',env);r=json.load(open(folder/'browser/result.json'));assert r['complete'] and r['sourceVerified'] and r['cleanupVerified'];report['runs'].append({'kind':kind,'sourceFingerprint':r['sourceFingerprint'],'resultSha256':sha((folder/'browser/result.json').read_bytes()),'snapshots':r['snapshots'],'radar':r['radar'],'checks':r['checks']});dump()
 a,b=report['runs'];assert a['snapshots']==b['snapshots'], 'compiled Canvas snapshots differ';assert a['radar']==b['radar'];report['exactSnapshotPairs']=len(a['snapshots']);report['exactRadarPairs']=len(a['radar']);report['complete']=True;report['endedAt']=now();(output/'completed.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'complete':True,'snapshotPairs':report['exactSnapshotPairs'],'output':str(output)}))
except BaseException as e:report['failure']=repr(e);raise
finally:dump()
