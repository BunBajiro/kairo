export const CHAIN_NODE_WIDTH = 264;
export const CHAIN_NODE_HEIGHT = 84;
export const CHAIN_MAX_ZOOM = 1.8;

const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function chainBounds(nodes) {
  const valid = (nodes || []).filter(node => finite(node.x) && finite(node.y));
  if (!valid.length) return {minX: 0, minY: 0, maxX: CHAIN_NODE_WIDTH, maxY: CHAIN_NODE_HEIGHT};
  return {minX: Math.min(...valid.map(node => node.x)), minY: Math.min(...valid.map(node => node.y)), maxX: Math.max(...valid.map(node => node.x + CHAIN_NODE_WIDTH)), maxY: Math.max(...valid.map(node => node.y + CHAIN_NODE_HEIGHT))};
}

export function fitChainCamera(nodes, viewport, padding = viewport.width < 600 ? 24 : 58, maxZoom = 1) {
  const bounds = chainBounds(nodes), width = Math.max(1, viewport.width), height = Math.max(1, viewport.height);
  // Include the actual side handles, which remain attached to the whole card at every zoom.
  const availableWidth=Math.max(1,width-padding*2),availableHeight=Math.max(1,height-padding*2);
  const zoom=clamp(Math.min(availableWidth/(bounds.maxX-bounds.minX+28),availableHeight/(bounds.maxY-bounds.minY)),.12,maxZoom);
  return {x: width / 2 - (bounds.minX + bounds.maxX) / 2 * zoom, y: height / 2 - (bounds.minY + bounds.maxY) / 2 * zoom, zoom};
}

export function chainZoomLimits(nodes, viewport) {
  return {min: fitChainCamera(nodes, viewport).zoom, max: CHAIN_MAX_ZOOM};
}

export function zoomChainAt(camera, point, factor, limits = {min: .12, max: CHAIN_MAX_ZOOM}) {
  const zoom = clamp(camera.zoom * factor, limits.min, limits.max);
  const worldX = (point.x - camera.x) / camera.zoom, worldY = (point.y - camera.y) / camera.zoom;
  return {x: point.x - worldX * zoom, y: point.y - worldY * zoom, zoom};
}

export function boundChainCamera(camera, nodes, viewport) {
  const bounds = chainBounds(nodes), margin = Math.min(48, viewport.width / 4, viewport.height / 4);
  return {...camera, x: clamp(camera.x, margin - bounds.maxX * camera.zoom, viewport.width - margin - bounds.minX * camera.zoom), y: clamp(camera.y, margin - bounds.maxY * camera.zoom, viewport.height - margin - bounds.minY * camera.zoom)};
}

/** Cardinal ports and cubic curves attach to the card boundary, never its label. */
export function chainEdgeGeometry(from, to, parallelOffset = 0) {
  const source = {x: from.x + CHAIN_NODE_WIDTH / 2, y: from.y + CHAIN_NODE_HEIGHT / 2};
  const target = {x: to.x + CHAIN_NODE_WIDTH / 2, y: to.y + CHAIN_NODE_HEIGHT / 2};
  const dx = target.x - source.x, dy = target.y - source.y;
  const horizontal = Math.abs(dx) / CHAIN_NODE_WIDTH >= Math.abs(dy) / CHAIN_NODE_HEIGHT;
  const direction = (horizontal ? dx : dy) >= 0 ? 1 : -1;
  const start = {x: source.x + (horizontal ? direction * CHAIN_NODE_WIDTH / 2 : 0), y: source.y + (horizontal ? 0 : direction * CHAIN_NODE_HEIGHT / 2)};
  const end = {x: target.x - (horizontal ? direction * CHAIN_NODE_WIDTH / 2 : 0), y: target.y - (horizontal ? 0 : direction * CHAIN_NODE_HEIGHT / 2)};
  const bend = Math.max(52, Math.min(240, Math.abs(horizontal ? end.x - start.x : end.y - start.y) * .45));
  const c1 = {x: start.x + (horizontal ? direction * bend : parallelOffset), y: start.y + (horizontal ? parallelOffset : direction * bend)};
  const c2 = {x: end.x - (horizontal ? direction * bend : -parallelOffset), y: end.y - (horizontal ? -parallelOffset : direction * bend)};
  const label = {x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8, y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8};
  return {start, end, label, controls:[c1,c2], path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`};
}

/** Place connection captions in clear space using a shared spatial index, including dense 16px card gaps. */
export function placeChainEdgeLabels(edges, nodes) {
  const cellSize=320;
  const index=()=>{
    const cells=new Map();
    const keys=(rect,padding=0)=>{const out=[];for(let x=Math.floor((rect.left-padding)/cellSize);x<=Math.floor((rect.right+padding)/cellSize);x++)for(let y=Math.floor((rect.top-padding)/cellSize);y<=Math.floor((rect.bottom+padding)/cellSize);y++)out.push(x+':'+y);return out;};
    return {add(rect){for(const key of keys(rect))cells.set(key,[...(cells.get(key)||[]),rect]);},hits(rect,padding=0){const seen=new Set();for(const key of keys(rect,padding))for(const other of cells.get(key)||[]){if(seen.has(other))continue;seen.add(other);if(rect.left<other.right+padding&&rect.right>other.left-padding&&rect.top<other.bottom+padding&&rect.bottom>other.top-padding)return true;}return false;}};
  };
  const cards=index(),captions=index(),bounds=chainBounds(nodes);
  for(const node of nodes)cards.add({left:node.x,right:node.x+CHAIN_NODE_WIDTH,top:node.y,bottom:node.y+CHAIN_NODE_HEIGHT});
  const pointAt=(edge,t)=>{const u=1-t,[a,b]=edge.controls;return{x:u*u*u*edge.start.x+3*u*u*t*a.x+3*u*t*t*b.x+t*t*t*edge.end.x,y:u*u*u*edge.start.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*edge.end.y};};
  const pointClear=point=>!cards.hits({left:point.x-.2,right:point.x+.2,top:point.y-.2,bottom:point.y+.2},2);
  const leaderClear=(a,b)=>{const steps=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/14);for(let i=1;i<steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(!pointClear(p))return false;}return true;};
  return edges.map(edge=>{
    const width=edge.labelWidth||110,height=edge.labelHeight||34;
    const box=point=>({left:point.x-width/2,right:point.x+width/2,top:point.y-height/2,bottom:point.y+height/2});
    const bounded=point=>({x:clamp(point.x,bounds.minX-64+width/2,bounds.maxX+64-width/2),y:clamp(point.y,bounds.minY-64+height/2,bounds.maxY+64-height/2)});
    const clear=point=>!cards.hits(box(point),10)&&!captions.hits(box(point),8);
    const samples=[.5,.38,.62,.25,.75,.15,.85,.07,.93].map(t=>({point:pointAt(edge,t),t})).filter(value=>pointClear(value.point));
    let chosen=null,anchor=null;
    // Prefer a caption directly on a clear part of its own curve.
    for(const sample of samples){const point=bounded(sample.point);if(clear(point)&&Math.hypot(point.x-sample.point.x,point.y-sample.point.y)<1){chosen=point;anchor=sample.point;break;}}
    if(!chosen)for(const sample of samples){
      const before=pointAt(edge,Math.max(0,sample.t-.01)),after=pointAt(edge,Math.min(1,sample.t+.01)),length=Math.max(1,Math.hypot(after.x-before.x,after.y-before.y)),normal={x:-(after.y-before.y)/length,y:(after.x-before.x)/length};
      for(const distance of [-48,48,-96,96,-144,144,-208,208]){const point=bounded({x:sample.point.x+normal.x*distance,y:sample.point.y+normal.y*distance});if(clear(point)&&leaderClear(sample.point,point)){chosen=point;anchor=sample.point;break;}}
      if(chosen)break;
    }
    // Overlapping user-arranged cards may cover the entire curve. Keep the caption on a bounded outer rail.
    if(!chosen){const y=bounds.minY-height/2-16;for(const offset of [0,-1,1,-2,2,-3,3,-4,4]){const point=bounded({x:edge.label.x+offset*(width+12),y});if(clear(point)){chosen=point;break;}}chosen ||= bounded({x:edge.label.x,y});anchor=samples.find(sample=>leaderClear(sample.point,chosen))?.point||null;}
    captions.add(box(chosen));
    return {...edge,label:chosen,labelBox:box(chosen),leader:anchor&&Math.hypot(chosen.x-anchor.x,chosen.y-anchor.y)>6?{from:anchor,to:chosen}:null};
  });
}

/** A topology trace is deliberately separate from ship/access-aware travel planning. */
export function traceChainPath(nodes, connections, fromId, toId, now = Date.now()) {
  const present = new Set(nodes.map(node => node.system_id));
  if (!present.has(fromId) || !present.has(toId)) return {nodes: [], edges: []};
  const neighbors = new Map([...present].map(id => [id, []]));
  for (const edge of connections) {
    if (!present.has(edge.from_system_id) || !present.has(edge.to_system_id) || edge.expired || edge.life_status === 'collapsed' || edge.enabled === false || edge.expires_at && Date.parse(edge.expires_at) <= now) continue;
    neighbors.get(edge.from_system_id).push({to: edge.to_system_id, edge: edge.id});
    neighbors.get(edge.to_system_id).push({to: edge.from_system_id, edge: edge.id});
  }
  for (const list of neighbors.values()) list.sort((a, b) => a.to - b.to || String(a.edge).localeCompare(String(b.edge)));
  const visited = new Map([[fromId, null]]), queue = [fromId];
  for (let cursor = 0; cursor < queue.length && !visited.has(toId); cursor++) {
    for (const neighbor of neighbors.get(queue[cursor])) if (!visited.has(neighbor.to)) {visited.set(neighbor.to, {from: queue[cursor], edge: neighbor.edge}); queue.push(neighbor.to);}
  }
  if (!visited.has(toId)) return {nodes: [], edges: []};
  const path = {nodes: [toId], edges: []};
  let current = toId;
  while (current !== fromId) {const previous = visited.get(current); path.edges.unshift(previous.edge); path.nodes.unshift(previous.from); current = previous.from;}
  return path;
}

export function placeChainPopover(point, size, viewport, padding = 12) {
  return {x: clamp(point.x + 15 + size.width <= viewport.width - padding ? point.x + 15 : point.x - size.width - 15, padding, viewport.width - size.width - padding), y: clamp(point.y + 12, padding, viewport.height - size.height - padding)};
}

/** Preserve readable overview labels without stacking every system name on its neighbour. */
export function visibleChainLabels(nodes, camera, viewport, priorityIds = []) {
  const priority = new Map(priorityIds.filter(Boolean).map((id,index)=>[id,index]));
  const ordered = [...nodes].sort((a,b)=>(priority.get(a.system_id)??999)-(priority.get(b.system_id)??999)||a.system_id-b.system_id);
  const cells = new Map(), visible = new Set();
  const labelScale=Math.max(.65,camera.zoom),halfWidth=(306*labelScale+14)/2,halfHeight=(62*labelScale+12)/2;
  for (const node of ordered) {
    const x=camera.x+(node.x+CHAIN_NODE_WIDTH/2)*camera.zoom,y=camera.y+(node.y+CHAIN_NODE_HEIGHT/2)*camera.zoom;
    const box={left:x-halfWidth,right:x+halfWidth,top:y-halfHeight,bottom:y+halfHeight};
    if(box.right<0||box.left>viewport.width||box.bottom<0||box.top>viewport.height)continue;
    const keys=[];for(let col=Math.floor(box.left/180);col<=Math.floor(box.right/180);col++)for(let row=Math.floor(box.top/54);row<=Math.floor(box.bottom/54);row++)keys.push(col+':'+row);
    if(keys.some(key=>(cells.get(key)||[]).some(other=>box.left<other.right+8&&box.right>other.left-8&&box.top<other.bottom+6&&box.bottom>other.top-6)))continue;
    visible.add(node.system_id);for(const key of keys)cells.set(key,[...(cells.get(key)||[]),box]);
  }
  return visible;
}

/** Pointer deltas use the gesture's initial zoom, including while a previous save is pending. */
export function draggedChainPositions(originals, start, end, zoom) {
  return originals.map(node=>({system_id:node.system_id,x:Math.round(node.x+(end.x-start.x)/zoom),y:Math.round(node.y+(end.y-start.y)/zoom)}));
}
/** Public reports cannot become private connection endpoints without explicit adoption. */
export function chainConnectionTarget(nodes, point, fromId, padding=12) {
  return nodes.find(node=>node.system_id!==fromId&&!node.public_report&&point.x>=node.x-padding&&point.x<=node.x+CHAIN_NODE_WIDTH+padding&&point.y>=node.y-padding&&point.y<=node.y+CHAIN_NODE_HEIGHT+padding)||null;
}
export function chainConnectionPreview(from, side, point, target=null, portExtent=CHAIN_NODE_WIDTH/2) {
  const start={x:from.x+CHAIN_NODE_WIDTH/2+(side==='right'?portExtent:-portExtent),y:from.y+CHAIN_NODE_HEIGHT/2};
  const end=target?{x:target.x+CHAIN_NODE_WIDTH/2+(start.x>target.x+CHAIN_NODE_WIDTH/2?portExtent:-portExtent),y:target.y+CHAIN_NODE_HEIGHT/2}:point;
  const direction=side==='right'?1:-1,bend=Math.max(44,Math.min(160,Math.abs(end.x-start.x)*.45));
  return `M ${start.x} ${start.y} C ${start.x+direction*bend} ${start.y}, ${end.x+(target?(start.x>end.x?1:-1):-direction)*bend} ${end.y}, ${end.x} ${end.y}`;
}
