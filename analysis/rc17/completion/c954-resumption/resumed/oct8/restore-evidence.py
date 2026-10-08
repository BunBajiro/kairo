"""Restore a RAW-MANIFEST.json to a chosen resumed directory without overwriting edits."""
import hashlib, io, json, sys, tarfile
from pathlib import Path, PurePosixPath

manifest_path, destination = Path(sys.argv[1]), Path(sys.argv[2])
manifest = json.loads(manifest_path.read_text())
def checked_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError(f'Unsafe archive path: {value}')
    return path
parts = []
for row in manifest['chunks']:
    content = (manifest_path.parent / checked_path(row['path'])).read_bytes()
    assert len(content) == row['bytes'] and hashlib.sha256(content).hexdigest() == row['sha256'], row['path']
    parts.append(content)
archive = b''.join(parts)
assert len(archive) == manifest['archiveBytes'] and hashlib.sha256(archive).hexdigest() == manifest['archiveSha256']
restored = 0
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as stream:
    for row in manifest['files']:
        name = checked_path(row['path'])
        member = stream.getmember(str(name))
        assert member.isfile() or member.islnk(), name
        if member.islnk(): checked_path(member.linkname)
        content = stream.extractfile(member).read()
        assert len(content) == row['bytes'] and hashlib.sha256(content).hexdigest() == row['sha256'], name
        target = destination / name
        # Avoid following a pre-existing symlink outside the chosen destination.
        assert target.resolve().is_relative_to(destination.resolve()), target
        if target.exists():
            assert target.is_file() and target.read_bytes() == content, f'Different existing bytes: {target}'
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            restored += 1
print(json.dumps({'verifiedFiles': len(manifest['files']), 'restoredFiles': restored, 'destination': str(destination)}))
