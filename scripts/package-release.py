"""Package the standalone Kairo runtime, compiled UI and source without local data."""
from pathlib import Path
import json, os, sys, zipfile
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent/f'Kairo-v{version}.zip'
if not (root/'dist/client/index.html').is_file():
    raise SystemExit('Build the frontend before packaging.')
skip_dirs={'node_modules','.git','.sites-runtime','.wrangler','.next','out','coverage','__pycache__','.cache','.codex'}
skip_suffixes={'.log','.sqlite','.sqlite-wal','.sqlite-shm','.tsbuildinfo','.pyc','.zip'}
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for directory,folders,files in os.walk(root):
        base=Path(directory)
        folders[:]=[d for d in folders if d not in skip_dirs and not (base==root/'dist' and d!='client')]
        for name in sorted(files):
            p=base/name
            if name.startswith('.env') or name in {'vault.key','vault.dpapi'} or p.suffix in skip_suffixes or p==out:
                continue
            archive.write(p,'Kairo/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    for name in ['START_KAIRO.bat','server/index.mjs','server/obs.mjs','server/projections.mjs','dist/client/index.html','public/stream/render.js','docs/VALIDATION.md','docs/IMPORT-ANALYSER.md','server/imports.mjs','server/import-math.mjs','server/market-history-worker.mjs','server/vendor/seek-bzip/LICENSE','server/vendor/seek-bzip/lib/index.js','server/data/npc-market-owners.json','tests/kairo/fixtures/market-history-archives.json']:
        assert 'Kairo/'+name in archive.namelist(),name
    print(json.dumps({'file':str(out),'version':version,'bytes':out.stat().st_size,'files':len(archive.namelist())}))
