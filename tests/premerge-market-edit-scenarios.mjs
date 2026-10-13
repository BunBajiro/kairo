import assert from 'node:assert/strict';
import {DEFAULT_IMPORT_SETTINGS} from '../server/import-math.mjs';

// The importer form uses real saved settings and real analysis. Only the save
// response is delayed; later edits occur through the compiled visible controls.
export async function importSettingsDraft({page,app,check,frame,deferred}){
 const hubId=60008494,key='market:imports:'+hubId,path='/api/markets/imports/settings',gates=[];
 app.store.set(key,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});
 let held=null,fail=false;
 const handler=async route=>{
  if(route.request().method()!=='PUT')return route.fallback();
  if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic import settings save failure'})});}
  if(!held)return route.continue();
  const gate=held;held=null;
  try{const response=await route.fetch();assert.equal(response.status(),200);gate.body=await response.json();gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}
  finally{gate.done.resolve();}
 };
 await page.route(app.origin+path,handler);
 const isPut=response=>new URL(response.url()).pathname===path&&response.request().method()==='PUT';
 try{
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.connection-status.online').waitFor({state:'attached'});
  await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:'Amarr'})}).click();
  await page.locator('.markets-module > [data-slot=tabs] > [role=tablist]').getByRole('tab',{name:'Import Analyser',exact:true}).click();
  const cargo=page.getByLabel('Cargo per round trip / m³',{exact:true}),budget=page.getByLabel('Available capital / ISK',{exact:true}),apply=page.getByRole('button',{name:'Apply & analyse',exact:true});
  await cargo.waitFor();await apply.waitFor();
  check('Cold Import Analyser loads persisted hauling settings',{cargo:await cargo.inputValue(),budget:await budget.inputValue()},{cargo:'10000',budget:'1000000000'});
  await cargo.fill('20000');await budget.fill('2000000000');
  const gate={seen:deferred(),release:deferred(),done:deferred()};gates.push(gate);held=gate;
  await apply.click();await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Import settings save did not reach real persistence.');})]);
  assert.equal(app.store.get(key).cargo,20000);
  await cargo.fill('30000');await budget.fill('3000000000');
  const finished=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname===path&&request.method()==='PUT'});
  gate.release.resolve();await gate.done.promise;await finished;await apply.waitFor();await frame();
  check('An earlier Apply preserves newer cargo edits',await cargo.inputValue(),'30000');
  check('An earlier Apply preserves newer capital edits',await budget.inputValue(),'3000000000');
  check('Newer import settings remain unapplied',await page.getByText('Apply your changes to update the recommendations. Cards currently use the last applied settings.',{exact:true}).count(),1);
  check('Only submitted import settings have reached persistence',{cargo:app.store.get(key).cargo,budget:app.store.get(key).budget},{cargo:20000,budget:2000000000});
  // Reset deliberate baseline loss before independent recovery controls.
  await cargo.fill('30000');await budget.fill('3000000000');let response=page.waitForResponse(isPut);await apply.click();assert.equal((await response).status(),200);await apply.waitFor();await frame();
  check('Applying after the race persists the current settings',{cargo:app.store.get(key).cargo,budget:app.store.get(key).budget},{cargo:30000,budget:3000000000});
  check('A current import Apply leaves no unapplied-settings notice',await page.getByText('Apply your changes to update the recommendations. Cards currently use the last applied settings.',{exact:true}).count(),0);
  await cargo.fill('40000');fail=true;response=page.waitForResponse(isPut);await apply.click();assert.equal((await response).status(),503);await apply.waitFor();await frame();
  check('A failed Apply retains the current import draft',await cargo.inputValue(),'40000');
  check('A failed Apply leaves saved import settings intact',app.store.get(key).cargo,30000);
  response=page.waitForResponse(isPut);await apply.click();assert.equal((await response).status(),200);await apply.waitFor();await frame();
  check('Retrying Apply persists the retained import settings',app.store.get(key).cargo,40000);
 }finally{for(const gate of gates)gate.release.resolve();await page.unroute(app.origin+path,handler);}
}
