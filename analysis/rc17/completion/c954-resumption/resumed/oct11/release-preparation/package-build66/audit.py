"""Offline build66 package re-audit after workspace reset; never imports/runs Kairo.

Requires the exact downloaded Actions ZIP and source Git objects 0149/70.
Uses the already banked metadata, logs, continuity receipt and measured manifest.
Does not download, build, package, launch browsers or execute runtime tests.
"""
import argparse
import ast
import hashlib
import io
import json
import re
import stat
import subprocess
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / '.git').exists())
HEAD = '0149e86638aa7bef279f24a6425504345ae1179f'
TREE = 'a4086b74114af46420eefbb96aef32086392cf37'
MEASURED = '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'
RUN, JOB, ARTIFACT = 38177333462, 114582374795, 11717150334
ZIP_SHA = '7024711ed49dafa21ec0b89ed90d01ad45748528066fb653d83b4147a141b2f0'
MEASURED_FINGERPRINT = '09dfcf5950c2e6b340ea03ae1e813caffd2bd4e4d98d1e1c7a7ae6fe6ad22262'
OLD_UUID = 'f49971b7-37a6-47e4-ab89-fca37908ca4b'
NEW_UUID = '92908a4f-e51f-4956-9480-c3634c02e9e8'
DOC_PATHS = ['CHANGELOG.md', 'README.md', 'docs/README.md', 'docs/VALIDATION.md']

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zip', type=Path, default=Path('/tmp/kairo-package-build66-restored/Kairo-test-build.zip'))
parser.add_argument('--extract', type=Path, default=Path('/tmp/kairo-package-build66-restored/extracted'))
args = parser.parse_args()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*arguments):
    return subprocess.check_output(['git', '-C', str(REPO), *arguments])

def load(path):
    return json.loads(path.read_text())

def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n')

def source_tree(commit):
    result = {}
    for row in git('ls-tree', '-rz', commit).split(b'\0'):
        if row:
            meta, path = row.split(b'\t')
            mode, kind, blob = meta.decode().split()
            assert kind == 'blob' and mode in {'100644', '100755'}
            result[path.decode()] = {'mode': mode, 'blob': blob}
    return result

run, jobs = load(HERE / 'run.json'), load(HERE / 'jobs.json')['jobs']
artifacts = load(HERE / 'artifacts.json')['artifacts']
log = (HERE / 'job.log').read_text()
historical_receipt = load(HERE / 'RECOVERY-RECEIPT.json')
historical_sha = sha((HERE / 'RECOVERY-RECEIPT.json').read_bytes())
assert historical_receipt['recordType'] == 'reconstructed-completed-audit-receipt'
assert run['id'] == RUN and run['run_number'] == 66 and run['run_attempt'] == 1
assert run['head_sha'] == HEAD and run['head_commit']['tree_id'] == TREE
assert run['status'] == 'completed' and run['conclusion'] == 'success'
assert run['path'] == '.github/workflows/test-build.yml'
assert len(jobs) == 1 and jobs[0]['id'] == JOB and jobs[0]['run_id'] == RUN
assert jobs[0]['status'] == 'completed' and jobs[0]['conclusion'] == 'success'
assert all(s['status'] == 'completed' and s['conclusion'] == 'success' for s in jobs[0]['steps'])
assert git('rev-parse', HEAD + '^{tree}').decode().strip() == TREE

tree, measured_tree = source_tree(HEAD), source_tree(MEASURED)
assert len(tree) == 486 and len(measured_tree) == 486
assert sorted(p for p in tree if tree[p] != measured_tree[p]) == DOC_PATHS
assert git('diff', '--name-only', MEASURED, HEAD).decode().splitlines() == DOC_PATHS
continuity_path = HERE.parent / 'DOC-CONTINUITY.json'
continuity = load(continuity_path)
assert continuity['measuredSource'] == MEASURED and len(continuity['files']) == 486
blobs = {}
def blob(identity):
    if identity not in blobs:
        blobs[identity] = git('cat-file', 'blob', identity)
    return blobs[identity]
for entry in continuity['files']:
    assert tree[entry['path']] == {'mode': entry['mode'], 'blob': entry['preparedBlob']}
    assert measured_tree[entry['path']]['blob'] == entry['measuredBlob']
    content = blob(entry['preparedBlob'])
    assert len(content) == entry['bytes'] and sha(content) == entry['sha256']

# Recover the exact measured asset manifest from the already banked raw archive.
# Hash every chunk, the joined archive, and the selected original member.
bank_path = HERE.parents[1] / 'first-assets-attribution' / 'RAW-MANIFEST.json'
bank = load(bank_path)
archive_parts = []
for entry in bank['chunks']:
    content = (bank_path.parent / entry['path']).read_bytes()
    assert len(content) == entry['bytes'] and sha(content) == entry['sha256']
    archive_parts.append(content)
archive_bytes = b''.join(archive_parts)
assert len(archive_bytes) == bank['archiveBytes'] and sha(archive_bytes) == bank['archiveSha256']
manifest_member = 'public-resume/setup/candidate-source.json'
member_pin = next(e for e in bank['files'] if e['path'] == manifest_member)
with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz') as archive:
    matches = [e for e in archive.getmembers() if e.name == manifest_member]
    assert len(matches) == 1 and matches[0].isfile()
    measured_bytes = archive.extractfile(matches[0]).read()
assert len(measured_bytes) == member_pin['bytes'] and sha(measured_bytes) == member_pin['sha256']
measured = json.loads(measured_bytes)
assert measured['sourceCommit'] == MEASURED and not measured['dirty']
assert measured['fingerprint'] == MEASURED_FINGERPRINT
assert len(measured['files']) == 486
for entry in measured['files']:
    content = blob(measured_tree[entry['path']]['blob'])
    assert len(content) == entry['bytes'] and sha(content) == entry['sha256']

package_script = blob(tree['scripts/package-release.py']['blob']).decode()
workflow = blob(tree['.github/workflows/test-build.yml']['blob']).decode()
syntax = ast.parse(package_script)
assignments = {n.targets[0].id: n.value for n in syntax.body if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name)}
skip_dirs = ast.literal_eval(assignments['skip_dirs'])
skip_suffixes = ast.literal_eval(assignments['skip_suffixes'])
required = next(ast.literal_eval(n.iter) for n in ast.walk(syntax) if isinstance(n, ast.For) and isinstance(n.target, ast.Name) and n.target.id == 'name' and isinstance(n.iter, ast.List))
assert len(required) == 54
def included(path):
    p = PurePosixPath(path)
    return not (
        any(part in skip_dirs for part in p.parts[:-1])
        or p.name.startswith('.env') or p.name in {'.git', 'vault.key', 'vault.dpapi'}
        or p.suffix in skip_suffixes
        or (p.parts[0] == 'dist' and (len(p.parts) < 2 or p.parts[1] != 'client'))
        or p.parts[:2] == ('tests', 'performance')
    )

artifact = next(a for a in artifacts if a['id'] == ARTIFACT)
data = args.zip.read_bytes()
assert len(data) == artifact['size_in_bytes'] == 25938696
assert sha(data) == artifact['digest'].removeprefix('sha256:') == ZIP_SHA
assert artifact['workflow_run']['head_sha'] == HEAD and artifact['workflow_run']['id'] == RUN
assert 'SHA256 digest of uploaded artifact is ' + ZIP_SHA in log
inventory = []
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    assert archive.testzip() is None
    entries = archive.infolist()
    assert len(entries) == len({e.filename for e in entries}) == 504
    for entry in entries:
        p = PurePosixPath(entry.filename)
        assert not p.is_absolute() and p.parts[0] == 'Kairo' and '..' not in p.parts
        assert '\\' not in entry.filename and ':' not in p.parts[0]
        assert not entry.is_dir() and not stat.S_ISLNK(entry.external_attr >> 16)
        content = archive.read(entry)
        target = args.extract.joinpath(*p.parts)
        assert target.resolve().is_relative_to(args.extract.resolve())
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == content
        else:
            target.write_bytes(content)
        inventory.append({'path': entry.filename, 'bytes': len(content), 'sha256': sha(content)})
save('PACKAGE-MEMBERS.json', inventory)
extracted = args.extract / 'Kairo'
members = {f['path'].removeprefix('Kairo/'): f for f in inventory}
expected_source = {path for path in tree if included(path)}
actual_source = {path for path in members if not path.startswith('dist/client/')}
assert len(expected_source) == len(actual_source) == 484 and actual_source == expected_source
sources = []
for path in sorted(actual_source):
    content = (extracted / path).read_bytes()
    assert content == blob(tree[path]['blob'])
    sources.append({'path': path, **tree[path], 'bytes': len(content), 'sha256': sha(content)})
save('SOURCE-MEMBERS.json', sources)
assert all(included(path) for path in members)
assert not any(PurePosixPath(path).parts[0] in {'analysis', 'node_modules', 'data', 'performance-results'} for path in members)
assert all(path in members for path in required)
assert load(extracted / 'package.json')['version'] == '0.8.0-rc.17'

assets = {e['path']: e for e in measured['builtFiles']}
assert {p for p in members if p.startswith('dist/client/')} == assets.keys() and len(assets) == 20
compiled = []
for path, previous in sorted(assets.items()):
    current = (extracted / path).read_bytes()
    identical = sha(current) == previous['sha256']
    identity_only = False
    assert len(current) == previous['bytes']
    if not identical:
        assert path in {'dist/client/index.html', 'dist/client/index.rsc'}
        assert current.count(NEW_UUID.encode()) == 1
        reverted = current.replace(NEW_UUID.encode(), OLD_UUID.encode(), 1)
        identity_only = sha(reverted) == previous['sha256']
        assert identity_only
    compiled.append({'path': path, 'measuredSha256': previous['sha256'], 'packageSha256': sha(current), 'bytes': len(current), 'byteIdentical': identical, 'onlyExactBuildUuidReplacement': identity_only})
assert sum(e['byteIdentical'] for e in compiled) == 18
save('COMPILED-MEMBERS.json', compiled)

links = []
documents = [extracted / 'README.md', extracted / 'AGENTS.md', extracted / 'CHANGELOG.md', *sorted((extracted / 'docs').glob('*.md'))]
for document in documents:
    for match in re.finditer(r'(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)', document.read_text()):
        target = match.group(1).split(' "', 1)[0].strip('<>')
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc:
            continue
        resolved = (document.parent / unquote(parsed.path)).resolve() if parsed.path else document.resolve()
        assert resolved.is_relative_to(extracted.resolve()) and resolved.exists(), (document, target)
        anchor_verified = None
        if parsed.fragment and resolved.suffix.lower() == '.md':
            counts, anchors = {}, set()
            text = resolved.read_text()
            for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*\s*$', text, re.M):
                heading = re.sub(r'<[^>]*>', '', heading).lower()
                slug = re.sub(r'[^\w\- ]', '', heading).replace(' ', '-')
                occurrence = counts.get(slug, 0)
                counts[slug] = occurrence + 1
                anchors.add(slug if occurrence == 0 else slug + '-' + str(occurrence))
            anchors.update(re.findall(r'(?:id|name)=["\']([^"\']+)["\']', text))
            anchor_verified = unquote(parsed.fragment) in anchors
            assert anchor_verified, (document, target)
        links.append({'document': document.relative_to(extracted).as_posix(), 'target': target, 'resolvedPath': resolved.relative_to(extracted).as_posix(), 'anchorVerified': anchor_verified})
assert len(links) == 115
save('DOCUMENT-LINKS.json', links)

# These are checks of retained CI evidence, not execution of its acceptance tests.
assert 'working-directory: ${{ runner.temp }}/kairo-package-check/Kairo\n        run: npm run test:kairo' in workflow
assert log.index('Run python3 -m zipfile -e') < log.index('Run npm run test:kairo') < log.index('Uploading artifact: Kairo-test-build.zip')
for label, value in {'tests': 1004, 'pass': 1004, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}.items():
    assert re.search(r'ℹ ' + label + ' ' + str(value) + r'\s', log)
browser_results = []
for line in log.splitlines():
    payload = re.sub(r'^\S+\s+', '', line)
    if payload.startswith('{"ok":true'):
        browser_results.append(json.loads(payload))
assert len(browser_results) == 3 and all(r['ok'] for r in browser_results)
assert len(browser_results[0]['layoutChecks']) == 7 and browser_results[0]['cards'] == 9
assert len(browser_results[1]['checks']) == 84 and browser_results[2]['checks'] == 15
assert 'node: v24.21.0' in log and 'npm: 11.19.0' in log
assert sha((HERE / 'RECOVERY-RECEIPT.json').read_bytes()) == historical_sha

audit = {
    'schema': 1, 'kind': 'offline-package-reaudit-after-workspace-reset',
    'capturedAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Only offline reconstruction of package/source/compiled/docs inventories. No runtime, browser, performance, build or packaging commands were executed.',
    'sourceCommit': HEAD, 'sourceTree': TREE, 'measuredSourceCommit': MEASURED,
    'runId': RUN, 'runNumber': 66, 'runAttempt': 1, 'jobId': JOB,
    'artifactId': ARTIFACT, 'artifactBytes': len(data), 'artifactSha256': sha(data),
    'artifactUrl': f'https://github.com/BunBajiro/kairo/actions/runs/{RUN}/artifacts/{ARTIFACT}',
    'artifactPath': str(args.zip.resolve()), 'extractedPath': str(extracted.resolve()),
    'apiUploadAndDownloadDigestsMatched': True, 'zipCrcPassed': True, 'safeExtractionPassed': True,
    'packageFileCount': len(inventory), 'exactTrackedSourceMembers': len(sources),
    'excludedTrackedMembers': sorted(set(tree) - expected_source),
    'version': '0.8.0-rc.17', 'requiredPaths': required, 'requiredPathCount': len(required),
    'packageExclusionsPassed': True, 'relativeDocumentationLinksVerified': len(links),
    'sourceContinuity': {'trackedFiles': 486, 'unchangedFiles': 482, 'changedDocumentation': DOC_PATHS, 'receiptSha256': sha(continuity_path.read_bytes())},
    'measuredManifestRecovery': {'bankPath': bank_path.relative_to(REPO).as_posix(), 'bankSha256': sha(bank_path.read_bytes()), 'archiveSha256': bank['archiveSha256'], 'archiveBytes': bank['archiveBytes'], 'chunksVerified': len(bank['chunks']), 'member': manifest_member, 'memberBytes': len(measured_bytes), 'memberSha256': sha(measured_bytes), 'fingerprint': measured['fingerprint'], 'sourceFilesVerifiedAgainstGit': 486},
    'compiledAssets': {'count': 20, 'byteIdentical': 18, 'uuidOnlyDifferences': ['dist/client/index.html', 'dist/client/index.rsc'], 'measuredUuid': OLD_UUID, 'packageUuid': NEW_UUID, 'proof': 'Package bytes match measured SHA-256 directly, or after exactly one reverse UUID substitution in each of two known files.'},
    'retainedCiEvidence': {'runSuccessful': True, 'jobSuccessful': True, 'successfulSteps': len(jobs[0]['steps']), 'extractedPackageRuntime': {'tests': 1004, 'pass': 1004, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0, 'durationMs': 24344.383857}, 'node': '24.21.0', 'npm': '11.19.0', 'browserResultsFromLog': browser_results},
    'historicalReconstructedReceipt': {'path': 'RECOVERY-RECEIPT.json', 'sha256': historical_sha, 'untouched': True},
    'limits': ['The historical reconstructed receipt remains historical; this new audit is not presented as its original lost file.', 'Supporting browser ZIPs were not downloaded again; retained API/log evidence and the previous hash-verified recovery receipt retain their acceptance status.', 'No new visual-inspection claim, acceptance rerun, user-review promotion, merge or stable release is implied.', 'Normal build used Node24.21.0; separate performance measurements used pinned Node24.19.0.'],
    'files': {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in sorted(HERE.iterdir()) if p.is_file() and p.name not in {'AUDIT.json', 'REVIEW.md'}},
}
save('AUDIT.json', audit)
print(json.dumps({'success': True, 'sourceFiles': len(sources), 'compiledAssets': 20, 'identicalAssets': 18, 'requiredPaths': len(required), 'documentLinks': len(links), 'runtimeRerun': False}))
