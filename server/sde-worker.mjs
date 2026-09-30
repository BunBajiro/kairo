import { parentPort, workerData } from 'node:worker_threads';
import { buildSde } from './sde-build.mjs';

if (!parentPort) throw new Error('SDE conversion must run in a worker');
try {
  const manifest = await buildSde({ ...workerData, onProgress: progress => parentPort.postMessage({ type: 'progress', ...progress }) });
  parentPort.postMessage({ type: 'result', manifest });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: { message: error?.message || 'SDE conversion failed' } });
}
