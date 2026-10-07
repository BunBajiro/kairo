"""Run under flock /tmp/kairo-performance.lock; immutable source roots required."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

baseline, candidate, output = map(Path, sys.argv[1:4])
output.mkdir(parents=True, exist_ok=True)
harness = Path(__file__).with_name('diagnostic.mjs')
sha = 'c954c0d808847f249df0659ed15fdce2e89f84c4'
manifest = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'order': ['baseline', 'candidate', 'candidate', 'baseline'],
            'baseline': str(baseline.resolve()), 'candidate': str(candidate.resolve()),
            'harnessSha256': hashlib.sha256(harness.read_bytes()).hexdigest(),
            'fixtureNow': int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000),
            'lock': '/tmp/kairo-performance.lock', 'runs': [], 'complete': False}
source_harness = harness.parent.parent.parent / 'harness/source-manifest.mjs'
for arm, repo in [('baseline', baseline), ('candidate', candidate)]:
    command = ['node', str(source_harness), 'capture', str(repo), str(output / (arm+'-source.json'))]
    if arm == 'baseline':
        command.append(sha)
    subprocess.run(command, check=True)
base_source = json.loads((output / 'baseline-source.json').read_text())
trial_source = json.loads((output / 'candidate-source.json').read_text())
assert base_source['sourceCommit'] == trial_source['sourceCommit'] == sha
base_files = {row['path']: row for row in base_source['files']}
trial_files = {row['path']: row for row in trial_source['files']}
changed = sorted(key for key in set(base_files) | set(trial_files) if base_files.get(key) != trial_files.get(key))
assert changed == ['server/core.mjs'], changed
assert base_source['builtFiles'] == trial_source['builtFiles'], 'No browser build difference in this backend-only trial'
manifest['changedFiles'] = changed
cases = [('baseline-counts', 'baseline', False), ('candidate-counts', 'candidate', False)]
cases += [(f'{index+1}-{arm}', arm, True) for index, arm in enumerate(manifest['order'])]
for name, arm, timed in cases:
    repo = baseline if arm == 'baseline' else candidate
    env = dict(os.environ, KAIRO_BENCH_REPO=str(repo.resolve()),
               KAIRO_BENCH_SOURCE_COMMIT=sha, KAIRO_ALLOW_DIRTY='1' if arm == 'candidate' else '0',
               KAIRO_FIXTURE_NOW=str(manifest['fixtureNow']),
               KAIRO_DECISION_TIMED='1' if timed else '0',
               KAIRO_DECISION_OUTPUT=str((output / (name+'.json')).resolve()))
    print('START', name, flush=True)
    with (output / (name+'.log')).open('w') as log:
        run = subprocess.run(['node', str(harness.resolve())], env=env, stdout=log, stderr=subprocess.STDOUT)
    manifest['runs'].append({'name': name, 'source': arm, 'timed': timed, 'exitCode': run.returncode})
    (output / 'run-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print('END', name, run.returncode, flush=True)
    if run.returncode:
        raise SystemExit(run.returncode)
assert hashlib.sha256(harness.read_bytes()).hexdigest() == manifest['harnessSha256']
def semantic_rows(data):
    assert data['complete'] and data['sourceVerified']
    assert data['fixtureNow'] == manifest['fixtureNow']
    return [{key: row.get(key) for key in ['kind', 'namesCount', 'elementCount', 'visibility', 'clients', 'stateSha256', 'equivalentData', 'averageFrameBytes', 'namesJsonBytes']} for row in data['cases']]
first = semantic_rows(json.loads((output / '1-baseline.json').read_text()))
for name in ['2-candidate', '3-candidate', '4-baseline']:
    assert semantic_rows(json.loads((output / (name+'.json')).read_text())) == first, name
manifest['equivalentPublicOutputs'] = True
manifest['complete'] = True
manifest['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(output / 'run-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
