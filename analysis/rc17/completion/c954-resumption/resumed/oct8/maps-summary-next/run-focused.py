from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = Path('/workspace/scratch/a2f3334402fc/kairo-m9-summary-write-9afa-isolated')
BASELINE = ROOT.parent / 'kairo-m9-summary-baseline-9afa'
BASE = '9afa9a7197fa6b5a802e9efdaa322dedf2439150'
TESTS = ['tests/kairo/universe-jspace-reads.test.mjs', 'tests/kairo/universe-jspace-summary-inputs.test.mjs']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def source(root):
    paths = sorted(set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().strip('\0').split('\0')))
    return {name: sha((root / name).read_bytes()) for name in paths}


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


assert len(sys.argv) == 2, 'Supply a new output directory'
output = Path(sys.argv[1]).resolve()
output.mkdir(parents=False, exist_ok=False)
proposal = json.loads((HERE / 'prototype-files.json').read_text())
assert proposal['base'] == BASE
assert git(BASELINE, 'rev-parse', 'HEAD').decode().strip() == BASE
assert git(ROOT, 'rev-parse', 'HEAD').decode().strip() == BASE
assert not git(BASELINE, 'status', '--porcelain', '--untracked-files=all').strip()
original = source(BASELINE)
expected = original.copy()
for row in proposal['files']:
    assert expected.get(row['path']) == row['baselineSha256']
    expected[row['path']] = row['candidateSha256']
assert source(ROOT) == expected
assert sha((HERE / 'prototype.patch').read_bytes()) == proposal['patchSha256']
before_status = git(ROOT, 'status', '--porcelain', '--untracked-files=all').decode()
(output / 'source-before.json').write_text(json.dumps({'base': BASE, 'status': before_status, 'files': expected}, indent=2) + '\n')
command = ['flock', '-x', '/tmp/kairo-performance.lock', 'node', '--test', '--test-concurrency=1', *TESTS]
receipt = {'base': BASE, 'root': str(ROOT), 'command': command, 'startedAt': stamp(), 'performanceAcceptance': False,
           'runnerSha256': sha(Path(__file__).read_bytes()), 'proposalPatchSha256': proposal['patchSha256'],
           'sourceFiles': len(expected), 'node': subprocess.check_output(['node', '--version'], text=True).strip(),
           'executionComplete': False, 'passed': False}
log = output / 'tests.log'
try:
    with log.open('xb') as handle:
        result = subprocess.run(command, cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT)
    receipt['exitCode'] = result.returncode
    receipt['executionComplete'] = True
    receipt['logSha256'] = sha(log.read_bytes())
    receipt['sourceStable'] = source(ROOT) == expected and git(ROOT, 'status', '--porcelain', '--untracked-files=all').decode() == before_status
    assert receipt['sourceStable'], 'Source changed during tests'
    text = log.read_text()
    receipt['counts'] = {key: int(match.group(1)) for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped'] if (match := re.search(r'^[#ℹ] ' + key + r' (\d+)$', text, re.M))}
    receipt['passed'] = result.returncode == 0
finally:
    receipt['endedAt'] = stamp()
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
sys.exit(receipt['exitCode'])
