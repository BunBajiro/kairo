"""Boundary-only ownership and immutable evidence checks; no timed-worker changes."""
import ctypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path('/workspace/scratch/a2f3334402fc/kairo-analysis-restored')
sys.path.insert(0, str(ROOT / 'analysis/rc17/completion/c954-resumption/resumed/oct8/final-merged-frontend'))
from ownership import NamespaceCensus, status_ids

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def pin(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise RuntimeError('Expected regular evidence file: ' + str(path))
    raw = path.read_bytes()
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w') as file:
        file.write(json.dumps(value, indent=2) + '\n')
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)

class Envelope:
    def __init__(self, output):
        self.output = Path(output)
        self.receipt = self.output / 'ownership-progress.json'
        self.report = {'schemaVersion': 1, 'startedAt': stamp(), 'complete': False,
                       'reviewReady': False, 'commands': [], 'closedFiles': {},
                       'scope': 'Original commands with boundary-only process ownership and evidence hashes'}
        self.census = NamespaceCensus()
        self.self_host = int(Path('/proc/self/stat').read_text().split(' ', 1)[0])
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(36, 1, 0, 0, 0):  # PR_SET_CHILD_SUBREAPER
            raise OSError(ctypes.get_errno(), 'Cannot establish descendant ownership')
        self.interrupted = []
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda value, frame: self.interrupted.append(value))
        self.flush()

    def flush(self):
        save(self.receipt, self.report)

    def check_pins(self):
        for path, expected in self.report['closedFiles'].items():
            if pin(self.output / path) != expected:
                raise RuntimeError('Closed evidence changed: ' + path)

    def capture(self, paths):
        self.check_pins()
        for path in paths:
            path = Path(path)
            name = str(path.relative_to(self.output))
            value = pin(path)
            if name in self.report['closedFiles'] and self.report['closedFiles'][name] != value:
                raise RuntimeError('Closed evidence changed: ' + name)
            self.report['closedFiles'][name] = value
        self.flush()

    def capture_tree(self, root, excluded=()):
        root = Path(root)
        self.capture(path for path in sorted(root.rglob('*'))
                     if path.is_file() and path.name not in excluded)

    def adopted(self):
        """Only this subreaper's direct descendants; mounted /proc IDs are mapped."""
        records = []
        for directory in Path('/proc').iterdir():
            if not directory.name.isdigit():
                continue
            try:
                stat = (directory / 'stat').read_text().rsplit(')', 1)[1].split()
                if int(stat[1]) != self.self_host:
                    continue
                status = (directory / 'status').read_text()
                pids, groups = status_ids(status, 'NSpid'), status_ids(status, 'NSpgid')
                if len(pids) < self.census.depth or len(groups) < self.census.depth:
                    raise RuntimeError('Cannot map owned adopted child into local namespace')
                records.append({'pid': pids[self.census.depth - 1],
                                'group': groups[self.census.depth - 1],
                                'state': stat[0], 'hostPid': int(directory.name)})
            except (FileNotFoundError, ProcessLookupError):
                continue
        return records

    def reap(self, row):
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                return True
            if pid == 0:
                return False
            row.setdefault('adoptedChildExits', []).append({'pid': pid, 'waitStatus': status})

    def drain(self, child, row):
        # Called after direct Popen wait/poll, so waitpid cannot steal its exit.
        groups = {child.pid}
        record = {'complete': False, 'startedAt': stamp()}
        row['descendantDrain'] = record
        first = True
        signalled = False
        while True:
            try:
                no_children = self.reap(row)
                adopted = self.adopted()
                groups.update(item['group'] for item in adopted)
                if os.getpgrp() in groups or any(group <= 1 for group in groups):
                    raise RuntimeError('Owned group escaped its independent session')
                observed = {str(group): self.census.members(group) for group in sorted(groups)}
                live = any(item['state'] not in ('Z', 'X') for rows in observed.values() for item in rows)
                if first:
                    record['initialGroups'] = observed
                    record['initialAdopted'] = adopted
                    record['unexpectedLiveAfterLeaderExit'] = live and row.get('exitCode') == 0
                    first = False
                if no_children and not adopted and not any(observed.values()):
                    record.update(complete=not record.get('observationFailures') and
                                  not record.get('unexpectedLiveAfterLeaderExit') and not signalled,
                                  endedAt=stamp(), finalGroups=observed,
                                  waitpidConfirmedNoChildren=True)
                    self.flush()
                    return record['complete']
                if live:
                    signalled = True
                    for group in sorted(groups):
                        try:
                            os.killpg(group, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    record.setdefault('cleanupSignals', []).append({'at': stamp(), 'groups': sorted(groups), 'signal': 'SIGKILL'})
            except Exception as error:
                record.setdefault('observationFailures', []).append({'at': stamp(), 'error': repr(error)})
            # Never release an outer lock on unknown/live descendants.
            self.flush()
            time.sleep(0.1)

    def command(self, label, args, log, cwd=ROOT, env=None, timeout=900):
        self.check_pins()
        if self.interrupted:
            raise RuntimeError('Coordinator interrupted: ' + str(self.interrupted))
        row = {'label': label, 'command': [str(value) for value in args], 'cwd': str(cwd),
               'timeoutSeconds': timeout, 'startedAt': stamp(), 'log': str(Path(log).relative_to(self.output))}
        self.report['commands'].append(row)
        self.flush()
        child = None
        error = None
        try:
            with Path(log).open('xb') as file:
                try:
                    child = subprocess.Popen(row['command'], cwd=cwd, env=env,
                                             stdin=subprocess.DEVNULL, stdout=file, stderr=subprocess.STDOUT,
                                             start_new_session=True)
                    row['pid'] = child.pid
                    self.flush()
                    deadline = time.monotonic() + timeout
                    while child.poll() is None:
                        if self.interrupted or time.monotonic() > deadline:
                            raise RuntimeError('Command interrupted or exceeded original deadline')
                        time.sleep(0.1)
                    row['exitCode'] = child.returncode
                except BaseException as caught:
                    error = caught
                    row['failure'] = repr(caught)
                finally:
                    if child is not None:
                        if child.poll() is None:
                            for sig in (signal.SIGTERM, signal.SIGKILL):
                                try:
                                    os.killpg(child.pid, sig)
                                except ProcessLookupError:
                                    pass
                                try:
                                    child.wait(timeout=5)
                                    break
                                except subprocess.TimeoutExpired:
                                    continue
                            while child.poll() is None:
                                self.flush()
                                time.sleep(0.1)
                        row['exitCode'] = child.returncode
                        row['drainPassed'] = self.drain(child, row)
                    file.flush()
                    os.fsync(file.fileno())
        finally:
            row['endedAt'] = stamp()
            if Path(log).is_file():
                row['closedLog'] = pin(log)
                self.capture([log])
            self.flush()
        if error:
            raise error
        if child is None or child.returncode != 0 or not row.get('drainPassed'):
            raise RuntimeError('Command failed or descendants survived leader: ' + label)
        self.check_pins()

    def finish(self, complete):
        self.check_pins()
        self.report.update(complete=bool(complete), endedAt=stamp())
        self.flush()
        target = self.output / 'ownership-completed.json'
        with target.open('x') as file:
            file.write(json.dumps(self.report, indent=2) + '\n')
