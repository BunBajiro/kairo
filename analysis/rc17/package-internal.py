#!/usr/bin/env python3
"""Assemble a review-only runtime, harness and evidence bundle after measurement.

This does not install dependencies, run Kairo, or execute benchmarks. Sources are
copied from the measured manifest and checked byte-for-byte during assembly.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def contained(root, relative):
    path = Path(relative)
    assert not path.is_absolute() and '..' not in path.parts, relative
    result = root / path
    assert result.resolve().is_relative_to(root.resolve()), relative
    assert not result.is_symlink(), f'Symlink is not a bundled regular file: {relative}'
    return result


def copy_file(source, destination):
    assert source.is_file() and not source.is_symlink(), source
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    assert digest(source) == digest(destination), f'Changed during copy: {source}'


def copy_tree(source, destination):
    assert source.is_dir(), source
    for path in sorted(source.rglob('*')):
        assert not path.is_symlink(), path
        if path.is_file():
            copy_file(path, destination / path.relative_to(source))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--candidate-manifest', type=Path, required=True)
    parser.add_argument('--baseline-manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    checkpoint = args.checkpoint.resolve()
    output = args.output.resolve()
    assert not output.exists(), 'Bundle output must be a fresh directory'
    assert not output.is_relative_to(checkpoint), 'Keep packaging outside the measured checkout'
    candidate = json.loads(args.candidate_manifest.read_text())
    baseline = json.loads(args.baseline_manifest.read_text())
    assert candidate['schemaVersion'] == baseline['schemaVersion'] == 1
    assert candidate['dirty'] is False and baseline['dirty'] is False
    assert baseline['sourceCommit'] == '57c8dcc7fbd8fc2b62129498d1819050c78381a1'
    assert candidate['sourceCommit'] != baseline['sourceCommit']
    assert candidate['builtFiles'], 'A compiled runtime is required'
    assert candidate['fingerprint'] == hashlib.sha256(json.dumps(
        {'files': candidate['files'], 'builtFiles': candidate['builtFiles']},
        separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    root = Path(candidate['root']).resolve()
    output.mkdir(parents=True)
    bundle = output / 'internal-rc17'
    runtime = bundle / 'runtime'
    copied = set()
    for item in candidate['files'] + candidate['builtFiles']:
        assert not item.get('missing'), f'Missing runtime file: {item["path"]}'
        source = contained(root, item['path'])
        assert source.stat().st_size == item['bytes'] and digest(source) == item['sha256'], source
        if item['path'] not in copied:
            copy_file(source, contained(runtime, item['path']))
            copied.add(item['path'])
    copy_tree(checkpoint / 'analysis/rc16', bundle / 'checkpoint/analysis/rc16')
    copy_tree(checkpoint / 'analysis/rc17', bundle / 'checkpoint/analysis/rc17')
    for name in ['rc16-followup.yml', 'rc17-comparison.yml']:
        copy_file(checkpoint / '.github/workflows' / name, bundle / 'checkpoint/.github/workflows' / name)
    metadata = bundle / 'metadata'
    metadata.mkdir(parents=True)
    copy_file(args.candidate_manifest, metadata / 'candidate-source.json')
    copy_file(args.baseline_manifest, metadata / 'rc16-source.json')
    steps = json.loads(os.environ.get('KAIRO_WORKFLOW_STEPS', '{}'))
    suite = os.environ.get('KAIRO_REQUEST_SUITE', 'unknown')
    expected = ['compile', 'correctness', 'maps', 'routes', 'legacy', 'backend', 'memory',
                'mixed', 'restart', 'browser', 'camera', 'sources']
    all_lanes = suite == 'all' and all(steps.get(key, {}).get('outcome') == 'success' for key in expected)
    info = {
        'schemaVersion': 1,
        'kind': 'internal-instrumented-rc17-checkpoint',
        'releaseReady': False,
        'userFacingReleaseAfterReview': '8.0',
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'candidateCommit': candidate['sourceCommit'],
        'candidateFingerprint': candidate['fingerprint'],
        'rc16Commit': baseline['sourceCommit'],
        'historical073Commit': '239794774320fcdebaa1d76ce8a77c5c25cfc48c',
        'harnessCommit': os.environ.get('GITHUB_SHA'),
        'runId': os.environ.get('GITHUB_RUN_ID'),
        'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
        'requestedSuite': suite,
        'allComparisonLanesPassed': all_lanes,
        'workflowStepOutcomes': {key: value.get('outcome') for key, value in steps.items()},
        'scope': 'Pinned compiled runtime plus external harnesses, reports and evidence. Instrumentation is present in the bundle and runs externally; timed production operations are not rewritten with diagnostic observers.',
        'reportStatus': 'Reports reflect their stated source commits and evidence dates. This bundle can contain a draft whitepaper; the workflow does not rewrite narrative findings or convert pending review to approval.',
        'whitepaper': {
            'commitAtPackaging': os.environ.get('GITHUB_SHA'),
            'sha256AtPackaging': digest(checkpoint / 'analysis/rc17/REPORT.md'),
            'canonicalUrl': 'https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/REPORT.md',
            'note': 'This checked-out report predates review of fresh workflow evidence. The canonical whitepaper is updated separately after artifact retrieval.',
        },
        'reproduction': 'Use the included workflow at harnessCommit with candidateCommit. The source archive has no Git database; exact source-manifest benchmark reproduction requires clean Git checkouts at the pinned commits.',
    }
    (metadata / 'bundle.json').write_text(json.dumps(info, indent=2) + '\n')
    legacy_manifest = args.candidate_manifest.parent / 'v073-source.json'
    if legacy_manifest.exists():
        copy_file(legacy_manifest, metadata / 'v073-source.json')
    (bundle / 'README-INTERNAL.md').write_text('''# Internal instrumented RC17 checkpoint

This bundle is for performance and refactoring review. RC17 identifies the
internal optimised candidate. The eventual user-facing release is **8.0**, after
the findings are reviewed, a clean preparation is made, and user review clears
it. This bundle is not an end-user release or an approval to merge.

- `runtime/` is the exact pinned application source with its measured compiled
  client. It includes the original dependency lockfile; dependencies and a Node
  executable are not redistributed. Use Node 24.19.0. The built server uses Node's
  runtime modules and can start without installing frontend build dependencies.
  From `runtime/`, give this internal run its own fresh data directory and ports:

  ```sh
  KAIRO_DATA_DIR=/absolute/fresh/kairo-internal-data KAIRO_PORT=4480 KAIRO_STREAM_PORT=4481 npm start
  ```

  Replace the data path with an absolute fresh test location you own. Open
  `http://127.0.0.1:4480`. Use `npm run install:ci` only when installing the
  locked dependencies needed for rebuilding or applicable harness tooling.
- `checkpoint/analysis/rc17/REPORT.md` is the comparison whitepaper. Its status,
  commit labels and pending sections remain authoritative. Historical 0.7.3,
  RC16 and current RC17 observations are separated by method and environment.
  Its packaging revision/hash is in `metadata/bundle.json`; it can predate review
  of this workflow's new results. See the [canonical whitepaper](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/REPORT.md)
  for the separately updated comparison after evidence retrieval.
- `checkpoint/analysis/` contains the benchmarking harnesses, reports, raw
  evidence and method descriptions. Diagnostic and timing runs are separate.
- `checkpoint/.github/workflows/` contains the reproduction workflows. Use
  clean Git checkouts at the commits in `metadata/bundle.json` to run them;
  benchmark source verification deliberately requires real Git provenance.
- `metadata/` retains source/build manifests and each observed workflow step
  outcome. A partial or failed run is useful evidence, not a passing checkpoint.

Run `python3 verify-bundle.py` before use to check every bundled file. The
SHA-256 inventory authenticates byte consistency, not a publisher signature.
Original evidence manifests retain their original measurement paths; those
paths are provenance and do not imply that this archive is a Git checkout.

The internal package keeps the harnesses alongside the runtime. Removing them
and producing the clean user-review preparation is a later, separately reviewed
step. Do not deploy or distribute this package as 8.0.
''')
    (bundle / 'verify-bundle.py').write_text('''#!/usr/bin/env python3
import hashlib, json
from pathlib import Path
root = Path(__file__).resolve().parent
manifest = json.loads((root / 'SHA256SUMS.json').read_text())
actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.json'}
assert actual == set(manifest), 'Bundle file set changed'
for relative, expected in manifest.items():
    path = root / relative
    assert not path.is_symlink() and path.resolve().is_relative_to(root)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, relative
print(f'Verified {len(manifest)} internal checkpoint files')
''')
    inventory = {str(path.relative_to(bundle)): digest(path) for path in sorted(bundle.rglob('*')) if path.is_file()}
    (bundle / 'SHA256SUMS.json').write_text(json.dumps(inventory, indent=2) + '\n')
    archive = output / f'internal-rc17-{candidate["sourceCommit"][:12]}.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(bundle, arcname='internal-rc17')
    (output / (archive.name + '.sha256')).write_text(digest(archive) + '  ' + archive.name + '\n')
    print(json.dumps({'archive': str(archive), 'sha256': digest(archive), 'files': len(inventory),
                      'allComparisonLanesPassed': all_lanes, 'releaseReady': False}))


if __name__ == '__main__':
    main()
