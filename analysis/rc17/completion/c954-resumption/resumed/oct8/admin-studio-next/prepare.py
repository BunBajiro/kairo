"""Freeze exact committed source and a four-file historical UI ablation; no app runtime."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
COMPLETION = HERE.parents[3]
WORKSPACE = HERE.parents[7]
SOURCE = WORKSPACE / 'kairo-rc17-c954-continuation'
COMMIT = 'a7b1bf97b0073695926c443e52d523638e59e48d'
ROOTS = {v: WORKSPACE / ('kairo-admin-studio-' + v + '-a7b-oct8') for v in ('baseline', 'candidate')}
ALLOWED = sorted(['components/kairo/markets.tsx', 'components/kairo/obs-controls.tsx', 'components/kairo/studio.tsx', 'public/stream/render.js'])
sha = lambda b: hashlib.sha256(b).hexdigest()
git = lambda root, *args: subprocess.check_output(['git', '-C', str(root), *args])

assert git(SOURCE, 'rev-parse', COMMIT + '^{commit}').decode().strip() == COMMIT
historical_candidate = json.loads((COMPLETION / 'frontend-models/frozen-candidate-source.json').read_text())
historical_baseline = json.loads((COMPLETION / 'frontend-models/ablation-source.json').read_text())
candidate_files = {x['path']: x for x in historical_candidate['files']}
baseline_files = {x['path']: x for x in historical_baseline['files']}
original_patch = (COMPLETION / 'frontend-models/legacy-ui-ablation.patch').read_bytes()
sections = re.split(rb'(?=^diff --git )', original_patch, flags=re.M)
selected = [s for s in sections if s and s.splitlines()[0].decode().split(' ')[2][2:] in ALLOWED]
assert len(selected) == 4
patch = b''.join(selected)
(HERE / 'legacy-admin-studio-ablation.patch').write_bytes(patch)

rows = []
for path in ALLOWED:
    current = git(SOURCE, 'show', COMMIT + ':' + path)
    assert sha(current) == candidate_files[path]['sha256'], path + ' differs from saved c954 candidate'
    rows.append({'path': path, 'currentAndC954Sha256': sha(current), 'historicalAblationSha256': baseline_files[path]['sha256']})

inventories = {}
for variant, root in ROOTS.items():
    assert not root.exists(), 'Use fresh roots, or inspect an existing preparation before reuse: ' + str(root)
    subprocess.run(['git', 'clone', '--local', '--no-hardlinks', '--no-checkout', str(SOURCE), str(root)], check=True)
    git(root, 'checkout', '--detach', COMMIT)
    if variant == 'baseline':
        git(root, 'apply', '--check', str(HERE / 'legacy-admin-studio-ablation.patch'))
        git(root, 'apply', str(HERE / 'legacy-admin-studio-ablation.patch'))
        for row in rows:
            assert sha((root / row['path']).read_bytes()) == row['historicalAblationSha256']
    (root / 'node_modules').symlink_to(SOURCE / 'node_modules', target_is_directory=True)
    status = git(root, 'status', '--porcelain', '--untracked-files=all').decode()
    assert sorted(line[3:] for line in status.splitlines()) == (ALLOWED if variant == 'baseline' else [])
    paths = sorted(x for x in git(root, 'ls-files', '-z').decode().split('\0') if x)
    files = [{'path': p, 'bytes': len((root / p).read_bytes()), 'sha256': sha((root / p).read_bytes())} for p in paths]
    inventories[variant] = {'root': str(root), 'commit': COMMIT, 'status': status, 'files': files}
    assert not (root / 'dist').exists()

assert [f['path'] for f in inventories['baseline']['files']] == [f['path'] for f in inventories['candidate']['files']]
assert [b['path'] for b, c in zip(inventories['baseline']['files'], inventories['candidate']['files']) if b != c] == ALLOWED
receipt = {'schemaVersion': 1, 'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceCommit': COMMIT,
    'sourceTree': git(SOURCE, 'rev-parse', COMMIT + '^{tree}').decode().strip(), 'releaseReady': False, 'runtimeExecuted': False,
    'sourceOnly': True, 'roots': inventories, 'differencePaths': ALLOWED, 'fourFilesMatchHistoricalVersions': rows,
    'historicalEightFileAblation': {'sourceCommit': historical_baseline['sourceCommit'], 'fingerprint': historical_baseline['fingerprint'],
        'manifestSha256': sha((COMPLETION / 'frontend-models/ablation-source.json').read_bytes()), 'patchSha256': sha(original_patch)},
    'selectedPatchSha256': sha(patch), 'packageLockSha256': sha((SOURCE / 'package-lock.json').read_bytes()),
    'note': 'New narrow four-file ablation on current a7b source. This is not the old eight-file c954 baseline and has no compiled assets yet.'}
(HERE / 'PREPARATION.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'prepared': True, 'roots': {k: str(v) for k, v in ROOTS.items()}, 'filesPerRoot': len(inventories['candidate']['files']), 'differences': ALLOWED}))
