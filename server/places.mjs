/** Shared system metadata and private entity notes. Discovery and travel are
 * owned independently by discovery.mjs and session-travel.mjs. */
/** Persist coordinates in metres, preserving known coordinates/region fields when omitted. */
export function rememberSystem(store, system, constellation, region) {
 if (!system?.system_id) return;
 const p=system.position||{};
 store.db.prepare(`INSERT INTO universe_systems VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(system_id) DO UPDATE SET name=excluded.name,constellation_id=excluded.constellation_id,constellation_name=COALESCE(excluded.constellation_name,constellation_name),region_id=COALESCE(excluded.region_id,region_id),region_name=COALESCE(excluded.region_name,region_name),security=excluded.security,x=COALESCE(excluded.x,x),y=COALESCE(excluded.y,y),z=COALESCE(excluded.z,z)`).run(system.system_id,system.name||String(system.system_id),system.constellation_id||null,constellation?.name||null,constellation?.region_id||region?.region_id||null,region?.name||null,system.security_status??null,p.x??null,p.y??null,p.z??null);
}
/**
 * Upsert a private installation-wide entity annotation (not pilot-scoped).
 * Invalid entity/kind throws; text/tags are bounded and unknown status becomes none.
 */
export function savePlaceNote(store,kind,entityId,input){
 if(!['system','constellation','region'].includes(kind)||!Number.isSafeInteger(entityId)||entityId<1)throw new Error('Choose a system, constellation or region.');
 const name=String(input.name||entityId).trim().slice(0,100),body=String(input.body||'').slice(0,12000),tags=[...new Set((Array.isArray(input.tags)?input.tags:[]).map(t=>String(t).trim().slice(0,32)).filter(Boolean))].slice(0,12),status=['none','home','staging','watch','avoid','opportunity'].includes(input.status)?input.status:'none',updated=new Date().toISOString();
 store.db.prepare('INSERT INTO place_notes VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,entity_id) DO UPDATE SET name=excluded.name,body=excluded.body,tags=excluded.tags,status=excluded.status,updated=excluded.updated').run(kind,entityId,name,body,JSON.stringify(tags),status,updated);return {kind,entity_id:entityId,name,body,tags,status,updated};
}
