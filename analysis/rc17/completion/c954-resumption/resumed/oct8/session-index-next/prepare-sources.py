"""Static source preparation only. Imports no Kairo code and runs no tests."""
from pathlib import Path
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
REPO = Path('/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation')
COMMIT = 'a7b1bf97b0073695926c443e52d523638e59e48d'
ROOTS = {role: REPO.parent / ('kairo-s3-a7-' + role) for role in ('baseline', 'candidate')}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

def manifest(root, clean):
    status = git(root, 'status', '--porcelain', '--untracked-files=all').decode()
    assert git(root, 'rev-parse', 'HEAD').decode().strip() == COMMIT
    if clean:
        assert not status
    paths = sorted(set(filter(None, git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0'))))
    files = [{'path': p, 'bytes': len((root / p).read_bytes()), 'sha256': sha((root / p).read_bytes())} for p in paths]
    assert not (root / 'dist/client').exists()
    payload = {'files': files, 'builtFiles': []}
    # Match JSON.stringify used by source-manifest.mjs exactly (ASCII source paths).
    fingerprint = sha(json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode())
    return {'schemaVersion': 1, 'root': str(root), 'sourceCommit': COMMIT, 'expectedCommit': COMMIT,
            'requireClean': clean, 'dirty': bool(status), 'status': status, **payload, 'fingerprint': fingerprint}

assert not any(path.exists() for path in ROOTS.values()), 'Do not replace an existing frozen tree'
for role, root in ROOTS.items():
    subprocess.run(['git', '-C', str(REPO), 'worktree', 'add', '-b', 'analysis/s3-a7-' + role,
                    str(root), COMMIT], check=True)
candidate = manifest(ROOTS['candidate'], True)
recipe = json.loads((HERE / 'baseline-ablation-recipe.json').read_text())
for change in recipe['replacements']:
    path = ROOTS['baseline'] / change['path']
    body = path.read_text()
    if change.get('expectedSourceSha256'):
        assert sha(path.read_bytes()) == change['expectedSourceSha256']
    assert body.count(change['find']) == 1
    path.write_text(body.replace(change['find'], change['replace'], 1))
baseline = manifest(ROOTS['baseline'], False)
old = {row['path']: row for row in baseline['files']}
changed = [row['path'] for row in candidate['files'] if row != old[row['path']]]
assert sorted(changed) == ['server/session-combat.mjs', 'server/store.mjs']
for role, value in [('baseline', baseline), ('candidate', candidate)]:
    (HERE / (role + '-source.json')).write_text(json.dumps(value, indent=2) + '\n')
patch = git(ROOTS['baseline'], 'diff', '--binary', '--', *changed)
(HERE / 'baseline-ablation.patch').write_bytes(patch)
(HERE / 'source-boundary.json').write_text(json.dumps({
    'schemaVersion': 1, 'commit': COMMIT, 'preparedOnly': True, 'runtimeExecuted': False,
    'changedFiles': changed, 'baselinePatchSha256': sha(patch),
    'baselineFingerprint': baseline['fingerprint'], 'candidateFingerprint': candidate['fingerprint'],
    'scope': 'Only S3 eligibility SQL and migration are ablated; R1 and all other a7 source remain exact.'
}, indent=2) + '\n')
print(json.dumps({'prepared': True, 'roots': {k: str(v) for k, v in ROOTS.items()}, 'changedFiles': changed}))
