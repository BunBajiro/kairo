// End-to-end acceptance for general-purpose Maps. All mutations below use the
// visible UI; API reads verify that provisional placement never writes early.
import assert from 'node:assert/strict';

export async function mapsExpansionAcceptance(ui) {
 const {api,evaluate,click,clickElement,button,fill,key,waitFor,delay,screenshot,space,ensureJSpaceMap,call,checks}=ui;
 await space('Maps');await ensureJSpaceMap('Constellation operations',true);
 const mapId=await evaluate("document.querySelector('.jspace-workspace').dataset.mapId");
 const state=async()=> (await api('/universe/jspace?character=42')).maps.find(map=>map.id===mapId);
 const settle=async()=>waitFor("document.querySelector('.jspace-workspace-stage')?.getAttribute('aria-busy')==='false' && !document.querySelector('.jspace-saving')");
 const nativeSelect=async(label,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify('[aria-label='+JSON.stringify(label)+']')});if(!Array.from(e.options).some(o=>o.value===${JSON.stringify(String(value))}))throw new Error('Missing select option');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const closeSheet=async()=>{const title=await evaluate("document.querySelector('.jspace-sheet')?.getAttribute('aria-label')");if(title)await click('[aria-label='+JSON.stringify('Close '+title)+']');};
 const reference=await evaluate("(async()=>{const a=await(await fetch('/api/universe/static')).json(),jita=a.systems.find(s=>s.name==='Jita'),group=a.constellations.find(c=>c.constellation_id===jita.constellation_id),members=a.systems.filter(s=>s.constellation_id===jita.constellation_id),ids=new Set(members.map(s=>s.system_id)),gates=a.gates.filter(g=>ids.has(g.from_system_id)&&ids.has(g.to_system_id));return{jita,group,members,gates,region:a.regions.find(r=>r.region_id===jita.region_id)};})()");
 assert.ok(reference.members.length>2&&reference.gates.length>0,'The placement test uses a real multi-system constellation and its gates');
 async function stage(kind,name){await nativeSelect('Add to map',kind);await fill('[aria-label='+JSON.stringify('Find a '+kind+' to add to map')+']',name);await clickElement('Array.from(document.querySelectorAll(".map-add-search [role=option]")).find(e=>e.querySelector("strong")?.textContent==='+JSON.stringify(name)+')');await waitFor('!!document.querySelector(".jspace-placement")');await delay(350);}
 const initial=await state();
 await stage('region',reference.region.name);assert.ok(await evaluate("document.querySelectorAll('.jspace-placement-node').length")>reference.members.length,'Regions can be staged as one larger group');
 await button('Cancel placement','[aria-label="Group placement"]');await waitFor('!document.querySelector(".jspace-placement")');assert.equal((await state()).revision,initial.revision,'Cancelling a region performs no map mutation');
 await stage('constellation',reference.group.name);
 assert.equal(await evaluate("document.querySelectorAll('.jspace-placement-node').length"),reference.members.length);
 assert.equal((await state()).nodes.length,0,'Preview nodes are not saved map nodes');
 const frame=await evaluate("(()=>{const v=document.querySelector('.jspace-map-viewport').getBoundingClientRect();return {viewport:{left:v.left,top:v.top,right:v.right,bottom:v.bottom},nodes:Array.from(document.querySelectorAll('.jspace-placement-node')).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};})};})()");
 assert.ok(frame.nodes.every(r=>r.left>=frame.viewport.left+54&&r.top>=frame.viewport.top+54&&r.right<=frame.viewport.right-54&&r.bottom<=frame.viewport.bottom-54),'The whole provisional group is initially framed: '+JSON.stringify(frame));
 const before=await evaluate("Array.from(document.querySelectorAll('.jspace-placement-node')).map(e=>({system_id:Number(e.dataset.systemId),x:parseFloat(e.style.left),y:parseFloat(e.style.top)}))");
 const grip=await evaluate("(()=>{const e=document.querySelector('.jspace-placement-heading'),r=e.getBoundingClientRect();return{x:r.left+Math.min(60,r.width/2),y:r.top+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...grip});await call('Input.dispatchMouseEvent',{type:'mousePressed',...grip,button:'left',buttons:1,clickCount:1});
 for(const fraction of [.25,.5,.75,1]){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x+80*fraction,y:grip.y+45*fraction,button:'left',buttons:1});await delay(20);}
 assert.equal((await state()).revision,initial.revision,'Dragging a whole staged group is entirely provisional');
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x+80,y:grip.y+45,button:'left',clickCount:1});
 await evaluate("document.querySelector('.jspace-placement-surface').focus()");await key('ArrowRight','ArrowRight',39);
 const placed=await evaluate("Array.from(document.querySelectorAll('.jspace-placement-node')).map(e=>({system_id:Number(e.dataset.systemId),x:parseFloat(e.style.left),y:parseFloat(e.style.top)}))");
 assert.ok(placed[0].x>before[0].x+20&&placed[0].y>before[0].y,'Pointer movement and keyboard nudge both reposition the preview');
 for(let i=1;i<placed.length;i++){assert.ok(Math.abs((placed[i].x-placed[0].x)-(before[i].x-before[0].x))<=1);assert.ok(Math.abs((placed[i].y-placed[0].y)-(before[i].y-before[0].y))<=1);}
 await screenshot('maps-constellation-placement');await button('Confirm placement','[aria-label="Group placement"]');await waitFor('!document.querySelector(".jspace-placement")');await settle();
 const saved=await state();assert.equal(saved.nodes.length,reference.members.length);assert.equal(saved.revision,initial.revision+1,'Group placement commits exactly once');
 for(const node of placed){const stored=saved.nodes.find(row=>row.system_id===node.system_id);assert.ok(stored&&Math.abs(stored.x-node.x)<=1&&Math.abs(stored.y-node.y)<=1,'Confirmed nodes retain the chosen group position');}
 const pairs=new Set(reference.gates.map(g=>[g.from_system_id,g.to_system_id].sort((a,b)=>a-b).join(':')));
 assert.equal(saved.connections.filter(edge=>edge.kind==='gate').length,pairs.size,'Every real internal gate is added once');
 assert.ok(saved.connections.filter(edge=>edge.kind==='gate').every(edge=>!edge.expires_at&&!edge.mass),'Gates do not inherit wormhole lifespan or mass');
 assert.equal(await evaluate("document.querySelectorAll('.jspace-node .jspace-connection-handle').length"),reference.members.length*4,'Every private node exposes four exterior connection tabs');
 checks.push('Region and constellation previews stay provisional, drag and nudge as one group, cancel without writes, then atomically place individual nodes and real internal stargates');

 await click('[aria-label="Fit chain"]');await delay(350);
 const gate=saved.connections.find(edge=>edge.kind==='gate'),gatePath='[data-connection-id='+JSON.stringify(gate.id)+'] .jspace-edge-hit';
 assert.equal(await evaluate("document.querySelectorAll('.jspace-edge-label[data-kind=gate],.jspace-edge-label[data-kind=ansiblex]').length"),0,'Permanent connections have no information badges');
 const gatePoint=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(gatePath)}),matrix=e.getScreenCTM();for(const t of [.5,.4,.6,.3,.7]){const p=e.getPointAtLength(e.getTotalLength()*t).matrixTransform(matrix);if(document.elementFromPoint(p.x,p.y)===e)return{x:p.x,y:p.y};}throw new Error('No exposed stargate segment');})()`);
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...gatePoint,button:'right',buttons:2,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...gatePoint,button:'right',clickCount:1});
 await waitFor("!!document.querySelector('.jspace-map-menu')");assert.equal(await evaluate("!!document.querySelector('.jspace-connection-quick')"),false,'Permanent connection menus contain no lifetime, mass or ship-size controls');
 await button('Edit connection','.jspace-map-menu');await waitFor("!!document.querySelector('.jspace-sheet')");
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Connection type Stargate\"]')?.getAttribute('aria-pressed')"),'true');
 assert.equal(await evaluate("!!document.querySelector('.jspace-sheet [aria-label=\"Connection wormhole type\"],.jspace-sheet [aria-label=\"Lifetime 16h\"],.jspace-sheet [aria-label=\"Mass Normal\"]')"),false);
 await closeSheet();await click('[aria-label="Connect systems"]');await waitFor("!!document.querySelector('.jspace-sheet')");
 await nativeSelect('Connection from system',gate.from_system_id);await nativeSelect('Connection to system',gate.to_system_id);await click('[aria-label="Connection type Ansiblex"]');
 assert.equal(await evaluate("!!document.querySelector('.jspace-sheet [aria-label=\"Connection wormhole type\"]')"),false);
 await button('Record connection','.jspace-sheet');await waitFor('!document.querySelector(".jspace-sheet")');await settle();
 const bridge=(await state()).connections.find(edge=>edge.kind==='ansiblex');assert.ok(bridge&&!bridge.expires_at&&!bridge.mass);
 assert.equal(await evaluate('!!document.querySelector('+JSON.stringify('[data-connection-label='+JSON.stringify(bridge.id)+']')+')'),false,'Ansiblex is drawn as an uninterrupted connection without a badge');
 const bridgePath='[data-connection-id='+JSON.stringify(bridge.id)+'] .jspace-edge-hit';
 assert.match(await evaluate('document.querySelector('+JSON.stringify(bridgePath)+').getAttribute("aria-label")'),/Ansiblex/);
 await evaluate('document.querySelector('+JSON.stringify(bridgePath)+').focus()');await key('Enter','Enter',13,'\r');
 await waitFor('document.querySelector('+JSON.stringify('[data-connection-id='+JSON.stringify(bridge.id)+']')+').classList.contains("is-selected")');
 if(await evaluate("!!document.querySelector('[aria-label=\"Close selected map context\"]')"))await click('[aria-label="Close selected map context"]');
 const unlinkedPair=reference.members.flatMap((a,index)=>reference.members.slice(index+1).map(b=>[a.system_id,b.system_id])).find(pair=>!pairs.has([...pair].sort((a,b)=>a-b).join(':')));assert.ok(unlinkedPair,'The anchor test uses systems with no real stargate');
 const port=(id,side)=>'.jspace-connection-handle[data-system-id="'+id+'"][data-side="'+side+'"]';
 await evaluate('document.querySelector('+JSON.stringify(port(unlinkedPair[0],'top'))+').focus()');await key('Enter','Enter',13,'\r');await evaluate('document.querySelector('+JSON.stringify(port(unlinkedPair[1],'bottom'))+').focus()');await key('Enter','Enter',13,'\r');await settle();
 const drawn=(await state()).connections.find(edge=>edge.kind==='wormhole');assert.ok(drawn);assert.equal(drawn.from_port,'top');assert.equal(drawn.to_port,'bottom');
 assert.ok(await evaluate('!!document.querySelector('+JSON.stringify('[data-connection-label='+JSON.stringify(drawn.id)+']')+')'),'Wormhole condition badges remain available');
 const curve=await evaluate('document.querySelector('+JSON.stringify('[data-connection-id='+JSON.stringify(drawn.id)+'] .jspace-edge-line')+').getAttribute("d")');assert.equal((curve.match(/C/g)||[]).length,1);assert.equal((curve.match(/M/g)||[]).length,1);
 checks.push('Stargates and Ansiblex have distinct permanent visuals and editors without wormhole conditions; keyboard creation from top to bottom tabs preserves both anchors on one continuous curve');

 const jita=reference.jita;
 await click('[aria-label='+JSON.stringify('Actions for '+jita.name)+']');await button('System details','.jspace-map-menu');await button('Notes','[aria-label="System tools"]');
 await fill('[aria-label="J-Space field note"]','Aurora convoy assembly at this entrance');await button('Save note','.jspace-notebook');await settle();
 await fill('[aria-label="J-Space field note"]','Fuel delivery scheduled after downtime');await button('Save note','.jspace-notebook');await settle();
 assert.equal(await evaluate("document.querySelectorAll('.jspace-note').length"),2);
 assert.equal(await evaluate("document.querySelector('.jspace-note-attribution strong')?.textContent"),'Atlas Alpha');assert.equal(await evaluate("document.querySelector('.jspace-note-portrait')?.dataset.authorId"),'42');assert.match(await evaluate("document.querySelector('.jspace-note-attribution time').textContent"),/^\d+ min ago$/);
 await fill('[aria-label="Search notes"]','Aurora');assert.equal(await evaluate("document.querySelectorAll('.jspace-note').length"),1);assert.match(await evaluate("document.querySelector('.jspace-note-body').textContent"),/Aurora convoy/);await screenshot('maps-field-notes');await closeSheet();
 await click('[aria-label="Back to J-Space maps"]');await waitFor("!!document.querySelector('.jspace-welcome')");assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Find system\"]')"),false);
 await fill('[aria-label="Search maps"]','Jita');await clickElement('Array.from(document.querySelectorAll("[aria-label=\\"Systems in your maps\\"] [role=option]")).find(e=>e.textContent.includes("Constellation operations")&&e.textContent.includes("Jita"))');
 await waitFor('document.querySelector(".jspace-workspace")?.dataset.mapId==='+JSON.stringify(mapId)+' && !!document.querySelector(".jspace-sheet [aria-label=\\"System tools\\"]")');assert.ok(await evaluate('document.querySelector('+JSON.stringify('.jspace-node[data-system-id="'+jita.system_id+'"]')+').classList.contains("is-selected")'));
 await closeSheet();await click('[aria-label="Back to J-Space maps"]');await fill('[aria-label="Search maps"]','Aurora');await button('Notes','[aria-label="Search in maps"]');
 await clickElement('Array.from(document.querySelectorAll("[aria-label=\\"Notes in your maps\\"] [role=option]")).find(e=>e.textContent.includes("Constellation operations")&&e.textContent.includes("Aurora convoy"))');
 await waitFor('document.querySelector(".jspace-workspace")?.dataset.mapId==='+JSON.stringify(mapId)+' && !!document.querySelector(".jspace-notebook")');assert.ok(await evaluate("document.querySelector('.jspace-note-list').textContent.includes('Aurora convoy')"));await screenshot('maps-search-note-destination');await closeSheet();
 checks.push('Pilot-attributed notes show portraits and EVE-relative times, filter within a system, and landing searches open the exact map instance with system details or matching notes');
}
