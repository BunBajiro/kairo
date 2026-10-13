import { captureSessionObservation, recordSessionObservation, recordSessionShipBaseline } from './session-travel.mjs';
import { recordDiscoveredSystem } from './discovery.mjs';

// Fresh Pilot observations feed Sessions, discovery and activity independently.
// Keep the registration name for Core; the retired lifetime log owns no writes.
export function registerUniverseHistory({ store, bus, esi, publish, now = Date.now }) {
    const off = [];
    off.push(bus.on('data.location', async e => {
        // Pausing Pilot still suppresses delivery of enrichment that was in
        // flight. Receipt capture fixes session attribution, not this pause gate.
        if (!store.get('module:pilot', true)) return;
        const { current, previous } = e.payload;
        const id = current?.solar_system_id;
        if (!Number.isSafeInteger(id) || id < 1) return;
        const observation = e.payload.observation || captureSessionObservation(store, { characterId: e.characterId, systemId: id, at: new Date(now()).toISOString() });
        if (observation.characterId !== e.characterId || observation.systemId !== id) return;
        const recordedAt = observation.at;
        recordDiscoveredSystem(store, e.characterId, id);
        const known = current.system?.name || store.get('names', {})[id];
        const name = known || String(id);
        const visit = recordSessionObservation(store, { characterId: e.characterId, systemId: id, name,
            observation });
        if (id !== previous?.solar_system_id) publish({ type: 'location.changed', module: 'universe', characterId: e.characterId, at: recordedAt,
            summary: (previous ? 'Entered ' : 'First observed in ') + name,
            payload: { system_id: id, system_name: name, region_name: current.region?.name,
                region_id: current.constellation?.region_id, ship_type_id: observation.shipTypeId, session_id: observation.sessionId } });
        // Optional display enrichment cannot delay collection/activity, change
        // ownership, or replace the historical ship/sovereignty observation.
        if (!known && visit) {
            try {
                const names = await esi.names([id]);
                if (names[id]) store.db.prepare('UPDATE visits SET name=? WHERE id=? AND session_id=?')
                    .run(names[id], visit.id, visit.sessionId);
            } catch { /* Keep the recorded fallback identity if names fail. */ }
        }
    }));
    off.push(bus.on('data.ship', e => {
        if (!store.get('module:pilot', true)) return;
        const { current, previous } = e.payload;
        if (!current) return;
        // Core resolves ordinary dataset names before emission; a missing
        // optional name must not postpone the event beyond a session boundary.
        const observation = e.payload.observation || captureSessionObservation(store, { characterId: e.characterId, at: new Date(now()).toISOString() });
        if (observation.characterId !== e.characterId) return;
        recordSessionShipBaseline(store, e.characterId, current, observation);
        if (!previous || current.ship_id === previous.ship_id) return;
        const at = observation.at, names = store.get('names', {});
        publish({ type: 'ship.changed', module: 'universe', characterId: e.characterId, at,
            summary: 'Changed ship to ' + (names[current.ship_type_id] || 'Hull ' + current.ship_type_id),
            payload: { ship_type_id: current.ship_type_id, ship_id: current.ship_id, session_id: observation.sessionId } });
    }));
    return () => off.forEach(stop => stop());
}
