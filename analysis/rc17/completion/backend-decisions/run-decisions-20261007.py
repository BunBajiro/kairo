"""Serial immutable source ABBA; each process separately holds shared timing lock."""
import os, subprocess, json, pathlib, hashlib, datetime
ROOT=pathlib.Path('/workspace/scratch/a2f3334402fc')
OUT=ROOT/'kairo-analysis-restored/analysis/rc17/completion/backend-decisions/timed-20261007'
OUT.mkdir(exist_ok=True)
HARNESS=OUT.parent
NODE='/opt/node/bin/node'
if not pathlib.Path(NODE).exists(): NODE='node'
manifest={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'order':['baseline','candidate','candidate','baseline'],'lock':'/tmp/kairo-performance.lock','runs':[]}
if (OUT/'manifest.json').exists():
 manifest=json.loads((OUT/'manifest.json').read_text());manifest['resumedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(repo,script,name,extra):
    if any(r['name']==name and r['status']==0 for r in manifest['runs']): return
    for suffix in ['.json','.log']:
     p=OUT/(name+suffix)
     if p.exists(): p.rename(OUT/(name+'.interrupted-freeze'+suffix))
    source='c954c0d808847f249df0659ed15fdce2e89f84c4' if repo.name=='kairo-backend-session-frozen-c954' else subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    env=dict(os.environ,KAIRO_BENCH_REPO=str(repo),KAIRO_BENCH_SOURCE_COMMIT=source,KAIRO_DECISION_TIMED='1',KAIRO_DECISION_OUTPUT=str(OUT/(name+'.json')),**extra)
    command=['flock','/tmp/kairo-performance.lock',NODE,str(HARNESS/script)]
    print('START',name,flush=True)
    with open(OUT/(name+'.log'),'w') as log: status=subprocess.call(command,env=env,stdout=log,stderr=subprocess.STDOUT)
    manifest['runs'].append({'name':name,'source':source,'repo':str(repo),'status':status,'extra':extra})
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('END',name,status,flush=True)
    if status: raise SystemExit(status)
for wait in [0,50,200]:
    for i,arm in enumerate(manifest['order']):
        repo=ROOT/('kairo-enrichment-baseline-a27' if arm=='baseline' else 'kairo-enrichment-trial-a27')
        run(repo,'enrichment-trial.mjs',f'enrichment-delay{wait}-{i+1}-{arm}',{'KAIRO_ENRICHMENT_DELAY_MS':str(wait)})
for i in range(4):
    run(ROOT/'kairo-backend-session-frozen-c954','goals-ledger-trial.mjs',f'goals-{i+1}',{})
manifest['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
