"""Fresh exact-source build restoration for the existing export acceptance control."""
from pathlib import Path
import fcntl
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
OCT11 = HERE.parent.parent
sys.path.insert(0, str(OCT11 / 'final-matrix-public-resume'))
from envelope import Envelope, ROOT, pin, save, stamp

BASE = ROOT.parent
OUT = Path('/tmp/kairo-export-oct13/setup')
HELPER = ROOT / 'analysis/rc17/harness/source-manifest.mjs'
COMMITS = [('baseline', 'kairo-rc16-baseline', '57c8dcc7fbd8fc2b62129498d1819050c78381a1'),
           ('candidate', 'kairo-rc17-c954-continuation', '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789')]
assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE')
assert not [key for key in os.environ if key.startswith('KAIRO_')]
assert pin(HELPER)['sha256'] == '4cd636f98836261ee7808daa7ad98c7eda16f21bf8847a9ae1196042ccf58487'
OUT.mkdir(parents=True, exist_ok=False)
owner = Envelope(OUT)
locks = []
inputs = {str(path): pin(path) for path in [Path(__file__).resolve(), HELPER,
          OCT11 / 'final-matrix-public-resume/envelope.py',
          OCT11.parent / 'oct8/final-merged-frontend/ownership.py']}
report = {'schemaVersion': 1, 'scope': 'Fresh dependencies, typechecks and builds for synthetic export control; no runtime acceptance or timing claims',
          'startedAt': stamp(), 'complete': False, 'inputs': inputs, 'commands': [], 'roots': [],
          'helperSha256': pin(HELPER)['sha256'],
          'adaptedFrom': {'archive': 'analysis/rc17/completion/c954-resumption/resumed/oct11/first-assets-attribution/RAW-MANIFEST.json',
                          'member': 'public-resume/setup-runtime.py',
                          'sha256': 'e079aed02930ebaf93426b2eb559703ec3af3619872e9b4a27b4fb97c841dac0'}}

def flush():
    save(OUT / 'progress.json', report)

def guard():
    for path, expected in inputs.items():
        assert pin(path) == expected, 'Setup helper changed: ' + path
    owner.check_pins()

def command(label, argv, cwd=ROOT, timeout=660):
    guard()
    before = len(owner.report['commands'])
    try:
        owner.command(label, argv, OUT / (label + '.log'), cwd=cwd, env=dict(os.environ), timeout=timeout)
    finally:
        if len(owner.report['commands']) == before:
            raise RuntimeError('Setup command rejected before process creation: ' + label)
        original = owner.report['commands'][-1]
        row = {'args': original['command'], 'cwd': original['cwd'],
               'start': original['startedAt'], 'end': original.get('endedAt'),
               'log': original['log'], 'exitCode': original.get('exitCode'),
               'drainPassed': original.get('drainPassed', False)}
        if 'closedLog' in original:
            row.update(logBytes=original['closedLog']['bytes'], logSha256=original['closedLog']['sha256'])
        drain = original.get('descendantDrain', {})
        row['remainingProcessGroupMembers'] = [member for members in drain.get('finalGroups', {}).values() for member in members] if drain.get('complete') else None
        report['commands'].append(row)
        flush()
    assert row['exitCode'] == 0 and row['drainPassed'] and row['remainingProcessGroupMembers'] == []
    guard()
    print(json.dumps({'command': label, 'exitCode': row['exitCode']}), flush=True)

try:
    for filename in ['/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock']:
        handle = open(filename, 'a')
        locks.append(handle)
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    report['locksHeld'] = [handle.name for handle in locks]
    flush()
    command('node-version', ['node', '--version'])
    assert (OUT / 'node-version.log').read_text().strip() == 'v24.19.0'
    command('npm-version', ['npm', '--version'])
    for label, folder, commit in COMMITS:
        root = BASE / folder
        row = {'label': label, 'root': str(root), 'commit': commit, 'complete': False}
        report['roots'].append(row)
        flush()
        prebuild = OUT / (label + '-prebuild.json')
        manifest = OUT / (label + '-source.json')
        command(label + '-prebuild', ['node', HELPER, 'capture', root, prebuild, commit])
        owner.capture([prebuild])
        pre = json.loads(prebuild.read_text())
        assert pre['builtFiles'] == [] and pre['requireClean'] and not pre['dirty'] and pre['status'] == ''
        row['lockSha256Before'] = pin(root / 'package-lock.json')['sha256']
        command(label + '-install', ['npm', 'run', 'install:ci'], cwd=root)
        row['installReceipt'] = json.loads((root / 'node_modules/.sites-install.json').read_text())
        assert row['installReceipt']['lockfile_sha256'] == row['lockSha256Before']
        command(label + '-types', ['npm', 'run', 'check:kairo'], cwd=root)
        command(label + '-prebuild-verify', ['node', HELPER, 'verify', prebuild])
        command(label + '-build', ['npm', 'run', 'build'], cwd=root)
        command(label + '-capture', ['node', HELPER, 'capture', root, manifest, commit])
        owner.capture([manifest])
        source = json.loads(manifest.read_text())
        assert source['files'] == pre['files'] and source['builtFiles']
        assert row['lockSha256Before'] == pin(root / 'package-lock.json')['sha256']
        row.update(complete=True, fingerprint=source['fingerprint'], sourceFiles=len(source['files']),
                   builtFiles=len(source['builtFiles']), manifest=str(manifest))
        flush()
    for row in report['roots']:
        command(row['label'] + '-final-verify', ['node', HELPER, 'verify', row['manifest']])
    guard()
    owner.capture_tree(OUT, excluded=('progress.json', 'ownership-progress.json', 'ownership-completed.json'))
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
        guard()
        report['inventory'] = {str(path.relative_to(OUT)): pin(path) for path in sorted(OUT.rglob('*'))
                               if path.is_file() and path.name not in ('progress.json', 'receipt.json')}
        for path, value in owner.report['closedFiles'].items():
            assert report['inventory'].get(path) == value, 'Closed evidence differs: ' + path
        report['finalCrossBindingPassed'] = True
    except BaseException as error:
        report.update(complete=False, finalCrossBindingPassed=False, inventoryFailure=repr(error))
    flush()
    save(OUT / 'receipt.json', report)
    for handle in reversed(locks):
        handle.close()
    if not report['complete']:
        sys.exit(1)
