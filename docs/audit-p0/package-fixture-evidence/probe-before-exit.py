"""Exercise the archive-without-checkout fixture, optionally at a disappearing-child boundary.

The injected removal models the observed Python 3.12 rmtree failure; it does not
identify which process removed maintenance.lock in the hosted run.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

parser = argparse.ArgumentParser()
parser.add_argument('root', type=Path)
parser.add_argument('fixture', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--race', action='store_true')
parser.add_argument('--suite', action='store_true')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('package_fixture', args.fixture)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.ROOT = args.root.resolve()
fixture_base = getattr(module, 'PackageFixture', module.PackageReleaseTests)
original_package = fixture_base.package
original_git = fixture_base.git
original_rmtree = shutil.rmtree
original_unlink = os.unlink
evidence = {'race_requested': args.race, 'race_entries': 0, 'removed_children': 0,
            'package_calls': 0, 'package_results': [], 'fixture_git_commands': [],
            'python': sys.version,
            'git': subprocess.check_output(['git', '--version'], text=True).strip(),
            'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=args.root, text=True).strip(),
            'fixture': str(args.fixture.resolve()),
            'fixture_sha256': hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
            'packager_sha256': hashlib.sha256((args.root/'scripts/package-release.py').read_bytes()).hexdigest()}


def tracked_git(case, *arguments):
    evidence['fixture_git_commands'].append(list(arguments))
    return original_git(case, *arguments)


def tracked_package(case):
    evidence['package_calls'] += 1
    result = original_package(case)
    evidence['package_results'].append({'exit_code': result.returncode,
        'stderr': result.stderr, 'destination_exists': case.output.exists(),
        'git_metadata_exists': (case.source / '.git').exists()})
    return result


def disappearing_child(path, *positional, **keywords):
    if os.fspath(path) == 'maintenance.lock' and 'dir_fd' in keywords:
        # Another actor removes the child after rmtree enumerated it. The second
        # unlink is Python's actual operation, with its normal exception policy.
        original_unlink(path, *positional, **keywords)
        evidence['removed_children'] += 1
    try:
        return original_unlink(path, *positional, **keywords)
    except FileNotFoundError as error:
        evidence['unlink_error_child'] = error.filename
        raise


def checked_rmtree(path, *positional, **keywords):
    if args.race and Path(path).name == '.git':
        evidence['race_entries'] += 1
        # Exclusive creation avoids overwriting a real lock in this disposable fixture.
        with (Path(path) / 'maintenance.lock').open('x') as stream:
            stream.write('Synthetic removable child, not a Git producer attribution.\n')
        with patch('os.unlink', disappearing_child):
            return original_rmtree(path, *positional, **keywords)
    return original_rmtree(path, *positional, **keywords)


if args.suite:
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
else:
    case_type = getattr(module, 'SourceArchiveTests', module.PackageReleaseTests)
    suite = unittest.TestSuite([case_type('test_source_archive_without_git_checkout_is_rejected')])

start = time.monotonic()
with (args.output / 'test.log').open('w') as stream:
    with patch.object(fixture_base, 'package', tracked_package), patch.object(fixture_base, 'git', tracked_git), patch('shutil.rmtree', checked_rmtree):
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
evidence.update(tests_run=result.testsRun, errors=len(result.errors), failures=len(result.failures),
                successful=result.wasSuccessful(), elapsed_seconds=round(time.monotonic()-start, 3))
(args.output / 'result.json').write_text(json.dumps(evidence, indent=2)+'\n')
print(json.dumps({key: value for key, value in evidence.items() if key != 'package_results'}))
print((args.output / 'test.log').read_text()[-5000:])
