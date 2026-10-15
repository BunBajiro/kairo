import assert from 'node:assert/strict';
import {DEFAULT_IMPORT_SETTINGS} from '../server/import-math.mjs';

// The initial analysis is accepted by the real owner, then its delivery fails
// after a newer Apply has saved settings and loaded a current analysis.
export async function importAnalysisErrorOwnership({page,app,check,frame,deferred}){
 const hubId=60008494,path='/api/markets/imports/analyse',settingsPath='/api/markets/imports/settings',pattern='**/api/markets/imports/analyse?*';
 app.store.set('market:imports:'+hubId,{...DEFAULT_IMPORT_SETTINGS,characterId:42,minProfit:0});
 const gate={seen:deferred(),release:deferred(),done:deferred()};let first=true,started=false,fail=false;
 const counts={analysis:0,settings:0},observe=request=>{const url=new URL(request.url());if(url.origin!==app.origin)return;if(url.pathname===path)counts.analysis++;if(url.pathname===settingsPath&&request.method()==='PUT')counts.settings++;};
 const handler=async route=>{
  if(first){first=false;started=true;try{const response=await route.fetch();assert.equal(response.status(),200);const body=await response.json();assert.equal(body.settings.cargo,10000);gate.seen.resolve();await gate.release.promise;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Obsolete import analysis failure'})});}finally{gate.done.resolve();}return;}
  if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Current import analysis failure'})});}
  return route.continue();
 };
 const analysisResponse=response=>new URL(response.url()).pathname===path;
 page.on('request',observe);await page.route(pattern,handler);
 try{
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.connection-status.online').waitFor({state:'attached'});
  await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:'Amarr'})}).click();
  await page.locator('.markets-module > [data-slot=tabs] > [role=tablist]').getByRole('tab',{name:'Import Analyser',exact:true}).click();
  const cargo=page.getByLabel('Cargo per round trip / m³',{exact:true}),apply=page.getByRole('button',{name:'Apply & analyse',exact:true}),alerts=page.locator('.import-analyser > .inline-error');
  await cargo.waitFor();await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Initial import analysis did not reach its response gate.');})]);
  check('Import settings are editable while the first analysis is pending',await cargo.inputValue(),'10000');
  await cargo.fill('20000');let response=page.waitForResponse(analysisResponse);await apply.click();assert.equal((await response).status(),200);await apply.waitFor();await frame();
  check('A newer Apply persists settings while the original analysis waits',app.store.get('market:imports:'+hubId).cargo,20000);
  check('A current import analysis clears its error state',await alerts.allTextContents(),[]);
  const finished=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname===path});gate.release.resolve();await gate.done.promise;await finished;await frame();
  check('An obsolete import analysis failure cannot replace recovered state',await alerts.allTextContents(),[]);
  check('An obsolete analysis preserves the current cargo draft',await cargo.inputValue(),'20000');
  await cargo.fill('30000');fail=true;response=page.waitForResponse(analysisResponse);await apply.click();assert.equal((await response).status(),503);await apply.waitFor();await page.getByText('Current import analysis failure',{exact:true}).waitFor();
  check('A current import analysis failure remains visible',await alerts.allTextContents(),['Current import analysis failure']);
  check('A failed analysis retains the submitted saved settings',app.store.get('market:imports:'+hubId).cargo,30000);
  check('A failed analysis retains the current editable draft',await cargo.inputValue(),'30000');
  response=page.waitForResponse(analysisResponse);await apply.click();assert.equal((await response).status(),200);await apply.waitFor();await frame();
  check('Retrying the current analysis clears its current error',await alerts.allTextContents(),[]);
  check('Retrying analysis preserves the latest saved settings',app.store.get('market:imports:'+hubId).cargo,30000);
  check('Import load ownership retains one analysis per explicit load',counts,{analysis:4,settings:3});
 }finally{gate.release.resolve();if(started)await gate.done.promise;await page.unroute(pattern,handler);page.off('request',observe);}
}
