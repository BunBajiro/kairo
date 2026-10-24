"""Independent read-only archive check, safe fresh extraction, and runtime receipt.

Usage: python verify-package.py ARCHIVE FRESH_DIRECTORY NODE_BIN_DIRECTORY
No install/build; the archive must have the connector-confirmed identity below.
Run from any directory. Evidence outputs are beside this script. No source edits.
"""
import ast
import collections
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import time
import zipfile
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = 'aa2bc453cdc5e6c4f86d0a01aa7a2d6c5c97d0b5'
TREE = 'c19bcc3ebad8ef7d87c748bfa3c3481b78ca02e9'
EXPECTED_DIGEST = 'cd8a3e86a7a9de8f3310eca3c41f3002d5977aca346f46f50b095bc98c186b83'
ARCHIVE, FRESH, NODEBIN = map(lambda x: Path(x).resolve(), sys.argv[1:])

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

def write(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n')

assert git('rev-parse', SOURCE + '^{tree}').decode().strip() == TREE
assert ARCHIVE.stat().st_size == 27873895
assert sha(ARCHIVE.read_bytes()) == EXPECTED_DIGEST
assert not FRESH.exists(), 'Require a new extraction directory'

# Read the exact-source exclusion policy without importing/executing the packager.
packager = git('show', SOURCE + ':scripts/package-release.py').decode()
tree = ast.parse(packager)
policy = [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'skip_dirs', 'skip_suffixes'} for t in n.targets)]
policy += [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'eligible']
namespace = {'root': ROOT, 'out': ARCHIVE}
exec(compile(ast.Module(body=policy, type_ignores=[]), '<exact-source-package-policy>', 'exec'), namespace)
eligible = namespace['eligible']
tracked = {}
for record in git('ls-tree', '-rz', '--full-tree', SOURCE).split(b'\0'):
    if not record:
        continue
    metadata, raw_name = record.split(b'\t', 1)
    mode, kind, blob = metadata.decode().split()
    name = os.fsdecode(raw_name)
    if eligible(PurePosixPath(name)):
        assert kind == 'blob' and mode in {'100644', '100755'}, (name, mode, kind)
        tracked[name] = {'mode': int(mode, 8), 'blob': blob}

with zipfile.ZipFile(ARCHIVE) as z:
    assert z.testzip() is None, 'ZIP CRC mismatch'
    infos = z.infolist()
    names = [i.filename for i in infos]
    assert len(names) == len(set(names)), 'Duplicate ZIP paths'
    assert len(names) == len(set(n.casefold() for n in names)), 'Case-insensitive duplicate'
    contents, modes = {}, {}
    for info in infos:
        name = info.filename
        parts = PurePosixPath(name).parts
        assert name.startswith('Kairo/') and not name.endswith('/')
        assert '\\' not in name and '\x00' not in name
        assert all(p and p not in {'.', '..'} and ':' not in p and p.rstrip(' .') == p for p in name.split('/'))
        assert parts[0] == 'Kairo' and str(PurePosixPath(name)) == name
        assert not (info.flag_bits & 1), 'Encrypted entry'
        mode = info.external_attr >> 16
        assert stat.S_ISREG(mode) and mode in {0o100644, 0o100755}, (name, oct(mode))
        relative = name.removeprefix('Kairo/')
        assert eligible(PurePosixPath(relative)), ('Excluded archive entry', relative)
        contents[relative] = z.read(info)
        modes[relative] = mode

missing = sorted(set(tracked) - set(contents))
generated = sorted(set(contents) - set(tracked))
assert not missing, missing
assert all(n.startswith('dist/client/') for n in generated), generated
for name, source in tracked.items():
    data = contents[name]
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert blob == source['blob'], ('Source mismatch', name)
    assert modes[name] == source['mode'], ('Mode mismatch', name)

# Required shipped paths are an independent check against the exact packager list.
required = ['START_KAIRO.bat', 'package.json', 'package-lock.json', 'server/start.mjs', 'server/index.mjs', 'server/import-cache.mjs', 'dist/client/index.html', 'dist/client/.vite/license.md', 'dist/client/.vite/manifest.json', 'public/stream/render.js', 'vendor/frontend-license-supplement.json']
for node in ast.walk(tree):
    if isinstance(node, ast.For) and isinstance(node.iter, ast.List) and all(isinstance(x, ast.Constant) and isinstance(x.value, str) for x in node.iter.elts):
        required += [x.value for x in node.iter.elts]
assert all(p in contents for p in required)
manifest = json.loads(contents['dist/client/.vite/manifest.json'])
targets = set()
for key, entry in manifest.items():
    for field in ['imports', 'dynamicImports']:
        assert all(ref in manifest for ref in entry.get(field, [])), (key, field)
    for target in [entry['file'], *entry.get('css', []), *entry.get('assets', [])]:
        targets.add('dist/client/' + target)
        assert 'dist/client/' + target in contents, (key, target)

class References(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key not in {'src', 'href'} or not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or not parsed.path or value.startswith('#'):
                continue
            local = unquote(parsed.path).lstrip('/')
            if local.startswith('assets/') or local == 'favicon.svg':
                target = 'dist/client/' + local
                assert target in contents, ('HTML asset missing', target)
                targets.add(target)
References().feed(contents['dist/client/index.html'].decode())
public = sorted(n for n in tracked if n.startswith('public/'))
for name in public:
    copy = 'dist/client/' + name.removeprefix('public/')
    assert contents[copy] == contents[name], ('Copied public mismatch', name)

lock = json.loads(contents['package-lock.json'])
package = json.loads(contents['package.json'])
assert package['version'] == lock['version'] == lock['packages']['']['version'] == '0.8.0-rc.17'
assert package['scripts']['test:kairo'] == 'node --test tests/kairo/*.test.mjs'
supplement = json.loads(contents['vendor/frontend-license-supplement.json'])
supplement_keys = set()
additional = 0
upstream_blob_ids = 0
for entry in supplement['packages']:
    assert lock['packages']['node_modules/' + entry['name']]['version'] == entry['version']
    for notice in [entry, *entry.get('additional_notices', [])]:
        text = notice['text'].encode()
        assert text.strip() and sha(text) == notice['text_sha256']
        if 'source_blob_sha' in notice:
            assert hashlib.sha1(b'blob ' + str(len(text)).encode() + b'\0' + text).hexdigest() == notice['source_blob_sha']
            upstream_blob_ids += 1
    additional += len(entry.get('additional_notices', []))
    supplement_keys.add((entry['name'], entry['version']))
markdown = contents['dist/client/.vite/license.md'].decode()
entries = list(re.finditer(r'^## ([^\n]+) - (\S+)(?: \([^\n]*\))?\n', markdown, re.MULTILINE))
assert entries
empty = []
for index, entry in enumerate(entries):
    end = entries[index + 1].start() if index + 1 < len(entries) else len(markdown)
    if not markdown[entry.end():end].strip():
        assert entry.groups() in supplement_keys, entry.groups()
        empty.append(entry.groups())

baseline = {name: sha(data) for name, data in contents.items()}
write('archive-check.json', {
    'source': SOURCE, 'tree': TREE, 'archive_bytes': ARCHIVE.stat().st_size, 'archive_sha256': EXPECTED_DIGEST,
    'crc_paths_duplicates_case_collisions_symlinks_modes_exclusions': 'pass',
    'eligible_tracked_files': len(tracked), 'exact_blob_matches': len(tracked), 'total_files': len(contents),
    'archive_modes': dict(collections.Counter(oct(m) for m in modes.values())),
    'missing': missing, 'unexpected_nonclient_files': [], 'required_paths_checked': len(set(required)),
    'client_manifest_and_html_targets': sorted(targets), 'copied_public_paths': public,
    'generated_client': [{'path': name, 'bytes': len(contents[name]), 'sha256': baseline[name]} for name in generated],
    'package_version': package['version'], 'lock_sha256': sha(contents['package-lock.json']),
    'notices': {'entries': len(entries), 'empty_entries_covered': empty, 'supplement_packages': len(supplement_keys), 'additional_notices': additional, 'supplement_text_digests': 'pass', 'supplied_upstream_blob_ids_checked': upstream_blob_ids, 'upstream_network_retrieval': False, 'license_sha256': sha(contents['dist/client/.vite/license.md'])},
    'method': 'Exact git ls-tree source blob IDs and executable bits; only other inputs are generated dist/client files. Public copies, manifest imports/files and local HTML asset references checked. Extraction occurs only after all checks pass.'
})

# Every destination derives only from already validated regular, relative paths.
FRESH.mkdir()
APP = FRESH / 'Kairo'
for name, data in contents.items():
    destination = APP / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    destination.chmod(stat.S_IMODE(modes[name]))
assert all(sha((APP / n).read_bytes()) == digest for n, digest in baseline.items())
assert not any((p / 'node_modules').exists() for p in [APP, *APP.parents])
env = dict(os.environ)
env.pop('NODE_PATH', None)
env.pop('NODE_OPTIONS', None)
env['PATH'] = str(NODEBIN) + ':/usr/local/bin:/usr/bin:/bin'
env['npm_config_update_notifier'] = 'false'
node = NODEBIN / 'node'
npm = NODEBIN / 'npm'
identity = json.loads(subprocess.check_output([str(node), '-p', 'JSON.stringify({execPath:process.execPath,versions:process.versions})'], cwd=APP, env=env))
assert identity['execPath'] == str(node) and identity['versions']['node'].startswith('24.')
environment = {'command': [str(npm), 'run', 'test:kairo'], 'cwd': str(APP), 'NODE_PATH': 'unset', 'NODE_OPTIONS': 'unset', 'PATH': env['PATH'], 'node': identity, 'node_sha256': sha(node.read_bytes()), 'npm_realpath': str(npm.resolve()), 'npm_cli_sha256': sha(npm.resolve().read_bytes()), 'node_modules_in_app_or_ancestors': False, 'install_or_build_performed': False, 'platform': sys.platform, 'uname': list(os.uname()), 'fresh_synthetic_test_data': 'Runtime tests create isolated temporary fixtures; no user profile supplied'}
write('runtime-environment.json', environment)
started = time.time()
with (HERE / 'extracted-runtime.txt').open('wb') as output:
    result = subprocess.run([str(npm), 'run', 'test:kairo'], cwd=APP, env=env, stdout=output, stderr=subprocess.STDOUT)
elapsed = time.time() - started
raw = (HERE / 'extracted-runtime.txt').read_text()
summary = {m.group(1): float(m.group(2)) if '.' in m.group(2) else int(m.group(2)) for m in re.finditer(r'^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)\s*$', raw, re.MULTILINE)}
actual = {p.relative_to(APP).as_posix(): sha(p.read_bytes()) for p in APP.rglob('*') if p.is_file()}
changed = sorted(n for n, digest in baseline.items() if actual.get(n) != digest)
extra = sorted(set(actual) - set(baseline))
post_modes = sorted(n for n in baseline if stat.S_IMODE((APP / n).stat().st_mode) != stat.S_IMODE(modes[n]))
write('runtime-result.json', {'exit_code': result.returncode, 'summary': summary, 'elapsed_seconds_observation_only': elapsed, 'log_sha256': sha((HERE / 'extracted-runtime.txt').read_bytes()), 'archived_files': len(baseline), 'changed_or_missing_archived_files': changed, 'additional_package_files': extra, 'mode_changes': post_modes, 'all_archived_files_unchanged': not changed, 'archive_sha256_after_runtime': sha(ARCHIVE.read_bytes())})
print(json.dumps({'eligible_tracked': len(tracked), 'generated': len(generated), 'total': len(contents), 'runtime_exit': result.returncode, 'summary': summary, 'changed': changed, 'extra': extra}))
assert result.returncode == 0
assert not changed and not extra and not post_modes
assert sha(ARCHIVE.read_bytes()) == EXPECTED_DIGEST
assert summary.get('tests') == summary.get('pass') == 1354 and summary.get('fail') == summary.get('cancelled') == summary.get('skipped') == summary.get('todo') == 0
