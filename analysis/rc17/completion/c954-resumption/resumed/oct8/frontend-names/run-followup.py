"""Fixed adverse-row follow-up: diagnostic coverage, then one unchanged ABBA cycle."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import sys

assert os.environ.get('KAIRO_MODELS_LOCKED') == '1'
baseline, candidate, output = map(lambda p: Path(p).resolve(), sys.argv[1:4])
lane = Path(__file__).resolve().parent
output.mkdir()
stamp = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
harness_paths = [Path(__file__).resolve(), lane/'browser-names.mjs', lane/'browser-first-open-coverage.mjs',
    lane/'../../../../../harness/source-manifest.mjs', lane/'../../../../../../rc16/historical/tests/performance/chrome.mjs']
harnesses = {str(p.resolve()):sha(p) for p in harness_paths}
receipt = {'schemaVersion':1,'startedAt':stamp(),'complete':False,'releaseReady':False,'harnesses':harnesses,
    'protocol':'One precise-coverage diagnostic, then one fixed ABBA cycle using unchanged ordinary browser-names.mjs and original fresh-build manifests; every original timing case retained.',
    'runs':[]}
try:
    jobs = [('coverage','candidate',candidate,'browser-first-open-coverage.mjs')]
    jobs += [(str(i+1),variant,baseline if variant=='baseline' else candidate,'browser-names.mjs') for i,variant in enumerate(['baseline','candidate','candidate','baseline'])]
    for arm,variant,root,harness in jobs:
        name=f'{arm}-{variant}.json'
        command=['node',str(lane/harness),str(root),str(output/name),str(lane/'browser-attempt1'/f'{variant}-source.json'),'--timing']
        with (output/(name+'.log')).open('x') as log:
            run=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT)
        if run.returncode: raise RuntimeError(f'{name} exited {run.returncode}')
        result=json.loads((output/name).read_text())
        assert result['complete'] and result['sourceVerified'] and not result['errors'] and not result['external']
        assert all(row['passed'] for row in result['checks'])
        assert result['harnessSha256'] == harnesses[str((lane/harness).resolve())]
        receipt['runs'].append({'arm':arm,'variant':variant,'filename':name,'sha256':sha(output/name),'checks':len(result['checks']),'mode':result['mode']})
        (output/'progress.json').write_text(json.dumps(receipt,indent=2)+'\n')
    assert harnesses == {str(p.resolve()):sha(p) for p in harness_paths}
    receipt['harnessVerified']=True
    receipt['complete']=True
finally:
    receipt['endedAt']=stamp()
    (output/'completed.json').write_text(json.dumps(receipt,indent=2)+'\n')
