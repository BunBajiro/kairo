import assert from 'node:assert/strict';

// Focused follow-up probes: real HTTP/SQLite owners, with transport timing held
// only at the browser boundary. These intentionally need the hosted UI runner.
async function navigate(page,id){
 if(!await page.locator('[data-route="'+id+'"]:visible').count())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();
 await page.locator('[data-route="'+id+'"]:visible').first().click();
}
async function ready(page,app){await page.goto(app.origin+'/#opsec',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});await page.locator('.page-transition').waitFor();}
const responseFor=(path,method='PUT')=>response=>new URL(response.url()).pathname==='/api/'+path&&response.request().method()===method;
async function bounded(page,promise){return Promise.race([promise,page.waitForTimeout(10000).then(()=>{throw new Error('Focused UI ownership gate did not complete.');})]);}

export async function opsecAcceptedNavigation({page,app,check,frame,deferred,dirtyRemount=false}){
 const original={manual:false,allowHighsec:true,characterId:42,blueAlliances:[91],hostileAlliances:[92]};
 app.store.set('opsec',original);
 app.store.db.prepare('UPDATE characters SET scopes=? WHERE id=42').run(JSON.stringify(['esi-location.read_location.v1']));
 const fresh=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
 app.store.saveSnapshot(42,'location',fresh({solar_system_id:30000142,system:{security_status:1,region_id:10000002}}));app.store.saveSnapshot(0,'fw',fresh([]));app.store.saveSnapshot(0,'sovereignty',fresh([]));app.core.refreshOPSEC();
 const gate={seen:deferred(),release:deferred(),done:deferred(),entered:false};let hold=true,failNext=false;const writes=[];
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();writes.push(route.request().postDataJSON());
  if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic protection save failure'})});}
  if(!hold)return route.continue();hold=false;gate.entered=true;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}finally{gate.done.resolve();}
 };
 await page.route(app.origin+'/api/opsec',handler);
 const manual=page.getByRole('switch',{name:'Force protection on',exact:true}),blue=page.getByRole('textbox',{name:'Blue alliance IDs',exact:true}),save=page.getByRole('button',{name:'Save protection rules',exact:true});
 const settle=async()=>{await page.waitForFunction(()=>{const control=document.querySelector('[role=switch][aria-label="Force protection on"]');return control&&!control.disabled;});await frame();};
 const send=async(status=200)=>{const pending=page.waitForResponse(responseFor('opsec'));await save.click();const response=await pending;assert.equal(response.status(),status);await response.finished();await settle();};
 try{
  await ready(page,app);
  check('Cold manual control agrees with saved released High-Sec policy',{manual:await manual.getAttribute('aria-checked'),saved:app.store.get('opsec'),hidden:app.core.stream.state().opsec.hidden},{manual:'false',saved:original,hidden:false});
  await manual.click();await bounded(page,gate.seen.promise);
  check('Held manual acknowledgement follows actual persistence and cover activation',{saved:app.store.get('opsec').manual,hidden:app.core.stream.state().opsec.hidden,busy:await manual.isDisabled()},{saved:true,hidden:true,busy:true});
  await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();await navigate(page,'opsec');await manual.waitFor();
  if(dirtyRemount)await blue.fill('321');
  // The retired editor reloads bootstrap only after its accepted PUT settles.
  // Wait through that real recovery, rather than assuming a frame means it ran.
  const bootstrap=page.waitForResponse(responseFor('bootstrap','GET'));
  gate.release.resolve();await bounded(page,gate.done.promise);assert.equal((await bootstrap).status(),200);
  await page.getByText('Broadcast protection updated.',{exact:true}).waitFor();await frame();
  check(dirtyRemount?'Accepted manual acknowledgement synchronizes manual state beside a newer policy draft':'Accepted manual acknowledgement synchronizes a clean OPSEC remount',await manual.getAttribute('aria-checked'),'true');
  if(dirtyRemount)check('Manual acknowledgement preserves a newer remount policy draft',{draft:await blue.inputValue(),saved:app.store.get('opsec').blueAlliances},{draft:'321',saved:[91]});
  check('Unrelated policy fields survive the accepted manual command',app.store.get('opsec'),{...original,manual:true});
  await blue.fill('123');await send();
  check('Saving another policy field after remount retains accepted manual protection',app.store.get('opsec'),{...original,manual:true,blueAlliances:[123]});
  check('An unrelated policy save cannot release accepted manual covers',app.core.stream.state().opsec.hidden,true);
  // Keep current failure/retry controls meaningful even on a failing baseline.
  const beforeFailure=app.store.get('opsec');await blue.fill('456');failNext=true;await send(503);
  check('Current policy failure retains durable state and the retry draft',{saved:app.store.get('opsec'),draft:await blue.inputValue(),retryable:await save.isEnabled()},{saved:beforeFailure,draft:'456',retryable:true});
  await send();
  check('Explicit policy retry persists its retained draft',app.store.get('opsec').blueAlliances,[456]);
  check('Navigation and acknowledgement add no protection commands',writes.length,4);
 }finally{gate.release.resolve();if(gate.entered)await bounded(page,gate.done.promise);await page.unroute(app.origin+'/api/opsec',handler);}
}

export const opsecDirtyAcceptedNavigation=context=>opsecAcceptedNavigation({...context,dirtyRemount:true});

// A policy save can be accepted by a remount before the prior manual command's
// acknowledgement arrives. Its captured policy must not become a manual command.
export async function opsecQueuedPolicyNavigation({page,app,check,frame,deferred}){
 const original={manual:false,allowHighsec:true,characterId:42,blueAlliances:[91],hostileAlliances:[92]};
 app.store.set('opsec',original);
 app.store.db.prepare('UPDATE characters SET scopes=? WHERE id=42').run(JSON.stringify(['esi-location.read_location.v1']));
 const fresh=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
 app.store.saveSnapshot(42,'location',fresh({solar_system_id:30000142,system:{security_status:1,region_id:10000002}}));app.store.saveSnapshot(0,'fw',fresh([]));app.store.saveSnapshot(0,'sovereignty',fresh([]));app.core.refreshOPSEC();
 const gate={seen:deferred(),release:deferred(),done:deferred(),entered:false};const writes=[];let hold=true;
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();writes.push(route.request().postDataJSON());
  if(!hold)return route.continue();hold=false;gate.entered=true;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}finally{gate.done.resolve();}
 };
 await page.route(app.origin+'/api/opsec',handler);
 const manual=page.getByRole('switch',{name:'Force protection on',exact:true}),blue=page.getByRole('textbox',{name:'Blue alliance IDs',exact:true}),save=page.getByRole('button',{name:'Save protection rules',exact:true});
 try{
  await ready(page,app);await manual.click();await bounded(page,gate.seen.promise);
  check('Held manual acknowledgement already protects the real broadcast',{manual:app.store.get('opsec').manual,hidden:app.core.stream.state().opsec.hidden},{manual:true,hidden:true});
  await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();await navigate(page,'opsec');await blue.waitFor();
  await blue.fill('123');const policy=page.waitForResponse(response=>responseFor('opsec')(response)&&Object.keys(response.request().postDataJSON()).some(key=>key!=='manual'));await save.click();await frame();
  check('A newer explicit policy save waits behind the held manual command',{writes:writes.length,busy:await save.isDisabled(),manual:app.store.get('opsec').manual},{writes:1,busy:true,manual:true});
  gate.release.resolve();await bounded(page,gate.done.promise);const response=await bounded(page,policy);assert.equal(response.status(),200);await response.finished();
  await page.waitForFunction(()=>{const control=document.querySelector('[role=switch][aria-label="Force protection on"]');return control&&!control.disabled;});await frame();
  check('A policy submitted before manual acknowledgement preserves accepted protection',app.store.get('opsec'),{...original,manual:true,blueAlliances:[123]});
  check('A queued policy save cannot release manually protected broadcast output',app.core.stream.state().opsec.hidden,true);
  check('The current editor agrees with the accepted manual and policy state',{manual:await manual.getAttribute('aria-checked'),blue:await blue.inputValue()},{manual:'true',blue:'123'});
  check('Only the two explicit protection commands reach HTTP',writes.length,2);
 }finally{gate.release.resolve();if(gate.entered)await bounded(page,gate.done.promise);await page.unroute(app.origin+'/api/opsec',handler);}
}

export async function obsAcceptedNavigation({page,context,app,check,frame,deferred}){
 const initial=app.core.obs.config();assert.equal(initial.enabled,false);
 const gate={seen:deferred(),release:deferred(),done:deferred(),entered:false},newerGate={done:deferred(),entered:false};let hold=true,failNext=false;const writes=[];
 await context.addInitScript(()=>{
  const native=window.fetch;window.__focusedOBSWrites=[];
  window.fetch=function(input,options){if(String(input)==='/api/obs'&&options?.method==='PUT')window.__focusedOBSWrites.push(JSON.parse(options.body).port);return native.apply(this,arguments);};
 });
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();writes.push(route.request().postDataJSON());
  if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic OBS save failure'})});}
  if(route.request().postDataJSON().port===4477){newerGate.entered=true;try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{newerGate.done.resolve();}return;}
  if(!hold)return route.continue();hold=false;gate.entered=true;
  try{gate.seen.resolve();await gate.release.promise;const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{gate.done.resolve();}
 };
 await page.route(app.origin+'/api/obs',handler);
 const port=page.getByRole('spinbutton',{name:'Local WebSocket port',exact:true}),save=page.getByRole('button',{name:'Save connection',exact:true});
 const settle=async()=>{await page.waitForFunction(()=>{const button=[...document.querySelectorAll('.obs-controls button')].find(button=>button.textContent==='Save connection');return button&&!button.disabled;});await frame();};
 const send=async(status=200)=>{const pending=page.waitForResponse(responseFor('obs'));await save.click();const response=await pending;assert.equal(response.status(),status);await response.finished();await settle();};
 try{
  await ready(page,app);await port.waitFor();
  check('Cold OBS editor shows the saved disconnected configuration',{port:await port.inputValue(),enabled:app.core.obs.config().enabled},{port:String(initial.port),enabled:false});
  await port.fill('4466');await save.click();await bounded(page,gate.seen.promise);
  check('Held OBS transport has not persisted and its current editor is busy',{port:app.core.obs.config().port,busy:await save.isDisabled()},{port:initial.port,busy:true});
  await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();await navigate(page,'opsec');await port.waitFor();
  await port.fill('4477');const newer=page.waitForResponse(response=>responseFor('obs')(response)&&response.request().postDataJSON().port===4477);await save.click();await frame();
  // Observe actual fetch admission: before correction the newer write must have
  // persisted before releasing the older one. A corrected queue admits it later.
  const admitted=await page.evaluate(()=>window.__focusedOBSWrites.slice());assert.equal(admitted[0],4466);
  if(admitted.length>1){await bounded(page,newerGate.done.promise);assert.equal(app.core.obs.config().port,4477);}
  const older=page.waitForResponse(response=>responseFor('obs')(response)&&response.request().postDataJSON().port===4466);
  gate.release.resolve();await bounded(page,gate.done.promise);assert.equal((await older).status(),200);assert.equal((await newer).status(),200);await settle();
  check('Accepted OBS writes retain order across editor remounts',app.core.obs.config().port,4477);
  check('The active OBS editor displays its newest accepted port',await port.inputValue(),'4477');
  check('Disabled OBS saves do not connect or arm automation',{enabled:app.core.obs.config().enabled,automation:app.core.obs.config().automation,connected:app.core.obs.status().connected},{enabled:false,automation:false,connected:false});
  const beforeFailure=app.core.obs.config();await port.fill('4488');failNext=true;await send(503);
  check('Current OBS failure preserves durable settings and its retry draft',{saved:app.core.obs.config(),draft:await port.inputValue(),retryable:await save.isEnabled()},{saved:beforeFailure,draft:'4488',retryable:true});
  await send();
  check('Explicit OBS retry persists its retained draft',app.core.obs.config().port,4488);
  await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();await navigate(page,'opsec');await port.waitFor();
  check('OBS remount after acknowledged retry reads current saved configuration',await port.inputValue(),'4488');
  check('Only explicit OBS saves reach HTTP',writes.map(write=>write.port),[4466,4477,4488,4488]);
 }finally{gate.release.resolve();await bounded(page,Promise.all([...(gate.entered?[gate.done.promise]:[]),...(newerGate.entered?[newerGate.done.promise]:[])]));await page.unroute(app.origin+'/api/obs',handler);}
}
