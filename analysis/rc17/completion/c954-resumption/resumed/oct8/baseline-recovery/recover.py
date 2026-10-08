"""Recover exact canonical source into two NEW local baseline repos; no runtime work."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import subprocess

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--execute', action='store_true', help='Create new baseline roots; never install, build, or test')
args = parser.parse_args()
plan = json.loads((here / 'PREPARED.json').read_text())

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def git_sha(kind, data):
    return hashlib.sha1(kind.encode() + b' ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def git(root, *command, data=None):
    return subprocess.check_output(['git', '-C', str(root), *command], input=data)

# Preflight every donor before making either checkout. All paths are exact pinned inputs.
for baseline in plan['baselines']:
    assert not Path(baseline['target']).exists(), 'Never replace an existing checkout'
    raw = (here / baseline['canonicalCommitFile']).read_bytes()
    assert sha256(raw) == baseline['canonicalCommitSha256']
    assert git_sha('commit', raw) == baseline['commit']
    assert raw.startswith(('tree ' + baseline['tree'] + '\n').encode())
    for row in baseline['files']:
        relative = Path(row['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        assert row['mode'] in ['100644', '100755']
        data = Path(row['donor']).read_bytes()
        assert len(data) == row['bytes'] and sha256(data) == row['sha256']
        assert git_sha('blob', data) == row['gitBlob']

if not args.execute:
    print(json.dumps({'preflight': True, 'recoveryExecuted': False, 'files': sum(len(x['files']) for x in plan['baselines'])}))
    raise SystemExit(0)

receipts = []
for baseline in plan['baselines']:
    root = Path(baseline['target'])
    root.mkdir()
    subprocess.run(['git', 'init', '-q', '-b', baseline['branch'], str(root)], check=True)
    for row in baseline['files']:
        target = root / row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        data = Path(row['donor']).read_bytes()
        assert sha256(data) == row['sha256'], 'Donor changed after preflight'
        target.write_bytes(data)
        os.chmod(target, int(row['mode'], 8) & 0o777)
    git(root, 'add', '-f', '--all')
    tree = git(root, 'write-tree').decode().strip()
    assert tree == baseline['tree'], 'Complete canonical tree must match; no exemptions'
    raw = (here / baseline['canonicalCommitFile']).read_bytes()
    commit = git(root, 'hash-object', '-t', 'commit', '-w', '--stdin', data=raw).decode().strip()
    assert commit == baseline['commit']
    # Explicit shallow boundary: source identity is canonical, no baseline ancestry claim.
    (root / '.git/shallow').write_text(commit + '\n')
    git(root, 'update-ref', 'refs/heads/' + baseline['branch'], commit)
    assert git(root, 'rev-parse', 'HEAD').decode().strip() == commit
    assert git(root, 'status', '--porcelain', '--untracked-files=all') == b''
    assert git(root, 'diff', '--cached', '--exit-code', commit) == b''
    receipts.append({'name': baseline['name'], 'root': str(root), 'commit': commit, 'tree': tree,
                     'files': len(baseline['files']), 'status': '', 'shallow': True,
                     'dependenciesInstalled': False, 'buildAvailable': False,
                     'sourceOnly': True})

receipt = {'complete': True, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'planSha256': sha256((here / 'PREPARED.json').read_bytes()),
           'scriptSha256': sha256(Path(__file__).read_bytes()), 'baselines': receipts,
           'limits': 'No dependencies, historical compiled assets, build, tests, or performance run. Old roots preserved.'}
(here / 'RECOVERY.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
