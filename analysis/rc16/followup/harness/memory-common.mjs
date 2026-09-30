// Internal follow-up only. Shared setup never reads an installed user's data.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';

export const analysisRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultRoot = resolve(analysisRoot, '../..');
export const rcRoot = process.env.KAIRO_MEMORY_CANDIDATE_ROOT ? resolve(process.env.KAIRO_MEMORY_CANDIDATE_ROOT) : defaultRoot;
export const stableRoot = process.env.KAIRO_MEMORY_BASELINE_ROOT ? resolve(process.env.KAIRO_MEMORY_BASELINE_ROOT) : resolve(defaultRoot, '../kairo-v073');
export const AT = Date.parse('2026-09-30T09:00:00Z');
export const iso = n => new Date(n).toISOString();
export const sha = data => createHash('sha256').update(data).digest('hex');
export const moduleAt = (root, name) => import(pathToFileURL(join(root, 'server', name)).href);
export const tick = () => new Promise(resolve => setImmediate(resolve));
const candidateOverride = !!process.env.KAIRO_MEMORY_CANDIDATE_ROOT;
const candidateCommit = candidateOverride ? process.env.KAIRO_MEMORY_CANDIDATE_COMMIT || execFileSync('git', ['-C', rcRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() : '57c8dcc7fbd8fc2b62129498d1819050c78381a1';
export const builds = { rc16: { root: rcRoot, commit: candidateCommit }, v073: { root: stableRoot, commit: '239794774320fcdebaa1d76ce8a77c5c25cfc48c' } };
export function provenance(buildName, harnessNames) {
  const build = builds[buildName];
  let manifest;
  if (buildName === 'rc16' && candidateOverride) {
    if (process.env.KAIRO_MEMORY_CANDIDATE_MANIFEST) manifest = JSON.parse(readFileSync(process.env.KAIRO_MEMORY_CANDIDATE_MANIFEST));
    else {
      const tree = execFileSync('git', ['-C', rcRoot, 'ls-tree', '-r', '-z', build.commit], { encoding: 'utf8' });
      manifest = { files: tree.split('\0').filter(Boolean).map(row => { const [header, path] = row.split('\t'), [mode, type, sha] = header.split(' '); return { mode, type, sha, path }; }).filter(row => row.type === 'blob') };
    }
  } else manifest = buildName === 'rc16' ? JSON.parse(readFileSync(join(analysisRoot, 'rc16-source-manifest.json'))) : JSON.parse(readFileSync(join(analysisRoot, 'historical/retrieval-manifest.json'))).stableTree;
  const entries = manifest.files || manifest.tree.filter(row => row.type === 'blob');
  const selected = entries.filter(row => row.path.startsWith('server/') || row.path.startsWith('public/stream/'));
  const files = selected.map(row => {
    const bytes = readFileSync(join(build.root, row.path));
    const gitBlob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (gitBlob !== row.sha) throw new Error(`Source differs from selected source commit: ${row.path}`);
    return { path: row.path, gitBlob, expectedGitBlob: row.sha, sha256: sha(bytes), bytes: bytes.length };
  });
  const harness = [...new Set(['memory-common.mjs', ...harnessNames])].map(name => ({ path: `analysis/rc16/followup/harness/${name}`, sha256: sha(readFileSync(new URL(name, import.meta.url))) }));
  return { sourceCommit: build.commit, sourceRoot: build.root, candidateOverride: buildName === 'rc16' && candidateOverride, checkedCanonicalFiles: files.length, productionTreeSha256: sha(JSON.stringify(files)), productionFiles: files, harness,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model }, recordedAt: new Date().toISOString() };
}
export function seedPilots(store, count = 4) {
  const pilots = Array.from({ length: count }, (_, i) => ({ id: 42 + i, name: `Synthetic pilot ${i}`, scopes: [] }));
  const sample = data => ({ status: 'ready', data, updatedAt: iso(AT), expiresAt: iso(AT + 86400000) });
  for (const c of pilots) {
    store.saveSnapshot(c.id, 'profile', sample({ corporation_id: 98000000, alliance_id: 99000000 }));
    store.saveSnapshot(c.id, 'location', sample({ solar_system_id: 30000142 }));
    for (const key of ['contacts', 'corporation_contacts', 'alliance_contacts', 'calendar', 'mining']) store.saveSnapshot(c.id, key, sample([]));
  }
  for (const key of ['sovereignty', 'kills', 'jumps', 'fw', 'incursions', 'industry_systems', 'sovereignty_structures', 'sovereignty_campaigns']) store.saveSnapshot(0, key, sample([]));
  return pilots;
}
