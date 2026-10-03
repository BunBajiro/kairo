"""Package tracked Kairo source and the compiled UI, never local workspace data."""
from pathlib import Path
import json, os, subprocess, sys, zipfile
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent/f'Kairo-v{version}.zip'
if not (root/'dist/client/index.html').is_file():
    raise SystemExit('Build the frontend before packaging.')
skip_dirs={'node_modules','.git','.github','.sites-runtime','.wrangler','.next','.agents','.aws','out','outputs','work','coverage','__pycache__','.cache','.codex','analysis','performance-results'}
skip_suffixes={'.log','.sqlite','.sqlite-wal','.sqlite-shm','.db','.db-wal','.db-shm','.tsbuildinfo','.pyc','.zip','.tar','.tgz','.bundle','.cpuprofile','.heapsnapshot','.pem','.key','.p12','.pfx'}

def excluded(relative):
    return (any(part in skip_dirs for part in relative.parts)
            or relative.parts[:2]==('tests','performance')
            or any(part.startswith('.env') for part in relative.parts)
            or relative.name in {'.git','vault.key','vault.dpapi'}
            or relative.suffix.lower() in skip_suffixes
            or relative.name.lower().endswith(('.tar.gz','.tar.bz2','.tar.xz')))

def checked_file(relative):
    if relative.is_absolute() or '..' in relative.parts:
        raise SystemExit(f'Unsafe package path: {relative}')
    candidate=root
    for part in relative.parts:
        candidate=candidate/part
        if candidate.is_symlink():
            raise SystemExit(f'Refusing a symlink in package input: {relative}')
    if not candidate.is_file():
        raise SystemExit(f'Package input is not a regular file: {relative}')
    return candidate

# The index is the source allowlist. A scratch file, downloaded payload or
# diagnostic report must never enter a release just because it is nearby.
try:
    tracked=subprocess.check_output(['git','ls-files','--cached','--full-name','-z'],cwd=root)
except (OSError, subprocess.CalledProcessError) as error:
    raise SystemExit('Package from a Git checkout with tracked source files.') from error
sources={Path(os.fsdecode(name)) for name in tracked.split(b'\0') if name}
files={relative:checked_file(relative) for relative in sources
       if not excluded(relative) and relative.parts[0]!='dist' and root/relative!=out}

# dist/client is the only generated tree allowed in the archive. Do not follow
# symlinked directories or files, including links to somewhere within the repo.
client=root/'dist'/'client'
for parent in (root/'dist',client):
    if parent.is_symlink():
        raise SystemExit(f'Refusing a symlink in package input: {parent.relative_to(root)}')
for directory,folders,names in os.walk(client,followlinks=False):
    base=Path(directory)
    for name in folders+names:
        candidate=base/name
        if candidate.is_symlink():
            raise SystemExit(f'Refusing a symlink in package input: {candidate.relative_to(root)}')
    folders[:]=[name for name in folders if not excluded((base/name).relative_to(root))]
    for name in names:
        relative=(base/name).relative_to(root)
        if not excluded(relative) and root/relative!=out:
            files[relative]=checked_file(relative)
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for relative in sorted(files):
        archive.write(files[relative],'Kairo/'+relative.as_posix())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    assert not any(excluded(Path(name).relative_to('Kairo')) for name in archive.namelist())
    assert 'Kairo/server/import-cache.mjs' in archive.namelist()
    assert not any('/tests/performance/' in p or '/performance-results/' in p or '/.github/' in p or p=='Kairo/.git' or p.endswith(('.cpuprofile','.heapsnapshot')) for p in archive.namelist())
    for name in ['START_KAIRO.bat','server/start.mjs','server/index.mjs','server/datasets.mjs','server/dataset-paths.mjs','server/runtime-supervisor.mjs','server/runtime-child.mjs','server/runtime-lock.mjs','server/sde-archive.mjs','server/sde-build.mjs','server/sde-worker.mjs','docs/DATASETS.md','server/obs.mjs','server/projections.mjs','dist/client/index.html','public/stream/render.js','docs/VALIDATION.md','docs/IMPORT-ANALYSER.md','server/imports.mjs','server/market-history-store.mjs','server/import-math.mjs','server/market-history-worker.mjs','server/vendor/seek-bzip/LICENSE','server/vendor/seek-bzip/lib/index.js','server/data/npc-market-owners.json','server/universe.mjs','server/universe-static.mjs','server/universe-wormholes.mjs','server/data/universe-wormholes.json','docs/WANDERER-REFERENCE-NOTICE.md','docs/WANDERER-DESTINATIONS-NOTICE.md','docs/WANDERER-INTEGRATION.md','server/universe-jspace.mjs','server/universe-destinations.mjs','server/data/universe-destinations.json','server/universe-routing.mjs','server/universe-history.mjs','server/session-replay.mjs','server/data/universe.json.gz','server/data/universe-provenance.json','server/data/universe-details-000.bin','server/data/universe-details-001.bin','server/data/universe-details-002.bin','docs/UNIVERSE.md','docs/THIRD-PARTY-NOTICES.md','docs/SMT-INTEGRATION.md','server/universe-feeds.mjs','server/universe-operations.mjs','server/universe-navigation.mjs','server/data/universe-points.json','tests/fixtures/smt-user-ansiblex.txt','tests/kairo/fixtures/market-history-archives.json']:
        assert 'Kairo/'+name in archive.namelist(),name
    print(json.dumps({'file':str(out),'version':version,'bytes':out.stat().st_size,'files':len(archive.namelist())}))
