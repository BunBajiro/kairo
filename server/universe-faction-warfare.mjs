// CCP's published frontline/command/rearguard rules, derived from a complete
// public FW occupancy snapshot and the bundled stargate graph, not sovereignty.
// https://support.eveonline.com/hc/en-us/articles/203209072-Factional-Warfare
const side = new Map([[500001,1],[500003,1],[500002,2],[500004,2]]);
export function factionWarfareContext(rows, neighbors, {fresh=true}={}) {
    const map=new Map(rows.map(row=>[row.solar_system_id,{...row,operational_state:'unknown',
        operational_state_source:'derived_gate_adjacency',operational_state_status:fresh?'ready':'stale',frontline_neighbors:[]}]));
    if (!fresh) return map;
    for (const [id,row] of map) {
        const own=side.get(row.occupier_faction_id); if(!own) continue;
        row.frontline_neighbors=[...(neighbors.get(id)||[])].filter(other=>{
            const faction=side.get(map.get(other)?.occupier_faction_id);return faction&&faction!==own;
        }).sort((a,b)=>a-b);
        row.operational_state=row.frontline_neighbors.length?'frontline':'rearguard';
    }
    for(const [id,row] of map) if(row.operational_state==='rearguard'&&[...(neighbors.get(id)||[])].some(other=>map.get(other)?.operational_state==='frontline'))
        row.operational_state='command_operations';
    return map;
}
