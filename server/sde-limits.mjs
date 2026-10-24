/** Shared preparation failure budgets for dataset workers and their supervisor; see docs/DATASETS.md. */
import { statfs } from 'node:fs/promises';

const MiB = 1024 ** 2;
// These are failure budgets, not predictions of resident process memory. In particular,
// V8 old-generation limits do not cover Buffer allocations, SQLite or other threads.
export const SDE_LIMITS = Object.freeze({
  conversionMs: 20 * 60_000, noProgressMs: 2 * 60_000,
  spoolBytes: 768 * MiB, bucketBytes: 64 * MiB, bufferedSpoolBytes: 8 * MiB,
  outputBytes: 512 * MiB, externalBytes: 256 * MiB, reserveBytes: 256 * MiB,
});
/** Return a fresh policy; overrides must be known positive integer budgets no greater than defaults. */
export function sdeLimits(overrides = {}) {
  const limits = { ...SDE_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(limits, key) || !Number.isSafeInteger(value) || value <= 0 || value > limits[key]) throw new TypeError(`Invalid SDE resource limit: ${key}`);
    limits[key] = value;
  }
  return limits;
}
/** Preserve a machine-readable resource code alongside a user-facing preparation failure. */
export function sdeLimitError(code, message) { return Object.assign(new Error(`${message}. The installed dataset is unchanged; retry after resolving the resource limit.`), { code }); }
/** Return bytes available to this process, not the filesystem's total free-block count. */
export async function availableDatasetBytes(path) {
  const info = await statfs(path, { bigint: true });
  return Number(info.bavail * info.bsize);
}
/**
 * Require at least `required` available bytes; throw SDE_DISK_SPACE on insufficient
 * or non-finite readings. This is advisory, not a reservation: writes must still
 * handle ENOSPC if another process consumes space after the check.
 */
export async function requireDatasetSpace(path, required, readAvailable = availableDatasetBytes) {
  const available = await readAvailable(path);
  if (!Number.isFinite(available) || available < required) throw sdeLimitError('SDE_DISK_SPACE', `Dataset preparation needs at least ${Math.ceil(required / MiB)} MiB of free space`);
}
