"""Prepared ordinary-only S3 coordinator. Requires the root's runtime grant."""
from pathlib import Path
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import signal
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
BINDING = '68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c'
COMMIT = 'a7b1bf97b0073695926c443e52d523638e59e48d'
PHASES = [('write', 25, 6), ('cadence', 9, 2)]  # Each phase includes its own seed child.


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text())


def save(path, value):
    data = (json.dumps(value, indent=2) + '\n').encode()
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('wb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def file_receipt(path, relative=None):
    data = path.read_bytes()
    return {'path': str(path.relative_to(relative) if relative else path), 'bytes': len(data), 'sha256': sha(data)}


def guard(self_sha):
    assert sha(Path(__file__).read_bytes()) == self_sha, 'Ordinary coordinator changed'
    for row in load(HERE / 'ordinary-gates-binding.json')['files']:
        assert file_receipt(Path(row['path'])) == row, 'Ordinary gate binding changed: ' + row['path']
    assert sha((HERE / 'prepared-harness-binding.json').read_bytes()) == BINDING, 'Reviewed binding changed'
    for row in load(HERE / 'prepared-harness-binding.json')['files']:
        assert file_receipt(Path(row['path'])) == row, 'Bound file changed: ' + row['path']
    observed = {}
    for role in ('baseline', 'candidate'):
        source = load(HERE / (role + '-source.json'))
        root = Path(source['root'])

        def git(*args):
            return subprocess.check_output(['git', '-C', str(root), *args]).decode()

        assert git('rev-parse', 'HEAD').strip() == source['sourceCommit'] == COMMIT
        assert git('status', '--porcelain', '--untracked-files=all') == source['status']
        paths = sorted(set(filter(None, git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0'))))
        rows = [file_receipt(root / path, root) for path in paths]
        assert rows == source['files'], role + ' source inventory changed'
        assert source['builtFiles'] == [] and not (root / 'dist/client').exists()
        fingerprint = sha(json.dumps({'files': rows, 'builtFiles': []}, separators=(',', ':'), ensure_ascii=False).encode())
        assert fingerprint == source['fingerprint']
        observed[role] = fingerprint
    return observed


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path, help='New outer output directory; never reused or resumed')
args = parser.parse_args()
output = args.output.resolve()
output.mkdir(parents=False, exist_ok=False)
self_sha = sha(Path(__file__).read_bytes())
receipt = {'schemaVersion': 1, 'complete': False, 'releaseReady': False, 'startedAt': stamp(),
    'sourceCommit': COMMIT, 'bindingSha256': BINDING, 'coordinatorSha256': self_sha,
    'scope': 'Six-shape ordinary write/storage ABBA then two-endpoint ordinary real cadence ABBA; no diagnostics or fixture expansion.',
    'expected': {'writeWorkers': 24, 'cadenceWorkers': 8, 'seedChildren': 2, 'minimumCadenceSeconds': 960},
    'processes': [], 'finalGuardComplete': False, 'sourceAndHarnessVerified': False,
    'limitations': ['Sequential per-pilot collector calls, not production Core concurrent dispatch.',
        'Four interior ordinary cadence shapes remain unexecuted.',
        'An interrupted worker can lack its own final JSON; existing logs and observed progress are retained without invented completion or exit status.',
        'SIGKILL or host loss cannot guarantee final receipts; atomically saved progress and phase files remain.']}
save(output / 'progress.json', receipt)
locks = []
interrupted = []


def handle_signal(signum, _frame):
    interrupted.append(signum)
    # Main loop handles group shutdown and drains both pipes before writing logs.


for handled_signal in (signal.SIGINT, signal.SIGTERM):
    signal.signal(handled_signal, handle_signal)


def check_interruption():
    if interrupted:
        raise RuntimeError('Coordinator interrupted by signal ' + str(interrupted[-1]))


def group_members(group):
    rows = []
    for directory in Path('/proc').iterdir():
        if not directory.name.isdigit():
            continue
        try:
            fields = (directory / 'stat').read_text().rsplit(')', 1)[1].split()
        except (FileNotFoundError, ProcessLookupError):
            continue
        if int(fields[2]) == group:
            rows.append({'pid': int(directory.name), 'state': fields[0]})
    return sorted(rows, key=lambda row: row['pid'])


def signal_group(group, signum, row):
    try:
        os.killpg(group, signum)
        row.setdefault('forwardedSignals', []).append({'signal': int(signum), 'at': stamp()})
    except ProcessLookupError:
        pass


def drain_group(process, row):
    # The leader's pipe EOF does not establish exit of workers writing their own files.
    process.poll()
    observation = {'initialMembers': group_members(process.pid), 'signals': []}
    row['processGroupCleanup'] = observation
    members = observation['initialMembers']
    if members:
        observation['unexpectedAfterLeaderClose'] = not interrupted and row.get('exitCode') == 0
        for signum in (signal.SIGTERM, signal.SIGKILL):
            signal_group(process.pid, signum, row)
            observation['signals'].append(int(signum))
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                process.poll()
                members = group_members(process.pid)
                if not members:
                    break
                time.sleep(0.05)
            if not members:
                break
    live_members = [member for member in members if member['state'] not in ('Z', 'X')]
    if live_members:
        # A live uninterruptible member cannot safely be followed by another trial.
        # Keep both locks and original phase logs open to inspection; do not claim
        # finalized artifacts while a process can still append to them.
        observation['boundedShutdownIncomplete'] = True
        receipt['lockReleaseBlockedByLiveProcesses'] = live_members
        save(output / 'progress.json', receipt)
        print(json.dumps({'cleanupBlocked': row['phase'], 'liveProcesses': live_members, 'locksHeld': True}), flush=True)
        while live_members:
            time.sleep(1)
            process.poll()
            members = group_members(process.pid)
            live_members = [member for member in members if member['state'] not in ('Z', 'X')]
        receipt.pop('lockReleaseBlockedByLiveProcesses', None)
        observation['liveProcessesEventuallyExitedAt'] = stamp()
    observation['finalMembers'] = members
    observation['absent'] = not members
    # Even a zombie is retained in the evidence instead of being called absent.
    observation['liveMembers'] = [member for member in members if member['state'] not in ('Z', 'X')]
    observation['complete'] = not members and not observation.get('unexpectedAfterLeaderClose', False) and not observation.get('boundedShutdownIncomplete', False)
    return observation['complete']


def phase(name, child_count, parity_groups):
    check_interruption()
    guard(self_sha)
    command = [sys.executable, str(HERE / 'run.py'), str(output / name), '--phase', name]
    row = {'phase': name, 'command': command, 'cwd': str(HERE), 'startedAt': stamp(), 'state': 'starting'}
    receipt['processes'].append(row)
    save(output / 'progress.json', receipt)
    print(json.dumps({'starting': name, 'output': str(output / name)}), flush=True)
    process = None
    stdout, stderr = b'', b''
    try:
        process = subprocess.Popen(command, cwd=HERE, env=dict(os.environ, KAIRO_SESSION_MATCHED_LOCK_HELD='1'),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        row.update(pid=process.pid, processGroup=process.pid, state='running')
        save(output / 'progress.json', receipt)
        shutdown_stage = 0
        while True:
            if interrupted:
                shutdown_signal = (signal.SIGINT, signal.SIGTERM, signal.SIGKILL)[min(shutdown_stage, 2)]
                signal_group(process.pid, shutdown_signal, row)
                shutdown_stage += 1
            try:
                stdout, stderr = process.communicate(timeout=5)
                break
            except subprocess.TimeoutExpired:
                pass
        row.update(exitCode=process.returncode, state='closed')
    finally:
        # Popen/communicate errors must not orphan a measurement process.
        row['cleanupFailures'] = []
        if process is not None:
            try:
                if process.poll() is None:
                    signal_group(process.pid, signal.SIGTERM, row)
                    try:
                        stdout, stderr = process.communicate(timeout=5)
                    except subprocess.TimeoutExpired:
                        signal_group(process.pid, signal.SIGKILL, row)
                        stdout, stderr = process.communicate(timeout=5)
                    row.update(exitCode=process.returncode, state='closed-after-error')
            except BaseException as error:
                row['cleanupFailures'].append(repr(error))
            try:
                if not drain_group(process, row):
                    row['cleanupFailures'].append('Process group not clean after leader exit; see processGroupCleanup')
            except BaseException as error:
                row['cleanupFailures'].append(repr(error))
            # Drain/reap again after group cleanup, including a leader that exited
            # during shutdown; communicate preserves its prior buffered output.
            try:
                stdout, stderr = process.communicate(timeout=5)
                row['exitCode'] = process.returncode
                if row.get('state') != 'closed':
                    row['state'] = 'closed-after-error'
            except BaseException as error:
                row['cleanupFailures'].append(repr(error))
        for channel, data in [('stdout', stdout), ('stderr', stderr)]:
            path = output / (name + '.' + channel + '.log')
            try:
                with path.open('xb') as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                row[channel] = file_receipt(path, output)
            except BaseException as error:
                row.setdefault('receiptFailures', []).append({'channel': channel, 'error': repr(error)})
        row['endedAt'] = stamp()
        # Preserve the phase's actual state, including an unfinalized active child.
        for filename in ('completed.json', 'failed.json', 'progress.json'):
            path = output / name / filename
            if path.exists():
                row.setdefault('phaseReceipts', []).append(file_receipt(path, output))
        progress = output / name / 'progress.json'
        if progress.exists():
            value = load(progress)
            row['observedPhaseState'] = {key: value.get(key) for key in ('complete', 'activeChild', 'seedDirectory', 'failure')}
        save(output / 'progress.json', receipt)
    check_interruption()
    assert not row['cleanupFailures'], name + ' process cleanup failed'
    assert not row.get('receiptFailures'), name + ' process receipt failed'
    assert process.returncode == 0, name + ' coordinator failed'
    value = load(output / name / 'completed.json')
    assert value['complete'] and value['sourceAndHarnessVerified'] and value['parity']['complete']
    assert value['phase'] == name and len(value['children']) == child_count
    assert len(value['parity']['groups']) == parity_groups
    for child in value['children']:
        assert child['exitCode'] == 0
        raw = load(output / name / (child['label'] + '.json'))
        assert raw['complete'] and raw['sourceVerified']
        if name == 'cadence' and child['mode'] == 'cadence':
            assert raw['measurement']['elapsedMs'] >= 120000 and len(raw['tickWorkMs']) == 41
            assert raw['actualTickOffsetsMs'][40] >= raw['schedule']['firstLiveDueOffsetMs']
    for artifact in value['artifacts']:
        assert file_receipt(output / name / artifact['path'], output / name) == artifact
    row['artifactsVerified'] = True
    guard(self_sha)
    print(json.dumps({'completed': name, 'workers': child_count - 1}), flush=True)


try:
    if os.environ.get('KAIRO_SESSION_MATCHED_LOCK_HELD') == '1':
        receipt['lockOwnership'] = 'Both established locks declared held by parent'
    else:
        for lock_path in ('/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock'):
            handle = open(lock_path, 'a')
            locks.append(handle)
            while True:
                check_interruption()
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    time.sleep(0.25)
        receipt['lockOwnership'] = 'Both established locks acquired by this coordinator'
    check_interruption()
    for filename in ('prepared-harness-binding.json', 'ordinary-gates-binding.json', 'baseline-source.json',
                     'candidate-source.json', 'source-boundary.json', 'baseline-ablation.patch', 'run-ordinary-gates.py'):
        with (output / filename).open('xb') as handle:
            handle.write((HERE / filename).read_bytes())
            handle.flush()
            os.fsync(handle.fileno())
    receipt['sources'] = guard(self_sha)
    receipt['initialGuardComplete'] = True
    save(output / 'progress.json', receipt)
    for name, children, groups in PHASES:
        phase(name, children, groups)
    receipt['complete'] = True
except BaseException as error:
    receipt['failure'] = repr(error)
finally:
    try:
        receipt['finalSources'] = guard(self_sha)
        receipt['finalGuardComplete'] = True
        receipt['sourceAndHarnessVerified'] = receipt.get('initialGuardComplete', False)
    except BaseException as error:
        receipt['finalGuardError'] = repr(error)
        receipt['complete'] = False
    receipt['artifacts'], receipt['artifactInventoryFailures'] = [], []
    try:
        for path in sorted(output.rglob('*')):
            if path.is_file() and path not in (output / 'progress.json', output / 'completed.json', output / 'failed.json'):
                try:
                    receipt['artifacts'].append(file_receipt(path, output))
                except BaseException as error:
                    receipt['artifactInventoryFailures'].append({'path': str(path), 'error': repr(error)})
                    receipt['complete'] = False
    except BaseException as error:
        receipt['artifactInventoryFailures'].append({'error': repr(error)})
        receipt['complete'] = False
    if interrupted:
        receipt['interruptSignals'] = interrupted
        receipt['complete'] = False
    receipt['endedAt'] = stamp()
    save(output / ('completed.json' if receipt['complete'] else 'failed.json'), receipt)
    save(output / 'progress.json', receipt)
    for handle in reversed(locks):
        handle.close()
    print(json.dumps({'complete': receipt['complete'], 'output': str(output), 'locksReleased': bool(locks)}), flush=True)
raise SystemExit(0 if receipt['complete'] else 1)
