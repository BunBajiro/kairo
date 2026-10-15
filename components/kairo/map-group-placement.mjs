import {schematicLayout} from '../../lib/universe-schematic-layout.mjs';
import {CHAIN_NODE_WIDTH, CHAIN_NODE_HEIGHT} from './jspace-map-geometry.mjs';

/** Provisional only: the command validates membership and creates authoritative links. */
export function prepareMapGroup(atlas, map, links, kind, id) {
  const field = kind + '_id';
  const group = atlas[kind === 'region' ? 'regions' : 'constellations'].find(row => row[field] === id);
  if (!group || !['region','constellation'].includes(kind)) throw new Error('Choose a region or constellation.');
  const members = atlas.systems.filter(system => system[field] === id && system.space !== 'wormhole');
  const present = new Set(map.nodes.map(node => node.system_id));
  const missing = members.filter(system => !present.has(system.system_id));
  if (map.nodes.length + missing.length > 600) throw new Error('This group would exceed the 600-system map limit.');
  const layout = schematicLayout(members, {nodeWidth: CHAIN_NODE_WIDTH, nodeHeight: CHAIN_NODE_HEIGHT, gap: 44});
  const offsetX = map.nodes.length ? Math.max(...map.nodes.map(node => node.x)) + CHAIN_NODE_WIDTH + 180 - layout.bounds.minX : 0;
  const offsetY = map.nodes.length ? Math.min(...map.nodes.map(node => node.y)) - layout.bounds.minY : 0;
  const nodes = layout.points.filter(point => !present.has(point.system.system_id)).map(point => ({system_id:point.system.system_id,x:point.x+offsetX,y:point.y+offsetY,status:'unknown',locked:false}));
  const staged = new Set(nodes.map(node => node.system_id)), pairs = new Set();
  const connections = [...atlas.gates.map(gate => ({...gate,kind:'gate'})),...(links || []).filter(link => link.kind === 'ansiblex' && !link.map_id)].filter(edge => {
    if (!staged.has(edge.from_system_id) || !staged.has(edge.to_system_id)) return false;
    const key = edge.kind + ':' + (edge.kind === 'gate' ? [edge.from_system_id,edge.to_system_id].sort((a,b)=>a-b).join(':') : edge.id);
    if (pairs.has(key)) return false; pairs.add(key); return true;
  }).map((edge,index) => ({...edge,id:'preview:'+index}));
  return {name:group.name,group:{kind,id},nodes,connections,source:layout.source,existing:members.length-missing.length};
}
