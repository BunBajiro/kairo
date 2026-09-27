import { captureVisitSovereignty } from './visit-sovereignty.mjs';

// Pilot observations feed both Universe and independent Sessions.
// Turning map intelligence off must not stop an operation’s travel record.
// History is never treated as a usable travel graph.
export function registerUniverseHistory({ store, bus, esi, publish }) {
    const visit = store.db.prepare('INSERT INTO visits(character_id,system_id,name,ship_type_id,at,sovereignty_at_visit) VALUES(?,?,?,?,?,?)');
    const off = [];
    off.push(bus.on('data.location', async e => {
        if (!store.get('module:pilot', true)) return;
        const { current, previous } = e.payload;
        const id = current?.solar_system_id;
        if (!id || id === previous?.solar_system_id) return;
        const recordedAt = new Date().toISOString(), sovereignty = captureVisitSovereignty(store, id, recordedAt);
        const known = current.system?.name || store.get('names', {})[id];
        const names = known ? { [id]: known } : await esi.names([id]);
        const ship = store.snapshot(e.characterId, 'ship')?.data;
        const name = names[id] || String(id);
        visit.run(e.characterId, id, name, ship?.ship_type_id || null, recordedAt, sovereignty ? JSON.stringify(sovereignty) : null);
        publish({ type: 'location.changed', module: 'universe', characterId: e.characterId,
            summary: (previous ? 'Entered ' : 'First observed in ') + name,
            payload: { system_id: id, system_name: name, region_name: current.region?.name,
                region_id: current.constellation?.region_id, ship_type_id: ship?.ship_type_id } });
    }));
    off.push(bus.on('data.ship', async e => {
        if (!store.get('module:pilot', true)) return;
        const { current, previous } = e.payload;
        if (!previous || current.ship_id === previous.ship_id) return;
        const names = await esi.names([current.ship_type_id]);
        publish({ type: 'ship.changed', module: 'universe', characterId: e.characterId,
            summary: 'Changed ship to ' + (names[current.ship_type_id] || 'new hull'),
            payload: { ship_type_id: current.ship_type_id, ship_id: current.ship_id } });
    }));
    return () => off.forEach(stop => stop());
}
