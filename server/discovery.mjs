/**
 * Per-pilot discovered-system membership used by Universe. This is independent
 * of Session travel and records neither arrival time nor an inferred route.
 * See ../docs/ARCHITECTURE.md for the observation ownership boundary.
 */
const validId = value => Number.isSafeInteger(value) && value > 0;

/** Return true only for a new durable membership; invalid IDs and repeats return false. */
export function recordDiscoveredSystem(store, characterId, systemId) {
    if (!validId(characterId) || !validId(systemId)) return false;
    return store.db.prepare('INSERT OR IGNORE INTO discovered_systems(character_id,system_id) VALUES(?,?)')
        .run(characterId, systemId).changes > 0;
}

/** Return ascending system IDs for one pilot; an invalid pilot ID yields an empty list. */
export function discoveredSystemIds(store, characterId) {
    if (!validId(characterId)) return [];
    return store.db.prepare('SELECT system_id FROM discovered_systems WHERE character_id=? ORDER BY system_id')
        .all(characterId).map(row => row.system_id);
}
