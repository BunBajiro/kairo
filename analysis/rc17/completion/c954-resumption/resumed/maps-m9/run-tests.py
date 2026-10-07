from pathlib import Path
import datetime
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = Path('/workspace/scratch/a2f3334402fc/kairo-m9-c954-isolated')
BASE = 'c954c0d808847f249df0659ed15fdce2e89f84c4'
TESTS = [
    'universe-jspace-reads', 'universe-operations', 'jspace-tracking',
    'jspace-retention', 'universe-jspace', 'jspace-operational-export',
    'jspace-scopes', 'universe-service', 'universe-routing',
    'universe-route-preparation', 'universe-navigation',
    'universe-navigation-state', 'universe-jspace-http',
    'universe-operations-http',
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


baseline = json.loads((HERE.parents[2] / 'maps-final/c954-source.json').read_text())
proposal = json.loads((HERE / 'proposal-files.json').read_text())
assert baseline['sourceCommit'] == proposal['baseCommit'] == BASE
expected = {row['path']: row['sha256'] for row in baseline['files']}
for row in proposal['files']:
    assert expected[row['path']] == row['baselineSha256']
    expected[row['path']] = row['proposalSha256']


def verify():
    actual = {str(path.relative_to(ROOT)): sha(path) for path in ROOT.rglob('*') if path.is_file()}
    assert actual == expected, 'Only declared proposal changes may differ from the exact c954 source'
    return actual


before = verify()
command = ['flock', '-x', '/tmp/kairo-performance.lock', 'node', '--test', '--test-concurrency=1']
command += [f'tests/kairo/{name}.test.mjs' for name in TESTS]
receipt = {
    'baseCommit': BASE, 'root': str(ROOT), 'startedAt': stamp(),
    'command': command, 'sourceFiles': len(before), 'complete': False,
    'sourceManifestSha256': hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
    'proposalPatchSha256': sha(HERE / 'm9-proposal.patch'),
    'runnerSha256': sha(Path(__file__)),
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'testFiles': {name: sha(ROOT / f'tests/kairo/{name}.test.mjs') for name in TESTS},
    'performanceAcceptance': False,
}
log = HERE / 'tests-attempt1.log'
assert not log.exists(), 'Retain every attempt rather than overwrite its evidence'
with log.open('wb') as output:
    result = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
receipt['exitCode'] = result.returncode
receipt['endedAt'] = stamp()
receipt['logSha256'] = sha(log)
receipt['sourceStable'] = verify() == before
receipt['complete'] = True
(HERE / 'tests-attempt1.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ['exitCode', 'sourceFiles', 'sourceStable', 'complete', 'logSha256']}))
raise SystemExit(result.returncode)
