"""Root-granted focused semantics, then the reviewed revision-2 diagnostic only."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = Path('/workspace/scratch/a2f3334402fc/kairo-s3-a7-candidate')
BINDING = '68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c'
TESTS = ['tests/kairo/session-combat-eligibility.test.mjs', 'tests/kairo/session-live.test.mjs',
         'tests/kairo/sessions.test.mjs', 'tests/kairo/lifecycle.test.mjs']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

if os.environ.get('KAIRO_SESSION_MATCHED_LOCK_HELD') != '1':
    raise SystemExit(subprocess.call(['flock', '-x', '/tmp/kairo-performance.lock', 'flock', '-x',
        '/tmp/kairo-rc16-benchmark.lock', sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]],
        env=dict(os.environ, KAIRO_SESSION_MATCHED_LOCK_HELD='1')))

assert len(sys.argv) == 2
output = Path(sys.argv[1]).resolve()
output.mkdir(parents=False, exist_ok=False)
receipt = {'complete': False, 'startedAt': stamp(), 'bindingSha256': BINDING, 'tests': TESTS,
    'runtimeScope': 'Focused exact-candidate semantics plus both-arm six-shape simulated diagnostics only; no ordinary writes/cadence.',
    'runnerSha256': sha(Path(__file__).read_bytes()), 'children': []}

def guard():
    assert sha((HERE / 'prepared-harness-binding.json').read_bytes()) == BINDING
    for row in json.loads((HERE / 'prepared-harness-binding.json').read_text())['files']:
        data = Path(row['path']).read_bytes()
        assert len(data) == row['bytes'] and sha(data) == row['sha256']
    for role in ['baseline', 'candidate']:
        source = json.loads((HERE / (role + '-source.json')).read_text())
        root = Path(source['root'])
        def git(*args):
            return subprocess.check_output(['git', '-C', str(root), *args]).decode()
        assert git('rev-parse', 'HEAD').strip() == source['sourceCommit']
        assert git('status', '--porcelain', '--untracked-files=all') == source['status']
        paths = sorted(set(filter(None, git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0'))))
        rows = [{'path': p, 'bytes': len((root / p).read_bytes()), 'sha256': sha((root / p).read_bytes())} for p in paths]
        assert rows == source['files']

def child(name, command, cwd):
    guard()
    row = {'name': name, 'command': command, 'cwd': str(cwd), 'startedAt': stamp()}
    print(json.dumps({'starting': name}), flush=True)
    process = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = output / (name + '.log')
    with log.open('xb') as handle:
        handle.write(process.stdout)
        handle.flush()
        os.fsync(handle.fileno())
    row.update(endedAt=stamp(), exitCode=process.returncode, logSha256=sha(log.read_bytes()), logBytes=log.stat().st_size)
    receipt['children'].append(row)
    guard()
    assert process.returncode == 0, name + ' failed'
    return process.stdout.decode(errors='replace')

try:
    log = child('focused-semantics', ['node', '--test', '--test-concurrency=1', *TESTS], ROOT)
    receipt['semanticCounts'] = {key: int(found.group(1)) for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped']
        if (found := re.search(r'^[#ℹ] ' + key + r' (\d+)$', log, re.M))}
    assert receipt['semanticCounts'].get('fail') == 0
    child('diagnostic-runner', [sys.executable, str(HERE / 'run.py'), str(output / 'diagnostics'), '--phase', 'diagnostic'], HERE)
    receipt['diagnostics'] = json.loads((output / 'diagnostics/completed.json').read_text())
    assert receipt['diagnostics']['complete'] and receipt['diagnostics']['sourceAndHarnessVerified']
    guard()
    receipt['complete'] = True
except BaseException as error:
    receipt['failure'] = repr(error)
    raise
finally:
    receipt['endedAt'] = stamp()
    receipt['artifacts'] = [{'path': str(p.relative_to(output)), 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())}
        for p in sorted(output.rglob('*')) if p.is_file()]
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'complete': receipt['complete'], 'receipt': str(output / 'receipt.json'), 'semanticCounts': receipt.get('semanticCounts')}), flush=True)
