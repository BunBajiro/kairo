// Acceptance-only fixture contract. No application modules are imported here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadSourceManifest} from '../../../../../harness/source-manifest.mjs';

export const CANDIDATE = '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789';
export const BASELINE = '57c8dcc7fbd8fc2b62129498d1819050c78381a1';
export const GOAL = {id: 'first-binding-goal', characterId: 42, title: 'Fixture objective',
  progress: 1234567.89, target: 2345678.91};
export const PROFILE = 'stress';
export const WARM_CALLS = 100;
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function sourceAt(root, path) {
  const source = await loadSourceManifest(path, root);
  assert.ok([BASELINE, CANDIDATE].includes(source.sourceCommit), 'Only reviewed RC16/final source is accepted');
  assert.equal(source.expectedCommit, source.sourceCommit);
  assert.equal(source.requireClean, true);
  assert.equal(source.dirty, false);
  assert.equal(source.status, '');
  assert.ok(source.builtFiles.length > 0, 'Retain the separate fresh-build receipt');
  return {manifest: source, binding: {commit: source.sourceCommit, fingerprint: source.fingerprint,
    manifestSha256: sha(await readFile(path))}};
}

export async function filesBelow(root, relative = '') {
  const files = [];
  for (const entry of await readdir(join(root, relative), {withFileTypes: true})) {
    const path = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await filesBelow(root, path));
    else {
      assert.ok(entry.isFile(), 'Fixture must contain regular files only: ' + path);
      const bytes = await readFile(join(root, path));
      files.push({path, bytes: bytes.length, sha256: sha(bytes)});
    }
  }
  // Do not exercise ICU/Intl collation before the first real number formatter.
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function expectedElements(config) {
  return config.elements.map(element => {
    const {binding, sourceId, characterId, bindingDisplay, name, ...visual} = element;
    assert.equal(element.visible, true);
    if (binding === 'wallet.balance') return {...visual, text: '1,234,567.89 ISK', detail: '', bindingStatus: 'ready'};
    assert.equal(binding, 'goal.progress');
    return {...visual, text: GOAL.title, detail: '1,234,567.89 / 2,345,678.91',
      value: GOAL.progress / GOAL.target * 100, bindingStatus: 'ready'};
  });
}
