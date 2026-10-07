"""Each measurement owns the shared host timing lock; fresh DB per arm."""
import os,subprocess,json,pathlib,datetime
ROOT=pathlib.Path('/workspace/scratch/a2f3334402fc'); H=ROOT/'kairo-analysis-restored/analysis/rc17/completion/session-replay'; O=H/'timed-20261007'; O.mkdir(exist_ok=True)
manifest={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lock':'/tmp/kairo-performance.lock','order':['baseline','candidate','candidate','baseline'],'runs':[]}
if (O/'manifest.json').exists():
 manifest=json.loads((O/'manifest.json').read_text());manifest['resumedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(script,name,repo,extra):
 if any(r['name']==name and r['status']==0 for r in manifest['runs']): return
 for suffix in ['.json','.log']:
  p=O/(name+suffix)
  if p.exists(): p.rename(O/(name+'.interrupted-freeze'+suffix))
 env=dict(os.environ,KAIRO_BENCH_REPO=str(repo),KAIRO_BENCH_SOURCE_COMMIT='c954c0d808847f249df0659ed15fdce2e89f84c4'+('-minus-S3-R1' if 'baseline' in repo.name else ''),KAIRO_SESSION_OUTPUT=str(O/(name+'.json')),**extra)
 print('START',name,flush=True)
 with open(O/(name+'.log'),'w') as log: status=subprocess.call(['flock','/tmp/kairo-performance.lock','node',str(H/script)],env=env,stdout=log,stderr=subprocess.STDOUT)
 manifest['runs'].append({'name':name,'repo':str(repo),'status':status,'extra':extra}); (O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print('END',name,status,flush=True)
 if status: raise SystemExit(status)
for archived in [100,1000,10000]:
 for pilots in [1,4]:
  for i,arm in enumerate(manifest['order']):
   run('index-write-trial.mjs',f'write-{archived}-{pilots}-{i+1}-{arm}',ROOT/'kairo-backend-session-frozen-c954',{'KAIRO_SESSION_INDEX':arm,'KAIRO_SESSION_ARCHIVED':str(archived),'KAIRO_SESSION_PILOTS':str(pilots)})
for archived,pilots in [(100,1),(10000,4)]:
 for i,arm in enumerate(manifest['order']):
  repo=ROOT/('kairo-session-replay-baseline-c954' if arm=='baseline' else 'kairo-backend-session-frozen-c954')
  run('eligibility-workload.mjs',f'cadence-{archived}-{pilots}-{i+1}-{arm}',repo,{'KAIRO_SESSION_ARCHIVED':str(archived),'KAIRO_SESSION_PILOTS':str(pilots)})
manifest['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat(); (O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
