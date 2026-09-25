import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAIN_NODE_WIDTH, CHAIN_NODE_HEIGHT, chainBounds, fitChainCamera, chainZoomLimits, zoomChainAt, boundChainCamera, chainEdgeGeometry, traceChainPath, placeChainPopover, visibleChainLabels, placeChainEdgeLabels} from '../../components/kairo/jspace-map-geometry.mjs';

test('chain framing includes full cards at negative coordinates and disconnected discoveries', () => {
  const nodes = [{system_id:1,x:-420,y:-200},{system_id:2,x:610,y:470}], viewport = {width:1200,height:760};
  const camera = fitChainCamera(nodes, viewport), bounds = chainBounds(nodes);
  assert.ok(bounds.minX * camera.zoom + camera.x >= 57);
  assert.ok(bounds.maxX * camera.zoom + camera.x <= viewport.width - 57);
  assert.ok(bounds.minY * camera.zoom + camera.y >= 57);
  assert.ok(bounds.maxY * camera.zoom + camera.y <= viewport.height - 57);
  const limits = chainZoomLimits(nodes, viewport);
  assert.ok(limits.min > 0 && limits.min === camera.zoom);
});

test('zoom preserves the pointer world position and cannot zoom into unlimited empty space', () => {
  const camera = {x:120,y:-80,zoom:1}, point = {x:530,y:310}, limits = {min:.4,max:1.8};
  const next = zoomChainAt(camera,point,.1,limits);
  assert.equal(next.zoom,.4);
  assert.equal((point.x-next.x)/next.zoom,(point.x-camera.x)/camera.zoom);
  assert.equal((point.y-next.y)/next.zoom,(point.y-camera.y)/camera.zoom);
  assert.equal(zoomChainAt(camera,point,100,limits).zoom,1.8);
});

test('connection curves terminate on card sides and distinguish parallel observations', () => {
  const from={x:0,y:0},to={x:600,y:50};
  const line=chainEdgeGeometry(from,to),parallel=chainEdgeGeometry(from,to,30);
  assert.equal(line.start.x,CHAIN_NODE_WIDTH);
  assert.equal(line.start.y,CHAIN_NODE_HEIGHT/2);
  assert.equal(line.end.x,to.x);
  assert.notEqual(line.path,parallel.path);
  assert.ok(parallel.label.y>line.label.y);
  const down=chainEdgeGeometry(from,{x:10,y:450});
  assert.equal(down.start.y,CHAIN_NODE_HEIGHT);
  assert.equal(down.end.y,450);
});

test('traces use explicit recorded connections and stop at expired, collapsed or removed nodes', () => {
  const nodes=[1,2,3,4].map(system_id=>({system_id,x:0,y:0}));
  const edge=(id,a,b,extra={})=>({id,from_system_id:a,to_system_id:b,...extra});
  const edges=[edge('a',1,2),edge('b',2,3),edge('c',3,4,{life_status:'collapsed'}),edge('d',1,4,{expires_at:'2026-01-01T00:00:00Z'}),edge('outside',3,5)];
  assert.deepEqual(traceChainPath(nodes,edges,1,3,Date.parse('2026-02-01')),{nodes:[1,2,3],edges:['a','b']});
  assert.deepEqual(traceChainPath(nodes,edges,1,4,Date.parse('2026-02-01')),{nodes:[],edges:[]});
  assert.deepEqual(traceChainPath(nodes,edges,1,5),{nodes:[],edges:[]});
});

test('panning retains recoverable map content and contextual overlays remain bounded', () => {
  const viewport={width:390,height:600},nodes=[{system_id:1,x:0,y:0}];
  const camera=boundChainCamera({x:-100000,y:100000,zoom:1},nodes,viewport);
  assert.ok(camera.x+CHAIN_NODE_WIDTH>=48);
  assert.ok(camera.y<=viewport.height-48);
  const popover=placeChainPopover({x:380,y:590},{width:290,height:240},viewport);
  assert.ok(popover.x>=12 && popover.y>=12);
  assert.ok(popover.x+290<=viewport.width-12 && popover.y+240<=viewport.height-12);
});

test('overview labels retain the selected system and avoid neighbouring text collisions', () => {
  const nodes=[{system_id:1,x:0,y:0},{system_id:2,x:270,y:0},{system_id:3,x:900,y:0}];
  const visible=visibleChainLabels(nodes,{x:20,y:100,zoom:.4},{width:600,height:400},[2]);
  assert.ok(visible.has(2));assert.ok(!visible.has(1));assert.ok(visible.has(3));
});

test('public and private connection captions avoid intervening cards and narrow endpoint gaps', () => {
  const nodes=[{system_id:1,x:0,y:0},{system_id:2,x:280,y:0},{system_id:3,x:680,y:0}];
  const edges=placeChainEdgeLabels([
    {...chainEdgeGeometry(nodes[0],nodes[1]),id:'private',labelWidth:110},
    {...chainEdgeGeometry(nodes[2],nodes[0]),id:'public',labelWidth:110},
  ],nodes);
  for(const edge of edges){
    const box=edge.labelBox;
    for(const node of nodes)assert.ok(!(box.left<node.x+CHAIN_NODE_WIDTH&&box.right>node.x&&box.top<node.y+CHAIN_NODE_HEIGHT&&box.bottom>node.y),`${edge.id} caption must remain clickable outside system cards`);
    assert.ok(box.left>=-64&&box.right<=nodes[2].x+CHAIN_NODE_WIDTH+64);
    assert.ok(box.top>=-64&&box.bottom<=CHAIN_NODE_HEIGHT+64);
  }
  assert.ok(edges[0].leader,'the narrow private gap uses a leader to retain association');
  assert.notDeepEqual(edges[1].label,chainEdgeGeometry(nodes[2],nodes[0]).label,'public caption leaves the intervening middle card');
  assert.ok(edges[0].labelBox.right<=edges[1].labelBox.left||edges[0].labelBox.left>=edges[1].labelBox.right||edges[0].labelBox.bottom<=edges[1].labelBox.top||edges[0].labelBox.top>=edges[1].labelBox.bottom);
});
