import {mapEnrichment} from './enrichment.mjs';

// Resolve containment once per sample. A cycle retains the first repeated ID,
// matching the collector's previous bounded walk instead of inventing a station.
export function prepareAssetLocations(assets) {
    const entries=new Map(assets.map(asset=>[asset.item_id,asset])), resolved=new Map();
    function root(location) {
        const origin=location;
        const path=[],seen=new Map();
        while(entries.has(location)&&!resolved.has(location)&&!seen.has(location)) {
            seen.set(location,path.length);path.push(location);location=entries.get(location).location_id;
        }
        if(seen.has(location)) {
            const start=seen.get(location);
            for(let i=start;i<path.length;i++)resolved.set(path[i],path[i]);
            for(let i=0;i<start;i++)resolved.set(path[i],location);
        } else {
            const target=resolved.has(location)?resolved.get(location):location;
            for(const id of path)resolved.set(id,target);
        }
        return resolved.has(origin)?resolved.get(origin):location;
    }
    const rows=assets.map(asset=>({...asset,root_location_id:root(asset.location_id)}));
    return {rows,locations:[...new Set(rows.map(asset=>asset.root_location_id))]};
}

export async function enrichAssetLocations(assets,{names,rememberNames,esi,characterId,canReadStructures,current=()=>true}) {
    const {rows,locations}=prepareAssetLocations(assets);
    rememberNames(await esi.names(locations.filter(id=>id<2147483647&&!names[id])));
    await mapEnrichment(locations,async location => {
        if(names[location])return;
        try {
            if(location>=60000000&&location<64000000) {
                const result=await esi.request('/universe/stations/'+location,{ttl:86400});
                rememberNames({[location]:result.data.name});
            } else if(location>=1000000000000&&canReadStructures) {
                if(!current())return;
                const result=await esi.request('/universe/structures/'+location,{characterId,ttl:3600});
                if(!current())return;
                rememberNames({[location]:result.data.name});
            }
        } catch { /* Keep unresolved locations visible when EVE denies access. */ }
    });
    return rows.map(asset=>({...asset,location_name:names[asset.root_location_id]||String(asset.root_location_id)}));
}
