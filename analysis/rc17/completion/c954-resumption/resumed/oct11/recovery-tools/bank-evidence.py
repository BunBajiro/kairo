"""Archive already closed evidence; this makes no semantic or runtime pass claim.

Restore with oct8/restore-evidence.py, which verifies every chunk and file.
The source must be coordinator-owned and closed before invocation.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import stat
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('--purpose', required=True)
args = parser.parse_args()
source, destination = args.source.resolve(), args.destination.resolve()
assert source.is_dir() and not destination.exists()
assert not destination.is_relative_to(source), 'Archive cannot include itself'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def inventory():
    result = {}
    for path in sorted(source.rglob('*')):
        mode = path.lstat().st_mode
        assert stat.S_ISREG(mode) or stat.S_ISDIR(mode), f'Unsupported entry: {path}'
        if stat.S_ISREG(mode):
            content = path.read_bytes()
            result[str(path.relative_to(source))] = {
                'bytes': len(content), 'sha256': sha(content)}
    return result

original = inventory()
assert original, 'Empty evidence source'
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as archive:
    for name, pin in original.items():
        content = (source / name).read_bytes()
        assert {'bytes': len(content), 'sha256': sha(content)} == pin, name
        member = tarfile.TarInfo(name)
        member.size = len(content)
        member.mode = 0o644
        member.mtime = member.uid = member.gid = 0
        archive.addfile(member, io.BytesIO(content))
assert inventory() == original, 'Source changed during archive construction'
content = gzip.compress(buffer.getvalue(), compresslevel=9, mtime=0)
destination.mkdir(parents=True, exist_ok=False)
chunks = []
for offset in range(0, len(content), 240000):
    part = content[offset:offset + 240000]
    name = f'evidence-{len(chunks) + 1:03d}.part'
    path = destination / name
    path.write_bytes(part)
    assert path.read_bytes() == part
    chunks.append({'path': name, 'bytes': len(part), 'sha256': sha(part),
                   'gitBlobSha': hashlib.sha1(b'blob ' + str(len(part)).encode() + b'\0' + part).hexdigest()})
manifest = {'schemaVersion': 1, 'purpose': args.purpose, 'sourceDirectory': str(source),
            'fileCount': len(original), 'totalFileBytes': sum(row['bytes'] for row in original.values()),
            'archiveBytes': len(content), 'archiveSha256': sha(content),
            'chunks': chunks, 'files': [{'path': name, **pin} for name, pin in original.items()]}
(destination / 'RAW-MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
assert inventory() == original, 'Source changed before archive closure'
print(json.dumps({key: manifest[key] for key in ('fileCount', 'totalFileBytes', 'archiveBytes', 'archiveSha256')}))
