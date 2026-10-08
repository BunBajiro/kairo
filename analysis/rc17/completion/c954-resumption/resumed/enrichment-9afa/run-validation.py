"""Frozen-source enrichment verification. Coordinator must grant runtime first."""
import datetime, fcntl, hashlib, json, os, pathlib, subprocess, sys
HERE = pathlib.Path(__file__).resolve().parent
mode = sys.argv[1]
assert mode in ['tests', 'timings']
OUT = HERE / sys.argv[2]
OUT.mkdir(exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
plans = {name: json.loads((HERE / (name + '-source.json')).read_text()) for name in ['baseline', 'candidate']}
harnesses = {name: sha(HERE / name) for name in ['run-validation.py', 'enrichment-trial.mjs', 'baseline-source.json', 'candidate-source.json', 'proposal-files.json', 'enrichment.patch', 'PLAN.md']}
def verify():
    for arm, plan in plans.items():
        root = pathlib.Path(plan['root'])
        for file, metadata in plan['files'].items():
            assert sha(root/file) == metadata['sha256'], (arm, file)
    for file, digest in harnesses.items(): assert sha(HERE/file) == digest, file
record = {'mode': mode, 'complete': False, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'baseCommit': plans['baseline']['baseCommit'], 'harnesses': harnesses, 'runs': [], 'sourceVerified': False}
def save(): (OUT/'receipt.json').write_text(json.dumps(record, indent=2)+'\n')
save()
try:
    with open('/tmp/kairo-performance.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        verify()
        if mode == 'tests':
            files = ['enrichment', 'asset-locations', 'esi-policy', 'esi-optimization', 'esi-pacing', 'lifecycle', 'core-idle-protection']
            command = ['node', '--test', '--test-concurrency=1', *['tests/kairo/'+file+'.test.mjs' for file in files]]
            with open(OUT/'tests.log', 'w') as log: result = subprocess.run(command, cwd=plans['candidate']['root'], stdout=log, stderr=subprocess.STDOUT)
            record['runs'].append({'name': 'targeted-tests', 'command': command, 'exitCode': result.returncode, 'logSha256': sha(OUT/'tests.log')}); save()
            assert result.returncode == 0, result.returncode
        else:
            for wait in [0, 50]:
                for index, arm in enumerate(['baseline', 'candidate', 'candidate', 'baseline']):
                    verify(); name = f'delay{wait}-{index+1}-{arm}'
                    env = dict(os.environ, KAIRO_BENCH_REPO=plans[arm]['root'], KAIRO_BENCH_SOURCE_COMMIT=plans[arm]['baseCommit']+(' + isolated enrichment.patch' if arm == 'candidate' else ''), KAIRO_DECISION_TIMED='1', KAIRO_DECISION_OUTPUT=str(OUT/(name+'.json')), KAIRO_ENRICHMENT_DELAY_MS=str(wait), KAIRO_ENRICHMENT_COUNTS='0,1,6,10')
                    print('START', name, flush=True)
                    with open(OUT/(name+'.log'), 'w') as log: result = subprocess.run(['node', str(HERE/'enrichment-trial.mjs')], cwd=plans[arm]['root'], env=env, stdout=log, stderr=subprocess.STDOUT)
                    item = {'name': name, 'arm': arm, 'delayMs': wait, 'exitCode': result.returncode, 'logSha256': sha(OUT/(name+'.log'))}
                    if (OUT/(name+'.json')).exists(): item['resultSha256'] = sha(OUT/(name+'.json'))
                    record['runs'].append(item); save(); assert result.returncode == 0, item
                    verify(); print('END', name, flush=True)
        verify(); record['sourceVerified'] = True; record['complete'] = True
except BaseException as error:
    record['error'] = repr(error); raise
finally:
    record['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat(); save()
