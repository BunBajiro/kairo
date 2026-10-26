"""Package committed Kairo sources and the freshly built client without local data.

Run from a clean Git checkout after the documented build/acceptance gates. Git
and Python are build-host dependencies only; the extracted Node runtime needs
neither. Unknown local files are excluded, and eligible symlinks are rejected.
Compiled-output freshness remains the build gate's responsibility.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / f'Kairo-v{version}.zip'
skip_dirs = {'node_modules', '.git', '.github', '.sites-runtime', '.wrangler', '.next', 'out', 'coverage', '__pycache__', '.cache', '.codex', 'performance-results'}
skip_suffixes = {'.log', '.sqlite', '.sqlite-wal', '.sqlite-shm', '.tsbuildinfo', '.pyc', '.zip', '.cpuprofile', '.heapsnapshot'}


def git(*args):
    """Use the checkout inventory; never silently fall back to a filesystem walk."""
    try:
        return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.PIPE)
    except (OSError, subprocess.CalledProcessError) as error:
        raise SystemExit('Packaging requires Git and a clean Git checkout at the intended commit.') from error


def eligible(relative):
    """Retain the existing distribution exclusions for tracked and compiled files."""
    parts = relative.parts
    return not (
        any(part in skip_dirs for part in parts[:-1])
        or parts[:2] == ('tests', 'performance')
        or (parts[0] == 'dist' and parts[:2] != ('dist', 'client'))
        or relative.name.startswith('.env')
        or relative.name in {'.git', 'vault.key', 'vault.dpapi'}
        or relative.suffix in skip_suffixes
        or root / relative == out
    )


def reject_symlinks(relative):
    """Reject both file links and linked parents before archive.write can follow them."""
    path = root
    for part in relative.parts:
        path = path / part
        if path.is_symlink():
            raise SystemExit(f'Packaging rejects symlink input: {path.relative_to(root)}')


if Path(os.fsdecode(git('rev-parse', '--show-toplevel')).strip()).resolve() != root:
    raise SystemExit('Packaging requires the Kairo Git checkout root.')
if git('status', '--porcelain=v1', '-z', '--untracked-files=no'):
    raise SystemExit('Commit or reconcile tracked changes before packaging the intended source.')

client = Path('dist/client')
reject_symlinks(client)
if not (root / client / 'index.html').is_file():
    raise SystemExit('Build the frontend before packaging.')
if not (root / client / '.vite/license.md').is_file():
    raise SystemExit('Build the frontend with its bundled license notices before packaging.')

# Only committed source paths enter the source side of the distribution. Local
# exports, ignored output folders and unknown files cannot become release inputs.
inputs = set()
for name in git('ls-files', '--cached', '-z').split(b'\0'):
    if name:
        relative = Path(os.fsdecode(name))
        if eligible(relative):
            reject_symlinks(relative)
            if not (root / relative).is_file():
                raise SystemExit(f'Missing tracked package input: {relative}')
            inputs.add(relative)

# dist/client is the one generated-input boundary. Validate directory links even
# though os.walk does not follow them: silently omitting a linked client subtree
# could otherwise produce an incomplete package that still has index.html.
def reject_walk_error(error):
    raise SystemExit(f'Cannot read compiled package input: {error.filename}: {error.strerror}')


for directory, folders, files in os.walk(root / client, followlinks=False, onerror=reject_walk_error):
    base = Path(directory)
    folders[:] = [name for name in folders if name not in skip_dirs]
    for name in folders + files:
        relative = (base / name).relative_to(root)
        if eligible(relative):
            reject_symlinks(relative)
    for name in files:
        relative = (base / name).relative_to(root)
        if eligible(relative):
            if not (root / relative).is_file():
                raise SystemExit(f'Invalid compiled package input: {relative}')
            inputs.add(relative)

def validate_notices():
    """Require full text or a reviewed version-matched supplement for every entry.

    Vite reads package license files from the actual bundled module graph. A few
    locked tarballs omit those files, and CSS imports are not in that JS graph;
    their upstream notices are retained explicitly with version/content checks.
    """
    supplemental_path = Path('vendor/frontend-license-supplement.json')
    if supplemental_path not in inputs:
        raise SystemExit('Missing tracked frontend license supplement.')
    supplement = json.loads((root / supplemental_path).read_text())
    lock = json.loads((root / 'package-lock.json').read_text())['packages']
    supplemental_keys = set()
    for entry in supplement['packages']:
        name, version = entry['name'], entry['version']
        if lock.get(f'node_modules/{name}', {}).get('version') != version:
            raise SystemExit(f'Stale supplemental license version: {name}')
        for notice in [entry, *entry.get('additional_notices', [])]:
            text = notice.get('text', '')
            if not text.strip() or hashlib.sha256(text.encode()).hexdigest() != notice.get('text_sha256'):
                raise SystemExit(f'Invalid supplemental license text: {name}')
        supplemental_keys.add((name, version))
    markdown = (root / client / '.vite/license.md').read_text()
    entries = list(re.finditer(r'^## ([^\n]+) - (\S+)(?: \([^\n]*\))?\n', markdown, re.MULTILINE))
    if not entries:
        raise SystemExit('No bundled dependency license entries; rebuild the frontend.')
    for index, entry in enumerate(entries):
        end = entries[index + 1].start() if index + 1 < len(entries) else len(markdown)
        if not markdown[entry.end():end].strip() and entry.groups() not in supplemental_keys:
            raise SystemExit(f'Missing full bundled license: {entry.group(1)} {entry.group(2)}')


validate_notices()

# Input validation happens before opening the destination. Write failures can
# still leave a partial ZIP; CRC/required-path checks below are not acceptance.
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for relative in sorted(inputs):
        archive.write(root / relative, 'Kairo/' + relative.as_posix())
# CRC and required-path checks establish package structure, not test acceptance.
# They do not replace the independent extracted-package checks in docs/VALIDATION.md.
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    assert 'Kairo/server/import-cache.mjs' in archive.namelist()
    assert not any('/tests/performance/' in p or '/performance-results/' in p or '/.github/' in p or p=='Kairo/.git' or p.endswith(('.cpuprofile','.heapsnapshot')) for p in archive.namelist())
    for name in ['START_KAIRO.bat','server/start.mjs','server/index.mjs','server/datasets.mjs','server/dataset-paths.mjs','server/runtime-supervisor.mjs','server/runtime-child.mjs','server/runtime-lock.mjs','server/sde-archive.mjs','server/sde-build.mjs','server/sde-worker.mjs','docs/DATASETS.md','server/obs.mjs','server/projections.mjs','dist/client/index.html','dist/client/.vite/license.md','public/stream/render.js','docs/VALIDATION.md','docs/IMPORT-ANALYSER.md','server/imports.mjs','server/market-history-store.mjs','server/import-math.mjs','server/market-history-worker.mjs','server/vendor/seek-bzip/LICENSE','server/vendor/seek-bzip/lib/index.js','server/data/npc-market-owners.json','server/universe.mjs','server/universe-static.mjs','server/universe-wormholes.mjs','server/data/universe-wormholes.json','docs/WANDERER-REFERENCE-NOTICE.md','docs/WANDERER-DESTINATIONS-NOTICE.md','docs/README.md','docs/USER-GUIDE.md','server/universe-jspace.mjs','server/universe-destinations.mjs','server/data/universe-destinations.json','server/universe-routing.mjs','server/universe-history.mjs','server/session-replay.mjs','server/data/universe.json.gz','server/data/universe-provenance.json','server/data/universe-details-000.bin','server/data/universe-details-001.bin','server/data/universe-details-002.bin','docs/UNIVERSE.md','docs/THIRD-PARTY-NOTICES.md','vendor/frontend-license-supplement.json','docs/INTERNAL-API.md','docs/API-REFERENCE.md','server/universe-feeds.mjs','server/universe-operations.mjs','server/universe-navigation.mjs','server/data/universe-points.json','tests/fixtures/smt-user-ansiblex.txt','tests/kairo/fixtures/market-history-archives.json']:
        assert 'Kairo/'+name in archive.namelist(),name
    print(json.dumps({'file':str(out),'version':version,'bytes':out.stat().st_size,'files':len(archive.namelist())}))
