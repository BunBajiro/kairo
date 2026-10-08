from pathlib import Path
import datetime,fcntl,hashlib,json,os,subprocess,sys

HERE=Path(__file__).resolve().parent
ANALYSIS=HERE.parents[6]
WORK=ANALYSIS.parent
SOURCE=WORK/'kairo-rc17-c954-continuation'
COMMIT='a7b1bf97b0073695926c443e52d523638e59e48d'
REPLAY='components/kairo/session-replay.tsx'
OLD_HASH='ebae48030dc69cbea81daaef2d091c0832e464adeaf9c06d3ddcd71dba4622a9'
WORKER_HASH='5c2e075f7c8cd7d1d427dcb49f9ccf64ec63bcdfdf43cbe13080d0dfa582c1ea'
CHROME=Path('/tmp/kairo-chrome-runtime/chromium')
CHROME_SHA256='7ddc6837ec0e0c9ff488cf8c8fa64d8eef71cc3fa7c79752c52367bddbfe94dd'
BROWSER={'product':'HeadlessChrome/138.0.7204.0','protocolVersion':'1.3','revision':'@d5de512dc9dc8ddfe4e6d71b0637578bb6158683','jsVersion':'13.8.258'}
OUT=HERE/(sys.argv[1] if len(sys.argv)>1 else 'attempt1')
OUT.mkdir(exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
report={'complete':False,'cleanupVerified':False,'finalAcceptance':False,'commit':COMMIT,'startedAt':now(),'runs':[],'order':['baseline','candidate','candidate','baseline'],'browserPin':{'path':str(CHROME),'sha256':CHROME_SHA256,'declaredExecutableVersion':'Chromium 138.0.7204.0','expectedCDP':BROWSER}}
harness_files=[HERE/'run.py',HERE/'capture-source.mjs',HERE/'compiled-replay-trial.mjs',ANALYSIS/'analysis/rc17/harness/source-manifest.mjs']
report['harnesses']={str(p.relative_to(ANALYSIS)):sha(p.read_bytes()) for p in harness_files}
def verify_harnesses():
    assert all(sha((ANALYSIS/p).read_bytes())==digest for p,digest in report['harnesses'].items())
def dump(): (OUT/'progress.json').write_text(json.dumps(report,indent=2)+'\n')
def command(args,cwd,log,env=None):
    start=now()
    with (OUT/log).open('xb') as f: p=subprocess.run(args,cwd=cwd,stdout=f,stderr=subprocess.STDOUT,env=env)
    row={'command':args,'cwd':str(cwd),'startedAt':start,'endedAt':now(),'exitCode':p.returncode,'log':log,'logSha256':sha((OUT/log).read_bytes())}
    report['runs'].append(row);dump();assert p.returncode==0,row
def capture(root,file):
    command(['node',str(HERE/'capture-source.mjs'),'capture',str(root),str(file)],ANALYSIS,file.name+'.log')
    source=json.loads(file.read_text());assert source['sourceCommit']==COMMIT and source['root']==str(root)
    return source
def verify(manifest,name):command(['node',str(HERE/'capture-source.mjs'),'verify',str(manifest)],ANALYSIS,name+'.log')
def check_source(source,arm):
    assert source['sourceCommit']==COMMIT
    assert source['status']==('' if arm=='candidate' else ' M '+REPLAY+'\n')
    assert source['dirty']==(arm=='baseline')
def profiles(raw,result,enabled):
    expected=[raw.name+'.'+name+'.cpuprofile' for name in ['replay-playback-start-60x','replay-playback-middle-60x']] if enabled else []
    assert sorted(p.name for p in OUT.glob(raw.name+'.*.cpuprofile'))==sorted(expected)
    records=result['profiles'];assert len(records)==len(expected)
    validated=[]
    for name,record in zip(expected,records):
        path=OUT/name;data=path.read_bytes();profile=json.loads(data)
        assert Path(record['path'])==path and record['sha256']==sha(data) and record['bytes']==len(data)
        assert profile['nodes'] and profile['samples'] and len(profile['samples'])==len(profile['timeDeltas'])
        assert profile['endTime']>profile['startTime'] and all(t>=0 for t in profile['timeDeltas'])
        ids={node['id'] for node in profile['nodes']};assert len(ids)==len(profile['nodes']) and all(i in ids for i in profile['samples'])
        assert record['nodes']==len(profile['nodes']) and record['samples']==len(profile['samples'])
        assert record['startTime']==profile['startTime'] and record['endTime']==profile['endTime']
        validated.append({'filename':name,'sha256':sha(data),'bytes':len(data),'nodes':len(profile['nodes']),'samples':len(profile['samples'])})
    return validated
try:
    assert os.environ.get('KAIRO_REPLAY_GRANTED')=='1','Coordinator runtime grant is required'
    with open('/tmp/kairo-performance.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        assert sha(CHROME.read_bytes())==CHROME_SHA256
        assert sha((HERE/'compiled-replay-trial.mjs').read_bytes())==WORKER_HASH
        old=(ANALYSIS/REPLAY).read_bytes();assert sha(old)==OLD_HASH
        roots={a:WORK/f'kairo-replay-{a}-a7-oct8' for a in ['baseline','candidate']}
        manifests={}
        for arm,root in roots.items():
            if root.exists():raise RuntimeError('Frozen root already exists; inspect before a new attempt: '+str(root))
            command(['git','worktree','add','--detach',str(root),COMMIT],SOURCE,arm+'-worktree.log')
            (root/'node_modules').symlink_to(SOURCE/'node_modules',target_is_directory=True)
            if arm=='baseline':(root/REPLAY).write_bytes(old)
            pre=capture(root,OUT/(arm+'-prebuild.json'))
            check_source(pre,arm);assert not pre['builtFiles'],'Fresh build root required'
            command(['npm','run','check:kairo'],root,arm+'-types.log')
            command(['npm','run','build'],root,arm+'-build.log')
            manifest=OUT/(arm+'-source.json');post=capture(root,manifest)
            check_source(post,arm)
            assert pre['files']==post['files'] and post['builtFiles']
            manifests[arm]=manifest
        a=json.loads(manifests['baseline'].read_text());b=json.loads(manifests['candidate'].read_text())
        fa={v['path']:v for v in a['files']};fb={v['path']:v for v in b['files']}
        assert fa.keys()==fb.keys() and [p for p in fa if fa[p]!=fb[p]]==[REPLAY]
        report['sources']={arm:json.loads(path.read_text())['fingerprint'] for arm,path in manifests.items()};dump()
        jobs=[]
        for case in ['repeat-small','repeat-cap','distinct-cap']:
            for i,arm in enumerate(report['order'],1):jobs.append((f'{case}-{i}-{arm}',arm,case,'none',False))
        for arm in roots:jobs.append(('distinct-cap-retention-'+arm,arm,'distinct-cap','focused',False))
        for arm in roots:jobs.append(('distinct-cap-profile-'+arm,arm,'distinct-cap','none',True))
        for name,arm,case,retention,profile in jobs:
            verify(manifests[arm],name+'-before')
            check_source(json.loads(manifests[arm].read_text()),arm)
            verify_harnesses()
            assert sha(CHROME.read_bytes())==CHROME_SHA256
            assert sha((HERE/'compiled-replay-trial.mjs').read_bytes())==WORKER_HASH
            env=dict(os.environ,KAIRO_CHROME_PATH=str(CHROME),LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime',KAIRO_BENCH_REPO=str(roots[arm]),KAIRO_BENCH_SOURCE_COMMIT=COMMIT+(' minus only R1 component' if arm=='baseline' else ''),KAIRO_REPLAY_CASE=case,KAIRO_REPLAY_RETENTION_MODE=retention,KAIRO_REPLAY_PROFILE='1' if profile else '0',KAIRO_FOLLOWUP_FRONTEND_OUTPUT=str(OUT/(name+'.json')))
            env.pop('KAIRO_FOLLOWUP_SMOKE',None);env.pop('KAIRO_REPLAY_SCHEMATIC',None)
            print('START',name,flush=True)
            command(['node',str(HERE/'compiled-replay-trial.mjs')],ANALYSIS,name+'.log',env)
            raw=OUT/(name+'.json');r=json.loads(raw.read_text())
            assert r.get('complete') is True and r.get('endedAt') and not r.get('failure') and r['errors']==[]
            assert r.get('cleanupVerified') is True and r['cleanup']['browserStarted'] and r['cleanup']['browserExited'] and r['cleanup']['appStarted'] and r['cleanup']['appClosed'] and r['cleanup']['scratchRemoved'] and not r['cleanup']['failures']
            assert r['cleanup']['exitCode'] is not None or r['cleanup']['signalCode'] is not None
            assert r['repo']==str(roots[arm]) and r['sourceCommit']==env['KAIRO_BENCH_SOURCE_COMMIT']
            assert all(r['environment']['browser'][k]==v for k,v in BROWSER.items())
            assert all(v==0 for v in r['controls'].values()) and r['harnessSha256']==WORKER_HASH
            assert r['profiling']==profile and r['retentionMode']==retention and len(r['samples'])==3
            built={f['path']:f['sha256'] for f in json.loads(manifests[arm].read_text())['builtFiles']}
            assert r['builtAssetHashes']
            for path,digest in r['builtAssetHashes'].items():assert built['dist/client'+path]==digest
            v=r['fixture']['replays'][0];assert v['validated']['uniqueSystems']==(1000 if case=='distinct-cap' else 11)
            assert v['validated']['events']==(200 if case=='repeat-small' else 10000)
            assert v['backwardStart']['elapsed']==0 and not v['endTransition']['playing']
            assert len(r['eventSourceRequests'])==1
            assert len(r['renderedParity'])==15 and all(row['passed'] is True for row in r['renderedParity'])
            assert {row['label'] for row in r['renderedParity'] if ' / ' not in row['label']}=={'home','fixed-midpoint','exact-end'}
            payload_path=Path(v['responseArtifact']['path']);assert payload_path==OUT/(raw.name+'.replay-1000.json')
            payload=payload_path.read_bytes();assert sha(payload)==v['responseArtifact']['sha256'] and len(payload)==v['responseArtifact']['bytes'];json.loads(payload)
            profile_records=profiles(raw,r,profile)
            verify(manifests[arm],name+'-after')
            assert sha(CHROME.read_bytes())==CHROME_SHA256
            report.setdefault('measurements',[]).append({'name':name,'arm':arm,'case':case,'retentionMode':retention,'profiling':profile,'resultSha256':sha(raw.read_bytes()),'sourceVerified':True,'cleanupVerified':True,'browser':r['environment']['browser'],'loadedAssetsVerified':len(r['builtAssetHashes']),'renderedParityChecks':len(r['renderedParity']),'responseArtifact':v['responseArtifact'],'profiles':profile_records})
            assert sha((HERE/'compiled-replay-trial.mjs').read_bytes())==WORKER_HASH
            verify_harnesses()
            dump();print('DONE',name,flush=True)
        report['cleanupVerified']=len(report['measurements'])==len(jobs) and all(row['cleanupVerified'] for row in report['measurements'])
        assert report['cleanupVerified'];report['complete']=True
except BaseException as e:report['failure']=repr(e);raise
finally:
    report['endedAt']=now();dump()
    with (OUT/'completed.json').open('x') as file:file.write(json.dumps(report,indent=2)+'\n')
