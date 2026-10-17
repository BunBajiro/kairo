/**
 * Pure Maps projections and command payload preparation. Public overlays are
 * ephemeral, saved map records remain authoritative, and layout queue ownership
 * is scoped by the workspace. See docs/UNIVERSE.md for the user-facing model.
 */
import {buildPortalNetworks} from './universe-map-portals.mjs';

/**
 * Test an explicit end at Unix-ms `now`, including the exact expiry boundary.
 * Missing/invalid expiry alone does not end a record or establish route access.
 */
export function connectionHasEnded(connection, now = Date.now()) {
  return connection.life_status === 'collapsed' || connection.expired === true || !!connection.expires_at && Number.isFinite(Date.parse(connection.expires_at)) && Date.parse(connection.expires_at) <= now;
}

/** A structure may have a schedule; only explicit timer records belong to Timers. */
export function groupSystemObservations(rows = []) {
  const groups = {structures: [], timers: [], reports: []};
  for (const row of rows) groups[row.kind === 'structure' ? 'structures' : row.kind === 'timer' ? 'timers' : 'reports'].push(row);
  return groups;
}

/** Read-only public report cards augment the diagram; they never enter saved map state. */
export function publicChainScene(map, feeds, systems, selectedSources = {}, now = Date.now(), previous = null) {
  if (!map) return null;
  const networks = buildPortalNetworks(feeds, systems, now).filter(network => selectedSources[network.source]);
  const nodes = [...map.nodes], connections = map.connections.filter(connection => !connectionHasEnded(connection, now)), present = new Set(nodes.map(node => node.system_id));
  // Keep surviving public cards in place when the provider changes a snapshot.
  const prior = new Map(previous?.id === map.id ? previous.nodes.filter(node => node.public_report).map(node => [node.system_id,node]) : []);
  const occupied = [...nodes,...prior.values()];
  function publicPosition(id,x,y) {const old=prior.get(id);if(old)return {x:old.x,y:old.y};while(occupied.some(node=>Math.abs(node.x-x)<290&&Math.abs(node.y-y)<110))y+=250;const position={x,y};occupied.push(position);return position;}
  let edgeX = nodes.length ? Math.max(...nodes.map(node => node.x)) + 400 : 0;
  for (const network of networks) {
    const endpoints = network.endpoints.filter(endpoint => endpoint.usable || endpoint.state === 'stale' && endpoint.report.completed === true && endpoint.report.reported === true && endpoint.report.route_eligible !== false);
    if (!network.hub || !endpoints.length) continue;
    const hub = network.hub, hubY = Math.max(0, Math.ceil(endpoints.length / 3) * 110 - 110);
    if (!present.has(hub.system_id)) {nodes.push({system_id:hub.system_id,...publicPosition(hub.system_id,edgeX,hubY),locked:true,status:'unknown',label:network.name+' · EVE-Scout',public_report:true,public_source:network.source});present.add(hub.system_id);}
    endpoints.forEach((endpoint,index) => {
      if (!present.has(endpoint.systemId)) {nodes.push({system_id:endpoint.systemId,...publicPosition(endpoint.systemId,edgeX+370+(index%3)*310,Math.floor(index/3)*250),locked:true,status:'unknown',label:network.name+' entrance · EVE-Scout',public_report:true,public_source:network.source});present.add(endpoint.systemId);}
      connections.push({...endpoint.report,id:'public:'+endpoint.id,link_id:undefined,kind:'wormhole',from_system_id:endpoint.report.from_system_id,to_system_id:endpoint.report.to_system_id,confirmed:false,accessible:false,enabled:false,active:false,public_report:true,public_source:network.source,stale:endpoint.state==='stale',portal:endpoint,life_status:'unknown',mass:'unknown'});
    });
    edgeX += 1450;
  }
  return {...map,nodes,connections};
}

/**
 * Convert a details draft to a command payload without renewing unchanged lifetime
 * evidence. `expiryInput` is a UTC minute string (YYYY-MM-DDTHH:mm), despite the
 * datetime-local control; a changed invalid date throws during ISO conversion.
 * Explicit expiry wins over duration, and an unchanged displayed minute preserves
 * the original seconds/milliseconds. Shared bridge references omit access fields.
 */
export function connectionEditorPayload(draft, expiryInput, original = null) {
  if (draft.kind === 'gate' || draft.kind === 'ansiblex') {
    // A diagram reference must never overwrite the shared Ansiblex network.
    const fields = original?.kind === 'ansiblex' && !original.map_id
      ? ['id','link_id','kind','from_system_id','to_system_id','notes','from_port','to_port','updated_at']
      : ['id','link_id','kind','from_system_id','to_system_id','notes','from_port','to_port','updated_at','confirmed','accessible','reverse_accessible','enabled'];
    return Object.fromEntries(fields.filter(key => draft[key] !== undefined).map(key => [key,draft[key]]));
  }
  const {duration_hours: ignoredDuration, expires_at: ignoredExpiry, ...payload} = draft;
  // Merely opening/saving details must not restamp the lifetime observation.
  if ((draft.life_band || 'unknown') === (original?.life_band || 'unknown')) {
    delete payload.life_band; delete payload.life_observed_at;
  } else delete payload.life_observed_at;
  if (expiryInput) {
    const originalDate = original?.expires_at && Number.isFinite(Date.parse(original.expires_at)) ? new Date(original.expires_at) : null;
    payload.expires_at = originalDate?.toISOString().slice(0, 16) === expiryInput ? original.expires_at : new Date(expiryInput + 'Z').toISOString();
  } else if (draft.duration_hours === '') payload.expires_at = null;
  else if (draft.duration_hours != null && (original == null || draft.duration_hours !== original.duration_hours || draft.lifetime_edited)) payload.duration_hours = Number(draft.duration_hours);
  delete payload.lifetime_edited;
  payload.max_ship_size = draft.max_ship_size || null;
  payload.from_signature = String(draft.from_signature || '').trim().toUpperCase();
  payload.to_signature = String(draft.to_signature || '').trim().toUpperCase();
  return payload;
}

/** New edges start with mapper defaults; they still require explicit route verification. */
export function drawnConnectionPayload(fromSystemId, toSystemId) {
  return {kind:'wormhole',from_system_id:fromSystemId,to_system_id:toSystemId,confirmed:false,accessible:false,reverse_accessible:false,enabled:true,mass:'stable',life_status:'stable',duration_hours:16,max_ship_size:'large'};
}

/**
 * Serialize save callbacks, which must read the current accepted revision when
 * invoked, not when enqueued. Each caller receives its own result/rejection; a
 * rejected save does not poison the queue tail. Scope invalidation is separate.
 */
export function createLayoutSaveQueue() {
  let tail = Promise.resolve();
  return function enqueue(save) {
    const result = tail.then(save);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

/**
 * Own a serial layout queue for one pilot/map key. `cancel()` permanently closes
 * this scope; it skips queued callbacks but cannot abort a save already started.
 * A falsy result or rejection invalidates gestures queued behind that save, since
 * they assumed its revision. A later newly submitted gesture may retry. `pending`
 * includes queued/in-flight work until each returned promise settles; skipped
 * work resolves null. The caller separately fences publication after switches.
 */
export function createLayoutSaveScope(key) {
  const enqueue = createLayoutSaveQueue();let closed=false,generation=0,pending=0;
  return {
    key,
    get closed(){return closed;},
    get pending(){return pending;},
    cancel(){closed=true;generation++;},
    run(save){
      if(closed)return Promise.resolve(null);
      const version=generation;pending++;
      return enqueue(async()=>{
        if(closed||version!==generation)return null;
        try {const result=await save();if(!result)generation++;return result;}
        catch(error){generation++;throw error;}
      }).finally(()=>{pending--;});
    },
  };
}

// CCP type identities used by EVE's tab-separated directional scanner clipboard.
// Names/types are references only: a scan does not establish power, ownership or access.
const STRUCTURES = Object.freeze({35825:'Raitaru',35826:'Azbel',35827:'Sotiyo',35832:'Astrahus',35833:'Fortizar',35834:'Keepstar',35835:'Athanor',35836:'Tatara',40340:'Upwell Palatine Keepstar',47512:"'Moreau' Fortizar",47513:"'Draccous' Fortizar",47514:"'Horizon' Fortizar",47515:"'Marginis' Fortizar",47516:"'Prometheus' Fortizar"});

/**
 * Parse a bounded D-scan paste or three-line UTC structure timer snippet for
 * review. No persistence occurs. Return rows, ignored line diagnostics and a
 * validity/error result; the 2,000-line/512,000-character guard precedes parsing.
 * Numeric type references identify structures, never their owner, power or access.
 */
export function previewStructureScan(text) {
  const rows = [], ignored = [], seen = new Set();
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length > 2000 || String(text).length > 512000) return {valid:false,rows:[],ignored:[],error:'Paste at most 2,000 lines and 500 KB of scanner text.'};
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();if (!line) continue;
    const timerText = lines[index + 2]?.trim().match(/^(Reinforced|Anchoring|Unanchoring)\s+until\s+(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/i);
    if (timerText && !line.includes('\t') && /^\d[\d,.\s]*\s*(?:m|km|AU)$/i.test(lines[index + 1]?.trim() || '')) {
      const [,state,year,month,day,hour,minute] = timerText, value = `${year}-${month}-${day}T${hour}:${minute}:00.000Z`, date = new Date(value);
      if (Number.isFinite(date.getTime()) && date.toISOString() === value) {
        const key = `timer:${line.toLowerCase()}:${value}`;
        if (!seen.has(key)) {rows.push({line:index+1,title:line.slice(0,160),type_name:'',type_id:null,state:state.toLowerCase(),standing:'unknown',kind:'structure',timer_at:value,body:'Timer copied from a structure observation. Structure type, ownership and present access were not established.'});seen.add(key);}
        else ignored.push({line:index+1,reason:'Duplicate timer observation in this paste.'});
        index += 2;continue;
      }
    }
    const cells = line.split('\t').map(value => value.trim());
    const type = STRUCTURES[Number(cells[0])];
    if (!type || cells.length < 3 || !cells[1]) {ignored.push({line:index + 1,reason:'Not a recognized structure scanner row.'});continue;}
    const key = `${cells[0]}:${cells[1].toLowerCase()}`;
    if (seen.has(key)) {ignored.push({line:index + 1,reason:'Duplicate structure in this paste.'});continue;}
    seen.add(key);
    rows.push({line:index + 1,title:cells[1].slice(0,160),type_name:type,type_id:Number(cells[0]),state:'',standing:'unknown',kind:'structure',body:'Observed in a directional scanner paste. Power, ownership and access were not established.'});
  }
  return {valid:rows.length > 0,rows,ignored,error:rows.length ? null : 'No supported structure rows or timer snippets found. Copy scanner results with type IDs, paste a three-line name/distance/timer snippet, or record the observation manually.'};
}
