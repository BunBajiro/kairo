"""Run three independently bankable original-workload stages, in fixed order."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
import time
from envelope import Envelope, ROOT, pin, save, stamp

HERE = Path(__file__).resolve().parent
BASE = ROOT.parent
SETUP = Path('/tmp/kairo-public-resume-20261011/setup')
MATRIX_SETUP = SETUP.parent / 'setup-matrix'
OUT = Path('/tmp/kairo-final-matrix-public-20261011/attempt1')
STAGES = ('historical', 'comparison', 'ui')
COMMITS = {'candidate': '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789',
           'rc16': '57c8dcc7fbd8fc2b62129498d1819050c78381a1',
           'v073': '239794774320fcdebaa1d76ce8a77c5c25cfc48c'}
ROOTS = {'candidate': BASE / 'kairo-rc17-c954-continuation',
         'rc16': BASE / 'kairo-rc16-baseline', 'v073': BASE / 'kairo-v073-final-baseline'}
LANES = ('frontend-refresh', 'admin-polling', 'frontend-models', 'studio-stream',
         'session-replay-repeat-small', 'session-replay-repeat-cap', 'session-replay-distinct-cap')
SOURCE_HELPER = ROOT / 'analysis/rc17/harness/source-manifest.mjs'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage', choices=STAGES, required=True)
args = parser.parse_args()
assert os.environ.get('KAIRO_FINAL_MATRIX_GRANTED') == '1', 'Coordinator runtime grant required'
assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE')
unexpected = [key for key in os.environ if key.startswith('KAIRO_') and key not in
              ('KAIRO_FINAL_MATRIX_GRANTED', 'KAIRO_CHROME_PATH')]
assert not unexpected, 'Refuse inherited workload/instrumentation overrides: ' + repr(unexpected)
out = OUT / args.stage
out.mkdir(parents=True, exist_ok=False)
owner = Envelope(out)
report = {'schemaVersion': 1, 'stage': args.stage, 'startedAt': stamp(), 'complete': False,
          'reviewReady': False, 'sourceCommits': COMMITS, 'originalInputs': {},
          'limitations': ['Successful envelope collection is not performance or release acceptance.',
                         'Historical/backend/UI workers retain their existing sampling and assertion limits.',
                         'An orchestrator can contain several original fresh workers: its nested files are pinned at that orchestrator exit; no in-window filesystem monitor is added.',
                         'Original reports may precede their finally-cleanup; this external owner additionally requires actual descendant absence.']}
lock = None
env = dict(os.environ, CANDIDATE_SHA=COMMITS['candidate'],
           KAIRO_CHROME_PATH='/tmp/kairo-chrome-runtime/chromium', LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime')
inputs = {}

def remember(path):
    path = Path(path)
    inputs[str(path)] = pin(path)
    return path

def assert_inputs():
    for path, value in inputs.items():
        assert pin(path) == value, 'Input changed: ' + path

def command(label, argv, timeout=900):
    assert_inputs()
    owner.command(label, argv, out / (label + '.log'), env=env, timeout=timeout)
    assert_inputs()

def copy_input(source, destination):
    remember(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as file:
        file.write(source.read_bytes())
    assert pin(destination) == inputs[str(source)]
    owner.capture([destination])

def verify_sources(suffix):
    for name in COMMITS:
        command(name + '-' + suffix, ['node', SOURCE_HELPER, 'verify', out / (name + '-source.json')])

def verify_prior():
    for previous in STAGES[:STAGES.index(args.stage)]:
        directory = OUT / previous
        receipt = directory / 'completed.json'
        old = json.loads(receipt.read_text())
        assert old['complete'] and old['sourceCommits'] == COMMITS
        for name, value in old['inventory'].items():
            assert pin(directory / name) == value, 'Prior stage evidence changed: ' + str(directory / name)
        for path, value in old['originalInputs'].items():
            assert pin(path) == value, 'Prior stage input changed: ' + path
        remember(receipt)

try:
    lock = open('/tmp/kairo-performance.lock', 'a')
    while True:
        if owner.interrupted:
            raise RuntimeError('Interrupted while waiting for performance lock')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            time.sleep(0.1)
    verify_prior()
    # Bind all code in the original harness families and the few exact JSON inputs.
    families = [ROOT / 'analysis/rc16', ROOT / 'analysis/rc17/harness']
    families += [ROOT / 'analysis/rc17/completion' / name for name in
                 ('frontend-refresh', 'admin-polling', 'frontend-models', 'studio-stream', 'session-replay', 'startup')]
    families += [HERE, HERE.parent.parent / 'oct8/final-merged-frontend']
    for family in families:
        for path in sorted(family.rglob('*')):
            if path.is_file() and path.suffix in ('.mjs', '.py'):
                remember(path)
    for path in ('analysis/rc17/completion/ui-ci-lane.mjs',
                 'analysis/rc16/historical/retrieval-manifest.json', 'analysis/rc16/rc16-source-manifest.json'):
        remember(ROOT / path)
    remember(Path(env['KAIRO_CHROME_PATH']))
    for name, commit in COMMITS.items():
        setup = SETUP if name == 'candidate' else MATRIX_SETUP
        manifest = setup / (name + '-source.json')
        value = json.loads(manifest.read_text())
        assert value['root'] == str(ROOTS[name]) and value['sourceCommit'] == commit
        assert value['expectedCommit'] == commit and value['requireClean'] and not value['dirty'] and value['status'] == ''
        assert value['builtFiles'], 'Fresh built assets required'
        copy_input(manifest, out / (name + '-source.json'))
        copy_input(setup / (name + '-prebuild.json'), out / (name + '-prebuild.json'))
        before = json.loads((out / (name + '-prebuild.json')).read_text())
        assert before['files'] == value['files'] and not before['builtFiles']
    for name, setup in [('candidate', SETUP), ('matrix', MATRIX_SETUP)]:
        copy_input(setup / 'receipt.json', out / (name + '-setup-receipt.json'))
        assert json.loads((out / (name + '-setup-receipt.json')).read_text())['complete']
        copy_input(setup / 'inventory.json', out / (name + '-setup-inventory.json'))
    matrix_receipt = json.loads((MATRIX_SETUP / 'receipt.json').read_text())
    for name in ('rc16', 'v073'):
        rows = [row for row in matrix_receipt['commands'] if row['args'] == ['npm', 'run', 'build']
                and row['cwd'] == str(ROOTS[name])]
        assert len(rows) == 1
        row = rows[0]
        assert row['exitCode'] == 0 and not row['remainingProcessGroupMembers'] and row['start'] and row['end']
        original_log = MATRIX_SETUP / row['log']
        assert pin(original_log) == {'bytes': row['logBytes'], 'sha256': row['logSha256']}
        copy_input(original_log, out / (name + '-build.log'))
    setup_receipt = json.loads((SETUP / 'receipt.json').read_text())
    builds = [row for row in setup_receipt['commands'] if row['args'] == ['npm', 'run', 'build']
              and row['cwd'] == str(ROOTS['candidate'])]
    assert len(builds) == 1
    build = builds[0]
    assert build['exitCode'] == 0 and not build['remainingProcessGroupMembers'] and build['start'] and build['end']
    build_log = SETUP / build['log']
    assert pin(build_log) == {'bytes': build['logBytes'], 'sha256': build['logSha256']}
    copy_input(build_log, out / 'candidate-build.log')
    source = json.loads((out / 'candidate-source.json').read_text())
    package_lock = ROOTS['candidate'] / 'package-lock.json'
    remember(package_lock)
    remember(SETUP / 'node-version.log')
    # Preserve the actual accessible build-log path; do not reconstruct or retime it.
    studio = {'schemaVersion': 1, 'sourceCommit': source['sourceCommit'], 'sourceFingerprint': source['fingerprint'],
              'sourceTree': '35826c9d50c45702ff103e1f173e05c529ba2d9c',
              'node': (SETUP / 'node-version.log').read_text().strip(),
              'buildCommand': 'npm run build', 'exitCode': 0, 'startedAt': build['start'], 'completedAt': build['end'],
              'buildLog': str(build_log), 'logSha256': build['logSha256'],
              'lockfileSha256': pin(package_lock)['sha256'], 'reviewReady': False,
              'derivedFrom': str(SETUP / 'receipt.json'), 'derivedFromSha256': pin(SETUP / 'receipt.json')['sha256']}
    (out / 'completion-ui').mkdir()
    save(out / 'completion-ui/build-receipt.json', studio)
    owner.capture([out / 'completion-ui/build-receipt.json'])
    save(out / 'inputs.json', inputs)
    owner.capture([out / 'inputs.json'])
    report['originalInputs'] = inputs.copy()
    verify_sources('before')
    if args.stage == 'historical':
        command('legacy-corrected-run', ['node', ROOT / 'analysis/rc16/followup/harness/legacy-corrected-run.mjs',
                ROOTS['v073'], ROOTS['rc16'], out / 'legacy-corrected'], timeout=1800)
        owner.capture_tree(out / 'legacy-corrected')
        command('legacy-corrected-summary', ['python3', ROOT / 'analysis/rc16/harness/legacy-summary.py', out / 'legacy-corrected'])
        owner.capture_tree(out / 'legacy-corrected')
    elif args.stage == 'comparison':
        command('original-comparison', ['python3', HERE / 'local-run-owned.py', ROOTS['rc16'], ROOTS['candidate'],
                out / 'comparison', '--lanes', 'maps', 'routes', 'backend', 'memory', 'mixed', 'restart', 'browser', 'browser-performance'], timeout=21600)
        owner.capture_tree(out / 'comparison')
        packet = json.loads((out / 'comparison/run.json').read_text())
        nested = json.loads((out / 'comparison/ownership-completed.json').read_text())
        assert packet['complete'] and nested['complete']
        for name, value in nested['closedFiles'].items():
            assert pin(out / 'comparison' / name) == value
    else:
        for lane in LANES:
            command(lane + '-owner', ['flock', '/tmp/kairo-rc16-benchmark.lock', 'node',
                    ROOT / 'analysis/rc17/completion/ui-ci-lane.mjs', lane, ROOTS['candidate'],
                    out / 'candidate-source.json', out / 'completion-ui'], timeout=660)
            owner.capture_tree(out / 'completion-ui' / lane)
            assert json.loads((out / 'completion-ui' / lane / 'lane-receipt.json').read_text())['complete']
    verify_sources('after')
    verify_prior()
    assert_inputs()
    owner.capture_tree(out, excluded=('ownership-progress.json', 'ownership-completed.json', 'completed.json'))
    owner.finish(True)
    report['complete'] = True
except BaseException as error:
    report['failure'] = repr(error)
    try:
        owner.finish(False)
    except BaseException as guard_error:
        report['finalGuardFailure'] = repr(guard_error)
    raise
finally:
    report['endedAt'] = stamp()
    try:
        owner.check_pins()
        assert_inputs()
        report['inventory'] = {str(path.relative_to(out)): pin(path) for path in sorted(out.rglob('*'))
                               if path.is_file() and path.name != 'completed.json'}
        for path, value in owner.report['closedFiles'].items():
            assert report['inventory'].get(path) == value, 'Final inventory disagrees with closed-file pin: ' + path
        report['finalCrossBindingPassed'] = True
    except BaseException as error:
        report.update(complete=False, finalCrossBindingPassed=False, inventoryFailure=repr(error))
    save(out / 'completed.json', report)
    if lock:
        lock.close()
    if not report['complete']:
        sys.exit(1)
