import assert from 'node:assert/strict';

// Drive the actual goal owner while one accepted create response is delayed.
// A second editor is a new intent, even when the pilot/resource is unchanged.
export async function goalCreateOwnership({page,app,check,frame,deferred}) {
 const prefix='Fourth-pass objective '+Date.now(),titles={first:prefix+' first',newer:prefix+' newer',retry:prefix+' retry',obsolete:prefix+' obsolete',last:prefix+' last'};
 const writes=[],gates=new Set();let next=null,failNext=false;
 const stored=title=>app.store.db.prepare('SELECT title,target,progress,done FROM goals WHERE character_id=42 AND title=?').all(title).map(row=>({...row}));
 const goalRequest=response=>new URL(response.url()).pathname==='/api/goals'&&response.request().method()==='POST';
 const handler=async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const body=route.request().postDataJSON();writes.push({title:body.title,target:body.target});
  if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic current objective failure'})});}
  const gate=next;next=null;
  if(!gate)return route.continue();
  gate.entered=true;
  try{
   let response;
   if(!gate.failure){response=await route.fetch();assert.equal(response.status(),201);}
   gate.seen.resolve();await gate.release.promise;
   if(gate.failure)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic obsolete objective failure'})});
   else await route.fulfill({response});
  }catch(error){gate.error=error;gate.seen.resolve();await route.abort().catch(()=>{});}
  finally{gate.done.resolve();gates.delete(gate);}
 };
 await page.route(app.origin+'/api/goals?*',handler);
 const wait=promise=>Promise.race([promise,page.waitForTimeout(10000).then(()=>{throw new Error('Objective create response gate did not complete.');})]);
 const dialog=page.locator('.goal-create-dialog');
 const titleInput=()=>dialog.getByRole('textbox',{name:'Objective name',exact:true});
 const targetInput=()=>dialog.getByRole('spinbutton',{name:'Target amount',exact:true});
 const create=()=>dialog.getByRole('button',{name:'Create objective',exact:true});
 const draft=async()=>await dialog.isVisible()?{open:true,title:await titleInput().inputValue(),target:await targetInput().inputValue()}: {open:false,title:null,target:null};
 const open=async(title,target)=>{await page.getByRole('button',{name:'New objective',exact:true}).click();await titleInput().fill(title);await targetInput().fill(String(target));};
 const close=async()=>{await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});};
 const hold=failure=>{const gate={failure,seen:deferred(),release:deferred(),done:deferred()};gates.add(gate);next=gate;return gate;};
 const saveCurrent=async()=>{const response=page.waitForResponse(goalRequest);await create().click();assert.equal((await response).status(),201);await dialog.waitFor({state:'detached'});await frame();};
 try{
  await page.goto(app.origin+'/#goals',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.connection-status.online').waitFor({state:'attached'});
  await open(titles.first,3);const success=hold(false);await create().click();await wait(success.seen.promise);if(success.error)throw success.error;
  // The actual accepted objective exists before its acknowledgement is released.
  check('The accepted first objective is durably created once',stored(titles.first),[{title:titles.first,target:3,progress:0,done:0}]);
  await page.locator('.goal-card h3').filter({hasText:titles.first}).waitFor();
  await close();await open(titles.newer,7);
  check('A new editor accepts a distinct draft while the older response is held',await draft(),{open:true,title:titles.newer,target:'7'});
  const progressRead=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/goals'&&r.request().method()==='GET');
  success.release.resolve();await wait(success.done.promise);assert.equal((await progressRead).status(),200);await frame();
  check('An older successful Create cannot close the newly opened objective draft',await draft(),{open:true,title:titles.newer,target:'7'});
  check('The unsaved newer draft has not created an extra objective',stored(titles.newer),[]);
  // Repair only the exercised old behavior so healthy controls also run before fix.
  if(!await dialog.isVisible())await open(titles.newer,7);
  check('The current objective draft remains saveable after the older response',await create().isEnabled(),true);
  await saveCurrent();
  check('Explicit Create saves the newer objective and closes its own editor',stored(titles.newer),[{title:titles.newer,target:7,progress:0,done:0}]);

  await open(titles.retry,9);failNext=true;let response=page.waitForResponse(goalRequest);await create().click();assert.equal((await response).status(),503);await frame();
  check('A current create failure is reported to the user',await page.getByText('Synthetic current objective failure',{exact:true}).count(),1);
  check('A current create failure preserves the editable draft',await draft(),{open:true,title:titles.retry,target:'9'});
  check('A current create failure releases its Save control',await create().isEnabled(),true);
  check('A current create failure does not persist an objective',stored(titles.retry),[]);
  await saveCurrent();check('Retrying the current create saves exactly once',stored(titles.retry),[{title:titles.retry,target:9,progress:0,done:0}]);

  await open(titles.obsolete,4);const failure=hold(true);await create().click();await wait(failure.seen.promise);if(failure.error)throw failure.error;await close();await open(titles.last,11);
  response=page.waitForResponse(goalRequest);failure.release.resolve();await wait(failure.done.promise);assert.equal((await response).status(),503);await frame();
  check('An obsolete create failure leaves the newer objective draft intact',await draft(),{open:true,title:titles.last,target:'11'});
  check('An obsolete create failure does not report an error over the new draft',await page.getByText('Synthetic obsolete objective failure',{exact:true}).count(),0);
  check('A rejected obsolete create never persists an objective',stored(titles.obsolete),[]);
  await saveCurrent();check('The current editor remains usable after an obsolete failure',stored(titles.last),[{title:titles.last,target:11,progress:0,done:0}]);
  check('Every accepted create intent performs exactly one POST',writes,[{title:titles.first,target:3},{title:titles.newer,target:7},{title:titles.retry,target:9},{title:titles.retry,target:9},{title:titles.obsolete,target:4},{title:titles.last,target:11}]);
 }finally{
  for(const gate of gates)gate.release.resolve();let timer;
  try{await Promise.race([Promise.all([...gates].filter(gate=>gate.entered).map(gate=>gate.done.promise)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Goal create response cleanup timed out.')),10000);})]);}
  finally{clearTimeout(timer);await page.unroute(app.origin+'/api/goals?*',handler);for(const title of Object.values(titles))app.store.db.prepare('DELETE FROM goals WHERE character_id=42 AND title=?').run(title);}
 }
}
