#!/usr/bin/env python3
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
