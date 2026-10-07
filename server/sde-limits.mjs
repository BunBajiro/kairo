import { statfs } from 'node:fs/promises';

const MiB = 1024 ** 2;
// These are failure budgets, not predictions of resident process memory. In particular,
// V8 old-generation limits do not cover Buffer allocations, SQLite or other threads.
export const SDE_LIMITS = Object.freeze({
  conversionMs: 20 * 60_000, noProgressMs: 2 * 60_000,
  spoolBytes: 768 * MiB, bucketBytes: 64 * MiB, bufferedSpoolBytes: 8 * MiB,
  outputBytes: 512 * MiB, externalBytes: 256 * MiB, reserveBytes: 256 * MiB,
});
export function sdeLimits(overrides = {}) {
  const limits = { ...SDE_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(limits, key) || !Number.isSafeInteger(value) || value <= 0 || value > limits[key]) throw new TypeError(`Invalid SDE resource limit: ${key}`);
    limits[key] = value;
  }
  return limits;
}
export function sdeLimitError(code, message) { return Object.assign(new Error(`${message}. The installed dataset is unchanged; retry after resolving the resource limit.`), { code }); }
export async function availableDatasetBytes(path) {
  const info = await statfs(path, { bigint: true });
  return Number(info.bavail * info.bsize);
}
export async function requireDatasetSpace(path, required, readAvailable = availableDatasetBytes) {
  const available = await readAvailable(path);
  if (!Number.isFinite(available) || available < required) throw sdeLimitError('SDE_DISK_SPACE', `Dataset preparation needs at least ${Math.ceil(required / MiB)} MiB of free space`);
}
