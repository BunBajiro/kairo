const validId = value => Number.isSafeInteger(value) && value > 0;
const knownSpace = id => validId(id) && id >= 30000000 && id < 31000000;

/** Capture existing ESI evidence only. Never request or reconstruct past ownership. */
export function captureVisitSovereignty(store, systemId, recordedAt = new Date().toISOString()) {
    if (!knownSpace(systemId) || !store.get('module:universe', true)) return null;
    const sample = store.snapshot(0, 'sovereignty'), now = Date.parse(recordedAt);
    if (sample?.status !== 'ready' || sample.stale || sample.truncated || !Array.isArray(sample.data) ||
        !Number.isFinite(now) || !Number.isFinite(Date.parse(sample.updatedAt)) || Date.parse(sample.updatedAt) > now ||
        !Number.isFinite(Date.parse(sample.expiresAt)) || Date.parse(sample.expiresAt) <= now) return null;
    const owner = sample.data.find(row => (row.system_id ?? row.solar_system_id) === systemId);
    const type = ['alliance', 'faction', 'corporation'].find(kind => validId(owner?.[kind + '_id']));
    if (!type) return null;
    const id = owner[type + '_id'], name = store.get('names', {})[id];
    return { owner_type: type, owner_id: id, owner_name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : null,
        observed_at: sample.updatedAt, recorded_at: recordedAt, source: 'esi' };
}

/** Legacy or incomplete records stay unavailable instead of using today's cache. */
export function recordedVisitSovereignty(value, systemId) {
    if (!knownSpace(systemId)) return null;
    try {
        const owner = typeof value === 'string' ? JSON.parse(value) : value;
        if (!owner || owner.source !== 'esi' || !['alliance', 'corporation', 'faction'].includes(owner.owner_type) ||
            !validId(owner.owner_id) || !Number.isFinite(Date.parse(owner.observed_at)) ||
            !Number.isFinite(Date.parse(owner.recorded_at)) || Date.parse(owner.observed_at) > Date.parse(owner.recorded_at)) return null;
        return { owner_type: owner.owner_type, owner_id: owner.owner_id,
            owner_name: typeof owner.owner_name === 'string' && owner.owner_name.trim() ? owner.owner_name.trim().slice(0, 200) : null,
            observed_at: owner.observed_at, recorded_at: owner.recorded_at, source: 'esi' };
    } catch { return null; }
}
