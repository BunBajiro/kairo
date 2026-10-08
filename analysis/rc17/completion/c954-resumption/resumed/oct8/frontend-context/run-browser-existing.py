"""Resume corrected diagnostics and full ABBA using previously verified fresh builds."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import sys

assert os.environ.get('KAIRO_MODELS_LOCKED') == '1'
baseline,candidate,output=map(lambda p:Path(p).resolve(),sys.argv[1:4])
lane=Path(__file__).resolve().parent
output.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
paths=[Path(__file__).resolve(),lane/'browser-names.mjs',lane/'browser-names-semantics.mjs',lane/'../../../../../harness/source-manifest.mjs',lane/'../../../../../../rc16/historical/tests/performance/chrome.mjs']
before={str(p.resolve()):sha(p) for p in paths}
prior=lane/'assets-browser-attempt1/completed.json'
builds=json.loads(prior.read_text())['builds']
assert len(builds)==2 and all(b['complete'] for b in builds)
receipt={'schemaVersion':1,'startedAt':stamp(),'complete':False,'releaseReady':False,'harnesses':before,'priorFreshBuildReceiptSha256':sha(prior),'builds':builds,'runs':[]}
try:
    jobs=[('diagnostic',v,baseline if v=='baseline' else candidate,'browser-names-semantics.mjs',[]) for v in ['baseline','candidate']]
    jobs += [(str(i+1),v,baseline if v=='baseline' else candidate,'browser-names.mjs',['--timing']) for i,v in enumerate(['baseline','candidate','candidate','baseline'])]
    for arm,variant,root,worker,flags in jobs:
        name=f'{arm}-{variant}.json'
        command=['node',str(lane/worker),str(root),str(output/name),str(lane/'assets-browser-attempt1'/f'{variant}-source.json'),*flags]
        with (output/(name+'.log')).open('x') as log:r=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT)
        if r.returncode:raise RuntimeError(f'{name} exited {r.returncode}')
        result=json.loads((output/name).read_text())
        assert result['complete'] and result['sourceVerified'] and not result['errors'] and not result['external']
        assert all(c['passed'] for c in result['checks'])
        assert result['harnessSha256']==before[str((lane/worker).resolve())]
        receipt['runs'].append({'arm':arm,'variant':variant,'filename':name,'sha256':sha(output/name),'checks':len(result['checks']),'mode':result['mode']})
        (output/'progress.json').write_text(json.dumps(receipt,indent=2)+'\n')
    assert before=={str(p.resolve()):sha(p) for p in paths}
    receipt['complete']=True;receipt['harnessVerified']=True
finally:
    receipt['endedAt']=stamp()
    (output/'completed.json').write_text(json.dumps(receipt,indent=2)+'\n')
