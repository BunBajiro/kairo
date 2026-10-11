#!/usr/bin/env python3
"""Bounded filesystem observation, independent of Kairo and its harnesses."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, time

stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
roots = [pathlib.Path('/workspace/scratch/a2f3334402fc/recovery-oct11') / ('fs-probe-' + stamp), pathlib.Path('/tmp') / ('kairo-fs-probe-' + stamp)]
report_path = pathlib.Path('/tmp') / ('kairo-fs-observation-' + stamp + '.json')
report = {'schema': 1, 'pid': os.getpid(), 'startedAt': stamp, 'roots': list(map(str, roots)), 'rows': [], 'observations': [], 'purpose': 'Create closed immutable files and remove disposable directories, then observe without recreating or rewriting either.'}
for root in roots:
    root.mkdir()
def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def observe():
    for row in report['rows']:
        tmp = pathlib.Path(row['tmp'])
        if tmp.exists() and not row.get('reappeared'):
            row['reappeared'] = True
            report['observations'].append({'at': now(), 'kind': 'directory-reappeared', 'path': str(tmp), 'stat': subprocess.check_output(['stat', '--printf=%n|inode=%i|birth=%w|mtime=%y|ctime=%z\n', str(tmp)], text=True), 'entries': sorted(x.name for x in tmp.iterdir())})
        path = pathlib.Path(row['file'])
        try:
            data = path.read_bytes()
            actual = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        except FileNotFoundError:
            actual = {'absent': True}
        if actual != row['closed'] and actual != row.get('lastMismatch'):
            row['lastMismatch'] = actual
            report['observations'].append({'at': now(), 'kind': 'closed-file-changed', 'path': str(path), 'expected': row['closed'], 'actual': actual})
for i in range(20):
    for root in roots:
        rowdir = root / ('row-%02d' % i)
        rowdir.mkdir()
        tmp = rowdir / 'tmp'
        tmp.mkdir()
        log = rowdir / 'stdout.log'
        data = (('immutable row %d\n' % i) * 200).encode()
        with log.open('xb') as out:
            out.write(data)
        original = {'inode': tmp.stat().st_ino, 'mtime_ns': tmp.stat().st_mtime_ns}
        time.sleep(.10)
        shutil.rmtree(tmp)
        try:
            tmp.lstat()
            raise RuntimeError('Removal did not produce ENOENT')
        except FileNotFoundError:
            pass
        report['rows'].append({'tmp': str(tmp), 'file': str(log), 'original': original, 'removedBy': os.getpid(), 'absenceConfirmedAt': now(), 'closed': {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}})
    observe()
    time.sleep(.30)
    print(json.dumps({'createdPairs': i + 1, 'observations': len(report['observations']), 'report': str(report_path)}), flush=True)
deadline = time.monotonic() + 15
while time.monotonic() < deadline:
    observe()
    time.sleep(.10)
report['finishedAt'] = now()
report['conclusion'] = 'Unexpected changes observed; no actor attribution.' if report['observations'] else 'No unexpected changes during this bounded observation; prior attempt cause remains unresolved.'
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'report': str(report_path), 'rows': len(report['rows']), 'observations': len(report['observations']), 'conclusion': report['conclusion']}), flush=True)
