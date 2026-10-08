"""Exclusive S3 coordinator. No filename resumption or implicit historical runs."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
COMMIT = 'a7b1bf97b0073695926c443e52d523638e59e48d'
ORDER = ['baseline', 'candidate', 'candidate', 'baseline']
CONFIGS = [(n, p) for n in (100, 1000, 10000) for p in (1, 4)]
ENDPOINTS = [(100, 1), (10000, 4)]
HELPER = (HERE / '../../../../../harness/source-manifest.mjs').resolve()
HARNESS = [HERE / name for name in ['common.mjs', 'fixtures.mjs', 'write-worker.mjs', 'cadence-worker.mjs',
    'run.py', 'prepare-sources.py', 'baseline-ablation-recipe.json', 'baseline-ablation.patch',
    'baseline-source.json', 'candidate-source.json', 'source-boundary.json']] + [HELPER]

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load(path):
    return json.loads(path.read_text())

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def hashes():
    return [{'path': str(path), 'bytes': len(path.read_bytes()), 'sha256': sha(path.read_bytes())} for path in HARNESS]

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

def verify_source(manifest):
    root = Path(manifest['root'])
    assert git(root, 'rev-parse', 'HEAD').decode().strip() == COMMIT == manifest['sourceCommit']
    assert git(root, 'status', '--porcelain', '--untracked-files=all').decode() == manifest['status']
    paths = sorted(set(filter(None, git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0'))))
    files = [{'path': p, 'bytes': len((root / p).read_bytes()), 'sha256': sha((root / p).read_bytes())} for p in paths]
    assert files == manifest['files']
    assert not (root / 'dist/client').exists() and not manifest['builtFiles']
    fingerprint = sha(json.dumps({'files': files, 'builtFiles': []}, separators=(',', ':'), ensure_ascii=False).encode())
    assert fingerprint == manifest['fingerprint']

if os.environ.get('KAIRO_SESSION_MATCHED_LOCK_HELD') != '1':
    env = dict(os.environ, KAIRO_SESSION_MATCHED_LOCK_HELD='1')
    raise SystemExit(subprocess.call(['flock', '-x', '/tmp/kairo-performance.lock', 'flock', '-x',
        '/tmp/kairo-rc16-benchmark.lock', sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]], env=env))

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--phase', choices=['diagnostic', 'write', 'cadence', 'all'], required=True)
args = parser.parse_args()
output = args.output.resolve()
output.mkdir(parents=False, exist_ok=False)
seed_directory, pinned, sources = None, [], {}
result = {'schemaVersion': 1, 'complete': False, 'releaseReady': False, 'startedAt': stamp(), 'phase': args.phase,
    'sourceCommit': COMMIT, 'sources': {},
    'harnessFiles': [], 'seedDirectory': None, 'order': ORDER, 'children': [],
    'ordinaryWriteCases': CONFIGS if args.phase in ('write', 'all') else [],
    'ordinaryCadenceCases': ENDPOINTS if args.phase in ('cadence', 'all') else [],
    'ordinaryCadenceInteriorCasesNotExecuted': [value for value in CONFIGS if value not in ENDPOINTS],
    'scope': 'Sequential per-pilot createSessionCombat collector calls, not production Core concurrent dispatch.',
    'limits': ['No historical arm is imported or resumed. A failed attempt stays intact.',
        'Only endpoint ordinary cadence is requested. Interior behavior requires explicit interpretation after endpoint and six-case diagnostic/write evidence; it is not automatically closed.',
        'Each ordinary shape has two fresh process observations per arm; ticks are not independent replications.']}
save(output / 'progress.json', result)

def guard():
    assert hashes() == pinned, 'Harness changed during this attempt'
    for source in sources.values():
        verify_source(source)

def child(label, role, mode, shape):
    guard()
    worker = 'write-worker.mjs' if mode in ('write', 'seed-only') else 'cadence-worker.mjs'
    target, log = output / (label + '.json'), output / (label + '.log')
    command = ['node', str(HERE / worker), str(output / (role + '-source.json')), role, str(target),
        str(seed_directory), mode, shape, str(output / 'harness-source.json')]
    receipt = {'label': label, 'role': role, 'mode': mode, 'shape': shape, 'command': command, 'startedAt': stamp()}
    result['activeChild'] = label
    save(output / 'progress.json', result)
    print(json.dumps({'starting': label, 'at': receipt['startedAt']}), flush=True)
    with log.open('xb') as handle:
        process = subprocess.run(command, cwd=HERE, env=dict(os.environ, KAIRO_SESSION_MATCHED_LOCK_HELD='1'), stdout=handle, stderr=subprocess.STDOUT)
    receipt.update(exitCode=process.returncode, endedAt=stamp(), logSha256=sha(log.read_bytes()))
    if target.exists():
        receipt['outputSha256'] = sha(target.read_bytes())
    result['children'].append(receipt)
    result.pop('activeChild', None)
    save(output / 'progress.json', result)
    guard()
    assert process.returncode == 0, 'Worker failed: ' + label
    value = load(target)
    assert value['complete'] and value['sourceVerified'], 'Incomplete worker: ' + label
    assert value['sourceFingerprint'] == sources[role]['fingerprint']
    print(json.dumps({'completed': label, 'at': receipt['endedAt']}), flush=True)
    return value

try:
    seed_directory = Path(tempfile.mkdtemp(prefix='kairo-s3-seeds-'))
    result['seedDirectory'] = str(seed_directory)
    pinned = hashes()
    result['harnessFiles'] = pinned
    assert pinned == load(HERE / 'prepared-harness-binding.json')['files'], 'Draft changed after review binding; refreeze and review before runtime'
    save(output / 'harness-source.json', {'schemaVersion': 1, 'files': pinned})
    sources = {role: load(HERE / (role + '-source.json')) for role in ('baseline', 'candidate')}
    result['sources'] = {role: value['fingerprint'] for role, value in sources.items()}
    for role, source in sources.items():
        verify_source(source)
        save(output / (role + '-source.json'), source)
    boundary = load(HERE / 'source-boundary.json')
    assert boundary['commit'] == COMMIT
    for role in sources:
        assert sources[role]['fingerprint'] == boundary[role + 'Fingerprint']
    save(output / 'progress.json', result)
    child('seed-preparation', 'baseline', 'seed-only', 'all')
    shutil.copyfile(seed_directory / 'seeds.json', output / 'seed-manifest.json')
    parity = {}
    if args.phase in ('diagnostic', 'all'):
        for archived, pilots in CONFIGS:
            shape = f'{archived}-{pilots}'
            for role in ('baseline', 'candidate'):
                value = child(f'diagnostic-{shape}-{role}', role, 'diagnostic', shape)
                reference = parity.setdefault('cadence-' + shape, value['parity'])
                assert value['parity'] == reference, 'Diagnostic full domain/provider parity: ' + shape
    if args.phase in ('write', 'all'):
        for archived, pilots in CONFIGS:
            shape = f'{archived}-{pilots}'
            for index, role in enumerate(ORDER, 1):
                value = child(f'write-{shape}-{index}-{role}', role, 'write', shape)
                reference = parity.setdefault('write-' + shape, value['parity'])
                assert value['parity'] == reference, 'Write full durable parity: ' + shape
    if args.phase in ('cadence', 'all'):
        for archived, pilots in ENDPOINTS:
            shape = f'{archived}-{pilots}'
            for index, role in enumerate(ORDER, 1):
                value = child(f'cadence-{shape}-{index}-{role}', role, 'cadence', shape)
                reference = parity.setdefault('cadence-' + shape, value['parity'])
                assert value['parity'] == reference, 'Cadence full normalized domain/provider parity: ' + shape
    guard()
    result['parity'] = {'complete': True, 'groups': sorted(parity), 'sha256': {key: sha(json.dumps(value, sort_keys=True).encode()) for key, value in parity.items()}}
    result['sourceAndHarnessVerified'] = True
    result['complete'] = True
except BaseException as error:
    result['failure'] = repr(error)
    raise
finally:
    result['cleanupFailures'] = []
    if result['complete'] and seed_directory is not None:
        try:
            shutil.rmtree(seed_directory)
            result['seedDirectoryRemoved'] = True
        except BaseException as error:
            result['cleanupFailures'].append(repr(error))
            result['complete'] = False
    result['artifacts'] = []
    result['artifactInventoryFailures'] = []
    try:
        for path in sorted(output.rglob('*')):
            if path.is_file() and path.name not in ('progress.json', 'completed.json', 'failed.json'):
                try:
                    data = path.read_bytes()
                    result['artifacts'].append({'path': str(path.relative_to(output)), 'bytes': len(data), 'sha256': sha(data)})
                except BaseException as error:
                    result['artifactInventoryFailures'].append({'path': str(path), 'error': repr(error)})
                    result['complete'] = False
    except BaseException as error:
        result['artifactInventoryFailures'].append({'error': repr(error)})
        result['complete'] = False
    result['endedAt'] = stamp()
    save(output / ('completed.json' if result['complete'] else 'failed.json'), result)
    save(output / 'progress.json', result)
    if not result['complete'] and sys.exc_info()[0] is None:
        raise SystemExit(1)
