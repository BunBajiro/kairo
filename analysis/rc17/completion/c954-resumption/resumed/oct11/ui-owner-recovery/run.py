"""Complete only the two unrun UI lanes after the schema-only owner correction."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'final-matrix-public-resume'))
from envelope import Envelope, ROOT, pin, save, stamp

OLD = Path('/tmp/kairo-final-matrix-public-20261011/attempt1')
OUT = OLD.parent / 'ui-owner-recovery-attempt1'
CANONICAL = ROOT / 'analysis/rc17/completion/ui-ci-lane.mjs'
ARCHIVED = HERE / 'original-ui-ci-lane.mjs'
PROPOSED = HERE / 'proposed-ui-ci-lane.mjs'
APP = ROOT.parent / 'kairo-rc17-c954-continuation'
COMMIT = '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'
SOURCE = OLD / 'ui/candidate-source.json'
HELPER = ROOT / 'analysis/rc17/harness/source-manifest.mjs'
LANES = ('session-replay-repeat-cap', 'session-replay-distinct-cap')
RETAINED = ('frontend-refresh', 'admin-polling', 'frontend-models', 'studio-stream')
ORIGINAL_SHA = '58ff9778d7dc8857bad3f9c29d2c53e55b1ffd95115348c49ef7d482e8441b43'
parser = argparse.ArgumentParser(description=__doc__)
parser.parse_args()
assert os.environ.get('KAIRO_UI_OWNER_RECOVERY_GRANTED') == '1', 'Reviewed coordinator grant required'
assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE')
assert not [name for name in os.environ if name.startswith('KAIRO_') and name not in
            ('KAIRO_UI_OWNER_RECOVERY_GRANTED', 'KAIRO_CHROME_PATH')], 'Inherited workload overrides refused'
OUT.mkdir(exist_ok=False)
owner = Envelope(OUT)
report = {'schemaVersion': 1, 'startedAt': stamp(), 'complete': False, 'reviewReady': False,
          'originalAttemptComplete': False, 'originalFailedReceiptsRewritten': False,
          'executedLanes': list(LANES), 'retainedSuccessfulLanes': list(RETAINED),
          'adoptedExistingWorker': 'session-replay-repeat-small', 'sourceCommit': COMMIT,
          'originalInputs': {}, 'historicalInputRebindings': [],
          'limitations': ['Local UI completion is assembled from immutable successful receipts, independently adopted worker evidence and two fresh lanes.',
                         'The original failed UI attempt remains failed.', 'This is not independent Actions or final release acceptance.']}
locks = []
inputs = {}
env = dict(os.environ, CANDIDATE_SHA=COMMIT, KAIRO_CHROME_PATH='/tmp/kairo-chrome-runtime/chromium',
           LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime')

def remember(path):
    path = Path(path)
    inputs[str(path)] = pin(path)

def guard():
    for path, expected in inputs.items():
        assert pin(path) == expected, 'Bound input changed: ' + path
    owner.check_pins()

def prior_guard():
    for stage in ('historical', 'comparison', 'ui'):
        path = OLD / stage / 'completed.json'
        record = json.loads(path.read_text())
        assert record['complete'] is (stage != 'ui')
        for rel, expected in record['inventory'].items():
            assert pin(path.parent / rel) == expected, 'Prior raw file changed: ' + str(path.parent / rel)
        for original, expected in record['originalInputs'].items():
            actual_path = ARCHIVED if original == str(CANONICAL) else Path(original)
            assert pin(actual_path) == expected, 'Prior input changed: ' + original
            if actual_path == ARCHIVED:
                assert expected['sha256'] == ORIGINAL_SHA
        remember(path)

def command(label, argv, timeout=900):
    guard()
    owner.command(label, argv, OUT / (label + '.log'), env=env, timeout=timeout)
    guard()

def temporary_absence():
    remaining = [str(path) for path in Path('/tmp').glob('kairo-rc16-frontend-*')]
    report.setdefault('temporaryObservations', []).append({'at': stamp(), 'paths': remaining})
    assert not remaining, 'Replay temporary paths remain: ' + repr(remaining)

try:
    for path in ('/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock'):
        lock = open(path, 'a')
        locks.append(lock)
        while True:
            if owner.interrupted:
                raise RuntimeError('Interrupted while waiting for locks')
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(.1)
    assert pin(ARCHIVED)['sha256'] == ORIGINAL_SHA
    assert PROPOSED.read_text() == ARCHIVED.read_text().replace('assert.equal(result.smoke,false)', 'assert.equal(result.environment?.smoke,false)')
    assert pin(CANONICAL) == pin(PROPOSED), 'Canonical schema correction must be reviewed, banked and installed first'
    report['oldOwner'] = {'path': str(ARCHIVED), **pin(ARCHIVED)}
    report['newOwner'] = {'path': str(CANONICAL), **pin(CANONICAL)}
    prior_guard()
    report['historicalInputRebindings'] = [{'original': str(CANONICAL), 'preservedArchive': str(ARCHIVED),
                                          **pin(ARCHIVED), 'scope': 'Only this changed owner input is rebound for old receipts; all other paths and hashes are unchanged'}]
    for lane in RETAINED:
        receipt = OLD / 'ui/completion-ui' / lane / 'lane-receipt.json'
        value = json.loads(receipt.read_text())
        assert value['complete'] and value['exitCode'] == 0 and value['sourceVerifiedBefore'] and value['sourceVerifiedAfter']
        assert value['sourceCommit'] == COMMIT
        remember(receipt)
    adoption_path = HERE / 'REPEAT-SMALL-ADOPTION.json'
    adoption = json.loads(adoption_path.read_text())
    assert adoption['eligible'] and adoption['correctedReplayAssertionsPassed'] and not adoption['measurementRerun']
    assert adoption['originalAttemptComplete'] is False and adoption['originalLaneReceiptComplete'] is False
    assert adoption['sourceCommit'] == COMMIT and adoption['replayCase'] == 'repeat-small'
    assert adoption['smoke'] is False and adoption['measuredCycles'] == 12
    for value in adoption['bindings'].values():
        assert pin(value['path']) == {key: value[key] for key in ('bytes', 'sha256')}
        remember(value['path'])
    controls = json.loads((HERE / 'OWNER-SCHEMA-CONTROLS.json').read_text())
    assert controls['complete'] and len(controls['checks']) == 19
    remember(adoption_path)
    source = json.loads(SOURCE.read_text())
    assert source['sourceCommit'] == COMMIT and source['root'] == str(APP) and not source['dirty']
    assert source['fingerprint'] == adoption['sourceFingerprint'] and len(source['builtFiles']) == 20
    for path in (CANONICAL, SOURCE, HERE / 'run.py', HERE / 'owner-schema-controls.mjs',
                 HERE.parent / 'final-matrix-public-resume/envelope.py',
                 HERE.parent.parent / 'oct8/final-merged-frontend/ownership.py', HELPER,
                 ROOT / 'analysis/rc17/completion/session-replay/compiled-replay-trial.mjs',
                 Path(env['KAIRO_CHROME_PATH'])):
        remember(path)
    report['sourceFingerprint'] = source['fingerprint']
    report['originalInputs'] = inputs.copy()
    for name, path in [('candidate-source.json', SOURCE), ('repeat-small-adoption.json', adoption_path)]:
        (OUT / name).write_bytes(path.read_bytes())
        assert pin(OUT / name) == pin(path)
        owner.capture([OUT / name])
    save(OUT / 'inputs.json', inputs)
    owner.capture([OUT / 'inputs.json'])
    temporary_absence()
    command('source-before', ['node', HELPER, 'verify', OUT / 'candidate-source.json'])
    for lane in LANES:
        assert not (OLD / 'ui/completion-ui' / lane).exists(), 'Refuse to rerun an already started original lane'
        command(lane, ['node', CANONICAL, lane, APP, OUT / 'candidate-source.json', OUT / 'completion-ui'], timeout=660)
        owner.capture_tree(OUT / 'completion-ui' / lane)
        value = json.loads((OUT / 'completion-ui' / lane / 'lane-receipt.json').read_text())
        assert value['complete'] and value['sourceCommit'] == COMMIT and value['sourceFingerprint'] == source['fingerprint']
        assert value['ownerSha256'] == report['newOwner']['sha256']
        temporary_absence()
    command('source-after', ['node', HELPER, 'verify', OUT / 'candidate-source.json'])
    prior_guard()
    guard()
    temporary_absence()
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
        report['inventory'] = {str(path.relative_to(OUT)): pin(path) for path in sorted(OUT.rglob('*'))
                               if path.is_file() and path.name != 'completed.json'}
        for path, expected in owner.report['closedFiles'].items():
            assert report['inventory'].get(path) == expected
        report['finalCrossBindingPassed'] = True
    except BaseException as error:
        report.update(complete=False, finalCrossBindingPassed=False, inventoryFailure=repr(error))
    save(OUT / 'completed.json', report)
    for lock in reversed(locks):
        lock.close()
    if not report['complete']:
        sys.exit(1)
