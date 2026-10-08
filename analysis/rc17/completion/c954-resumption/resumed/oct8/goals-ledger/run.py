#!/usr/bin/env python3
"""Four fresh current-source absolute-cost runs. Coordinator must grant the slot."""
import datetime, fcntl, hashlib, json, os, pathlib, statistics, subprocess, sys, time

here=pathlib.Path(__file__).resolve().parent
manifest=json.loads((here/'source-manifest.json').read_text())
repo=pathlib.Path(manifest['sourceRoot']); original=pathlib.Path(manifest['harness']['path'])
attempt=here/(sys.argv[1] if len(sys.argv)>1 else 'attempt-1')
assert attempt.parent==here and not attempt.exists(), 'Use a fresh simple attempt directory'
attempt.mkdir()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(name,value):(attempt/name).write_text(json.dumps(value,indent=2)+'\n')
harnesses={str(path):sha(path) for path in [here/'run.py',here/'query-plans.mjs',original,here/'source-manifest.json']}
def guard():
    for entry in manifest['files']:
        assert sha(repo/entry['path'])==entry['sha256'], 'Source changed: '+entry['path']
    for path,digest in harnesses.items():assert sha(pathlib.Path(path))==digest, 'Harness changed: '+path
    assert sha(original)==manifest['harness']['sha256']
    return {'at':now(),'files':len(manifest['files']),'sourceVerified':True,'harnessVerified':True}
progress={'startedAt':now(),'sourceCommit':manifest['commit'],'ordinaryRuns':4,'comparison':'absolute-current-source-cost','historicalTimingPooled':False,'runs':[],'complete':False}
save('progress.json',progress);save('harnesses.json',harnesses)
locks=[]
try:
    for path in ['/tmp/kairo-performance.lock','/tmp/kairo-rc16-benchmark.lock']:
        handle=open(path,'w');fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(handle)
    progress['initialGuard']=guard();save('progress.json',progress)
    for index in range(1,5):
        name=f'goals-{index}'; output=attempt/(name+'.json'); log=attempt/(name+'.log')
        env={**os.environ,'KAIRO_BENCH_REPO':str(repo),'KAIRO_BENCH_SOURCE_COMMIT':manifest['commit'],'KAIRO_DECISION_TIMED':'1','KAIRO_DECISION_OUTPUT':str(output)}
        started=now();t=time.monotonic()
        with log.open('wb') as stream:result=subprocess.run(['node',str(original)],cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=180)
        record={'name':name,'startedAt':started,'wallSeconds':time.monotonic()-t,'exitCode':result.returncode,'logSha256':sha(log),'guard':guard()}
        if output.exists():record['outputSha256']=sha(output)
        progress['runs'].append(record);save('progress.json',progress)
        assert result.returncode==0, 'Failed '+name
        raw=json.loads(output.read_text());assert raw['sourceCommit']==manifest['commit'] and raw['harnessSha256']==manifest['harness']['sha256']
        assert raw['kind']=='ordinary-goal-ledger-timings'
        for file,digest in raw['sourceHashes'].items():assert digest==next(e['sha256'] for e in manifest['files'] if e['path']==file)
    output=attempt/'query-plans.json';log=attempt/'query-plans.log'
    env={**os.environ,'KAIRO_BENCH_REPO':str(repo),'KAIRO_BENCH_SOURCE_COMMIT':manifest['commit'],'KAIRO_DECISION_OUTPUT':str(output)}
    with log.open('wb') as stream:result=subprocess.run(['node',str(here/'query-plans.mjs')],cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=60)
    progress['queryPlans']={'exitCode':result.returncode,'logSha256':sha(log),'guard':guard()};save('progress.json',progress)
    assert result.returncode==0
    raw=[json.loads((attempt/f'goals-{i}.json').read_text()) for i in range(1,5)]
    rows=[]
    def bounds(values):return {'min':min(values),'median':statistics.median(values),'max':max(values),'all':values}
    for index,retained in enumerate([100,10000,100000]):
        cases=[run['cases'][index] for run in raw]
        assert all(c['retained']==retained and c['unchanged']['loops']==100 and c['unchanged']['databaseWrites']==0 and c['publishedEvents']==0 for c in cases)
        assert len({c['ledgerSha256'] for c in cases})==1
        assert all(c['after']=={'progress':retained+52,'rows':retained+10,'total':retained+52} for c in cases)
        rows.append({'retained':retained,'unchangedMsPerRefresh':bounds([c['unchanged']['elapsedMs']/100 for c in cases]),'changedMs':bounds([c['addition']['elapsedMs'] for c in cases]),'unchangedCpuMsPerRefresh':bounds([(c['unchanged']['cpu']['user']+c['unchanged']['cpu']['system'])/1000/100 for c in cases]),'ledgerSha256':cases[0]['ledgerSha256'],'semanticParity':True})
    save('summary.json',{'sourceCommit':manifest['commit'],'kind':'four-fresh-process-absolute-cost','historicalTimingPooled':False,'runs':4,'cases':rows,'decision':'pending-independent-assessment','releaseReady':False})
    progress.update({'complete':True,'completedAt':now(),'finalGuard':guard(),'outputs':{p.name:sha(p) for p in sorted(attempt.glob('*.json')) if p.name not in ['progress.json','completed.json']},'releaseReady':False})
    save('completed.json',progress);save('progress.json',progress)
    print(json.dumps({'complete':True,'attempt':str(attempt),'runs':4}))
except BaseException as error:
    progress.update({'complete':False,'failedAt':now(),'error':str(error)})
    save('failure.json',progress);raise
finally:
    for handle in reversed(locks):fcntl.flock(handle,fcntl.LOCK_UN);handle.close()
