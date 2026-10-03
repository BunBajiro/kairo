#!/usr/bin/env python3
"""Restore only the exact verified original compiled client into its clean source checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile

ORIGINAL_TAR_SHA256 = 'bf398719a9f423530344588977cddc4731b919c123c10d9cf971e348e2ece998'
ORIGINAL_COMMIT = '05d0d4b36c154329006d6772769063db874762da'
ORIGINAL_FINGERPRINT = '9df9de9ed3e9740df9955c59aa8b09c0b03693cbb41875cc716b6b499021ea84'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('archive', type=Path)
    p.add_argument('candidate', type=Path)
    p.add_argument('output', type=Path)
    args = p.parse_args()
    candidate = args.candidate.resolve()
    assert sha(args.archive.read_bytes()) == ORIGINAL_TAR_SHA256
    assert not (candidate/'dist/client').exists(), 'Use a fresh checkout without rebuilt assets'
    args.output.mkdir(parents=True, exist_ok=True)
    prefix = 'internal-rc17/'
    with tarfile.open(args.archive) as tar:
        members = tar.getmembers()
        assert all(not Path(m.name).is_absolute() and '..' not in Path(m.name).parts and not m.issym() and not m.islnk() for m in members)
        def data(name):
            member = tar.getmember(prefix+name)
            assert member.isfile()
            return tar.extractfile(member).read()
        inventory = json.loads(data('SHA256SUMS.json'))
        actual = {m.name[len(prefix):] for m in members if m.isfile() and m.name != prefix+'SHA256SUMS.json'}
        assert actual == set(inventory)
        for name, expected in inventory.items():
            assert sha(data(name)) == expected, name
        manifest = json.loads(data('metadata/candidate-source.json'))
        assert manifest['sourceCommit'] == ORIGINAL_COMMIT and not manifest['dirty']
        assert manifest['fingerprint'] == ORIGINAL_FINGERPRINT
        assert len(manifest['files']) == 439 and len(manifest['builtFiles']) == 20
        for item in manifest['files']:
            path = candidate/item['path']
            assert path.resolve().is_relative_to(candidate)
            actual_bytes = path.read_bytes()
            assert len(actual_bytes) == item['bytes'] and sha(actual_bytes) == item['sha256'], item['path']
        for item in manifest['builtFiles']:
            path = candidate/item['path']
            assert item['path'].startswith('dist/client/') and path.resolve().is_relative_to(candidate)
            content = data('runtime/'+item['path'])
            assert len(content) == item['bytes'] and sha(content) == item['sha256']
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        (args.output/'original-candidate-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
        (args.output/'rc16-source.json').write_bytes(data('metadata/rc16-source.json'))
    record = {'schemaVersion':1,'sourceRunId':37078241973,'sourceArtifactId':11257683807,
              'archiveSha256':ORIGINAL_TAR_SHA256,'candidateCommit':ORIGINAL_COMMIT,
              'candidateFingerprint':ORIGINAL_FINGERPRINT,'inventoryFilesVerified':len(inventory),
              'sourceFilesVerified':len(manifest['files']),'compiledFilesRestored':len(manifest['builtFiles']),
              'scope':'Candidate-only browser replay. All clean-checkout source bytes match the original runtime; only its exact compiled client is restored. No compilation or RC16 execution occurs.'}
    (args.output/'original-runtime-restoration.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))


if __name__ == '__main__':
    main()
