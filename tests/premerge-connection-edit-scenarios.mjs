import assert from 'node:assert/strict';

// New Client ID drafts remain owned by the input while an earlier Save is in
// transit. The server is real; only its reply is held after SQLite persistence.
export async function connectionClientDraft({page,app,check,frame,deferred}){
 const path='/api/settings';let gate={seen:deferred(),release:deferred(),done:deferred()},hold=true,fail=false,writes=0;
 const pilots=app.store.db.prepare('SELECT * FROM characters').all(),originalId=app.store.get('clientId','');
 const initial='synthetic-client-original',submitted='synthetic-client-submitted',newer='synthetic-client-newer-draft',final='synthetic-client-recovery';
 // EVE's Client ID can only change before connecting pilots. Isolate this
 // documented first-setup boundary inside the disposable shared test database.
 app.store.db.prepare('DELETE FROM characters').run();app.store.set('clientId',initial);
 const handler=async route=>{
  if(route.request().method()!=='PUT'||!route.request().postDataJSON()?.clientId)return route.fallback();
  writes++;
  if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic client setup write failure'})});}
  if(hold){hold=false;try{const response=await route.fetch();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}finally{gate.done.resolve();}return;}
  return route.continue();
 };
 await page.route(app.origin+path,handler);
 try{
  await page.goto(app.origin+'/#connections',{waitUntil:'domcontentloaded',timeout:15000});
  const input=page.locator('#client-id'),save=page.getByRole('button',{name:'Save',exact:true});
  await input.waitFor();check('Client setup opens the actual saved Client ID',await input.inputValue(),initial);
  await input.fill(submitted);await save.click();
  await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Client ID save did not reach its response gate.');})]);
  assert.equal(app.store.get('clientId'),submitted,'The old save has already persisted before its response is released.');
  check('Client setup keeps draft editing available during Save',await input.isEnabled(),true);
  await input.fill(newer);gate.release.resolve();await gate.done.promise;
  await page.waitForFunction(()=>!document.querySelector('#client-id').parentElement.querySelector('button').disabled);await frame();
  check('Older Client ID Save cannot erase a newer editable draft',await input.inputValue(),newer);
  check('Only the submitted Client ID persisted before a second Save',app.store.get('clientId'),submitted);
  // The baseline loses the newer input. Restore it solely to continue the same
  // healthy save/failure/retry controls and retain the failed assertion above.
  if(await input.inputValue()!==newer)await input.fill(newer);
  const saved=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT');await save.click();assert.equal((await saved).status(),200);
  await page.waitForFunction(()=>!document.querySelector('#client-id').parentElement.querySelector('button').disabled);await frame();
  check('A later Save persists the current Client ID draft',app.store.get('clientId'),newer);
  check('Successful Save leaves the saved Client ID displayed',await input.inputValue(),newer);
  // Returning to the previously saved value is still a newer edit. Value
  // equality alone cannot decide whether this input belongs to the old Save.
  gate={seen:deferred(),release:deferred(),done:deferred()};hold=true;
  await input.fill(submitted);await save.click();
  await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Reverted Client ID save did not reach its response gate.');})]);
  await input.fill(newer);gate.release.resolve();await gate.done.promise;
  await page.waitForFunction(()=>!document.querySelector('#client-id').parentElement.querySelector('button').disabled);await frame();
  check('A draft reverted to the previous saved ID survives an older Save',await input.inputValue(),newer);
  check('Reverting the draft does not perform another settings write',app.store.get('clientId'),submitted);
  if(await input.inputValue()!==newer)await input.fill(newer);
  const reverted=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT');await save.click();assert.equal((await reverted).status(),200);
  await page.waitForFunction(()=>!document.querySelector('#client-id').parentElement.querySelector('button').disabled);await frame();
  check('Saving the reverted draft restores the chosen Client ID',app.store.get('clientId'),newer);
  await input.fill(final);fail=true;const failed=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT');await save.click();assert.equal((await failed).status(),503);
  await page.waitForFunction(()=>!document.querySelector('#client-id').parentElement.querySelector('button').disabled);await frame();
  check('Failed client setup Save preserves the current draft',await input.inputValue(),final);
  check('Failed client setup Save preserves the prior saved ID',app.store.get('clientId'),newer);
  const retried=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT');await save.click();assert.equal((await retried).status(),200);
  await page.waitForFunction(()=>!document.querySelector('#client-id').parentElement.querySelector('button').disabled);await frame();
  check('Retry recovers the current Client ID',app.store.get('clientId'),final);check('Every requested Save uses one settings write',writes,6);
 }finally{
  gate.release.resolve();await page.unroute(app.origin+path,handler);app.store.set('clientId',originalId);
  for(const pilot of pilots){const keys=Object.keys(pilot);app.store.db.prepare('INSERT OR REPLACE INTO characters('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(key=>pilot[key]));}
 }
}
