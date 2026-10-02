import test from 'node:test';
import assert from 'node:assert/strict';
import {chainNodeSize,CHAIN_PORTS,chainPortPoint,nearestChainPort,draggedChainPositions,chainConnectionTarget,chainConnectionPreview,CHAIN_NODE_WIDTH, CHAIN_NODE_HEIGHT, chainBounds, fitChainCamera, chainZoomLimits, zoomChainAt, boundChainCamera, chainEdgeGeometry, traceChainPath, placeChainPopover, visibleChainLabels, placeChainEdgeLabels} from '../../components/kairo/jspace-map-geometry.mjs';

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


test('drag previews preserve group offsets using initial zoom and latest pending positions',()=>{
  const original=[{system_id:1,x:10,y:20},{system_id:2,x:290,y:45}];
  const first=draggedChainPositions(original,{x:100,y:200},{x:130,y:215},.5);
  assert.deepEqual(first,[{system_id:1,x:70,y:50},{system_id:2,x:350,y:75}]);
  assert.deepEqual(draggedChainPositions(first,{x:0,y:0},{x:10,y:-5},.5),[{system_id:1,x:90,y:40},{system_id:2,x:370,y:65}]);
  assert.equal(CHAIN_NODE_HEIGHT,84);
});

test('connection handles snap to private targets and reject self, empty space and public reports',()=>{
  const nodes=[{system_id:1,x:0,y:0},{system_id:2,x:400,y:0,locked:true},{system_id:3,x:800,y:0,public_report:true}];
  assert.equal(chainConnectionTarget(nodes,{x:10,y:20},1),null);
  assert.equal(chainConnectionTarget(nodes,{x:400,y:42},1)?.system_id,2);
  assert.equal(chainConnectionTarget(nodes,{x:395,y:42},1)?.system_id,2);
  assert.equal(chainConnectionTarget(nodes,{x:820,y:20},1),null);
  assert.equal(chainConnectionTarget(nodes,{x:600,y:300},1),null);
  assert.match(chainConnectionPreview(nodes[0],'right',{x:320,y:60}),/^M 264 42 C /);
  assert.match(chainConnectionPreview(nodes[0],'right',{x:420,y:60},nodes[1]),/, 400 42$/);
  assert.match(chainConnectionPreview(nodes[1],'left',{x:0,y:0},nodes[0]),/^M 400 42 C .*264 42$/);
});


test('mobile Fit frames whole cards and their attached handles without a second label envelope',()=>{
  const nodes=[{system_id:1,x:-140,y:20},{system_id:2,x:140,y:20},{system_id:3,x:460,y:20}],viewport={width:340,height:360};
  const camera=fitChainCamera(nodes,viewport),halfEnvelope=(CHAIN_NODE_WIDTH+28)*camera.zoom/2;
  assert.ok(camera.zoom<.65,'The chain exercises overview zoom');
  for(const node of nodes){
    const center=camera.x+(node.x+CHAIN_NODE_WIDTH/2)*camera.zoom;
    assert.ok(center-halfEnvelope>=23.99,'The actual card and left handle remain inside Fit padding');
    assert.ok(center+halfEnvelope<=viewport.width-23.99,'The actual card and right handle remain inside Fit padding');
  }
  const path=chainConnectionPreview(nodes[0],'right',{x:0,y:0},nodes[2]);
  assert.ok(path.startsWith(`M ${nodes[0].x+CHAIN_NODE_WIDTH} 62 C `),'Preview stays attached to the same card edge at every zoom');
  const cardScreenWidth=CHAIN_NODE_WIDTH*camera.zoom;
  for(let i=1;i<nodes.length;i++)assert.ok((nodes[i].x-nodes[i-1].x)*camera.zoom>cardScreenWidth,'Whole identities retain their non-overlapping arrangement at overview zoom');
});


test('four cardinal tabs preserve exact selected endpoints in a single continuous curve',()=>{
  const from={x:20,y:50},to={x:630,y:360};
  for(const from_port of CHAIN_PORTS)for(const to_port of CHAIN_PORTS){
    const edge=chainEdgeGeometry(from,to,0,{from_port,to_port});
    assert.deepEqual(edge.start,chainPortPoint(from,from_port));
    assert.deepEqual(edge.end,chainPortPoint(to,to_port));
    assert.equal((edge.path.match(/M/g)||[]).length,1);
    assert.equal((edge.path.match(/C/g)||[]).length,1);
    assert.equal((edge.path.match(/L/g)||[]).length,0);
    assert.equal(chainConnectionPreview(from,from_port,edge.end,to,CHAIN_NODE_WIDTH/2,to_port),edge.path,'preview and saved curve agree at both chosen tabs');
    const moved=chainEdgeGeometry({...from,x:1000,y:-200},to,0,{from_port,to_port});
    assert.deepEqual(moved.start,chainPortPoint({x:1000,y:-200},from_port),'moving across the target does not switch the chosen tab');
  }
  assert.equal(nearestChainPort(to,{x:762,y:348}),'top');
  assert.equal(nearestChainPort(to,{x:762,y:456}),'bottom');
  assert.equal(nearestChainPort(to,{x:618,y:402}),'left');
  assert.equal(nearestChainPort(to,{x:906,y:402}),'right');
});

test('a large staged region can be framed with its full node and tab envelope',()=>{
  const nodes=[{system_id:1,x:-25000,y:-20000},{system_id:2,x:25000,y:20000}],viewport={width:1200,height:760};
  const camera=fitChainCamera(nodes,viewport);
  assert.ok(camera.zoom<.12,'expansive groups are not clipped by the old overview minimum');
  for(const node of nodes){
    assert.ok(camera.x+(node.x-14)*camera.zoom>=57.99);
    assert.ok(camera.x+(node.x+CHAIN_NODE_WIDTH+14)*camera.zoom<=viewport.width-57.99);
    assert.ok(camera.y+(node.y-14)*camera.zoom>=57.99);
    assert.ok(camera.y+(node.y+CHAIN_NODE_HEIGHT+14)*camera.zoom<=viewport.height-57.99);
  }
});


test('permanent map traces retain gates and follow Ansiblex direction without wormhole conditions',()=>{
  const nodes=[1,2,3].map(system_id=>({system_id,x:0,y:0}));
  const connections=[{id:'gate',kind:'gate',from_system_id:1,to_system_id:2,expires_at:'2020-01-01T00:00:00Z'},{id:'bridge',kind:'ansiblex',from_system_id:2,to_system_id:3,directional:true}];
  assert.deepEqual(traceChainPath(nodes,connections,1,3),{nodes:[1,2,3],edges:['gate','bridge']});
  assert.deepEqual(traceChainPath(nodes,connections,3,1),{nodes:[],edges:[]});
  assert.deepEqual(traceChainPath(nodes,connections.map(link=>({...link,enabled:false})),1,3),{nodes:[],edges:[]});
});

test('independent display sizes frame actual cards and retain scaled ports and hit targets',()=>{
  const small={system_id:1,x:-100,y:0,displayScale:.5},large={system_id:2,x:400,y:200,displayScale:1.5};
  assert.deepEqual(chainNodeSize(small),{width:132,height:42});assert.deepEqual(chainNodeSize(large),{width:396,height:126});
  assert.deepEqual(chainNodeSize({displayScale:NaN}),{width:264,height:84});
  assert.deepEqual(chainBounds([small,large]),{minX:-100,minY:0,maxX:796,maxY:326});
  assert.equal(chainConnectionTarget([small,large],{x:50,y:20},2,0),null,'outside the smaller card');
  assert.equal(chainConnectionTarget([small,large],{x:790,y:320},1,0),large,'inside the larger card');
  for(const from_port of CHAIN_PORTS)for(const to_port of CHAIN_PORTS){
    const edge=chainEdgeGeometry(small,large,0,{from_port,to_port});
    assert.deepEqual(edge.start,chainPortPoint(small,from_port));assert.deepEqual(edge.end,chainPortPoint(large,to_port));
    assert.equal(chainConnectionPreview(small,from_port,edge.end,large,undefined,to_port),edge.path);
  }
  const viewport={width:800,height:500},camera=fitChainCamera([small,large],viewport);
  for(const node of [small,large]){const size=chainNodeSize(node),handle=14*node.displayScale;
    assert.ok(camera.x+(node.x-handle)*camera.zoom>=57.99);assert.ok(camera.x+(node.x+size.width+handle)*camera.zoom<=viewport.width-57.99);
    assert.ok(camera.y+(node.y-handle)*camera.zoom>=57.99);assert.ok(camera.y+(node.y+size.height+handle)*camera.zoom<=viewport.height-57.99);
  }
});

test('scaled cards remain caption obstacles and scaled overview labels use their visual centres',()=>{
  const nodes=[{system_id:1,x:0,y:0,displayScale:.5},{system_id:2,x:260,y:0,displayScale:1.5},{system_id:3,x:800,y:0,displayScale:.75}];
  const edges=placeChainEdgeLabels([{...chainEdgeGeometry(nodes[0],nodes[2]),id:'crossing'}],nodes);
  for(const {labelBox:box} of edges)for(const node of nodes){const {width,height}=chainNodeSize(node);
    assert.ok(!(box.left<node.x+width&&box.right>node.x&&box.top<node.y+height&&box.bottom>node.y),'caption must not overlap the scaled card');
  }
  const compact=[{system_id:1,x:0,y:0,displayScale:.5},{system_id:2,x:200,y:0,displayScale:.5}],camera={x:20,y:100,zoom:1},viewport={width:600,height:400};
  assert.deepEqual([...visibleChainLabels(compact,camera,viewport)],[1,2]);
  assert.deepEqual([...visibleChainLabels(compact.map(node=>({...node,displayScale:1})),camera,viewport)],[1]);
});
