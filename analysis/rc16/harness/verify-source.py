"""Assert investigation does not change RC16 application files or dependencies."""
import hashlib, json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
manifest = json.loads((root / 'analysis/rc16/rc16-source-manifest.json').read_text())
allowed = {'AGENTS.md', '.github/workflows/test-build.yml'}
checked = 0
errors = []
for entry in manifest['files']:
    if entry['path'] in allowed:
        continue
    path = root / entry['path']
    if not path.is_file():
        errors.append(f"missing: {entry['path']}")
        continue
    data = path.read_bytes()
    digest = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if digest != entry['sha']:
        errors.append(f"changed: {entry['path']}")
    checked += 1
result = {'sourceCommit': manifest['sourceCommit'], 'checkedFiles': checked,
          'permittedInvestigationChanges': sorted(allowed), 'errors': errors}
print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
