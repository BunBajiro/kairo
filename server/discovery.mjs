const validId = value => Number.isSafeInteger(value) && value > 0;

// Private knowledge is membership, not a timestamped lifetime movement log.
export function recordDiscoveredSystem(store, characterId, systemId) {
    if (!validId(characterId) || !validId(systemId)) return false;
    return store.db.prepare('INSERT OR IGNORE INTO discovered_systems(character_id,system_id) VALUES(?,?)')
        .run(characterId, systemId).changes > 0;
}

export function discoveredSystemIds(store, characterId) {
    if (!validId(characterId)) return [];
    return store.db.prepare('SELECT system_id FROM discovered_systems WHERE character_id=? ORDER BY system_id')
        .all(characterId).map(row => row.system_id);
}
