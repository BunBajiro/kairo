const KEYS = new Set(['kairo-universe-tab', 'kairo-system-lookup', 'kairo-universe-settings-tab', 'kairo-universe-replay']);

/**
 * Four fixed one-shot workspace handoff slots, backed by sessionStorage with an
 * in-memory fallback. `set` replaces that slot; `take` consumes it and returns
 * text or null. Unsupported keys/non-string values throw; storage errors do not.
 * Requests are navigation intent, never authoritative map or saved-view records.
 */
export function createUniverseRequests(storage = () => globalThis.sessionStorage) {
  // At most four slots. A consumed null also prevents an old persisted request
  // returning if removeItem failed and storage subsequently becomes available.
  const pending = new Map();
  const checkKey = key => { if (!KEYS.has(key)) throw new Error('Unsupported Universe request.'); };
  function set(key, value) {
    checkKey(key);
    if (typeof value !== 'string') throw new Error('Universe requests must contain text.');
    pending.set(key, value);
    try { storage()?.setItem(key, value); } catch {}
  }
  function take(key) {
    checkKey(key);
    let value = pending.get(key) ?? null;
    if (!pending.has(key)) {
      try { value = storage()?.getItem(key) ?? null; } catch {}
    }
    pending.set(key, null);
    try { storage()?.removeItem(key); } catch {}
    return value;
  }
  return {set, take};
}

const requests = createUniverseRequests();
export const setUniverseRequest = requests.set;
export const takeUniverseRequest = requests.take;
