const validId=value=>Number.isSafeInteger(value)&&value>0;
const clamp=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const kinds=['custom','constellation','region'];
export const MAP_DISPLAY_GROUP_LIMIT=32;
export const MAP_DISPLAY_MEMBER_LIMIT=600;

/** Local display preferences only. IDs and membership stay stable across reloads. */
export function normalizeMapDisplayPrefs(raw){
  const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},seen=new Set(),groups=[];
  for(const input of (Array.isArray(value.groups)?value.groups:[]).slice(0,MAP_DISPLAY_GROUP_LIMIT)){
    if(!input||!kinds.includes(input.kind)||typeof input.id!=='string'||!/^[\w:-]{1,80}$/.test(input.id)||seen.has(input.id))continue;
    const memberIds=[],members=new Set();
    for(const id of (Array.isArray(input.memberIds)?input.memberIds:[]).slice(0,MAP_DISPLAY_MEMBER_LIMIT))if(validId(id)&&!members.has(id)){members.add(id);memberIds.push(id);}
    if(!memberIds.length)continue;
    seen.add(input.id);
    groups.push({id:input.id,name:typeof input.name==='string'&&input.name.trim()?input.name.trim().slice(0,64):'System group',kind:input.kind,memberIds,
      ...(members.has(input.parentSystemId)?{parentSystemId:input.parentSystemId}:{}),collapsed:input.collapsed===true});
  }
  return {version:1,knownScale:clamp(value.knownScale,.5,1.5,1),wormholeScale:clamp(value.wormholeScale,.5,1.5,1),groups};
}

const idSet=values=>new Set(values&&typeof values!=='string'&&typeof values[Symbol.iterator]==='function'?[...values].filter(validId):[]);

/**
 * Project display membership without changing canonical nodes, coordinates or edges.
 * Custom groups override constellations, which override regions; first saved group
 * wins ties. Work is linear in nodes, edges and bounded saved membership lists.
 * Call on data/preferences or settled focus changes, never on animation frames.
 */
export function projectMapDisplay({nodes=[],connections=[],byId,systems=[],prefs,protectedIds=[],focus}={}){
  const settings=normalizeMapDisplayPrefs(prefs),present=new Map(nodes.map(node=>[node.system_id,node]));
  const lookup=byId||new Map(systems.map(system=>[system.system_id,system])),owner=new Map();
  const groups=settings.groups.map(group=>({...group,memberIds:[],boundaryIds:[]})),groupById=new Map(groups.map(group=>[group.id,group]));
  for(const kind of kinds)for(const group of settings.groups)if(group.kind===kind)for(const id of group.memberIds){
    if(present.has(id)&&!owner.has(id)){owner.set(id,group.id);groupById.get(group.id).memberIds.push(id);}
  }
  const focused=focus?.enabled===true?idSet(focus.systemIds):new Set(),retained=idSet(protectedIds),boundary=new Set();
  for(const id of focused)retained.add(id);
  // Every crossing edge keeps both real endpoints, even across two groups.
  for(const edge of connections){
    const from=edge.from_system_id,to=edge.to_system_id;
    if(present.has(from)&&present.has(to)&&owner.get(from)!==owner.get(to)){
      retained.add(from);retained.add(to);
      if(owner.has(from))boundary.add(from);
      if(owner.has(to))boundary.add(to);
    }
  }
  for(const id of boundary)retained.add(id);
  const descriptors=[];
  for(const group of groups){
    if(!group.memberIds.length)continue;
    const anchorSystemId=owner.get(group.parentSystemId)===group.id?group.parentSystemId:group.memberIds[0],anchorNode=present.get(anchorSystemId);
    retained.add(anchorSystemId);
    descriptors.push({...group,...(owner.get(group.parentSystemId)===group.id?{}:{parentSystemId:undefined}),anchorSystemId,anchor:{x:anchorNode.x,y:anchorNode.y},memberCount:group.memberIds.length,visibleCount:0,hiddenCount:0,
      boundaryIds:group.memberIds.filter(id=>boundary.has(id))});
  }
  const descriptorsById=new Map(descriptors.map(group=>[group.id,group])),hiddenIds=new Set(),visibleNodes=[];
  const contextScale=clamp(focus?.contextScale,.5,1,.7);
  for(const node of nodes){
    const group=descriptorsById.get(owner.get(node.system_id));
    if(group?.collapsed&&!retained.has(node.system_id)){hiddenIds.add(node.system_id);group.hiddenCount++;continue;}
    if(group)group.visibleCount++;
    const compact=focus?.enabled===true&&!retained.has(node.system_id),base=lookup.get(node.system_id)?.space==='wormhole'?settings.wormholeScale:settings.knownScale;
    visibleNodes.push({...node,displayScale:base*(compact?contextScale:1),displayDetail:compact?'compact':'full'});
  }
  const visibleConnections=connections.filter(edge=>present.has(edge.from_system_id)&&present.has(edge.to_system_id)&&!hiddenIds.has(edge.from_system_id)&&!hiddenIds.has(edge.to_system_id));
  return {visibleNodes,visibleConnections,groups:descriptors,hiddenIds};
}
