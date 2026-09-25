import {buildPortalNetworks} from './universe-map-portals.mjs';

/** Read-only public report cards augment the diagram; they never enter saved map state. */
export function publicChainScene(map, feeds, systems, selectedSources = {}, now = Date.now()) {
  if (!map) return null;
  const networks = buildPortalNetworks(feeds, systems, now).filter(network => selectedSources[network.source]);
  const nodes = [...map.nodes], connections = [...map.connections], present = new Set(nodes.map(node => node.system_id));
  let edgeX = nodes.length ? Math.max(...nodes.map(node => node.x)) + 400 : 0;
  for (const network of networks) {
    const endpoints = network.endpoints.filter(endpoint => endpoint.usable);
    if (!network.hub || !endpoints.length) continue;
    const hub = network.hub, hubY = Math.max(0, Math.ceil(endpoints.length / 3) * 110 - 110);
    if (!present.has(hub.system_id)) {nodes.push({system_id:hub.system_id,x:edgeX,y:hubY,locked:true,status:'unknown',label:network.name+' · EVE-Scout',public_report:true,public_source:network.source});present.add(hub.system_id);}
    endpoints.forEach((endpoint,index) => {
      if (!present.has(endpoint.systemId)) {nodes.push({system_id:endpoint.systemId,x:edgeX+370+(index%3)*310,y:Math.floor(index/3)*250,locked:true,status:'unknown',label:network.name+' entrance · EVE-Scout',public_report:true,public_source:network.source});present.add(endpoint.systemId);}
      connections.push({...endpoint.report,id:'public:'+endpoint.id,link_id:undefined,kind:'wormhole',from_system_id:endpoint.report.from_system_id,to_system_id:endpoint.report.to_system_id,confirmed:false,accessible:false,enabled:false,active:false,public_report:true,public_source:network.source,portal:endpoint,life_status:'unknown',mass:'unknown'});
    });
    edgeX += 1450;
  }
  return {...map,nodes,connections};
}

/** Keep observation timestamps exact when an editor only changes other fields. */
export function connectionEditorPayload(draft, expiryInput, original = null) {
  const {duration_hours: ignoredDuration, expires_at: ignoredExpiry, ...payload} = draft;
  if (expiryInput) {
    const originalDate = original?.expires_at && Number.isFinite(Date.parse(original.expires_at)) ? new Date(original.expires_at) : null;
    payload.expires_at = originalDate?.toISOString().slice(0, 16) === expiryInput ? original.expires_at : new Date(expiryInput + 'Z').toISOString();
  } else payload.duration_hours = Number(draft.duration_hours || 16);
  payload.max_ship_size = draft.max_ship_size || null;
  payload.from_signature = String(draft.from_signature || '').trim().toUpperCase();
  payload.to_signature = String(draft.to_signature || '').trim().toUpperCase();
  return payload;
}

// CCP type identities used by EVE's tab-separated directional scanner clipboard.
// Names/types are references only: a scan does not establish power, ownership or access.
const STRUCTURES = Object.freeze({35825:'Raitaru',35826:'Azbel',35827:'Sotiyo',35832:'Astrahus',35833:'Fortizar',35834:'Keepstar',35835:'Athanor',35836:'Tatara',40340:'Upwell Palatine Keepstar',47512:"'Moreau' Fortizar",47513:"'Draccous' Fortizar",47514:"'Horizon' Fortizar",47515:"'Marginis' Fortizar",47516:"'Prometheus' Fortizar"});

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
