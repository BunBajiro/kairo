"""Root must grant runtime before invocation. Preserve every failed attempt directory."""
import datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path('/workspace/scratch/a2f3334402fc')
SHA='22773cc7cb6e83ac51e412565ba65c101613536a'
mode=sys.argv[1];assert mode in ['tests','counts','abba']
OUT=HERE/sys.argv[2];OUT.mkdir(exist_ok=False)
roots={arm:ROOT/('kairo-names-227-'+arm) for arm in ['baseline','candidate']}
hash=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def source(root):
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert head==SHA
    paths=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).decode().split('\0')
    return {p:{'sha256':hash(root/p),'bytes':(root/p).stat().st_size} for p in sorted(set(filter(None,paths)))}
sources={arm:json.loads((HERE/(arm+'-source.json')).read_text()) for arm in roots}
for arm,packet in sources.items():
    assert source(roots[arm])==packet['files'],arm+' changed after freeze'
    (OUT/(arm+'-source.json')).write_text(json.dumps(packet,indent=2)+'\n')
helper=HERE.parents[3]/'harness/source-manifest.mjs'
harnessPaths={name:HERE/name for name in ['backend.mjs','run.py','run-config.json']};harnessPaths['source-manifest.mjs']=helper
harnesses={name:hash(path) for name,path in harnessPaths.items()}
config=json.loads((HERE/'run-config.json').read_text())
record={'mode':mode,'sourceCommit':SHA,'acceptedBaseDelta':'hidden filter','harnesses':harnesses,'fixtureNow':config['fixtureNow'],'complete':False,'sourceVerified':False,'runs':[],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def save():(OUT/'receipt.json').write_text(json.dumps(record,indent=2)+'\n')
def verify():
    for arm,root in roots.items():assert source(root)==sources[arm]['files'],arm
    for name,path in harnessPaths.items():assert hash(path)==harnesses[name],name
save()
try:
    with open('/tmp/kairo-performance.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX);verify()
        if mode=='tests':
            command=['node','--test','--test-concurrency=1',*[f'tests/kairo/{name}.test.mjs' for name in config['semanticTests']]]
            with open(OUT/'tests.log','w') as log:tested=subprocess.run(command,cwd=roots['candidate'],stdout=log,stderr=subprocess.STDOUT)
            record['runs'].append({'name':'targeted-tests','command':command,'exitCode':tested.returncode,'logSha256':hash(OUT/'tests.log')});save();assert tested.returncode==0
        runs=[] if mode=='tests' else [(arm+'-counts',arm,False) for arm in roots] if mode=='counts' else [(str(i+1)+'-'+arm,arm,True) for i,arm in enumerate(config['order'])]
        packets={}
        for name,arm,timed in runs:
            env=dict(os.environ,KAIRO_BENCH_REPO=str(roots[arm]),KAIRO_BENCH_SOURCE_COMMIT=SHA,KAIRO_FIXTURE_NOW=str(config['fixtureNow']),KAIRO_DECISION_TIMED='1' if timed else '0',KAIRO_DECISION_OUTPUT=str(OUT/(name+'.json')))
            print('START',name,flush=True)
            with open(OUT/(name+'.log'),'w') as log:result=subprocess.run(['node',str(HERE/'backend.mjs')],env=env,cwd=roots[arm],stdout=log,stderr=subprocess.STDOUT)
            row={'name':name,'arm':arm,'timed':timed,'exitCode':result.returncode,'logSha256':hash(OUT/(name+'.log'))}
            if (OUT/(name+'.json')).exists():row['resultSha256']=hash(OUT/(name+'.json'))
            record['runs'].append(row);save();assert result.returncode==0,row
            packet=json.loads((OUT/(name+'.json')).read_text());assert packet['complete'] and packet['sourceVerified'] and len(packet['cases'])==config['casesPerArm']
            assert packet['fixtureNow']==config['fixtureNow'];packets[name]=packet;verify();print('END',name,flush=True)
        # Byte shape is deliberately different; reconstituted application domains must match.
        if packets:
            normalized=lambda packet:[{k:row[k] for k in ['namesCount','clients','finalNamesSha256']}|{key:row[key]['perClientDomainSha256'] for key in ['unchangedDelivery','batchDelivery']} for row in packet['cases']]
            expected=normalized(next(iter(packets.values())))
            for name,packet in packets.items():assert normalized(packet)==expected, name+' domain mismatch'
            record['matchedDomainParity']=True
        verify();record['complete']=True;record['sourceVerified']=True
except BaseException as error:record['error']=repr(error);raise
finally:record['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
