import assert from 'node:assert/strict';
import {defaultStream} from '../server/stream.mjs';

async function navigate(page,id){
 if(!await page.locator('[data-route="'+id+'"]:visible').count())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();
 await page.locator('[data-route="'+id+'"]:visible').first().click();
}
const put=(response,path)=>new URL(response.url()).pathname==='/api/'+path&&response.request().method()==='PUT';
async function ready(page,app,route){await page.goto(app.origin+'/#'+route,{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});await page.locator('.page-transition').waitFor();}

// Manual protection is an immediate command. Other editable policy fields must
// remain drafts until the explicit policy Save, even when they would reveal covers.
export async function opsecManualDraftIsolation({page,app,check,frame}){
 const original={manual:false,allowHighsec:false,characterId:42,blueAlliances:[91],hostileAlliances:[92]};
 app.store.set('opsec',original);
 for(const id of [42,43])app.store.db.prepare('UPDATE characters SET scopes=? WHERE id=?').run(JSON.stringify(['esi-location.read_location.v1']),id);
 const fresh=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
 const location=()=>{for(const id of [42,43])app.store.saveSnapshot(id,'location',fresh({solar_system_id:30000142,system:{security_status:1,region_id:10000002}}));app.store.saveSnapshot(0,'fw',fresh([]));app.store.saveSnapshot(0,'sovereignty',fresh([]));app.core.refreshOPSEC();};
 location();assert.equal(app.core.stream.state().opsec.hidden,true);
 let failed=false;const writes=[];
 const handler=async route=>{if(route.request().method()!=='PUT')return route.fallback();writes.push(route.request().postDataJSON());if(failed){failed=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic protection save failure'})});}return route.continue();};
 await page.route(app.origin+'/api/opsec',handler);
 const highsec=page.getByRole('switch',{name:'Release covers in High-Sec',exact:true}),manual=page.getByRole('switch',{name:'Force protection on',exact:true}),save=page.getByRole('button',{name:'Save protection rules',exact:true});
 const draft=async()=>({highsec:await highsec.getAttribute('aria-checked'),pilot:(await page.getByRole('combobox',{name:'Protected character',exact:true}).textContent()).trim(),blue:await page.getByRole('textbox',{name:'Blue alliance IDs',exact:true}).inputValue(),hostile:await page.getByRole('textbox',{name:'Hostile alliance IDs',exact:true}).inputValue()});
 const send=async(button,status=200)=>{location();const pending=page.waitForResponse(value=>put(value,'opsec'));await button.click();const response=await pending;assert.equal(response.status(),status);await response.finished();await page.waitForFunction(()=>{const control=document.querySelector('[role=switch][aria-label="Force protection on"]');return control&&!control.disabled;});await frame();};
 try{
  await ready(page,app,'opsec');
  check('Cold OPSEC reads its saved manual/cover policy',{manual:await manual.getAttribute('aria-checked'),highsec:await highsec.getAttribute('aria-checked')},{manual:'false',highsec:'false'});
  await highsec.click();await page.getByRole('combobox',{name:'Protected character',exact:true}).click();await page.getByRole('option',{name:'Audit Beta',exact:true}).click();
  await page.getByRole('textbox',{name:'Blue alliance IDs',exact:true}).fill('111');await page.getByRole('textbox',{name:'Hostile alliance IDs',exact:true}).fill('222');
  check('Editing policy does not persist or reveal covers',{saved:app.store.get('opsec'),hidden:app.core.stream.state().opsec.hidden},{saved:original,hidden:true});
  const expectedDraft={highsec:'true',pilot:'Audit Beta',blue:'111',hostile:'222'};
  await send(manual);
  check('Force on persists only the immediate manual choice',app.store.get('opsec'),{...original,manual:true});
  check('Force on leaves every policy draft editable and unchanged',await draft(),expectedDraft);
  check('Force on publishes covered manual output',app.core.stream.state().opsec,{state:'manual',hidden:true});
  await send(manual);
  check('Force off retains the last explicitly saved policy',app.store.get('opsec'),original);
  check('An unsaved High-Sec release draft cannot uncover broadcast output',app.core.stream.state().opsec,{state:'highsec',hidden:true});
  check('Force off preserves the unsaved policy draft',await draft(),expectedDraft);
  await send(save);
  check('Explicit policy Save accepts all policy draft fields',app.store.get('opsec'),{manual:false,allowHighsec:true,characterId:43,blueAlliances:[111],hostileAlliances:[222]});
  check('Explicit saved release can uncover verified High-Sec',app.core.stream.state().opsec,{state:'highsec',hidden:false});
  // Failure and retry remain explicit; a rejected manual command does not consume
  // a different unsaved draft or mutate the persisted release policy.
  await highsec.click();failed=true;await send(manual,503);
  check('Failed force-on leaves the saved manual state unchanged',app.store.get('opsec').manual,false);
  check('Failed force-on preserves the unsaved cover-policy edit',await highsec.getAttribute('aria-checked'),'false');
  await send(manual);
  check('Manual retry preserves the accepted policy and newest local draft',{manual:app.store.get('opsec').manual,savedRelease:app.store.get('opsec').allowHighsec,draftRelease:await highsec.getAttribute('aria-checked')},{manual:true,savedRelease:true,draftRelease:'false'});
  check('Only five explicit protection commands are sent',writes.length,5);
 }finally{await page.unroute(app.origin+'/api/opsec',handler);}
}

// This normal navigation is deliberately in the same document. A cold reload
// refreshes bootstrap and would hide the stale saved-layout remount defect.
export async function studioSavedNavigation({page,app,check,frame}){
 const config=defaultStream();config.elements=[{id:'audit-text',kind:'text',name:'Audit text',text:'Initial saved text',label:'Initial label',x:80,y:80,width:400,height:100,fontSize:24,opacity:.7,color:'#97ebce',visible:true,binding:'none'}];app.core.stream.save(config);
 const writes=[];let failNext=false;
 const handler=async route=>{if(route.request().method()!=='PUT')return route.fallback();writes.push(route.request().postDataJSON());if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic Studio save failure'})});}return route.continue();};
 await page.route(app.origin+'/api/stream',handler);
 const editor=page.locator('.inspector textarea'),label=page.getByRole('textbox',{name:'Label',exact:true}),save=page.locator('.studio-toolbar').getByRole('button',{name:'Save changes',exact:true});
 const saved=()=>{const e=app.core.stream.config().elements[0];return {text:e.text,label:e.label};};
 const publicCopy=()=>{const e=app.core.stream.state().elements[0];return {text:e.text,label:e.label};};
 const settle=async(status=200)=>{const pending=page.waitForResponse(value=>put(value,'stream'));await save.click();const response=await pending;assert.equal(response.status(),status);await response.finished();await page.waitForFunction(()=>![...document.querySelectorAll('.studio-toolbar button')].some(button=>button.textContent==='Saving…'));await frame();};
 const returnToStudio=async()=>{await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();await navigate(page,'studio');await page.getByRole('button',{name:'Audit text',exact:true}).click();await editor.waitFor();};
 try{
  await ready(page,app,'studio');await page.getByRole('button',{name:'Audit text',exact:true}).click();
  check('Cold Studio displays its actual saved layout',await editor.inputValue(),'Initial saved text');
  await editor.fill('Accepted first text');await settle();
  check('Studio Save persists and broadcasts accepted content',{saved:saved(),public:publicCopy()},{saved:{text:'Accepted first text',label:'Initial label'},public:{text:'Accepted first text',label:'Initial label'}});
  await returnToStudio();
  check('Ordinary navigation remounts the last accepted Studio layout',await editor.inputValue(),'Accepted first text');
  check('Remounted Studio clean status agrees with persisted content',{clean:await save.isDisabled(),text:await editor.inputValue()},{clean:true,text:saved().text});
  await label.fill('Accepted second label');await settle();
  check('Saving another field after remount does not roll back prior accepted text',saved(),{text:'Accepted first text',label:'Accepted second label'});
  check('Public output retains previously approved content after remount save',publicCopy(),{text:'Accepted first text',label:'Accepted second label'});
  // Current failure/retry uses the real save path and must not be hidden behind
  // an earlier stale-layout assertion; retain healthy controls on the baseline.
  await editor.fill('Recovered final text');failNext=true;const beforeFailure=saved();await settle(503);
  check('Failed Studio save preserves both durable state and retry draft',{saved:saved(),draft:await editor.inputValue(),retryable:await save.isEnabled()},{saved:beforeFailure,draft:'Recovered final text',retryable:true});
  await settle();
  check('Studio explicit retry persists the retained draft',saved(),{text:'Recovered final text',label:'Accepted second label'});
  await returnToStudio();
  check('Navigation after retry observes its accepted layout',await editor.inputValue(),'Recovered final text');
  check('Navigation adds no speculative stream writes',writes.length,4);
 }finally{await page.unroute(app.origin+'/api/stream',handler);}
}

// Accepted layout ownership also crosses an in-flight acknowledgement and a
// stale bootstrap. Unrelated bootstrap metadata must remain publishable.
export async function studioAcceptedOwnership({page,app,check,frame,deferred}){
 const config=defaultStream();config.elements=[{id:'audit-owner',kind:'text',name:'Audit owner',text:'Owner initial',label:'',x:80,y:80,width:400,height:100,fontSize:24,opacity:.7,color:'#97ebce',visible:true,binding:'none'}];app.core.stream.save(config);
 const gates=new Set(),writes=[];let held=null,bootstrapHeld=null;
 const wait=promise=>Promise.race([promise,page.waitForTimeout(10000).then(()=>{throw new Error('Studio accepted-owner gate did not complete.');})]);
 const hold=(text,before=false)=>{const gate={text,before,seen:deferred(),release:deferred(),done:deferred(),entered:false};gates.add(gate);held=gate;return gate;};
 const writeHandler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();const body=route.request().postDataJSON();writes.push(body.elements[0].text);
  const gate=held;if(!gate)return route.continue();held=null;gate.entered=true;
  try{if(gate.before){gate.seen.resolve();await gate.release.promise;}const response=await route.fetch();assert.equal(response.status(),200);if(!gate.before){gate.seen.resolve();await gate.release.promise;}await route.fulfill({response});}
  finally{gate.done.resolve();}
 };
 const bootstrapHandler=async route=>{
  const gate=bootstrapHeld;if(!gate)return route.fallback();bootstrapHeld=null;gate.entered=true;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.body=await response.json();gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}
  finally{gate.done.resolve();}
 };
 await page.route(app.origin+'/api/stream',writeHandler);await page.route(app.origin+'/api/bootstrap',bootstrapHandler);
 const editor=page.locator('.inspector textarea'),save=page.locator('.studio-toolbar').getByRole('button',{name:/^Save changes$|^Saving…$/});
 const open=async()=>{await navigate(page,'studio');await page.getByRole('button',{name:'Audit owner',exact:true}).click();await editor.waitFor();};
 const away=async()=>{await navigate(page,'overview');await page.getByRole('heading',{name:'Command centre',exact:true}).waitFor();};
 const settle=async()=>{await page.waitForFunction(()=>![...document.querySelectorAll('.studio-toolbar button')].some(button=>button.textContent==='Saving…'));await frame();};
 const release=async gate=>{const finished=page.waitForEvent('requestfinished',{predicate:req=>new URL(req.url()).pathname==='/api/stream'&&req.method()==='PUT'&&req.postDataJSON().elements[0].text===gate.text});gate.release.resolve();await wait(gate.done.promise);await finished;await frame();};
 try{
  await ready(page,app,'studio');await page.getByRole('button',{name:'Audit owner',exact:true}).click();
  await editor.fill('Accepted while editor away');const clean=hold('Accepted while editor away');await save.click();await wait(clean.seen.promise);
  assert.equal(app.core.stream.config().elements[0].text,clean.text,'Held acknowledgement follows real persistence');
  await away();await open();await release(clean);
  check('An accepted earlier save refreshes a clean Studio remount',await editor.inputValue(),clean.text);
  check('The clean remount acknowledgement remains clean',await save.isDisabled(),true);

  await editor.fill('Accepted before newer remount draft');const dirty=hold('Accepted before newer remount draft');await save.click();await wait(dirty.seen.promise);
  await away();await open();await editor.fill('Newer independent draft');await release(dirty);
  check('An accepted earlier save cannot replace a dirty remount draft',await editor.inputValue(),'Newer independent draft');
  check('The newer remount draft remains explicitly saveable',await save.isEnabled(),true);
  let response=page.waitForResponse(value=>put(value,'stream'));await save.click();assert.equal((await response).status(),200);await settle();
  check('Explicit save persists the independent newer draft',app.core.stream.config().elements[0].text,'Newer independent draft');

  await editor.fill('Older accepted transport');const transport=hold('Older accepted transport',true);await save.click();await wait(transport.seen.promise);
  check('A held Stream command has not crossed persistence',app.core.stream.config().elements[0].text,'Newer independent draft');
  await away();await open();await editor.fill('Newest accepted transport');
  const newest=page.waitForResponse(value=>put(value,'stream')&&value.request().postDataJSON().elements[0].text==='Newest accepted transport');await save.click();await frame();
  // The old implementation may already have persisted the newer write; the
  // corrected shell queues it. Neither branch requires sleeping for admission.
  await release(transport);assert.equal((await newest).status(),200);await settle();
  check('Accepted Stream writes retain order across remounts',app.core.stream.config().elements[0].text,'Newest accepted transport');
  check('The active editor receives its newest accepted layout',await editor.inputValue(),'Newest accepted transport');

  await navigate(page,'modules');const training=page.getByRole('switch',{name:'Enable Training & clones',exact:true});await training.waitFor();assert.equal(await training.getAttribute('aria-checked'),'true');
  const bootstrap={seen:deferred(),release:deferred(),done:deferred(),entered:false};gates.add(bootstrap);bootstrapHeld=bootstrap;
  await training.click();await wait(bootstrap.seen.promise);assert.equal(bootstrap.body.modules.find(module=>module.id==='training').enabled,false);
  assert.equal(bootstrap.body.stream.elements[0].text,'Newest accepted transport');
  await open();await editor.fill('Accepted after bootstrap began');response=page.waitForResponse(value=>put(value,'stream'));await save.click();assert.equal((await response).status(),200);await settle();
  const finished=page.waitForEvent('requestfinished',{predicate:req=>new URL(req.url()).pathname==='/api/bootstrap'});bootstrap.release.resolve();await wait(bootstrap.done.promise);await finished;await frame();
  check('A stale bootstrap stream field cannot roll back accepted Studio content',await editor.inputValue(),'Accepted after bootstrap began');
  await navigate(page,'modules');await training.waitFor();
  check('Stream acknowledgement preserves unrelated accepted bootstrap metadata',await training.getAttribute('aria-checked'),'false');
  await open();
  check('Saved layout remains current after the older bootstrap and another remount',await editor.inputValue(),'Accepted after bootstrap began');
  check('Ownership guards add no speculative Stream writes',writes,['Accepted while editor away','Accepted before newer remount draft','Newer independent draft','Older accepted transport','Newest accepted transport','Accepted after bootstrap began']);
 }finally{
  for(const gate of gates)gate.release.resolve();await wait(Promise.all([...gates].filter(gate=>gate.entered).map(gate=>gate.done.promise)));
  await page.unroute(app.origin+'/api/stream',writeHandler);await page.unroute(app.origin+'/api/bootstrap',bootstrapHandler);
 }
}
