#!/usr/bin/env python3
"""Split and checksum an internal bundle without changing its archive bytes."""
import hashlib
import json
import os
from pathlib import Path

CHUNK_BYTES = 30 * 1024 * 1024

def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def split_archive(archive, parts_dir):
    archive, parts_dir = Path(archive), Path(parts_dir)
    parts_dir.mkdir()
    parts = []
    chunk_bytes = CHUNK_BYTES
    with archive.open('rb') as source:
        while data := source.read(chunk_bytes):
            name = f'internal-rc17.part-{len(parts)+1:02d}'
            path = parts_dir / name
            path.write_bytes(data)
            parts.append({'file':name,'bytes':len(data),'sha256':digest(path)})
    assert len(parts) <= 4, 'Extend the explicit upload matrix before retaining a bundle over 120 MiB'
    part_manifest = {'schemaVersion':1,'archive':archive.name,'archiveBytes':archive.stat().st_size,
                     'archiveSha256':digest(archive),'partMaximumBytes':chunk_bytes,'parts':parts}
    (parts_dir / 'parts.json').write_text(json.dumps(part_manifest,indent=2)+'\n')
    (parts_dir / 'reassemble-bundle.py').write_text('''#!/usr/bin/env python3
import hashlib, json, os, sys
from pathlib import Path
root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
m = json.loads((root / 'parts.json').read_text())
assert Path(m['archive']).name == m['archive']
target = root / m['archive']
assert not target.exists(), 'Destination archive already exists'
temporary = target.with_suffix(target.suffix + '.assembling')
assert not temporary.exists(), 'An incomplete assembly already exists'
with temporary.open('xb') as out:
    for part in m['parts']:
        assert Path(part['file']).name == part['file']
        p = root / part['file']
        data = p.read_bytes()
        assert len(data) == part['bytes'] and len(data) <= m['partMaximumBytes']
        assert hashlib.sha256(data).hexdigest() == part['sha256'], part['file']
        out.write(data)
assert temporary.stat().st_size == m['archiveBytes']
with temporary.open('rb') as source:
    h = hashlib.file_digest(source, 'sha256').hexdigest()
assert h == m['archiveSha256'], 'Reassembled archive digest mismatch'
os.replace(temporary, target)
print(f'Verified and reassembled {target.name}: {h}')
''')
    (parts_dir / 'README.md').write_text('''# Internal RC17 bundle download

Download and extract the bundle manifest artifact and every numbered part
artifact into one directory. Each numbered part is at most 30 MiB, keeping
individual downloads below the transfer limit. The parts are pieces of one
tar.gz archive, not independently extractable archives.

Run `python3 reassemble-bundle.py /absolute/path/to/that/directory`. The helper
checks each part's size/SHA-256 and the complete archive's size/SHA-256 before
publishing it. Extract the resulting tar.gz, then run the internal
`verify-bundle.py` inventory check. `parts.json` lists the required part count,
names and hashes. No part or failed original run is silently omitted.
''')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as handle:
            handle.write(f'parts={len(parts)}\n')
    return parts

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    parts = split_archive(args.archive, args.output)
    print(json.dumps({'parts':len(parts),'archiveSha256':digest(args.archive)}))
