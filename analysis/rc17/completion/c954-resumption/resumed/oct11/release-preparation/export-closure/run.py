"""One bounded synthetic export/upgrade/reopen semantic acceptance control; no timings."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parent
OCT11 = HERE.parent.parent
sys.path.insert(0, str(OCT11 / 'final-matrix-public-resume'))
from envelope import Envelope, ROOT, pin, save, stamp

COMMITS = {'baseline': '57c8dcc7fbd8fc2b62129498d1819050c78381a1',
           'candidate': '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'}
HELPER = ROOT / 'analysis/rc17/harness/source-manifest.mjs'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('baseline_manifest', type=Path)
parser.add_argument('candidate_manifest', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert os.environ.get('KAIRO_EXPORT_GRANTED') == '1', 'Coordinator runtime grant required'
assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE')
assert not [key for key in os.environ if key.startswith('KAIRO_') and key not in ('KAIRO_EXPORT_GRANTED', 'KAIRO_CHROME_PATH')]
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
owner = Envelope(out)
locks, inputs, absent, sources = [], {}, [], {}
worker_pins = {}
env = {key: value for key, value in os.environ.items() if not key.startswith('KAIRO_')}
env.pop('NODE_OPTIONS', None)
env.pop('NODE_V8_COVERAGE', None)
env['KAIRO_EXPORT_LOCKED'] = '1'
report = {'schemaVersion': 1, 'suite': 'export-stopped-reopen-acceptance', 'startedAt': stamp(),
          'complete': False, 'sourceCommits': COMMITS, 'inputs': inputs, 'locks': [],
          'syntheticOnly': True, 'timingClaims': False, 'originalDirectoryRetained': True}

def remember(path):
    path = Path(path).resolve()
    inputs[str(path)] = pin(path)
    return path

def guards():
    for path, expected in inputs.items():
        assert pin(path) == expected, 'Harness/input changed: ' + path
    for path in absent:
        assert not path.exists() and not path.is_symlink(), 'Removed temporary data reappeared: ' + str(path)
    owner.check_pins()

def command(label, argv, directory=out, child_env=env, timeout=180):
    guards()
    owner.command(label, argv, directory / (label + '.log'), env=child_env, timeout=timeout)
    guards()

def copy_input(source, destination):
    source = remember(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as file:
        file.write(source.read_bytes())
    assert pin(destination) == inputs[str(source)]
    owner.capture([destination])

def source_and_build(name, manifest_path):
    manifest_path = manifest_path.resolve()
    source = json.loads(manifest_path.read_text())
    assert source['sourceCommit'] == source['expectedCommit'] == COMMITS[name]
    assert source['requireClean'] and not source['dirty'] and source['status'] == '' and source['builtFiles']
    root = Path(source['root'])
    assert root.is_absolute() and root.is_dir()
    assert not out.is_relative_to(root), 'Output must not contaminate application source'
    copy_input(manifest_path, out / (name + '-source.json'))
    prebuild_path = manifest_path.with_name(manifest_path.name.replace('-source.json', '-prebuild.json'))
    assert prebuild_path != manifest_path
    prebuild = json.loads(prebuild_path.read_text())
    assert prebuild['sourceCommit'] == source['sourceCommit'] and prebuild['root'] == source['root']
    assert prebuild['files'] == source['files'] and not prebuild['builtFiles']
    copy_input(prebuild_path, out / (name + '-prebuild.json'))
    setup_path = manifest_path.parent / 'receipt.json'
    setup = json.loads(setup_path.read_text())
    assert setup['complete']
    assert setup['helperSha256'] == pin(HELPER)['sha256']
    bindings = [entry for entry in setup['roots'] if entry['root'] == str(root)]
    assert len(bindings) == 1
    binding = bindings[0]
    assert binding['complete'] and binding['commit'] == source['sourceCommit']
    assert binding['fingerprint'] == source['fingerprint']
    assert binding['sourceFiles'] == len(source['files']) and binding['builtFiles'] == len(source['builtFiles'])
    assert Path(binding['manifest']).resolve() == manifest_path
    builds = [row for row in setup['commands'] if row['args'] == ['npm', 'run', 'build'] and row['cwd'] == str(root)]
    assert len(builds) == 1
    build = builds[0]
    assert build['exitCode'] == 0 and not build['remainingProcessGroupMembers'] and build['start'] and build['end']
    log = setup_path.parent / build['log']
    assert pin(log) == {'bytes': build['logBytes'], 'sha256': build['logSha256']}
    copy_input(setup_path, out / (name + '-build-receipt.json'))
    copy_input(log, out / (name + '-build.log'))
    sources[name] = source
    command(name + '-source-before', ['node', HELPER, 'verify', out / (name + '-source.json')])

try:
    for path in ('/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock'):
        handle = open(path, 'a')
        locks.append(handle)
        while True:
            if owner.interrupted:
                raise RuntimeError('Interrupted while acquiring ownership locks')
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(.1)
        report['locks'].append({'path': path, 'acquiredAt': stamp()})
    for path in sorted(HERE.iterdir()):
        if path.is_file() and path.suffix in ('.mjs', '.py', '.md'):
            remember(path)
    for path in (HELPER, OCT11 / 'first-binding-acceptance/common.mjs',
                 OCT11 / 'final-matrix-public-resume/envelope.py',
                 OCT11.parent / 'oct8/final-merged-frontend/ownership.py'):
        remember(path)
    source_and_build('baseline', args.baseline_manifest)
    source_and_build('candidate', args.candidate_manifest)
    data = out / 'evidence'
    data.mkdir()
    temporary = out / 'tmp'
    temporary.mkdir()
    command('export-control', ['node', HERE / 'worker.mjs', sources['baseline']['root'], out / 'baseline-source.json',
            sources['candidate']['root'], out / 'candidate-source.json', data],
            child_env=dict(env, TMPDIR=str(temporary)), timeout=180)
    observed = json.loads((data / 'result.json').read_text())
    assert observed['complete'] and observed['lifecycleClosed'] and observed['sourceVerified']
    assert observed['evidencePinsVerified'] and observed['closedEvidence']
    worker_pins.update(observed['closedEvidence'])
    for name, expected in observed['closedEvidence'].items():
        path = (data / name).resolve()
        assert path.is_relative_to(data) and path.is_file(), 'Invalid closed evidence path: ' + name
        assert pin(path) == expected, 'Worker closed evidence changed: ' + name
    assert observed['externalAttempts'] == 0 and observed['syntheticOnly']
    assert [item['commit'] for item in observed['source']] == list(COMMITS.values())
    assert [item['label'] for item in observed['observations']] == ['rc16', 'candidate-upgrade', 'candidate-reopen-1', 'candidate-reopen-2']
    assert all(item['fullExportSQLOraclePassed'] and len(item['authenticationChecks']) == 6 for item in observed['observations'])
    assert not list(temporary.iterdir()), 'Retain any unexplained temporary files with the failed attempt'
    temporary.rmdir()
    absent.append(temporary)
    owner.capture_tree(data)
    report['result'] = pin(data / 'result.json')
    for name in COMMITS:
        command(name + '-source-after', ['node', HELPER, 'verify', out / (name + '-source.json')])
    guards()
    owner.capture_tree(out, excluded=('ownership-progress.json', 'ownership-completed.json', 'completed.json'))
    owner.finish(True)
    report['complete'] = True
except BaseException as error:
    report['failure'] = repr(error)
    try:
        owner.finish(False)
    except BaseException as final_error:
        report['finalGuardFailure'] = repr(final_error)
finally:
    report['endedAt'] = stamp()
    try:
        guards()
        report['inventory'] = {str(path.relative_to(out)): pin(path) for path in sorted(out.rglob('*'))
                               if path.is_file() and path.name != 'completed.json'}
        for path, value in owner.report['closedFiles'].items():
            assert report['inventory'].get(path) == value, 'Final inventory differs from closed evidence: ' + path
        for path, value in worker_pins.items():
            assert report['inventory'].get('evidence/' + path) == value, 'Final inventory differs from worker pin: ' + path
        report['finalCrossBindingPassed'] = True
    except BaseException as error:
        report.update(complete=False, finalCrossBindingPassed=False, inventoryFailure=repr(error))
    save(out / 'completed.json', report)
    for handle in reversed(locks):
        handle.close()
    if not report['complete']:
        sys.exit(1)
