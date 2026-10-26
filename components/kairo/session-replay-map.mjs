/**
 * Keep each recorded J-Space leg together with its entrance and exit visits.
 * This is a view of session movement only, never a source of live connections.
 * Other K-Space visits retain the physical atlas. Repeated same-system samples
 * must not make the camera switch projections while the pilot is stationary.
 */
export function sessionReplaySpace(visits, currentVisitId, systems) {
    const index = visits.findIndex(visit => visit.id === currentVisitId);
    if (index < 0) return 'known';
    const current = visits[index], wormhole = visit => systems.get(visit?.systemId)?.space === 'wormhole';
    if (wormhole(current)) return 'wormhole';
    for (const direction of [-1, 1]) {
        let adjacent = index + direction;
        while (visits[adjacent]?.systemId === current.systemId) adjacent += direction;
        if (wormhole(visits[adjacent])) return 'wormhole';
    }
    return 'known';
}
