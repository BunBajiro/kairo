/** Current ESI sovereignty/systems combines ownership, development and hub windows. */
export function normalizeSovereignty(data) {
    const rows = Array.isArray(data) ? data : data?.solar_systems;
    if (!Array.isArray(rows)) throw new Error('ESI returned an invalid sovereignty snapshot.');
    return rows.filter(row => Number.isSafeInteger(row?.solar_system_id ?? row?.system_id)).map(row => {
        const alliance = row.claim?.alliance;
        return {...row, system_id: row.solar_system_id ?? row.system_id,
            alliance_id: alliance?.alliance_id ?? row.alliance_id,
            corporation_id: alliance?.corporation_id ?? row.corporation_id,
            faction_id: row.claim?.faction?.faction_id ?? row.faction_id,
            development: alliance?.development ?? row.development};
    });
}

export function sovereigntyStructures(rows) {
    return rows.flatMap(row => {
        const claim = row.claim?.alliance, hub = claim?.sovereignty_hub;
        if (!hub || !Number.isSafeInteger(hub.id) || hub.id <= 0) return [];
        return [{solar_system_id: row.system_id, structure_id: hub.id, name: 'Sovereignty Hub',
            alliance_id: claim.alliance_id, corporation_id: claim.corporation_id,
            is_capital_system: claim.is_capital_system === true,
            vulnerability_start_time: hub.vulnerability_window?.start ?? null,
            vulnerability_end_time: hub.vulnerability_window?.end ?? null,
            vulnerability_status: hub.vulnerability_window ? 'window' : 'campaign',
            development: claim.development ?? null, source: 'sovereignty_systems'}];
    });
}
