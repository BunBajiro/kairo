"""Exercise distribution input boundaries with the actual packaging command.

Requires Git/Python on the source-build host. This is not part of the Node-only
packaged-runtime suite. All profiles, links and secrets below are synthetic.
"""
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class PackageReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_archive = subprocess.check_output(['git', 'archive', 'HEAD'], cwd=ROOT)
        cls.packager = (ROOT / 'scripts/package-release.py').read_bytes()
        cls.supplement = (ROOT / 'vendor/frontend-license-supplement.json').read_bytes()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='kairo-package-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'source'
        self.source.mkdir()
        with tarfile.open(fileobj=io.BytesIO(self.source_archive)) as archive:
            archive.extractall(self.source, filter='data')
        (self.source / 'scripts/package-release.py').write_bytes(self.packager)
        (self.source / 'vendor/frontend-license-supplement.json').write_bytes(self.supplement)
        self.git('init', '-q')
        self.git('add', '.')
        self.commit()
        (self.source / 'dist/client/assets').mkdir(parents=True)
        (self.source / 'dist/client/index.html').write_text('<!doctype html><title>Package fixture</title>')
        (self.source / 'dist/client/assets/client.js').write_text('console.log("compiled fixture");')
        (self.source / 'dist/client/.vite').mkdir()
        (self.source / 'dist/client/.vite/license.md').write_text('# Licenses\n\n## react - 19.2.6 (MIT)\n\nSynthetic fixture license.\n')
        self.output = self.base / 'Kairo-test.zip'

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.source, stderr=subprocess.STDOUT)

    def commit(self):
        self.git('-c', 'user.name=Package Fixture', '-c', 'user.email=fixture@example.invalid',
                 'commit', '-qm', 'Fixture')

    def package(self):
        return subprocess.run(['python3', str(self.source / 'scripts/package-release.py'),
                               str(self.output)], cwd=self.base, capture_output=True, text=True)

    def assert_rejected(self, expected):
        result = self.package()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(expected, result.stderr)
        self.assertFalse(self.output.exists(), 'Invalid inputs must fail before opening the destination')

    def test_clean_tracked_sources_and_compiled_client_are_packaged(self):
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read('Kairo/server/start.mjs'), (self.source / 'server/start.mjs').read_bytes())
            self.assertEqual(archive.read('Kairo/dist/client/assets/client.js'), b'console.log("compiled fixture");')
            self.assertIn('Kairo/docs/THIRD-PARTY-NOTICES.md', archive.namelist())
            self.assertFalse(any('/.git/' in name or '/.github/' in name or '/tests/performance/' in name
                                 for name in archive.namelist()))

    def test_local_ignored_and_untracked_source_files_are_not_distributed(self):
        (self.source / 'local-secret.pem').write_text('SYNTHETIC NOT A KEY')
        (self.source / 'untracked-notes.txt').write_text('SYNTHETIC LOCAL NOTES')
        (self.source / 'outputs').mkdir()
        (self.source / 'outputs/local-profile.json').write_text('{"synthetic":true}')
        (self.base / 'outside.txt').write_text('SYNTHETIC OUTSIDE DATA')
        (self.source / 'untracked-link.txt').symlink_to(self.base / 'outside.txt')
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output) as archive:
            for name in ['local-secret.pem', 'untracked-notes.txt', 'outputs/local-profile.json', 'untracked-link.txt']:
                self.assertFalse('Kairo/' + name in archive.namelist(), f'Local input leaked into archive: {name}')

    def test_tracked_unicode_executable_and_private_exclusions_are_preserved(self):
        script = self.source / 'scripts/δοκιμή fixture.sh'
        script.write_text('#!/bin/sh\necho fixture\n')
        script.chmod(0o755)
        for name in ['.env.fixture', 'vault.key', 'synthetic.sqlite']:
            (self.source / name).write_text('SYNTHETIC PRIVATE CONTENT')
        self.git('add', '-f', 'scripts/δοκιμή fixture.sh', '.env.fixture', 'vault.key', 'synthetic.sqlite')
        self.commit()
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output) as archive:
            info = archive.getinfo('Kairo/scripts/δοκιμή fixture.sh')
            self.assertEqual((info.external_attr >> 16) & 0o777, 0o755)
            self.assertEqual(archive.read(info), script.read_bytes())
            for name in ['.env.fixture', 'vault.key', 'synthetic.sqlite']:
                self.assertFalse('Kairo/' + name in archive.namelist(), name)

    def test_deleted_tracked_source_is_rejected_before_destination_creation(self):
        (self.source / 'server/start.mjs').unlink()
        self.assert_rejected('tracked changes')

    def test_tracked_source_symlink_is_rejected(self):
        (self.base / 'outside.txt').write_text('SYNTHETIC OUTSIDE DATA')
        (self.source / 'tracked-link.txt').symlink_to(self.base / 'outside.txt')
        self.git('add', 'tracked-link.txt')
        self.commit()
        self.assert_rejected('symlink')

    def test_compiled_file_symlink_is_rejected(self):
        (self.base / 'outside.txt').write_text('SYNTHETIC OUTSIDE DATA')
        (self.source / 'dist/client/assets/outside.txt').symlink_to(self.base / 'outside.txt')
        self.assert_rejected('symlink')

    def test_compiled_directory_symlink_is_rejected(self):
        outside = self.base / 'outside-client'
        (self.source / 'dist/client').rename(outside)
        (self.source / 'dist/client').symlink_to(outside, target_is_directory=True)
        self.assert_rejected('symlink')

    def test_changed_tracked_source_is_rejected_before_destination_creation(self):
        start = self.source / 'server/start.mjs'
        start.write_text(start.read_text() + '\n// synthetic uncommitted change\n')
        self.assert_rejected('tracked changes')
        self.git('add', 'server/start.mjs')
        self.assert_rejected('tracked changes')

    def test_unreadable_compiled_subdirectory_is_rejected_before_destination_creation(self):
        # Inject the filesystem boundary deterministically: chmod is ineffective
        # when a source-build test happens to run as root.
        program = """
import errno, os, runpy, sys
original_scandir = os.scandir
blocked = os.path.join(os.path.dirname(os.path.dirname(sys.argv[1])), 'dist', 'client', 'assets')
def checked_scandir(path):
    if os.fspath(path) == blocked:
        raise PermissionError(errno.EACCES, 'Synthetic denied client subtree', path)
    return original_scandir(path)
os.scandir = checked_scandir
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
"""
        result = subprocess.run(['python3', '-c', program, str(self.source / 'scripts/package-release.py'),
                                 str(self.output)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('Cannot read compiled package input', result.stderr)
        self.assertFalse(self.output.exists())

    def test_uncovered_dependency_notice_is_rejected(self):
        (self.source / 'dist/client/.vite/license.md').write_text('# Licenses\n\n## missing-fixture - 1.0.0 (MIT)\n')
        self.assert_rejected('Missing full bundled license')

    def test_reviewed_supplement_covers_omitted_npm_license_text(self):
        (self.source / 'dist/client/.vite/license.md').write_text('# Licenses\n\n## @vitejs/plugin-rsc - 0.5.26 (MIT)\n')
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(archive.read('Kairo/vendor/frontend-license-supplement.json'), self.supplement)

    def test_stale_supplement_version_is_rejected(self):
        supplement = self.source / 'vendor/frontend-license-supplement.json'
        data = json.loads(supplement.read_text())
        data['packages'][0]['version'] = '0.0.0-fixture'
        supplement.write_text(json.dumps(data))
        self.git('add', 'vendor/frontend-license-supplement.json')
        self.commit()
        self.assert_rejected('Stale supplemental license version')

    def test_changed_supplement_text_is_rejected(self):
        supplement = self.source / 'vendor/frontend-license-supplement.json'
        data = json.loads(supplement.read_text())
        data['packages'][0]['text'] = 'Synthetic incomplete license text'
        supplement.write_text(json.dumps(data))
        self.git('add', 'vendor/frontend-license-supplement.json')
        self.commit()
        self.assert_rejected('Invalid supplemental license text')

    def test_empty_generated_notice_inventory_is_rejected(self):
        (self.source / 'dist/client/.vite/license.md').write_text('')
        self.assert_rejected('No bundled dependency license entries')

    def test_missing_bundled_notices_is_rejected_before_destination_creation(self):
        (self.source / 'dist/client/.vite/license.md').unlink()
        self.assert_rejected('bundled license')

    def test_source_archive_without_git_checkout_is_rejected(self):
        shutil.rmtree(self.source / '.git')
        self.assert_rejected('Git checkout')


if __name__ == '__main__':
    unittest.main()
