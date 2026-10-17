// Replay may use cached ownership as a dated backdrop, never live operational intel.
/**
 * Copy only sovereignty, its source metadata and territory colours into a replay
 * backdrop; remove live links, pins, structures and discovery. Null input remains
 * null. This is current cached ownership, never historical evidence for a visit.
 */
export function replaySovereigntyIntel(intel) {
    if (!intel) return null;
    return {
        character_id: intel.character_id,
        systems: (intel.systems || []).filter(row => row.sovereignty).map(row => ({system_id: row.system_id, sovereignty: {...row.sovereignty}})),
        sources: intel.sources?.sovereignty ? {sovereignty: {...intel.sources.sovereignty}} : {},
        ...(intel.politics?.territory_colours ? {politics: {territory_colours: {...intel.politics.territory_colours}}} : {}),
        links: [], link_lists: [], pins: [], views: [], structures: [],
        discoveredSystemIds: [],
    };
}

export function replaySovereigntyCaption(intel) {
    if (!intel?.systems?.some(row => row.sovereignty)) return 'Current sovereignty unavailable';
    const source = intel.sources?.sovereignty, time = Date.parse(source?.updatedAt || '');
    const date = Number.isFinite(time) ? new Date(time).toISOString().slice(0,16).replace('T',' ') + ' EVE' : 'time unavailable';
    return `Current sovereignty · cached ${date}${source?.stale || source?.status !== 'ready' ? ' · stale' : ''}`;
}

/**
 * Label only the owner captured on a recorded visit. Missing capture remains an
 * explicit gap; do not substitute current sovereignty to fill historical evidence.
 */
export function historicalSovereigntyLabel(owner) {
    if (!owner) return {label:'At visit: not recorded', title:'This session has no captured sovereignty for this visit.'};
    const name = owner.owner_name || `${owner.owner_type[0].toUpperCase()}${owner.owner_type.slice(1)} ${owner.owner_id}`;
    return {label:`At visit: ${name}`, title:`Recorded sovereignty · ESI observation ${owner.observed_at} · captured ${owner.recorded_at}`};
}
