// Internal follow-up only. Shared setup never reads an installed user's data.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';

export const AT = Date.parse('2026-09-30T09:00:00Z');
export const iso = n => new Date(n).toISOString();
export const sha = data => createHash('sha256').update(data).digest('hex');
export const moduleAt = (root, name) => import(pathToFileURL(join(root, 'server', name)).href);
export const tick = () => new Promise(resolve => setImmediate(resolve));
export const builds = {
  baseline: {root:process.env.KAIRO_MEMORY_BASELINE_ROOT, manifest:process.env.KAIRO_BASELINE_MANIFEST},
  candidate: {root:process.env.KAIRO_MEMORY_CANDIDATE_ROOT, manifest:process.env.KAIRO_CANDIDATE_MANIFEST},
};
for (const [name, build] of Object.entries(builds)) if (!build.root || !build.manifest) throw Error(name+' root and source manifest are required');
export async function provenance(buildName, harnessNames) {
  // Parent verifies before launching this child. Hashing and source validation
  // happen only after every measured phase, avoiding attribution to Core import.
  const {loadSourceManifest} = await import('./source-manifest.mjs');
  const build = builds[buildName], manifest = await loadSourceManifest(build.manifest, build.root);
  const harness = [...new Set(['memory-common.mjs', 'source-manifest.mjs', ...harnessNames])].map(name => ({path:'analysis/rc17/harness/'+name,sha256:sha(readFileSync(new URL(name,import.meta.url)))}));
  return {sourceCommit:manifest.sourceCommit, sourceRoot:manifest.root, sourceFingerprint:manifest.fingerprint,
    sourceDirty:manifest.dirty, checkedSourceFiles:manifest.files.length, checkedBuildFiles:manifest.builtFiles.length,
    endVerified:true, harness, environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,logicalCpus:cpus().length},recordedAt:new Date().toISOString()};
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
