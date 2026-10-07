// U3 current-cost decision evidence. Run under the shared benchmark flock.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir, cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadSourceManifest, verifySource } from '../../harness/source-manifest.mjs';
const root = resolve(process.env.KAIRO_PERF_APP_ROOT), out = resolve(process.argv[2]);
const source = await loadSourceManifest(process.env.KAIRO_SOURCE_MANIFEST, root);
const { createDatasetService } = await import(pathToFileURL(join(root, 'server/datasets.mjs')).href);
const dataDir = await mkdtemp(join(tmpdir(), 'kairo-inventory-cost-')), samples = [];
const files = await Promise.all(['universe-provenance.json', 'market-categories.json', 'npc-market-owners.json', 'universe-wormholes.json', 'universe-destinations.json', 'universe-points.json'].map(async name => {
  const bytes = await readFile(join(root, 'server/data', name)); return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
try {
  for (let index = 0; index < 25; index++) {
    const start = performance.now(), cpu = process.cpuUsage(), before = process.memoryUsage();
    const service = createDatasetService({ dataDir, automatic: false });
    try { await service.ready; assert.equal(service.status().datasets.length, 6); }
    finally { await service.close(); }
    const used = process.cpuUsage(cpu), after = process.memoryUsage(); samples.push({ index, elapsedMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000, heapDeltaBytes: after.heapUsed - before.heapUsed, rssBytes: after.rss });
  }
  await verifySource(source);
  await writeFile(out, JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), sourceCommit: source.sourceCommit, sourceFingerprint: source.fingerprint, sourceDirty: source.dirty,
    environment: { node: process.version, cpu: cpus()[0]?.model }, scope: 'Warm filesystem and one warm Node process; first-service baseline metadata initialization included only in index0. Service readiness includes inventory JSON parse and cleanup status read. No cold-disk claim or proposed-manifest counterfactual.', files, samples, complete: true }, null, 2) + '\n');
} finally { await rm(dataDir, { recursive: true, force: true }); }
