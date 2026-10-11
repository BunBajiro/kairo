"""Original updater workloads with the reviewed external ownership envelope."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parent
ENVELOPE = HERE.parent / 'final-matrix-public-resume'
sys.path.insert(0, str(ENVELOPE))
from envelope import Envelope, ROOT, pin, save, stamp

SETUP = Path('/tmp/kairo-public-resume-20261011/setup')
APP = ROOT.parent / 'kairo-rc17-c954-continuation'
COMMIT = '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'
OUT = Path('/tmp/kairo-updater-final-20261011/attempt1')
ARCHIVE = OUT.parent / 'official-3552227.zip'
ARCHIVE_PIN = {'bytes': 99197259, 'sha256': '0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83'}
BUILD = 3552227
ORDER = ['loaded-control-1', 'loaded-conversion-1', 'loaded-conversion-2',
         'loaded-control-2', 'loaded-control-3', 'loaded-conversion-3']
HELPER = ROOT / 'analysis/rc17/harness/source-manifest.mjs'
UPDATER = ROOT / 'analysis/rc17/completion/updater'
parser = argparse.ArgumentParser(description=__doc__)
parser.parse_args()
assert os.environ.get('KAIRO_FINAL_UPDATER_GRANTED') == '1', 'Coordinator runtime grant required'
assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE')
assert not [key for key in os.environ if key.startswith('KAIRO_') and key not in
            ('KAIRO_FINAL_UPDATER_GRANTED', 'KAIRO_CHROME_PATH')], 'Inherited workload overrides refused'
OUT.mkdir(exist_ok=False)
owner = Envelope(OUT)
report = {'schemaVersion': 1, 'complete': False, 'reviewReady': False, 'startedAt': stamp(),
          'sourceCommit': COMMIT, 'originalInputs': {}, 'temporaryPathObservations': [],
          'workload': {'inventoryActivations': 25, 'loadedWindowMs': 60000, 'loadedOrder': ORDER},
          'lockOwnership': {'order': ['/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock'],
                            'owner': 'This coordinator holds both locks through actual descendant drain and final evidence checks',
                            'loadedExistingGuard': 'KAIRO_UPDATER_LOCKED=1 prevents reacquisition of the genuinely held outer performance lock'},
          'limitations': ['Local collection is not performance acceptance or independent Actions evidence.',
                         'Original six-window loaded report is pinned after its owner exits; no filesystem observer enters measured windows.',
                         'Retain building-interval latency, restart gaps and all adverse rows; success is not a uniform improvement claim.']}
locks = []
inputs = {}
env = dict(os.environ, KAIRO_PERF_APP_ROOT=str(APP), KAIRO_SOURCE_MANIFEST=str(OUT / 'candidate-source.json'),
           KAIRO_UPDATER_ARCHIVE=str(ARCHIVE), KAIRO_UPDATER_BUILD=str(BUILD),
           KAIRO_UPDATER_ARCHIVE_SHA256=ARCHIVE_PIN['sha256'], KAIRO_UPDATER_LOCKED='1')

def remember(path):
    path = Path(path)
    inputs[str(path)] = pin(path)

def guard():
    for path, value in inputs.items():
        assert pin(path) == value, 'Input changed: ' + path
    owner.check_pins()

def copy_input(source, destination):
    remember(source)
    with destination.open('xb') as file:
        file.write(source.read_bytes())
    assert pin(destination) == inputs[str(source)]
    owner.capture([destination])

def temporary_absence(label):
    remaining = [str(path) for prefix in ('kairo-inventory-cost-', 'kairo-updater-loaded-')
                 for path in Path('/tmp').glob(prefix + '*')]
    report['temporaryPathObservations'].append({'label': label, 'at': stamp(), 'paths': remaining})
    assert not remaining, 'Updater temporary paths remain; preserve them for diagnosis: ' + repr(remaining)

def command(label, argv, timeout=900):
    guard()
    owner.command(label, argv, OUT / (label + '.log'), env=env, timeout=timeout)
    guard()

try:
    for path in report['lockOwnership']['order']:
        lock = open(path, 'a')
        locks.append(lock)
        while True:
            if owner.interrupted:
                raise RuntimeError('Interrupted during lock acquisition')
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(0.1)
    report['lockOwnership']['acquiredAt'] = stamp()
    temporary_absence('before')
    assert pin(ARCHIVE) == ARCHIVE_PIN
    remember(ARCHIVE)
    download = ARCHIVE.parent / 'download-receipt.json'
    value = json.loads(download.read_text())
    assert value['build'] == BUILD and value['path'] == str(ARCHIVE)
    assert {key: value[key] for key in ('bytes', 'sha256')} == ARCHIVE_PIN
    copy_input(download, OUT / 'archive-download-receipt.json')
    for name, destination in [('candidate-source.json', 'candidate-source.json'),
                              ('candidate-prebuild.json', 'candidate-prebuild.json'),
                              ('receipt.json', 'setup-receipt.json'), ('inventory.json', 'setup-inventory.json')]:
        copy_input(SETUP / name, OUT / destination)
    source = json.loads((OUT / 'candidate-source.json').read_text())
    prebuild = json.loads((OUT / 'candidate-prebuild.json').read_text())
    assert source['sourceCommit'] == source['expectedCommit'] == COMMIT
    assert source['root'] == str(APP) and source['requireClean'] and not source['dirty'] and source['status'] == ''
    assert len(source['builtFiles']) == 20 and prebuild['files'] == source['files'] and not prebuild['builtFiles']
    setup = json.loads((SETUP / 'receipt.json').read_text())
    assert setup['complete']
    builds = [row for row in setup['commands'] if row['args'] == ['npm', 'run', 'build'] and row['cwd'] == str(APP)]
    assert len(builds) == 1 and builds[0]['exitCode'] == 0 and not builds[0]['remainingProcessGroupMembers']
    build = builds[0]
    assert pin(SETUP / build['log']) == {'bytes': build['logBytes'], 'sha256': build['logSha256']}
    copy_input(SETUP / build['log'], OUT / 'candidate-build.log')
    inventory = json.loads((SETUP / 'inventory.json').read_text())
    assert inventory['complete']
    for row in inventory['files']:
        assert pin(SETUP / row['path']) == {key: row[key] for key in ('bytes', 'sha256')}
    for directory in (UPDATER, ROOT / 'analysis/rc17/harness'):
        for path in directory.rglob('*.mjs'):
            remember(path)
    for path in (Path(__file__), ENVELOPE / 'envelope.py',
                 HERE.parent.parent / 'oct8/final-merged-frontend/ownership.py'):
        remember(path)
    report['sourceFingerprint'] = source['fingerprint']
    report['originalInputs'] = inputs.copy()
    save(OUT / 'inputs.json', inputs)
    owner.capture([OUT / 'inputs.json'])
    command('source-before', ['node', HELPER, 'verify', OUT / 'candidate-source.json'])
    command('inventory', ['node', UPDATER / 'inventory-run.mjs', OUT / 'inventory.json'])
    owner.capture([OUT / 'inventory.json'])
    temporary_absence('after-inventory')
    result = json.loads((OUT / 'inventory.json').read_text())
    assert result['complete'] and result['sourceCommit'] == COMMIT and result['sourceFingerprint'] == source['fingerprint'] and not result['sourceDirty']
    assert len(result['samples']) == 25 and [row['index'] for row in result['samples']] == list(range(25))
    assert len(result['files']) == 6
    # Existing lock guard is used only while this coordinator really owns both locks.
    command('loaded', ['node', UPDATER / 'loaded-run.mjs', OUT / 'loaded'], timeout=1800)
    owner.capture_tree(OUT / 'loaded')
    temporary_absence('after-loaded')
    result = json.loads((OUT / 'loaded/loaded.json').read_text())
    assert result['complete'] and result['endVerified'] and result['sourceCommit'] == COMMIT
    assert result['sourceFingerprint'] == source['fingerprint'] and not result['sourceDirty']
    assert result['windowMs'] == 60000 and result['order'] == ORDER
    assert result['archive'] == {'build': BUILD, **ARCHIVE_PIN}
    assert [row['name'] for row in result['runs']] == ORDER
    for row in result['runs']:
        assert row['complete'] and not row.get('error') and not row.get('shutdownError') and not row['errors']
        assert row['endedAt'] - row['startedAt'] >= 60000
        if row['conversion']:
            assert row['outputManifest']['build'] == BUILD
            assert row['outputManifest']['sourceArchiveSha256'] == ARCHIVE_PIN['sha256']
    command('source-after', ['node', HELPER, 'verify', OUT / 'candidate-source.json'])
    temporary_absence('final')
    guard()
    owner.capture_tree(OUT, excluded=('ownership-progress.json', 'ownership-completed.json', 'completed.json'))
    owner.finish(True)
    report['complete'] = True
except BaseException as error:
    report['failure'] = repr(error)
    try:
        owner.finish(False)
    except BaseException as final_error:
        report['finalGuardFailure'] = repr(final_error)
    raise
finally:
    report['endedAt'] = stamp()
    try:
        guard()
        temporary_absence('final-inventory')
        report['inventory'] = {str(path.relative_to(OUT)): pin(path) for path in sorted(OUT.rglob('*'))
                               if path.is_file() and path.name != 'completed.json'}
        for path, value in owner.report['closedFiles'].items():
            assert report['inventory'].get(path) == value, 'Final inventory mismatch: ' + path
        report['finalCrossBindingPassed'] = True
    except BaseException as error:
        report.update(complete=False, finalCrossBindingPassed=False, inventoryFailure=repr(error))
    save(OUT / 'completed.json', report)
    for lock in reversed(locks):
        lock.close()
    if not report['complete']:
        sys.exit(1)
