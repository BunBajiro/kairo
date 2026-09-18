import { getUniverseSystem } from './universe-static.mjs';
export function rememberSystem(store, system, constellation, region) {
 if (!system?.system_id) return;
 const p=system.position||{};
 store.db.prepare(`INSERT INTO universe_systems VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(system_id) DO UPDATE SET name=excluded.name,constellation_id=excluded.constellation_id,constellation_name=COALESCE(excluded.constellation_name,constellation_name),region_id=COALESCE(excluded.region_id,region_id),region_name=COALESCE(excluded.region_name,region_name),security=excluded.security,x=COALESCE(excluded.x,x),y=COALESCE(excluded.y,y),z=COALESCE(excluded.z,z)`).run(system.system_id,system.name||String(system.system_id),system.constellation_id||null,constellation?.name||null,constellation?.region_id||region?.region_id||null,region?.name||null,system.security_status??null,p.x??null,p.y??null,p.z??null);
}
export async function getSystem(store,esi,id) {
 const local=getUniverseSystem(id,{celestials:false});
 if(local){const result={...local,security_status:local.security,position:{x:local.x,y:local.y,z:local.z}};rememberSystem(store,result,local.constellation,local.region);return result;}
 const system=(await esi.request('/universe/systems/'+id,{ttl:86400})).data;let constellation,region;
 if(system.constellation_id){constellation=(await esi.request('/universe/constellations/'+system.constellation_id,{ttl:86400})).data;region=(await esi.request('/universe/regions/'+constellation.region_id,{ttl:86400})).data;}
 const result={...system,system_id:id,constellation,region};rememberSystem(store,result,constellation,region);return result;
}
export function journeyData(store,characterId){
 const visits=store.db.prepare('SELECT v.*,u.region_id,u.region_name,u.security FROM visits v LEFT JOIN universe_systems u USING(system_id) WHERE character_id=? ORDER BY at DESC,id DESC LIMIT 500').all(characterId);
 const hidden=new Set(store.db.prepare('SELECT from_visit_id,to_visit_id FROM journey_hidden_links WHERE character_id=?').all(characterId).map(e=>e.from_visit_id+':'+e.to_visit_id));
 return {visits,
 connections:visits.slice(0,-1).map((to,i)=>{const from=visits[i+1];return {id:to.id,from_visit_id:from.id,to_visit_id:to.id,from_system_id:from.system_id,to_system_id:to.system_id,from_name:from.name,to_name:to.name,at:to.at,hidden:hidden.has(from.id+':'+to.id)};}).filter(e=>e.from_system_id!==e.to_system_id),
 systems:store.db.prepare(`SELECT v.system_id,COALESCE(u.name,v.name) name,COUNT(*) visits,MIN(v.at) first,MAX(v.at) last,u.constellation_id,u.constellation_name,u.region_id,u.region_name,u.security,u.x,u.y,u.z,n.status,n.tags,n.body AS annotation FROM visits v LEFT JOIN universe_systems u USING(system_id) LEFT JOIN place_notes n ON n.kind='system' AND n.entity_id=v.system_id WHERE character_id=? GROUP BY v.system_id ORDER BY last DESC`).all(characterId).map(s=>({...s,tags:JSON.parse(s.tags||'[]')}))};}
export function setJourneyConnection(store,characterId,toVisitId,hidden){
 if(!Number.isSafeInteger(toVisitId)||toVisitId<1||typeof hidden!=='boolean')throw new Error('Choose a recorded connection to hide or restore.');
 const to=store.db.prepare('SELECT * FROM visits WHERE id=? AND character_id=?').get(toVisitId,characterId);
 if(!to)throw new Error('Connection not found for this character.');
 const from=store.db.prepare('SELECT * FROM visits WHERE character_id=? AND (at<? OR (at=? AND id<?)) ORDER BY at DESC,id DESC LIMIT 1').get(characterId,to.at,to.at,to.id);
 if(!from||from.system_id===to.system_id)throw new Error('This visit has no connection to an earlier system.');
 if(hidden)store.db.prepare('INSERT OR IGNORE INTO journey_hidden_links VALUES(?,?,?,?)').run(characterId,from.id,to.id,new Date().toISOString());
 else store.db.prepare('DELETE FROM journey_hidden_links WHERE character_id=? AND from_visit_id=? AND to_visit_id=?').run(characterId,from.id,to.id);
 return {id:to.id,hidden};
}
export function savePlaceNote(store,kind,entityId,input){
 if(!['system','constellation','region'].includes(kind)||!Number.isSafeInteger(entityId)||entityId<1)throw new Error('Choose a system, constellation or region.');
 const name=String(input.name||entityId).trim().slice(0,100),body=String(input.body||'').slice(0,12000),tags=[...new Set((Array.isArray(input.tags)?input.tags:[]).map(t=>String(t).trim().slice(0,32)).filter(Boolean))].slice(0,12),status=['none','home','staging','watch','avoid','opportunity'].includes(input.status)?input.status:'none',updated=new Date().toISOString();
 store.db.prepare('INSERT INTO place_notes VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,entity_id) DO UPDATE SET name=excluded.name,body=excluded.body,tags=excluded.tags,status=excluded.status,updated=excluded.updated').run(kind,entityId,name,body,JSON.stringify(tags),status,updated);return {kind,entity_id:entityId,name,body,tags,status,updated};
}
