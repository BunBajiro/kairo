// Imported by the shared browser runner. Hold admission before route.fetch() to
// expose crossing durable writes; holding only the response cannot test ordering.
// Baseline recovery steps follow recorded failures and do not erase those checks.
import assert from 'node:assert/strict';

export async function appearanceWriteOrder({page,context,app,check,frame,deferred}){
 const path='/api/settings',gate={seen:deferred(),release:deferred(),done:deferred()},newer={seen:deferred(),done:deferred()};let held=true,fail=false;
 app.store.set('theme','mint');
 // Observe request admission synchronously while retaining the native transport.
 // This lets a serialized implementation proceed without a timing-based sleep.
 await context.addInitScript(()=>{const native=window.fetch;window.__accentWrites=[];window.fetch=function(input,options){if(String(input)==='/api/settings'&&options?.method==='PUT'){const body=JSON.parse(options.body);if(body.theme)window.__accentWrites.push(body.theme);}return native.apply(this,arguments);};});
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();
  const body=route.request().postDataJSON();
  if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic appearance write failure'})});}
  if(held&&body.theme==='amber'){
   held=false;gate.seen.resolve();try{await gate.release.promise;const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{gate.done.resolve();}return;
  }
  if(body.theme==='ice'){newer.seen.resolve();try{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response});}finally{newer.done.resolve();}return;}
  return route.continue();
 };
 await page.route(app.origin+path,handler);
 const wait=promise=>Promise.race([promise,page.waitForTimeout(10000).then(()=>{throw new Error('Appearance request did not complete its ownership gate.');})]);
 const choose=async name=>{await page.getByRole('combobox',{name:'Accent colour',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();};
 try{
  await page.goto(app.origin+'/#modules',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});await page.getByRole('tab',{name:'Appearance',exact:true}).click();
  check('Cold appearance loads the persisted accent',await page.evaluate(()=>document.documentElement.dataset.theme),'mint');
  await choose('Instrument amber');await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('First appearance write did not reach its gate.');})]);
  await choose('Glacial blue');await frame();
  const admitted=await page.evaluate(()=>window.__accentWrites.slice());
  assert.equal(admitted[0],'amber');
  // The old implementation dispatches the second write immediately. Let its
  // actual persistence finish before admitting the older write. A corrected
  // serialized writer retains the second intent until the first completes.
  if(admitted.length>1){await wait(newer.done.promise);assert.equal(app.store.get('theme'),'ice');}
  gate.release.resolve();await gate.done.promise;await wait(newer.done.promise);
  await page.waitForFunction(()=>window.__accentWrites.length===2);await frame();
  const latest=await page.evaluate(async()=>{const boot=await(await fetch('/api/bootstrap')).json();return boot.settings.theme;});
  check('A delayed earlier accent write cannot replace the latest choice',latest,'ice');
  // Wait for both associated bootstrap reloads to settle by the visible
  // appearance matching the server; the final intent assertion remains above.
  await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,latest);await frame();
  check('Displayed accent agrees with the latest user choice',await page.evaluate(()=>document.documentElement.dataset.theme),'ice');
  check('The accent selector retains the latest choice',(await page.getByRole('combobox',{name:'Accent colour',exact:true}).textContent()).trim(),'Glacial blue');
  check('Two selections make at most two settings writes',await page.evaluate(()=>window.__accentWrites),['amber','ice']);
  fail=true;const failure=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT');await choose('Signal mint');assert.equal((await failure).status(),503);await frame();
  check('A failed accent write leaves persisted appearance intact',app.store.get('theme'),latest);
  check('A failed accent write leaves the saved theme displayed',await page.evaluate(()=>document.documentElement.dataset.theme),latest);
  const retry=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT');await choose('Signal mint');assert.equal((await retry).status(),200);await page.waitForFunction(()=>document.documentElement.dataset.theme==='mint');
  check('A later selection recovers after a failed write',app.store.get('theme'),'mint');
 }finally{gate.release.resolve();await page.unroute(app.origin+path,handler);}
}
