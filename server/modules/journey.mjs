export default {
    id: 'journey', name: 'Journey & flight log', version: '1.0.0', description: 'Records observed system visits and hull changes in your local history.', scopes: [], datasets: [],
    register(ctx) {
        const off = [];
        off.push(ctx.on('data.location', async (e) => { const { current, previous } = e.payload; const id = current?.solar_system_id; if (!id || id === previous?.solar_system_id)
            return; const known = current.system?.name || ctx.store.get('names', {})[id]; const names = known ? { [id]: known } : await ctx.esi.names([id]); const ship = ctx.store.snapshot(e.characterId, 'ship')?.data; ctx.db.prepare('INSERT INTO visits(character_id,system_id,name,ship_type_id,at) VALUES(?,?,?,?,?)').run(e.characterId, id, names[id] || String(id), ship?.ship_type_id || null, new Date().toISOString()); ctx.publish({ type: 'location.changed', characterId: e.characterId, summary: (previous ? 'Entered ' : 'First observed in ') + (names[id] || id), payload:{system_id:id,system_name:current.system?.name||names[id],region_name:current.region?.name,region_id:current.constellation?.region_id,ship_type_id:ship?.ship_type_id} }); }));
        off.push(ctx.on('data.ship', async (e) => { const { current, previous } = e.payload; if (!previous || current.ship_id === previous.ship_id)
            return; const names = await ctx.esi.names([current.ship_type_id]); ctx.publish({ type: 'ship.changed', characterId: e.characterId, summary: 'Changed ship to ' + (names[current.ship_type_id] || 'new hull'), payload: { ship_type_id: current.ship_type_id, ship_id: current.ship_id } }); }));
        return () => off.forEach(f => f());
    }
};
