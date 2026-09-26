// End-to-end user tasks for the dedicated chain workspace. The parent harness
// supplies its real Chromium controls and local synthetic server, not app state.
import assert from 'node:assert/strict';

export async function jspaceAcceptance(ui){
 const {app,api,evaluate,click,clickElement,button,fill,key,choose,waitFor,delay,screenshot,viewport,layout,space,ensureJSpaceMap,call,checks,recentUniverseRequests}=ui;
 const sheet='.jspace-sheet',selected='[aria-label="Selected map context"]';
 const systems=await evaluate("(async()=>{const a=await(await fetch('/api/universe/static')).json();return {home:a.systems.find(s=>s.name==='J225111'),other:a.systems.find(s=>s.space==='wormhole'&&s.wormhole_class===1&&s.name!=='J225111'),jita:a.systems.find(s=>s.name==='Jita'),thera:a.systems.find(s=>s.name==='Thera')};})()");
 assert.ok(systems.home&&systems.other,'The bundled reference contains the user’s example and a C1 destination');
 const home=systems.home,other=systems.other;
 const node=id=>'.jspace-node[data-system-id="'+id+'"]';
 const mapState=async()=>{const id=await evaluate("document.querySelector('.jspace-workspace').dataset.mapId");return (await api('/universe/jspace?character=42')).maps.find(map=>map.id===id);};
 const settle=async()=>waitFor("document.querySelector('.jspace-workspace-stage')?.getAttribute('aria-busy')==='false' && !document.querySelector('.jspace-saving')");
 const closeSheet=async()=>{const label=await evaluate("document.querySelector('.jspace-sheet')?.getAttribute('aria-label')");if(label)await click('[aria-label='+JSON.stringify('Close '+label)+']');};
 const selectNode=async system=>{await click('[aria-label='+JSON.stringify('Select '+system.name)+']');await waitFor('!!document.querySelector('+JSON.stringify(selected)+')');};
 const selectEdge=async id=>{if(await evaluate("!!document.querySelector('[aria-label=\"Close selected map context\"]')"))await click('[aria-label="Close selected map context"]');await click('[data-connection-label='+JSON.stringify(id)+']');};
 const addNode=async system=>{await fill('[aria-label="Find a system to add to chain"]',system.name);await clickElement('Array.from(document.querySelectorAll(".jspace-quick-results button")).find(e=>e.querySelector("strong")?.textContent==='+JSON.stringify(system.name)+')');await waitFor('!!document.querySelector('+JSON.stringify(node(system.system_id))+') && !document.querySelector(".jspace-sheet")');};
 const nativeSelect=async(label,value)=>{await waitFor('!!document.querySelector('+JSON.stringify('[aria-label='+JSON.stringify(label)+']')+')');await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify('[aria-label='+JSON.stringify(label)+']')});if(!Array.from(e.options).some(o=>o.value===${JSON.stringify(String(value))}))throw new Error('Missing native option');e.focus();Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
 const inputValue=async(label,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify('[aria-label='+JSON.stringify(label)+']')});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const toggle=async text=>clickElement('Array.from(document.querySelectorAll(".jspace-sheet label")).find(e=>e.textContent.includes('+JSON.stringify(text)+'))?.querySelector("input[type=checkbox]")');
 const moveHeader=async(system,dx,dy)=>{
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(node(system.system_id)+' .jspace-node-grab')});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width*.4,y:r.y+r.height*.5};})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  for(const fraction of [.25,.5,.75,1]){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx*fraction,y:point.y+dy*fraction,button:'left',buttons:1});await delay(35);}
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',clickCount:1});await settle();
 };
 const altArrow=async(system,keyName='ArrowRight')=>{
  await evaluate('document.querySelector('+JSON.stringify(node(system.system_id)+' .jspace-node-grab')+').focus()');
  const code=keyName==='ArrowRight'?39:37;
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:keyName,code:keyName,windowsVirtualKeyCode:code,modifiers:1});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:keyName,code:keyName,windowsVirtualKeyCode:code,modifiers:1});await settle();
 };
 const action=async(system,name)=>{await click('[aria-label='+JSON.stringify('Actions for '+system.name)+']');await button(name,'.jspace-map-menu');await settle();};
 const port=(system,side='right')=>'.jspace-connection-handle[data-system-id="'+system.system_id+'"][data-side="'+side+'"]';
 const pointerAt=async selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing pointer target');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const beginPort=async system=>{const point=await pointerAt(port(system));await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});return point;};
 const movePort=async point=>call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'left',buttons:1});
 const releasePort=async point=>call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});

 // Exercise movement while a real save is outstanding. A delayed response must
 // never turn pointer movement into a wait-for-server interaction or drop the
 // next gesture. This wrapper is confined to this disposable browser and this
 // one command; it does not interfere with the harness's polling controls.
 await ensureJSpaceMap('Direct interaction review',true);
 await addNode(home);await addNode(other);
 const searchRevision=(await mapState()).revision;await addNode(home);
 assert.equal((await mapState()).revision,searchRevision,'Finding a system already on the chain frames it without saving a duplicate');
 assert.equal((await mapState()).nodes.filter(row=>row.system_id===home.system_id).length,1);
 await click('[aria-label="Fit chain"]');await delay(650);
 const directBefore=await mapState(),firstPosition=directBefore.nodes.find(row=>row.system_id===home.system_id);
 const dragFrames=[];
 const trackedDrag=async(system,dx,dy)=>{
  const start=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(node(system.system_id))}),e=n.querySelector('.jspace-node-grab'),r=e.getBoundingClientRect(),b=n.getBoundingClientRect();return {x:r.x+r.width*.35,y:r.y+r.height*.5,left:b.left,top:b.top,zoom:Number(document.querySelector('[data-testid="jspace-map"]').dataset.cameraZoom)};})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:start.x,y:start.y,button:'left',buttons:1,clickCount:1});
  await evaluate(`(()=>{window.__chainDragFrames=[];document.addEventListener('pointermove',()=>{const at=performance.now();const frame=()=>{const r=document.querySelector(${JSON.stringify(node(system.system_id))}).getBoundingClientRect();window.__chainDragFrames.push({left:r.left,top:r.top,elapsed:performance.now()-at});if(window.__chainDragFrames.length<2)requestAnimationFrame(frame);};requestAnimationFrame(frame);},{once:true,capture:true});})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+dx,y:start.y+dy,button:'left',buttons:1});
  await waitFor('window.__chainDragFrames?.length===2');
  const frames=await evaluate('window.__chainDragFrames');dragFrames.push({dx,dy,zoom:start.zoom,frames});
  assert.ok(frames.some(frame=>Math.abs(frame.left-start.left-dx)<=2&&Math.abs(frame.top-start.top-dy)<=2),'The card reaches the pointer within two animation frames, before pointer release: '+JSON.stringify({start,dx,dy,frames}));
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+dx,y:start.y+dy,button:'left',clickCount:1});
  return {...start,dx,dy};
 };
 await evaluate(`(()=>{const nativeFetch=window.fetch;window.__positionFetch=nativeFetch;window.__positionSaveHeld=false;let release;const gate=new Promise(resolve=>{release=resolve;});window.__releasePositionSave=release;window.fetch=async function(input,init){let payload;try{payload=JSON.parse(init?.body||'{}');}catch{}if(!window.__positionSaveHeld&&String(input).includes('/universe/jspace/maps/')&&payload?.op==='nodes.position'){window.__positionSaveHeld=true;await gate;}return nativeFetch.call(this,input,init);};})()`);
 let firstDrag,secondDrag;
 try{
  firstDrag=await trackedDrag(home,-48,32);await waitFor('window.__positionSaveHeld===true');
  assert.deepEqual((await mapState()).nodes.find(row=>row.system_id===home.system_id),firstPosition,'A deferred save leaves the authoritative position unchanged while the card moves locally');
  const held=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(node(home.system_id))}).getBoundingClientRect();return {left:r.left,top:r.top};})()`);
  assert.ok(Math.abs(held.left-firstDrag.left-firstDrag.dx)<=2&&Math.abs(held.top-firstDrag.top-firstDrag.dy)<=2,'Pointer release does not snap back while its save is pending');
  secondDrag=await trackedDrag(home,26,-18);
  await screenshot('jspace-live-drag-pending-save');
 }finally{await evaluate('window.__releasePositionSave?.();window.fetch=window.__positionFetch;delete window.__positionFetch;delete window.__releasePositionSave;');}
 await settle();
 await waitFor(`(async()=>{const d=await(await fetch('/api/universe/jspace?character=42')).json();return d.maps.find(m=>m.id===${JSON.stringify(directBefore.id)})?.revision>=${directBefore.revision+2};})()`);
 const savedPosition=(await mapState()).nodes.find(row=>row.system_id===home.system_id);
 const expected={x:firstPosition.x+Math.round(firstDrag.dx/firstDrag.zoom)+Math.round(secondDrag.dx/secondDrag.zoom),y:firstPosition.y+Math.round(firstDrag.dy/firstDrag.zoom)+Math.round(secondDrag.dy/secondDrag.zoom)};
 assert.ok(Math.abs(savedPosition.x-expected.x)<=1&&Math.abs(savedPosition.y-expected.y)<=1,'Two gestures persist in order without dropping the second movement: '+JSON.stringify({savedPosition,expected,dragFrames}));
 await click('[aria-label="Refresh Universe data"]');await settle();
 assert.deepEqual({x:(await mapState()).nodes.find(row=>row.system_id===home.system_id).x,y:(await mapState()).nodes.find(row=>row.system_id===home.system_id).y},{x:savedPosition.x,y:savedPosition.y});
 checks.push('Card movement follows real pointer input within two frames, stays optimistic during a delayed save and persists a second gesture in order');

 await click('[aria-label="Fit chain"]');await delay(650);
 const compact=await evaluate(`Array.from(document.querySelectorAll('.jspace-node')).map(e=>({width:e.offsetWidth,height:e.offsetHeight,identity:parseFloat(getComputedStyle(e.querySelector('.jspace-node-name strong')).fontSize),text:e.innerText,ports:Array.from(e.querySelectorAll('.jspace-connection-handle')).map(p=>({disabled:p.disabled,opacity:getComputedStyle(p).opacity,width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height}))}))`);
 assert.ok(compact.every(row=>row.width<=280&&row.height<=100&&row.identity>=14),'Compact cards retain a readable system identity: '+JSON.stringify(compact));
 assert.ok(compact.every(row=>row.ports.length===2&&row.ports.every(port=>!port.disabled&&Number(port.opacity)>0&&port.width>=16&&port.height>=16)),'Both connection ports are visibly usable on each private card');
 assert.ok(compact.every(row=>!/(?:No effect|Status unknown|Reference only)/i.test(row.text)),'Default and reference boilerplate does not consume space on compact cards');
 const navBeforePorts=JSON.stringify((await api('/universe/navigation?character=42')).itinerary);
 const originalPositionRevision=(await mapState()).revision;
 const startPort=await beginPort(home),targetPort=await pointerAt(port(other,'left'));
 await movePort({x:(startPort.x+targetPort.x)/2,y:Math.max(startPort.y,targetPort.y)+60});
 await waitFor("document.querySelector('[data-testid=\"jspace-connection-preview\"]')?.dataset.state==='drawing'");
 const previewPath=await evaluate("document.querySelector('[data-testid=\"jspace-connection-preview\"]').getAttribute('d')");assert.ok(previewPath?.startsWith('M '));
 await screenshot('jspace-port-drawing-preview');
 await movePort(targetPort);await waitFor('document.querySelector('+JSON.stringify(node(other.system_id))+')?.classList.contains("is-connect-target")');
 assert.notEqual(await evaluate("document.querySelector('[data-testid=\"jspace-connection-preview\"]').getAttribute('d')"),previewPath,'The drafted connection follows the pointer before any save');
 await evaluate(`(()=>{const nativeFetch=window.fetch;window.__connectionFetch=nativeFetch;window.__connectionSaveHeld=false;let release;const gate=new Promise(resolve=>{release=resolve;});window.__releaseConnectionSave=release;window.fetch=async function(input,init){let payload;try{payload=JSON.parse(init?.body||'{}');}catch{}if(!window.__connectionSaveHeld&&String(input).includes('/universe/jspace/maps/')&&payload?.op==='connection.save'){window.__connectionSaveHeld=true;await gate;}return nativeFetch.call(this,input,init);};})()`);
 try{
  await releasePort(targetPort);await waitFor('window.__connectionSaveHeld===true');
  await waitFor("document.querySelector('[data-testid=\"jspace-connection-preview\"]')?.dataset.state==='pending'");
  assert.equal((await mapState()).connections.length,0,'The pending visual is not a saved or routable connection');
 }finally{await evaluate('window.__releaseConnectionSave?.();window.fetch=window.__connectionFetch;delete window.__connectionFetch;delete window.__releaseConnectionSave;');}
 await settle();await waitFor("!document.querySelector('[data-testid=\"jspace-connection-preview\"]')");
 let directMap=await mapState();assert.equal(directMap.connections.length,1);assert.equal(directMap.revision,originalPositionRevision+1);
 const drawn=directMap.connections[0];assert.deepEqual([drawn.from_system_id,drawn.to_system_id],[home.system_id,other.system_id]);
 assert.equal(drawn.confirmed,false);assert.equal(drawn.accessible,false);assert.equal(drawn.active,false);assert.equal(drawn.expires_at,null);assert.equal(drawn.mass,'unknown');assert.equal(drawn.life_status,'unknown');assert.equal(drawn.wh_type,'');assert.equal(drawn.from_signature,'');assert.equal(drawn.to_signature,'');
 assert.equal(await evaluate('!!document.querySelector(".jspace-sheet")'),false,'Drawing a connection keeps the chain visible without opening a form');
 if(await evaluate("!!document.querySelector('[aria-label=\"Close selected map context\"]')"))await click('[aria-label="Close selected map context"]');
 const noSaveRevision=directMap.revision;
 let cancelled=await beginPort(home);await movePort({x:cancelled.x+35,y:cancelled.y+55});await key('Escape','Escape',27);await releasePort({x:cancelled.x+35,y:cancelled.y+55});
 await waitFor("!document.querySelector('[data-testid=\"jspace-connection-preview\"]')");
 await beginPort(home);const self=await pointerAt(port(home,'left'));await movePort(self);await releasePort(self);await waitFor("!document.querySelector('[data-testid=\"jspace-connection-preview\"]')");
 const emptyDrop=await evaluate("(()=>{const r=document.querySelector('.jspace-map-viewport').getBoundingClientRect();return{x:r.x+r.width/2,y:r.bottom-20};})()");
 await beginPort(home);await movePort(emptyDrop);await releasePort(emptyDrop);await waitFor("!document.querySelector('[data-testid=\"jspace-connection-preview\"]')");
 directMap=await mapState();assert.equal(directMap.revision,noSaveRevision);assert.equal(directMap.connections.length,1,'Escape, self-drops and empty-space drops never create connections');
 await addNode(systems.jita);await click('[aria-label="Fit chain"]');await delay(650);
 await evaluate('document.querySelector('+JSON.stringify(port(other))+').focus()');await key('Enter','Enter',13,'\r');
 await waitFor("!!document.querySelector('[data-testid=\"jspace-connection-preview\"]')");
 await evaluate('document.querySelector('+JSON.stringify(port(systems.jita,'left'))+').focus()');await key('Enter','Enter',13,'\r');await settle();
 directMap=await mapState();assert.equal(directMap.connections.length,2,'Keyboard ports create a connection without needing a mouse drag');
 assert.ok(directMap.connections.some(row=>row.from_system_id===other.system_id&&row.to_system_id===systems.jita.system_id&&!row.confirmed&&!row.active));
 assert.equal(JSON.stringify((await api('/universe/navigation?character=42')).itinerary),navBeforePorts,'Drawing or keyboard-connecting a chain never changes the saved itinerary');
 await screenshot('jspace-compact-connected-desktop');
 if(await evaluate("!!document.querySelector('[aria-label=\"Close selected map context\"]')"))await click('[aria-label="Close selected map context"]');
 await viewport(390,844);await click('[aria-label="Fit chain"]');await delay(650);await layout('Compact connection workspace 390');
 const mobileOverview=await evaluate(`(()=>{const v=document.querySelector('.jspace-map-viewport').getBoundingClientRect(),box=e=>{const r=e.getBoundingClientRect();return{left:r.left-v.left,right:r.right-v.left,top:r.top-v.top,bottom:r.bottom-v.top};},shown=e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;};return {width:v.width,height:v.height,nodes:Array.from(document.querySelectorAll('.jspace-node')).map(n=>{const h=n.querySelector('.jspace-node-heading');return{id:n.dataset.systemId,header:shown(h)?box(h):null,ports:Array.from(n.querySelectorAll('.jspace-connection-handle')).filter(shown).map(box)};})};})()`);
 const visibleNames=mobileOverview.nodes.filter(row=>row.header),overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
 assert.ok(visibleNames.length>0,'The fitted mobile chain keeps at least one readable system name');
 for(const row of mobileOverview.nodes){
  for(const box of [...(row.header?[row.header]:[]),...row.ports])assert.ok(box.left>=-1&&box.top>=-1&&box.right<=mobileOverview.width+1&&box.bottom<=mobileOverview.height+1,'Fit keeps visible overview names and ports inside the mobile viewport: '+JSON.stringify(mobileOverview));
  for(const neighbor of visibleNames.filter(value=>value.id!==row.id)){
   if(row.header)assert.equal(overlaps(row.header,neighbor.header),false,'Visible mobile overview names do not overlap neighboring names');
   for(const port of row.ports)assert.equal(overlaps(port,neighbor.header),false,'Shown connection ports do not cover a neighboring visible system name');
  }
 }
 await screenshot('jspace-compact-connected-mobile');await viewport(1600);
 checks.push('Mobile fit keeps visible overview names and connection ports inside the viewport without overlapping neighboring labels');
 checks.push('Compact readable cards expose pointer and keyboard ports, preserve the pending visual and create only unconfirmed observations; canceled, self and empty drops leave the map unchanged');

 // Common field observations are direct actions, but updating an observation
 // must never infer route trust or silently renew a wormhole's expiry.
 await click('[aria-label="Fit chain"]');await delay(650);await selectNode(home);
 await click('[aria-label="Mark system scanned"]');await settle();
 await click('[aria-label="Set system role home"]');await settle();
 let quickMap=await mapState();assert.equal(quickMap.nodes.find(row=>row.system_id===home.system_id).status,'scanned');assert.equal(quickMap.nodes.find(row=>row.system_id===home.system_id).role,'home');
 assert.equal(await evaluate('!!document.querySelector(".jspace-sheet")'),false,'Status and role save directly from the selected system');
 await selectEdge(drawn.id);await click('[aria-label="Set observed mass reduced"]');await settle();await click('[aria-label="Set observed lifetime eol"]');await settle();
 quickMap=await mapState();const quickEdge=quickMap.connections.find(row=>row.id===drawn.id);
 assert.equal(quickEdge.mass,'reduced');assert.equal(quickEdge.life_status,'eol');assert.equal(quickEdge.expires_at,null);assert.equal(quickEdge.confirmed,false);assert.equal(quickEdge.accessible,false);assert.equal(quickEdge.active,false);
 assert.equal(await evaluate('!!document.querySelector(".jspace-sheet")'),false,'Observed connection conditions save without opening a full editor');
 await screenshot('jspace-direct-connection-workbench');
 checks.push('Permanent chain search frames existing systems without duplicate writes; one-click status, role and condition changes retain unknown expiry and unconfirmed route trust');

 // Diagram-only removals are immediate and genuinely reversible. Canonical
 // shared connection records and routing permissions survive these operations.
 const undoRemoval=async()=>{await button('Undo removal','.jspace-notice');await settle();};
 const shape=value=>({nodes:value.nodes.map(row=>row.system_id).sort((a,b)=>a-b),connections:value.connections.map(row=>row.id).sort()});
 const removalBefore=await mapState(),removalShape=shape(removalBefore),canonicalBefore=(await api('/universe?character=42')).links.find(row=>row.id===quickEdge.link_id);
 await click('[aria-label="Close selected map context"]');
 const edgePoint=await pointerAt('[data-connection-label='+JSON.stringify(drawn.id)+']');
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...edgePoint});await call('Input.dispatchMouseEvent',{type:'mousePressed',...edgePoint,button:'right',buttons:2,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...edgePoint,button:'right',clickCount:1});
 await button('Remove from this map','.jspace-map-menu');await settle();
 assert.equal((await mapState()).connections.some(row=>row.id===drawn.id),false,'The edge context action removes the diagram edge immediately');
 assert.equal(await evaluate('!!document.querySelector(".jspace-sheet")'),false,'Diagram removal opens neither an editor nor a confirmation sheet');
 const canonicalAfter=(await api('/universe?character=42')).links.find(row=>row.id===quickEdge.link_id);
 for(const field of ['id','enabled','confirmed','accessible','expires_at','mass','life_status'])assert.equal(canonicalAfter[field],canonicalBefore[field],'Diagram removal preserves canonical '+field);
 await undoRemoval();assert.deepEqual(shape(await mapState()),removalShape,'Undo restores the removed diagram edge');
 await selectNode(home);await click('[aria-label="Remove system from map"]');await settle();
 assert.equal((await mapState()).nodes.some(row=>row.system_id===home.system_id),false,'The selected system trash action removes its card immediately');
 assert.equal((await mapState()).connections.some(row=>row.from_system_id===home.system_id||row.to_system_id===home.system_id),false,'Removing a card removes its attached diagram edges');
 await screenshot('jspace-removal-undo');await undoRemoval();assert.deepEqual(shape(await mapState()),removalShape,'Undo restores the card and all attached diagram edges');
 await action(home,'Remove from this map');assert.equal((await mapState()).nodes.some(row=>row.system_id===home.system_id),false,'The system menu removal performs the action instead of opening an editor');await undoRemoval();assert.deepEqual(shape(await mapState()),removalShape);
 await selectNode(home);const groupPoint=await pointerAt(node(other.system_id)+' .jspace-node-grab');
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...groupPoint,button:'left',buttons:1,modifiers:2,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...groupPoint,button:'left',modifiers:2,clickCount:1});
 await waitFor("document.querySelector('[aria-label=\"Selected chain systems\"]')?.textContent.includes('2 selected')");
 await click('[aria-label="Remove unlocked systems"]');await settle();
 assert.deepEqual((await mapState()).nodes.map(row=>row.system_id),[systems.jita.system_id],'Group removal acts immediately on the selected unlocked cards');
 await undoRemoval();assert.deepEqual(shape(await mapState()),removalShape,'One Undo restores an entire removed group and its connections');
 if(await evaluate("!!document.querySelector('[aria-label=\"Clear chain selection\"]')"))await click('[aria-label="Clear chain selection"]');
 checks.push('Node, edge and group diagram removals act immediately; real Undo restores cards and topology while canonical shared connection records remain unchanged');

 await ensureJSpaceMap('Flagship scout chain',true);
 const fresh=await mapState();assert.equal(fresh.nodes.length,0);assert.equal(fresh.connections.length,0);
 await addNode(home);await addNode(other);await click('[aria-label="Fit chain"]');await delay(650);
 assert.equal(await evaluate('document.querySelector('+JSON.stringify(node(home.system_id)+' .jspace-node-class')+').textContent'),'C4');
 assert.deepEqual(await evaluate('Array.from(document.querySelectorAll('+JSON.stringify(node(home.system_id)+' .jspace-static strong')+')).map(e=>e.textContent).sort()'),['C1','C3']);
 assert.deepEqual(await evaluate('Array.from(document.querySelectorAll('+JSON.stringify(node(home.system_id)+' .jspace-static')+')).map(e=>e.getAttribute("aria-label")).sort()'),['C247 → C3','P060 → C1'],'Compact static badges retain both exact type-to-class mappings');
 const firstStatic=home.wormhole.statics.find(row=>row.destinationClasses.some(value=>value.label==='C1'));
 const badge=await evaluate(`(()=>{const r=Array.from(document.querySelectorAll(${JSON.stringify(node(home.system_id)+' .jspace-static')})).find(e=>e.getAttribute('aria-label')?.startsWith(${JSON.stringify(firstStatic.type+' →')})).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...badge});await waitFor('document.querySelector(".jspace-map-hint")?.textContent.includes('+JSON.stringify(firstStatic.type)+')');
 assert.ok(await evaluate('document.querySelector(".jspace-map-hint").textContent.includes('+JSON.stringify(firstStatic.destinationClasses[0].label)+')'),'Static hover reveals the exact hole type and destination class');
 assert.equal((await mapState()).connections.length,0,'Static badges are references, never generated route edges');
 await selectNode(home);await button('System intel',selected);await waitFor("document.querySelectorAll('.jspace-static-reference').length===2");
 assert.ok(await evaluate("document.querySelector('.jspace-reference').textContent.includes('Nominal') && document.querySelector('.jspace-reference').textContent.includes('Expected static types')"));
 assert.equal(await evaluate('document.querySelector(".jspace-reference").textContent.includes('+JSON.stringify(home.region_name)+')'),false,'Static reference keeps internal wormhole regions out of the user’s context');
 await screenshot('jspace-system-reference');await closeSheet();
 await button('Edit system',selected);await fill('[aria-label="Chain system alias"]','Forward camp');await clickElement('Array.from(document.querySelectorAll(".jspace-sheet summary")).find(e=>e.textContent.trim()==="Notes & details")');await fill('[aria-label="Chain system label"]','Scouting route');
 await nativeSelect('Chain system status','scanned');await nativeSelect('Chain system role','staging');await fill('[aria-label="Chain system tags"]','exploration, bookmarks');
 await button('Save system context',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 let map=await mapState();assert.equal(map.nodes.find(row=>row.system_id===home.system_id).alias,'Forward camp');
 const before=map.nodes.find(row=>row.system_id===home.system_id);await moveHeader(home,-65,65);map=await mapState();
 let moved=map.nodes.find(row=>row.system_id===home.system_id);assert.ok(moved.x!==before.x||moved.y!==before.y,'Dragging a header saves a new map position');
 const groupBefore=map.nodes.map(row=>({...row})),otherPoint=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(node(other.system_id)+' .jspace-node-grab')}).getBoundingClientRect();return{x:r.x+r.width*.4,y:r.y+r.height*.5};})()`);
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...otherPoint,button:'left',buttons:1,modifiers:2,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...otherPoint,button:'left',modifiers:2,clickCount:1});
 await waitFor("document.querySelector('[aria-label=\"Selected chain systems\"]')?.textContent.includes('2 selected')");
 await moveHeader(home,45,-25);map=await mapState();const groupDelta=map.nodes.map(row=>({x:row.x-groupBefore.find(prior=>prior.system_id===row.system_id).x,y:row.y-groupBefore.find(prior=>prior.system_id===row.system_id).y}));
 assert.deepEqual(groupDelta[0],groupDelta[1],'Dragging a selected header moves both selected systems as one group');assert.ok(groupDelta[0].x!==0||groupDelta[0].y!==0);await click('[aria-label="Clear chain selection"]');moved=map.nodes.find(row=>row.system_id===home.system_id);
 await action(home,'Lock position');await altArrow(home);const locked=(await mapState()).nodes.find(row=>row.system_id===home.system_id);assert.equal(locked.locked,true);assert.deepEqual({x:locked.x,y:locked.y},{x:moved.x,y:moved.y},'A locked position ignores keyboard movement');
 await action(home,'Unlock position');await altArrow(home);map=await mapState();const nudged=map.nodes.find(row=>row.system_id===home.system_id);
 assert.equal(nudged.x,moved.x+20,'Alt + arrow provides a precise, persisted accessible move');
 await click('[aria-label="Undo map edit"]');await settle();assert.equal((await mapState()).nodes.find(row=>row.system_id===home.system_id).x,moved.x,'Undo restores the previous layout without removing the system');
 await click('[aria-label="Fit chain"]');await delay(650);await click('[aria-label="Zoom in on chain"]');await delay(650);
 const cameraBefore=await evaluate("document.querySelector('.jspace-map-world').style.transform");
 const empty=await evaluate("(()=>{const r=document.querySelector('.jspace-map-viewport').getBoundingClientRect();return {x:r.x+35,y:r.bottom-65};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...empty,button:'left',buttons:1,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:empty.x+60,y:empty.y-40,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:empty.x+60,y:empty.y-40,button:'left',clickCount:1});
 assert.notEqual(await evaluate("document.querySelector('.jspace-map-world').style.transform"),cameraBefore,'Dragging open space pans the chain');
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await click('[aria-label="Zoom in on chain"]');await delay(80);
 const reduced=await evaluate("document.querySelector('.jspace-map-world').style.transform");await delay(300);assert.equal(await evaluate("document.querySelector('.jspace-map-world').style.transform"),reduced,'Reduced-motion chain zoom settles immediately');
 assert.equal(await evaluate("document.querySelector('.jspace-workspace').getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect.getTiming().duration>0).length"),0,'Reduced motion stops decorative chain animation');
 await call('Emulation.setEmulatedMedia',{features:[]});await click('[aria-label="Fit chain"]');await delay(650);await screenshot('jspace-class-static-cards');
 checks.push('J225111 C4/C1/C3 reference cards, symbol explanations, persisted group drag/lock/keyboard layout, undo and reduced-motion pan/zoom');

 await selectNode(home);await button('Connect','.jspace-workspace-toolbar');
 await nativeSelect('Connection from system',home.system_id);await nativeSelect('Connection to system',other.system_id);
 await fill('[aria-label="Connection from signature"]','ABC-123');await fill('[aria-label="Connection to signature"]','XYZ-789');
 await fill('[aria-label="Connection wormhole type"]',home.wormhole.statics.find(row=>row.destinationClasses.some(item=>item.label==='C1')).type);
 await clickElement('Array.from(document.querySelectorAll(".jspace-choice-field")).find(e=>e.querySelector("legend")?.textContent==="Observed mass condition")?.querySelector("button.is-critical")');
 await button('End of life',sheet);await button('Record connection',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 map=await mapState();let edge=map.connections[0];assert.equal(edge.confirmed,false);assert.equal(edge.active,false);assert.equal(edge.mass,'critical');assert.equal(edge.life_status,'eol');
 assert.ok(await evaluate('document.querySelector('+JSON.stringify('[data-connection-id="'+edge.id+'"]')+').classList.contains("is-unconfirmed")'));
 assert.equal(await evaluate('document.querySelector('+JSON.stringify('[data-connection-id="'+edge.id+'"]')+').dataset.mass'),'critical');
 const linked=(await api('/universe?character=42')).links.find(row=>row.id===edge.link_id);assert.equal(linked.from_signature,'ABC-123');assert.equal(linked.to_signature,'XYZ-789');assert.equal(linked.active,false);
 await button('Edit connection',selected);await toggle('I have verified this connection');await toggle('Allow this verified connection in my routes');await button('Save connection conditions',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 map=await mapState();edge=map.connections[0];assert.equal(edge.confirmed,true);assert.equal(edge.accessible,true);assert.equal(edge.active,true,'Only explicit confirmation and route access make the live record usable');
 const exactExpiry=edge.expires_at;assert.ok(exactExpiry,'The explicitly recorded connection has a real expiry');
 await click('[aria-label="Set observed mass reduced"]');await settle();await click('[aria-label="Set observed lifetime stable"]');await settle();
 map=await mapState();edge=map.connections[0];assert.equal(edge.expires_at,exactExpiry,'Quick condition changes preserve the exact recorded expiry');assert.equal(edge.confirmed,true);assert.equal(edge.accessible,true);assert.equal(edge.active,true);
 checks.push('Quick condition updates preserve a confirmed connection’s exact expiry and existing routing permissions');
 const itinerary=JSON.stringify((await api('/universe/navigation?character=42')).itinerary),commandCount=recentUniverseRequests.filter(row=>/\/navigation\/(?:plan|waypoints)(?:\?|$)/.test(row.url)).length;
 await selectNode(home);await action(home,'Set route destination');await waitFor("document.querySelector('.jspace-shared-dock')?.hidden===false");
 assert.equal(JSON.stringify((await api('/universe/navigation?character=42')).itinerary),itinerary,'A map destination action does not replace the persisted itinerary');
 assert.equal(recentUniverseRequests.filter(row=>/\/navigation\/(?:plan|waypoints)(?:\?|$)/.test(row.url)).length,commandCount,'Map destination action does not plan or send EVE waypoints');
 const dockClose=await evaluate("Array.from(document.querySelectorAll('.jspace-shared-dock button')).find(e=>/close|collapse/i.test(e.getAttribute('aria-label')||e.textContent))?.getAttribute('aria-label')");if(dockClose)await click('[aria-label='+JSON.stringify(dockClose)+']');
 await click('[aria-label='+JSON.stringify('Open scanner in '+home.name)+']');await waitFor('document.querySelector(".universe-notebook-title strong")?.textContent==='+JSON.stringify(home.name));
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.jspace-shared-dock button')).some(e=>e.getClientRects().length&&e.textContent.trim()==='Infrastructure')"),false,'The J-Space scanner exposes its relevant notebook without nullsec infrastructure');
 assert.ok(await evaluate("document.querySelector('[aria-label=\"Scanner clipboard text\"]')?.getClientRects().length>0"),'A single card action opens the visible scan composer');
 assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Selected map context\"]')?.getClientRects().length"),false,'Opening the scanner replaces selected map context instead of stacking workbenches');
 await screenshot('jspace-scanner-direct');
 const scannerMapBefore=await mapState();assert.equal(scannerMapBefore.nodes.some(row=>row.system_id===systems.thera.system_id),false,'The scanner navigation sample is outside the private chain');
 await fill('[aria-label="Notebook system"]',systems.thera.name);await click('[aria-label="Open system notebook"]');
 await waitFor('document.querySelector(".jspace-shared-dock")?.hidden===false && document.querySelector(".universe-notebook-title strong")?.textContent==='+JSON.stringify(systems.thera.name)+' && !!document.querySelector('+JSON.stringify('[aria-label="Scanner clipboard text"]')+')?.getClientRects().length');
 assert.equal(await evaluate('!!document.querySelector(".jspace-sheet")'),false,'Choosing an uncharted scanner system keeps Scanner open instead of replacing it with system reference');
 assert.equal((await mapState()).revision,scannerMapBefore.revision,'Opening an uncharted system notebook does not add it to the private chain');
 await fill('[aria-label="Notebook system"]',home.name);await click('[aria-label="Open system notebook"]');await waitFor('document.querySelector(".universe-notebook-title strong")?.textContent==='+JSON.stringify(home.name));
 checks.push('Scanner navigation to a system outside the private chain keeps the requested tool open without adding a map card');
 await fill('[aria-label="Scanner clipboard text"]','CAN-999\tCosmic Signature\tGas Site\tCanceled preview\t100.0%\t3 AU');
 await evaluate(`(()=>{const nativeFetch=window.fetch;window.__scanFetch=nativeFetch;window.__scanPreviewHeld=false;window.__scanPreviewFinished=false;window.__scanImportsAfterLeave=0;let release;const gate=new Promise(resolve=>{release=resolve;});window.__releaseScanPreview=release;window.fetch=async function(input,init){if(String(input).includes('/universe/signatures/import'))window.__scanImportsAfterLeave++;if(!window.__scanPreviewHeld&&String(input).includes('/universe/signatures/preview')){window.__scanPreviewHeld=true;await gate;try{return await nativeFetch.call(this,input,init);}finally{window.__scanPreviewFinished=true;}}return nativeFetch.call(this,input,init);};})()`);
 try{
  await button('Update scan','.jspace-shared-dock');await waitFor('window.__scanPreviewHeld===true');
  await button('Navigate','.jspace-dock-tools');await waitFor("!document.querySelector('[aria-label=\"Scanner clipboard text\"]')");
  await evaluate('window.__releaseScanPreview()');await waitFor('window.__scanPreviewFinished===true');await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('window.__scanImportsAfterLeave'),0,'Leaving Scanner while validation is pending prevents a delayed automatic import');
  assert.equal((await api('/universe/operations?character=42')).signatures.some(row=>row.signature_id==='CAN-999'),false,'A canceled preview never becomes a canonical observation');
 }finally{await evaluate('window.__releaseScanPreview?.();window.fetch=window.__scanFetch;delete window.__scanFetch;delete window.__releaseScanPreview;');}
 await button('Scanner','.jspace-dock-tools');await waitFor('document.querySelector(".universe-notebook-title strong")?.textContent==='+JSON.stringify(home.name));
 checks.push('A delayed partial-scan preview cannot import after the user leaves the Scanner tool');
 await fill('[aria-label="Scanner clipboard text"]','ABC-123\tCosmic Signature\tWormhole\tSurveyed entrance\t100.0%\t1 AU\nDEF-456\tCosmic Signature\tRelic Site\tSurveyed relic\t100.0%\t2 AU');
 assert.equal((await api('/universe/operations?character=42')).signatures.filter(row=>row.system_id===home.system_id).length,0,'Pasting a scan alone never saves observations');
 await button('Update scan','.jspace-shared-dock');await waitFor("document.querySelectorAll('.universe-signature-list article').length===2");
 assert.equal(await evaluate("!!document.querySelector('.universe-scan-review')"),false,'A valid partial scan updates in one action without a redundant review step');
 const scanSignatures=async()=>(await api('/universe/operations?character=42')).signatures.filter(row=>row.system_id===home.system_id);
 await fill('[aria-label="Scanner clipboard text"]','ABC-123\tCosmic Signature\tWormhole\tSurveyed entrance\t100.0%\t1 AU');await button('Update scan','.jspace-shared-dock');
 await waitFor("!document.querySelector('.jspace-shared-dock [aria-label=\"Scanner clipboard text\"]').value");
 assert.ok((await scanSignatures()).every(row=>!row.missing),'The fast partial update preserves signatures absent from the paste');
 await fill('[aria-label="Scanner clipboard text"]','ABC-123\tCosmic Signature\tWormhole\tSurveyed entrance\t100.0%\t1 AU');
 await clickElement('Array.from(document.querySelectorAll(".jspace-shared-dock label")).find(e=>e.textContent.includes('+JSON.stringify('This is a complete scan of '+home.name)+'))?.querySelector("input[type=checkbox]")');
 await button('Review scan','.jspace-shared-dock');await waitFor("document.querySelector('.universe-scan-review')?.textContent.includes('DEF-456')");
 assert.ok((await scanSignatures()).every(row=>!row.missing),'Reviewing a complete scan does not mark signatures missing before confirmation');
 await button('Import signatures','.universe-scan-review');await waitFor("document.querySelector('.universe-signature-list .is-missing')?.textContent.includes('DEF-456')");
 assert.equal((await scanSignatures()).find(row=>row.signature_id==='DEF-456').missing,true);
 await clickElement('Array.from(document.querySelectorAll(".jspace-shared-dock label")).find(e=>e.textContent.includes('+JSON.stringify('This is a complete scan of '+home.name)+'))?.querySelector("input[type=checkbox]")');
 await fill('[aria-label="Scanner clipboard text"]','DEF-456\tCosmic Signature\tRelic Site\tSurveyed relic\t100.0%\t2 AU');await button('Update scan','.jspace-shared-dock');
 await waitFor("!document.querySelector('.universe-signature-list .is-missing')");
 const signatureBefore=(await scanSignatures()).find(row=>row.signature_id==='DEF-456');
 checks.push('A card opens the visible J-Space scanner in one click; partial updates preserve absent signatures while complete scans retain explicit missing-signature review');
 await clickElement('Array.from(document.querySelectorAll(".universe-signature-list article")).find(e=>e.querySelector("strong")?.textContent==="DEF-456")?.querySelector(".universe-record-action")');
 await waitFor("document.querySelector('[aria-label=\"Notebook export text\"]')?.value.includes('DEF-456')");
 await click('[aria-label="Delete signature DEF-456"]');await waitFor("!Array.from(document.querySelectorAll('.universe-signature-list article strong')).some(e=>e.textContent==='DEF-456')");
 await click('.universe-signature-trash summary');await click('[aria-label="Restore signature DEF-456"]');await waitFor("document.querySelectorAll('.universe-signature-list article').length===2");
 const restored=(await api('/universe/operations?character=42')).signatures.find(row=>row.system_id===home.system_id&&row.signature_id==='DEF-456');
 assert.equal(restored.first_seen_at,signatureBefore.first_seen_at);assert.equal(restored.last_seen_at,signatureBefore.last_seen_at,'Restoring a signature retains its original observation time');
 await screenshot('jspace-canonical-scanner-bookmark');await click('.jspace-shared-dock [aria-label^="Close"]');await click('[aria-label="Refresh Universe data"]');await settle();
 assert.equal(await evaluate('document.querySelector('+JSON.stringify(node(home.system_id)+' .jspace-node-metric[data-kind="signatures"]')+').textContent.trim()'),'2','The card shows the canonical present-signature count after scanning');
 await selectEdge(edge.id);await button('Edit connection',selected);await clickElement('Array.from(document.querySelectorAll(".jspace-sheet summary")).find(e=>e.textContent.includes("Link a scanner signature"))');
 const entrance=(await mapState()).signatures.find(row=>row.system_id===home.system_id&&row.signature_id==='ABC-123');await nativeSelect('Notebook signature to link',entrance.id);await button('Link signature to connection',sheet);await settle();
 map=await mapState();assert.equal(map.connections[0].from_signature_id,entrance.id);assert.ok(map.signatures.find(row=>row.id===entrance.id).connection_ids.includes(edge.id));await closeSheet();
 checks.push('Canonical scanner updates, bookmark text and deletion restore preserve observation age and attach to the exact connection');
 await selectEdge(edge.id);await click(selected+' [aria-label="Passages"]');await fill('[aria-label="Passage pilot name"]','Synthetic scout');await fill('[aria-label="Passage ship name"]','Buzzard');await fill('[aria-label="Passage observed mass kg"]','1270000');await button('Record observed passage',sheet);await settle();
 await click('[aria-label="Reverse passage direction"]');await fill('[aria-label="Passage pilot name"]','Unknown-mass return');await button('Record observed passage',sheet);await settle();
 map=await mapState();assert.equal(map.passages.length,2);assert.equal(map.connections[0].observed_mass_kg,1270000);assert.equal(map.connections[0].unweighed_passages,1);assert.equal(map.connections[0].remaining_mass_kg,null);
 assert.ok(await evaluate("document.querySelector('.jspace-sheet').textContent.includes('Mass unknown') && document.querySelector('.jspace-sheet').textContent.includes('remaining mass unknown')"));
 await screenshot('jspace-passage-ledger');await closeSheet();
 checks.push('Two-sided connection conditions use canonical links, explicit route access, unchanged itineraries and an honest passage ledger');

 await selectNode(home);await click(selected+' [aria-label="Observations"]');await fill('[aria-label="System observation title"]','Synthetic observatory');await fill('[aria-label="System observation notes"]','Reported Astrahus; owner and access unconfirmed.');await button('Save observation',sheet);await settle();
 await nativeSelect('System observation type','timer');await fill('[aria-label="System observation title"]','Scouting return window');await inputValue('Observation timer UTC',new Date(Date.now()+7200000).toISOString().slice(0,16));await button('Save observation',sheet);await settle();
 map=await mapState();assert.equal(map.observations.length,2);assert.ok(map.observations.some(row=>row.kind==='timer'&&Date.parse(row.timer_at)>Date.now()));assert.ok(map.observations.every(row=>row.system_id===home.system_id));
 await click('.jspace-dscan-import summary');await fill('[aria-label="D-scan structure clipboard"]','35832\tSurveyed Astrahus\tAstrahus\t1,475 km\n587\tPassing Rifter\tRifter\t5 km\n35833\tSurveyed Fortizar\tFortizar\t10 km');await button('Preview structure scan','.jspace-dscan-import');
 assert.ok(await evaluate("document.querySelector('.jspace-dscan-import .jspace-import-review h4').textContent.includes('2 structures') && document.querySelector('.jspace-dscan-import .jspace-import-review h4').textContent.includes('1 ignored')"));
 assert.equal((await mapState()).observations.length,2,'D-scan review does not save or remove observations');await button('Record 2 structure observations','.jspace-dscan-import');await waitFor("document.querySelector('.jspace-dscan-import [role=status]')?.textContent.includes('2')");
 map=await mapState();assert.equal(map.observations.length,4);const scannedStructure=map.observations.find(row=>row.title==='Surveyed Astrahus');assert.ok(scannedStructure);assert.equal(scannedStructure.standing,'unknown');assert.equal(scannedStructure.owner,'');assert.equal(scannedStructure.state,'','D-scan does not invent power state or access');
 await closeSheet();await click(selected+' [aria-label="Notes"]');await fill('[aria-label="J-Space field note"]','Follow the surveyed chain; static labels are reference only.');await button('Save note',sheet);await settle();
 assert.equal((await mapState()).comments.at(-1).system_id,home.system_id);await closeSheet();
 await button('Rally here',selected);await settle();map=await mapState();assert.equal(map.pings.length,1);assert.equal(map.pings[0].system_id,home.system_id);assert.ok(Date.parse(map.pings[0].expires_at)>Date.now());
 assert.ok(await evaluate('!!document.querySelector('+JSON.stringify(node(home.system_id)+' .jspace-node-rally')+')'),'A local rally is visible on its system card');await button('Clear rally',selected);await settle();assert.equal((await mapState()).pings.length,0);
 await click('[aria-label="Close selected map context"]');
 const cardMetrics=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(node(home.system_id))}),f=n.querySelector('.jspace-node-footer'),r=n.getBoundingClientRect();return {width:n.offsetWidth,height:n.offsetHeight,footerWidth:f.clientWidth,footerContent:f.scrollWidth,metrics:Array.from(n.querySelectorAll('.jspace-node-metric')).map(e=>{const b=e.getBoundingClientRect();return {kind:e.dataset.kind,text:e.textContent.trim(),inside:b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1};})};})()`);
 assert.ok(cardMetrics.width<=280&&cardMetrics.height<=100&&cardMetrics.footerContent<=cardMetrics.footerWidth+1&&cardMetrics.metrics.every(row=>row.inside),'Visual signature/report/note metrics fit within the compact card: '+JSON.stringify(cardMetrics));
 assert.equal(cardMetrics.metrics.find(row=>row.kind==='signatures')?.text,'2');
 await screenshot('jspace-visual-system-metrics');
 await click('[aria-label='+JSON.stringify('Open notes in '+home.name)+']');await waitFor("document.querySelector('.jspace-sheet')?.getAttribute('aria-label')==='Field notes'");await closeSheet();
 await click('[aria-label='+JSON.stringify('Open observations in '+home.name)+']');await waitFor("document.querySelector('.jspace-sheet')?.getAttribute('aria-label')==='System observations'");await closeSheet();
 checks.push('System observations, reviewed D-scan structure imports, EVE-time timers, expiring local rallies and contextual notes persist without inventing access or power state');
 checks.push('Compact visual card metrics fit inside the card and open scanner, notes and observations directly');

 await click('[aria-label="Map settings and export"]');await fill('[aria-label="J-Space map name"]','Flagship surveyed chain');await button('Save map details',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 await click('[aria-label="Map settings and export"]');await evaluate("window.__chainExport=null;window.__chainObjectURL=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(text=>window.__chainExport=text);return window.__chainObjectURL.call(URL,blob);}");
 try{await button('Export map',sheet);await waitFor("typeof window.__chainExport==='string'");}finally{await evaluate("URL.createObjectURL=window.__chainObjectURL;delete window.__chainObjectURL");}
 const exported=await evaluate('window.__chainExport');assert.ok(JSON.parse(exported));
 await evaluate("window.__chainExport=null;window.__chainObjectURL=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(text=>window.__chainExport=text);return window.__chainObjectURL.call(URL,blob);}");
 try{await button('Export for Wanderer',sheet);await waitFor("typeof window.__chainExport==='string'");}finally{await evaluate("URL.createObjectURL=window.__chainObjectURL;delete window.__chainObjectURL");}
 const wandererExport=JSON.parse(await evaluate('window.__chainExport'));assert.equal(wandererExport.version,1);assert.equal(wandererExport.systems.length,2);assert.equal(wandererExport.connections.length,1);assert.ok(wandererExport.systems.some(row=>row.solar_system_id===home.system_id));await closeSheet();
 const originalId=(await mapState()).id,originalCount=(await api('/universe/jspace?character=42')).maps.length;
 await click('[aria-label="Import a J-Space map"]');await fill('[aria-label="J-Space map import JSON"]',exported);await button('Preview import',sheet);await waitFor("!!document.querySelector('.jspace-import-review')");
 assert.equal((await api('/universe/jspace?character=42')).maps.length,originalCount,'Import preview is read-only');await button('Import as a new map',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 const imported=await mapState();assert.notEqual(imported.id,originalId);assert.equal(imported.nodes.length,2);assert.equal(imported.connections.length,1);assert.equal(imported.connections[0].confirmed,false);assert.equal(imported.connections[0].active,false);assert.equal(imported.passages.length,2);assert.equal(imported.observations.length,4);
 assert.equal((await api('/universe/jspace?character=42')).maps.find(row=>row.id===originalId).connections[0].active,true,'Importing a copy leaves the original connection evidence intact');
 const wanderer={version:1,exported_at:new Date(Date.now()-86400000).toISOString(),map:{name:'Migrated Wanderer chain',description:'Historical scout export'},systems:[{solar_system_id:home.system_id,custom_name:'Wanderer camp',position:{x:-100,y:250},locked:true,status:8},{solar_system_id:other.system_id,position:{x:300,y:250}},{solar_system_id:systems.jita.system_id,position:{x:1300,y:-350}}],connections:[{source:home.system_id,target:other.system_id,type:0,mass_status:1,time_status:2,ship_size_type:0,wormhole_type:'K162'}],signatures:[{solar_system_id:home.system_id,eve_id:'WDR-001',group:'Wormhole',name:'Historical imported signature'}]};
 await click('[aria-label="Import a J-Space map"]');await fill('[aria-label="J-Space map import JSON"]',JSON.stringify(wanderer));await button('Preview import',sheet);await waitFor("!!document.querySelector('.jspace-import-review')");await button('Import as a new map',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 await delay(650);
 const firstFit=await evaluate("(()=>{const v=document.querySelector('.jspace-map-viewport').getBoundingClientRect();return Array.from(document.querySelectorAll('.jspace-node')).map(e=>{const r=e.getBoundingClientRect();return {system:e.dataset.systemId,left:r.left-v.left,right:v.right-r.right,top:r.top-v.top,bottom:v.bottom-r.bottom};});})()");
 assert.equal(firstFit.length,3);assert.ok(firstFit.every(r=>Math.min(r.left,r.right,r.top,r.bottom)>=-1),'A newly imported populated map frames every node without a prior camera key or manual fit: '+JSON.stringify(firstFit));
 const migrated=await mapState();assert.equal(migrated.name,'Migrated Wanderer chain');assert.equal(migrated.nodes.find(row=>row.system_id===home.system_id).alias,'Wanderer camp');assert.equal(migrated.nodes.find(row=>row.system_id===home.system_id).locked,true);assert.equal(migrated.connections[0].mass,'reduced');assert.equal(migrated.connections[0].confirmed,false);assert.equal(migrated.connections[0].active,false);assert.equal(migrated.connections[0].expired,true);assert.equal(migrated.signatures.find(row=>row.signature_id==='WDR-001').missing,true);
 assert.equal((await api('/universe/operations?character=42')).signatures.find(row=>row.id===entrance.id).missing,false,'Historical map imports do not overwrite an existing fresh canonical scanner observation');
 await screenshot('jspace-wanderer-import');checks.push('Wanderer v1 migration preserves positions and context without reviving historical links or overwriting current scans');
 await choose('Active character','Atlas Beta');await waitFor("!!document.querySelector('.jspace-welcome') && document.querySelector('.jspace-workspace-stage')?.getAttribute('aria-busy')==='false'");
 assert.equal((await api('/universe/jspace?character=43')).maps.length,0,'Chain maps remain isolated to the selected pilot');
 await choose('Active character','Atlas Alpha');await waitFor("!!document.querySelector('[data-testid=\"jspace-map\"]')");
 await nativeSelect('Active J-Space map',originalId);await waitFor('document.querySelector(".jspace-workspace").dataset.mapId==='+JSON.stringify(originalId));await click('[aria-label="Fit chain"]');await delay(650);await selectNode(home);
 await space('K-Space');
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.universe-tabs button')).some(e=>e.textContent.trim()==='Journey') && Array.from(document.querySelectorAll('.universe-tabs button')).some(e=>e.textContent.includes('Connections & pins'))"),'K-Space retains its established Journey and connection tools');
 await space('J-Space');await waitFor('document.querySelector(".jspace-workspace").dataset.mapId==='+JSON.stringify(originalId));
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.universe-module .universe-tabs button')).some(e=>e.getClientRects().length&&/Journey|Connections/.test(e.textContent))"),false,'J-Space opens directly into its chain without Journey or Connections tabs');
 assert.ok(await evaluate('document.querySelector('+JSON.stringify(node(home.system_id))+').classList.contains("is-selected")'),'Returning to J-Space restores the selected map and system');
 await selectEdge(edge.id);await button('Edit connection',selected);await clickElement('Array.from(document.querySelectorAll(".jspace-choice-field")).find(e=>e.querySelector("legend")?.textContent==="Observed lifetime")?.querySelector("button.is-collapsed")');await button('Save connection conditions',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 const collapsed=(await mapState()).connections[0];assert.equal(collapsed.active,false);assert.equal(collapsed.life_status,'collapsed');assert.ok(await evaluate('document.querySelector('+JSON.stringify('[data-connection-id="'+edge.id+'"]')+').classList.contains("is-expired")'),'A reported collapse becomes historical topology instead of a live route');
 assert.ok(await evaluate("Array.from(document.querySelectorAll('[aria-label^=\"Set observed mass \"],[aria-label^=\"Set observed lifetime \"]')).every(e=>e.disabled)"),'Quick condition controls cannot accidentally revive a collapsed historical connection');
 await viewport(390,844);await layout('J-Space chain mobile');await screenshot('jspace-chain-mobile');await viewport(1600);await screenshot('jspace-chain-desktop');
 checks.push('Map rename/export/import preserves context with unconfirmed copied links; pilot isolation and workspace restoration work on desktop and mobile');

 await ensureJSpaceMap('Exit finder survey',true);await addNode(home);await addNode(systems.jita);await selectNode(home);await button('Connect','.jspace-workspace-toolbar');
 await nativeSelect('Connection from system',home.system_id);await nativeSelect('Connection to system',systems.jita.system_id);await nativeSelect('Connection maximum ship size','small');await button('Record connection',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 const exitEdge=(await mapState()).connections[0];await selectNode(home);await button('Find an exit','.jspace-workspace-footer');await button('Find destinations','.jspace-destinations');await waitFor("!!document.querySelector('.jspace-destination-empty')");
 assert.ok(await evaluate("document.querySelector('.jspace-destination-empty').textContent.includes('No eligible route')"),'Unconfirmed diagram topology cannot supply an exit route');await closeSheet();
 await selectEdge(exitEdge.id);await button('Edit connection',selected);await toggle('I have verified this connection');await toggle('Allow this verified connection in my routes');await button('Save connection conditions',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
 await selectNode(home);await button('Find an exit','.jspace-workspace-footer');await button('Find destinations','.jspace-destinations');await waitFor("!!document.querySelector('.jspace-destination-empty')");
 await choose('Destination vessel size','Small · frigate / destroyer');await button('Find destinations','.jspace-destinations');await waitFor("Array.from(document.querySelectorAll('.jspace-destination-card h4')).some(e=>e.textContent==='Jita')");
 const exitResult='Array.from(document.querySelectorAll(".jspace-destination-card")).find(e=>e.querySelector("h4")?.textContent==="Jita")';
 assert.equal(await evaluate('('+exitResult+').querySelector(".jspace-destination-hops strong").textContent'),'1','The nearest known high-sec exit is exactly one recorded wormhole jump');
 await clickElement('Array.from(('+exitResult+').querySelectorAll("button")).find(e=>e.textContent.trim()==="Copy route")');await waitFor('document.querySelector("[aria-label=\\"Destination route text\\"]")?.value.includes("Jita")');
 assert.ok(await evaluate('document.querySelector("[aria-label=\\"Destination route text\\"]").value.includes('+JSON.stringify(home.name)+')'));
 assert.equal(JSON.stringify((await api('/universe/navigation?character=42')).itinerary),itinerary,'Finding and copying exits does not replace the saved itinerary');
 await screenshot('jspace-nearest-exit');await closeSheet();
 checks.push('Nearest-exit discovery excludes unconfirmed or unsuitable passages, respects vessel limits and copies an evidenced one-jump route without changing EVE navigation');

 const priorThera=app.store.get('universe:feeds:thera'),observedAt=new Date(Date.now()-60000).toISOString(),reportExpiry=new Date(Date.now()+3600000).toISOString();
 try{
  app.store.set('universe:feeds:thera',{status:'ready',updated_at:new Date().toISOString(),expires_at:reportExpiry,data:[{id:'thera:chain-ui',source:'thera',from_system_id:systems.thera.system_id,to_system_id:home.system_id,from_signature:'THR-111',to_signature:'JSP-222',wh_type:'Z999',observed_at:observedAt,expires_at:reportExpiry,completed:true,reported:true,stale:false,max_ship_size:'large'}]});
  await click('[aria-label="Refresh Universe data"]');await waitFor("document.querySelector('[aria-label=\"Show Thera reports on chain\"] small')?.textContent==='EVE-Scout'");const savedBefore=await mapState();
  await click('[aria-label="Show Thera reports on chain"]');await waitFor("!!document.querySelector('[data-connection-label^=\"public:\"]')");await click('[aria-label="Fit chain"]');await delay(650);
  assert.equal((await mapState()).nodes.length,savedBefore.nodes.length);assert.equal((await mapState()).connections.length,savedBefore.connections.length,'Viewing public reports does not mutate the private map');
  assert.ok(await evaluate('Array.from(document.querySelectorAll('+JSON.stringify(node(systems.thera.system_id)+' .jspace-connection-handle')+')).every(e=>e.disabled)'),'An ephemeral public-only card cannot start a private connection');
  await beginPort(home);const publicDrop=await pointerAt(node(systems.thera.system_id)+' .jspace-node-grab');await movePort(publicDrop);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(node(systems.thera.system_id))+').classList.contains("is-connect-target")'),false,'An ephemeral public card is not offered as a valid private endpoint');
  await releasePort(publicDrop);await waitFor("!document.querySelector('[data-testid=\"jspace-connection-preview\"]')");
  assert.equal((await mapState()).revision,savedBefore.revision,'Dropping a connection on a public-only endpoint does not save a map change');
  const publicId=await evaluate("document.querySelector('[data-connection-label^=\"public:\"]').dataset.connectionLabel");await selectEdge(publicId);await button('Inspect public report',selected);
  assert.ok(await evaluate("document.querySelector('.jspace-sheet').textContent.includes('EVE-Scout / Signal Cartel') && document.querySelector('.jspace-public-facts').textContent.includes('Remaining massUnknown')"));
  assert.ok(await evaluate("document.querySelector('.jspace-source-heading p').textContent.includes('1m ago')"),'New public data refreshes its displayed observation age during active mapping');
  await screenshot('jspace-public-report');await button('Add unconfirmed observation to my map',sheet);await waitFor('!document.querySelector(".jspace-sheet")');
  const adopted=await mapState(),reported=adopted.connections.find(row=>row.from_system_id===systems.thera.system_id&&row.to_system_id===home.system_id);
  assert.ok(reported);assert.equal(reported.confirmed,false);assert.equal(reported.active,false);assert.equal(reported.expires_at,reportExpiry,'Explicit adoption preserves the original reported expiry');
  await click('[aria-label="Show Thera reports on chain"]');await waitFor("!document.querySelector('[data-connection-id^=\"public:\"]')");
  assert.ok(await evaluate('!!document.querySelector('+JSON.stringify('[data-connection-id="'+reported.id+'"]')+')'),'The explicitly adopted private observation remains when the public overlay is hidden');
  const expiringAt=Date.now()+7000;
  app.store.set('universe:feeds:thera',{status:'ready',updated_at:new Date().toISOString(),expires_at:reportExpiry,data:[{id:'thera:ui-expiry',source:'thera',from_system_id:systems.thera.system_id,to_system_id:other.system_id,from_signature:'THR-333',to_signature:'TMP-444',wh_type:'Z999',observed_at:observedAt,expires_at:new Date(expiringAt).toISOString(),completed:true,reported:true,max_ship_size:'large'}]});
  await click('[aria-label="Refresh Universe data"]');await click('[aria-label="Show Thera reports on chain"]');await waitFor("Array.from(document.querySelectorAll('[data-connection-id^=\"public:\"]')).some(e=>e.dataset.connectionId.includes('ui-expiry'))");
  const expiringId=await evaluate("Array.from(document.querySelectorAll('[data-connection-id^=\"public:\"]')).find(e=>e.dataset.connectionId.includes('ui-expiry')).dataset.connectionId");
  let mapRefreshes=0;
  while(Date.now()<expiringAt+450){await click('[aria-label="Refresh Universe data"]');await delay(250);mapRefreshes++;}
  assert.ok(mapRefreshes>=3,'The expiry sample includes repeated workspace refreshes');
  await waitFor('!document.querySelector('+JSON.stringify('[data-connection-id="'+expiringId+'"]')+')');
  assert.equal((await mapState()).connections.length,adopted.connections.length,'Public expiry never removes or creates saved private connections');
  await screenshot('jspace-public-expiry');await click('[aria-label="Show Thera reports on chain"]');
 }finally{if(priorThera===undefined)app.store.db.prepare('DELETE FROM settings WHERE key=?').run('universe:feeds:thera');else app.store.set('universe:feeds:thera',priorThera);await click('[aria-label="Refresh Universe data"]');}
 checks.push('Thera reports show current observation age, expire during repeated workspace refreshes, and support explicit adoption without granting route access');

 await click('[aria-label="Fit chain"]');await delay(650);await selectNode(home);await action(home,'Set route destination');await waitFor("document.querySelector('.jspace-shared-dock')?.hidden===false");
 if(await evaluate("Array.from(document.querySelectorAll('.jspace-shared-dock button')).some(e=>e.textContent.trim()==='Clear saved itinerary')")){await button('Clear saved itinerary','.jspace-shared-dock');await waitFor("!document.querySelector('.universe-itinerary-stops')");}
 await fill('[aria-label="Route origin"]','Jita');await fill('[aria-label="Route destination"]','Perimeter');await button('Calculate route','.jspace-shared-dock');await waitFor("document.querySelector('.universe-route-briefing')?.textContent.includes('Perimeter')");
 await click('.jspace-shared-dock [aria-label="Close details"]');await selectNode(home);await action(home,'Set route destination');await waitFor('document.querySelector(".jspace-shared-dock")?.hidden===false && document.querySelector("[aria-label=\\"Route destination\\"]")?.value==='+JSON.stringify(home.name));
 assert.equal(await evaluate("!!document.querySelector('.universe-route-briefing')"),false,'Choosing a new destination clears the previous briefing immediately');
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.jspace-shared-dock button')).some(e=>e.textContent.trim()==='Send to EVE')"),false,'A stale route never leaves a Send to EVE action visible');
 await space('K-Space');await space('J-Space');await waitFor('document.querySelector("[aria-label=\\"Route destination\\"]")?.value==='+JSON.stringify(home.name));
 assert.equal(await evaluate("!!document.querySelector('.universe-route-briefing')"),false,'Remounting the workspace cannot restore a saved plan for a different destination');await click('.jspace-shared-dock [aria-label="Close details"]');
 checks.push('Closing the planner and choosing a different map destination invalidates prior route results and Send actions, including after navigation remount');
}
