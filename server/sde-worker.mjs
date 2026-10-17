/**
 * Worker-only conversion entrypoint. Sends progress then a result/error DTO;
 * datasets.workerBuild owns watchdogs/cancellation and waits for actual exit
 * before the parent may remove files. A result message alone is not completion.
 * See docs/DATASETS.md for lifecycle and resource limits.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { buildSde } from './sde-build.mjs';

if (!parentPort) throw new Error('SDE conversion must run in a worker');
try {
  const manifest = await buildSde({ ...workerData, onProgress: progress => parentPort.postMessage({ type: 'progress', ...progress }) });
  parentPort.postMessage({ type: 'result', manifest });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: { message: error?.message || 'SDE conversion failed', code: error?.code } });
}
