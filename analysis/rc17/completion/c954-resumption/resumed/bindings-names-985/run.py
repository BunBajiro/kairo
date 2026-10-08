"""Current-source bindings/names lane; coordinator grants exclusive runtime first."""
import datetime, fcntl, hashlib, json, os, pathlib, subprocess, sys
HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path('/workspace/scratch/a2f3334402fc')
SHA='985a6c17d466d01f1f098a1704de68f6eae5f6e6'
mode=sys.argv[1];assert mode in ['counts-baseline','counts-candidate','abba','tests']
OUT=HERE/sys.argv[2];OUT.mkdir(exist_ok=False)
roots={arm:ROOT/('kairo-bindings-985-'+arm) for arm in ['baseline','candidate']}
hash=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def source(root):
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert head==SHA
    paths=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).decode().split('\0')
    files={p:{'sha256':hash(root/p),'bytes':(root/p).stat().st_size} for p in sorted(set(filter(None,paths)))}
    return {'head':head,'root':str(root),'status':subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=root,text=True),'files':files}
sources={arm:source(root) for arm,root in roots.items()};assert not sources['baseline']['status']
for arm,packet in sources.items():(OUT/(arm+'-source.json')).write_text(json.dumps(packet,indent=2)+'\n')
harnesses={p.name:hash(p) for p in [HERE/'diagnostic.mjs',HERE/'run.py',HERE/'run-config.json']}
helper=HERE.parents[3]/'harness/source-manifest.mjs';harnesses['source-manifest.mjs']=hash(helper)
config=json.loads((HERE/'run-config.json').read_text())
record={'mode':mode,'sourceCommit':SHA,'harnesses':harnesses,'fixtureNow':config['fixtureNow'],'complete':False,'sourceVerified':False,'runs':[],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def save():(OUT/'receipt.json').write_text(json.dumps(record,indent=2)+'\n')
def verify():
    for arm,root in roots.items():assert source(root)==sources[arm],arm
    for name,digest in harnesses.items():assert hash(helper if name=='source-manifest.mjs' else HERE/name)==digest,name
save()
try:
    with open('/tmp/kairo-performance.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX);verify()
        if mode=='tests':
            command=['node','--test','--test-concurrency=1',*[f'tests/kairo/{name}.test.mjs' for name in ['core-hidden-bindings','stream-projections','sse','stream-shutdown','core-idle-protection','lifecycle']]]
            with open(OUT/'tests.log','w') as log:tested=subprocess.run(command,cwd=roots['candidate'],stdout=log,stderr=subprocess.STDOUT)
            record['runs'].append({'name':'targeted-tests','command':command,'exitCode':tested.returncode,'logSha256':hash(OUT/'tests.log')});save();assert tested.returncode==0
        runs=[] if mode=='tests' else [('baseline-counts','baseline',False)] if mode=='counts-baseline' else [('candidate-counts','candidate',False)] if mode=='counts-candidate' else [(str(i+1)+'-'+arm,arm,True) for i,arm in enumerate(['baseline','candidate','candidate','baseline'])]
        for name,arm,timed in runs:
            env=dict(os.environ,KAIRO_BENCH_REPO=str(roots[arm]),KAIRO_BENCH_SOURCE_COMMIT=SHA,KAIRO_ALLOW_DIRTY='1' if arm=='candidate' else '0',KAIRO_FIXTURE_NOW=str(config['fixtureNow']),KAIRO_DECISION_TIMED='1' if timed else '0',KAIRO_DECISION_OUTPUT=str(OUT/(name+'.json')))
            print('START',name,flush=True)
            with open(OUT/(name+'.log'),'w') as log:result=subprocess.run(['node',str(HERE/'diagnostic.mjs')],env=env,cwd=roots[arm],stdout=log,stderr=subprocess.STDOUT)
            row={'name':name,'arm':arm,'timed':timed,'exitCode':result.returncode,'logSha256':hash(OUT/(name+'.log'))}
            if (OUT/(name+'.json')).exists():row['resultSha256']=hash(OUT/(name+'.json'))
            record['runs'].append(row);save();assert result.returncode==0,row
            packet=json.loads((OUT/(name+'.json')).read_text());assert packet['complete'] and packet['sourceVerified'] and len(packet['cases'])==72
            assert packet['fixtureNow']==config['fixtureNow'];verify();print('END',name,flush=True)
        verify();record['complete']=True;record['sourceVerified']=True
except BaseException as error:record['error']=repr(error);raise
finally:record['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
