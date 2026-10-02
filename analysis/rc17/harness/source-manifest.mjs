// External checkpoint provenance. Never imported by the measured application.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8', maxBuffer:20_000_000});
async function fingerprint(root, paths) {
  const files = [];
  for (const path of paths.sort()) {
    try {
      const bytes = await readFile(join(root, path));
      files.push({path, bytes:bytes.length, sha256:hash(bytes)});
    } catch (error) {
      // A local working tree can intentionally delete tracked source files.
      // Missing entries stay explicit and are checked again at the end.
      if (error.code !== 'ENOENT') throw error;
      files.push({path, missing:true});
    }
  }
  return files;
}
async function buildPaths(root) {
  const paths = [];
  async function walk(relative) {
    for (const entry of await readdir(join(root, relative), {withFileTypes:true})) {
      const path = relative + '/' + entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) paths.push(path);
    }
  }
  try { await stat(join(root, 'dist/client')); await walk('dist/client'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return paths;
}

export async function captureSource(root, {expectedCommit, requireClean=false}={}) {
  root = resolve(root);
  const sourceCommit = git(root, 'rev-parse', 'HEAD').trim();
  if (expectedCommit) {
    assert.match(expectedCommit, /^[0-9a-f]{40}$/, 'Pin a full lowercase commit SHA');
    assert.equal(sourceCommit, expectedCommit, 'Checkout must match the pinned application commit');
  }
  const status = git(root, 'status', '--porcelain', '--untracked-files=all');
  if (requireClean) assert.equal(status, '', 'Application checkout must be clean');
  const paths = [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))];
  const files = await fingerprint(root, paths);
  const builtFiles = await fingerprint(root, await buildPaths(root));
  assert.ok(files.some(file => file.path === 'server/index.mjs'), 'Expected Kairo application root');
  return {schemaVersion:1, root, sourceCommit, expectedCommit:expectedCommit || null, requireClean,
    dirty:!!status, status, files, builtFiles, fingerprint:hash(JSON.stringify({files, builtFiles}))};
}

export async function verifySource(manifest) {
  assert.equal(manifest.schemaVersion, 1);
  const actual = await captureSource(manifest.root, {expectedCommit:manifest.expectedCommit || manifest.sourceCommit, requireClean:manifest.requireClean});
  assert.equal(actual.sourceCommit, manifest.sourceCommit, 'Application commit changed during measurement');
  assert.equal(actual.status, manifest.status, 'Application working-tree status changed during measurement');
  assert.deepEqual(actual.files, manifest.files, 'Application source or file set changed during measurement');
  assert.deepEqual(actual.builtFiles, manifest.builtFiles, 'Compiled browser assets changed during measurement');
  assert.equal(actual.fingerprint, manifest.fingerprint);
  return actual;
}

export async function loadSourceManifest(path, root) {
  assert.ok(path, 'A source manifest captured before the run is required');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (root) assert.equal(resolve(root), manifest.root, 'Harness root must match its source manifest');
  await verifySource(manifest);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, rootOrManifest, output, expectedCommit] = process.argv.slice(2);
  if (command === 'capture') {
    assert.ok(rootOrManifest && output, 'capture <application-root> <output.json> [full-commit-sha]');
    const manifest = await captureSource(rootOrManifest, {expectedCommit, requireClean:!!expectedCommit});
    await mkdir(dirname(resolve(output)), {recursive:true});
    await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({output:resolve(output), sourceCommit:manifest.sourceCommit, dirty:manifest.dirty, files:manifest.files.length, builtFiles:manifest.builtFiles.length, fingerprint:manifest.fingerprint}));
  } else if (command === 'verify') {
    const manifest = await loadSourceManifest(rootOrManifest);
    console.log(JSON.stringify({verified:true, sourceCommit:manifest.sourceCommit, fingerprint:manifest.fingerprint}));
  } else throw Error('Use capture or verify');
}
