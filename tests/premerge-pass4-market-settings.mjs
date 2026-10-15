import {createHash} from 'node:crypto';

let fixtureNumber=0;
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});promise.catch(()=>{});return {promise,resolve,reject};};
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out waiting for '+label)),15000);})]);}finally{clearTimeout(timer);}}
export async function marketSettingsOwnership({page,app,check,frame}){
 const now=Date.now(),firstId=60009000+(fixtureNumber++)*10,nextId=firstId+1,partialId=firstId+2,foundId=firstId+3,manualId=firstId+4,cache=app.store.db.prepare('INSERT OR REPLACE INTO cache VALUES(?,?,?,?,?,?)');
 const seed=(path,data,method='GET',body)=>cache.run('0:'+method+':'+path+':'+(body?createHash('sha256').update(JSON.stringify(body)).digest('hex'):''),JSON.stringify(data),null,now+86400000,now,'{}');
 const queuedName='Queued next module';
 seed('/universe/ids',{inventory_types:[{id:587,name:queuedName}]},'POST',[queuedName]);seed('/universe/types/587',{market_group_id:5});
 for(const id of [firstId,nextId,partialId,foundId])seed('/universe/stations/'+id,{name:'Fixture station '+id,system_id:30000001,services:['market']});
 seed('/universe/ids',{solar_systems:[{id:30000001,name:'Fixture system'}]},'POST',['Fixture system']);
 seed('/universe/systems/30000001',{name:'Fixture system',constellation_id:20000001,stations:[foundId]});seed('/universe/constellations/20000001',{region_id:10000001});seed('/universe/regions/10000001',{name:'Fixture region'});
 app.store.set('market:quick',[1403,519]);
 const paths={quick:'/api/markets/quick',hubs:'/api/markets/hubs'},counts={quick:0,hubs:0},gates=[],modes={};let discoveries=0;
 const countDiscovery=request=>{if(new URL(request.url()).pathname==='/api/markets/discover')discoveries++;};page.on('request',countDiscovery);
 const hold=key=>{const gate={ready:deferred(),release:deferred(),done:deferred(),started:false};gates.push(gate);modes[key]=gate;return gate;};
 const fail=key=>{modes[key]={failure:true};};
 const handler=async route=>{
  const path=new URL(route.request().url()).pathname,key=Object.keys(paths).find(key=>paths[key]===path);
  if(!key||!['POST','PUT'].includes(route.request().method()))return route.continue();
  counts[key]++;const mode=modes[key];delete modes[key];
  if(mode?.failure)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Current '+key+' save failure'})});
  if(mode)mode.started=true;
  try{const response=await route.fetch();if(mode){mode.ready.resolve({status:response.status(),body:await response.json()});await mode.release.promise;}await route.fulfill({response});}catch(error){mode?.ready.reject(error);throw error;}finally{mode?.done.resolve();}
 };
 await page.route(app.origin+'/api/markets/quick',handler);await page.route(app.origin+'/api/markets/hubs',handler);
 const dialog=()=>page.locator('.market-dialog'),openQuick=()=>page.getByRole('button',{name:'Edit quick-scan supplies',exact:true}).click(),openHubs=()=>page.getByRole('button',{name:'Manage hubs',exact:true}).click();
 const close=async()=>{await dialog().getByRole('button',{name:'Close',exact:true}).click();await dialog().waitFor({state:'detached'});};
 const overview=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/api/markets'&&r.status()===200);
 const mutation=key=>page.waitForResponse(r=>new URL(r.url()).pathname===paths[key]&&['POST','PUT'].includes(r.request().method()));
 try{
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});
  await openQuick();const quickInput=()=>dialog().getByRole('textbox',{name:'Add exact item name to quick scan'});
  await quickInput().fill('Earlier unsaved item');const remove=hold('quick');
  await dialog().getByRole('button',{name:'Remove Domination Large Armor Repairer with an extended market item name from quick scan',exact:true}).click();
  check('Pending quick removal reaches real successful persistence',(await bounded(remove.ready.promise,'quick persistence')).status,200);
  check('Quick removal changes only the submitted basket item',app.store.get('market:quick'),[519]);
  await quickInput().fill(queuedName);await close();check('Pending quick mutation allows closing its dialog',await dialog().count(),0);
  await openQuick();check('Reopening the quick dialog retains the current draft before acknowledgement',await quickInput().inputValue(),queuedName);
  const quickOverview=overview();remove.release.resolve();await bounded(remove.done.promise,'quick response');await quickOverview;await frame();
  check('A quick removal acknowledgement preserves an unrelated newer item draft',await quickInput().inputValue(),queuedName);
  check('Accepted removal remains visible in the current basket',await dialog().locator('.market-quick-list>div').count(),1);
  // Repair only the failing old draft display so current failure/retry controls
  // exercise the same submitted value in both unchanged and fixed applications.
  await quickInput().fill(queuedName);fail('quick');const failedQuick=mutation('quick');await dialog().getByRole('button',{name:'Add item',exact:true}).click();await failedQuick;
  await page.getByText('Current quick save failure',{exact:true}).waitFor();await frame();
  check('A current quick-save failure retains its editable draft',await quickInput().inputValue(),queuedName);
  check('A rejected quick save leaves the durable basket unchanged',app.store.get('market:quick'),[519]);
  const retriedQuick=mutation('quick'),retryQuickOverview=overview();await dialog().getByRole('button',{name:'Add item',exact:true}).click();await retriedQuick;await retryQuickOverview;await frame();
  check('Retrying the current quick draft persists its resolved item once',app.store.get('market:quick'),[519,587]);
  check('A current accepted quick addition clears its submitted draft',await quickInput().inputValue(),'');await close();

  await openHubs();const location=()=>dialog().getByLabel('Station / structure ID',{exact:true}),nickname=()=>dialog().getByLabel('Hub nickname (optional)',{exact:true});
  await location().fill(String(firstId));await nickname().fill('Submitted hub');const add=hold('hubs');
  await dialog().getByRole('button',{name:'Add hub',exact:true}).click();check('Pending hub add reaches real successful persistence',(await bounded(add.ready.promise,'hub persistence')).status,200);
  check('The held hub save persists only its submitted nickname',app.store.db.prepare('SELECT name FROM market_hubs WHERE id=?').get(firstId)?.name,'Submitted hub');
  await location().fill(String(nextId));await nickname().fill('Next hub draft');await close();check('Pending hub save allows closing its dialog',await dialog().count(),0);
  await openHubs();check('Reopening the hub dialog retains both current fields before acknowledgement',{id:await location().inputValue(),name:await nickname().inputValue()},{id:String(nextId),name:'Next hub draft'});
  const hubOverview=overview();add.release.resolve();await bounded(add.done.promise,'hub response');await hubOverview;await frame();
  check('An old hub acknowledgement preserves newer location and nickname fields',{id:await location().inputValue(),name:await nickname().inputValue()},{id:String(nextId),name:'Next hub draft'});
  check('The later hub draft has not been submitted implicitly',!!app.store.db.prepare('SELECT id FROM market_hubs WHERE id=?').get(nextId),false);
  await location().fill(String(nextId));await nickname().fill('Next hub draft');fail('hubs');const failedHub=mutation('hubs');await dialog().getByRole('button',{name:'Add hub',exact:true}).click();await failedHub;
  await page.getByText('Current hubs save failure',{exact:true}).waitFor();await frame();
  check('A current hub-save failure retains both editable fields',{id:await location().inputValue(),name:await nickname().inputValue()},{id:String(nextId),name:'Next hub draft'});
  check('A rejected hub save creates no durable hub',!!app.store.db.prepare('SELECT id FROM market_hubs WHERE id=?').get(nextId),false);
  const retriedHub=mutation('hubs'),retryHubOverview=overview();await dialog().getByRole('button',{name:'Add hub',exact:true}).click();await retriedHub;await retryHubOverview;await frame();
  check('Retrying the current hub draft persists the matching identity and name',app.store.db.prepare('SELECT id,name,enabled FROM market_hubs WHERE id=?').get(nextId),{id:nextId,name:'Next hub draft',enabled:1});
  check('A current accepted hub addition clears its submitted fields',{id:await location().inputValue(),name:await nickname().inputValue()},{id:'',name:''});
  check('Market settings use only the six explicit mutation attempts',{...counts},{quick:3,hubs:3});
  await close();await openQuick();await quickInput().fill(queuedName);const sameName=hold('quick');
  await dialog().getByRole('button',{name:'Add item',exact:true}).click();check('The held same-item addition is accepted by the real owner',(await bounded(sameName.ready.promise,'same-item persistence')).status,200);
  await quickInput().fill('A different draft');await quickInput().fill(queuedName);
  const sameOverview=overview();sameName.release.resolve();await bounded(sameName.done.promise,'same-item response');await sameOverview;await frame();
  check('Editing away and back retains the newer quick draft after acknowledgement',await quickInput().inputValue(),queuedName);
  check('A repeated accepted item does not duplicate the durable basket',app.store.get('market:quick'),[519,587]);await close();

  await openHubs();await location().fill(String(partialId));await nickname().fill('Partial submitted');const partial=hold('hubs');
  await dialog().getByRole('button',{name:'Add hub',exact:true}).click();check('The partially edited hub reaches real persistence',(await bounded(partial.ready.promise,'partial hub persistence')).status,200);
  await nickname().fill('Temporary nickname');await nickname().fill('Partial submitted');
  const partialOverview=overview();partial.release.resolve();await bounded(partial.done.promise,'partial hub response');await partialOverview;await frame();
  check('A hub acknowledgement clears only the untouched submitted field',{id:await location().inputValue(),name:await nickname().inputValue()},{id:'',name:'Partial submitted'});
  check('The partial draft still has exactly its submitted durable identity',app.store.db.prepare('SELECT id,name FROM market_hubs WHERE id=?').get(partialId),{id:partialId,name:'Partial submitted'});

  await location().fill(String(manualId));await nickname().fill('Discovered nickname');await dialog().getByRole('textbox',{name:'Find hub stations by system',exact:true}).fill('Fixture system');
  const discovery=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/markets/discover'&&r.status()===200),discoveryOverview=overview();
  await dialog().getByRole('button',{name:'Find stations',exact:true}).click();await discovery;await discoveryOverview;
  const found=hold('hubs');await dialog().getByRole('button',{name:'Fixture station '+foundId,exact:true}).click();check('A discovered station addition reaches the real owner',(await bounded(found.ready.promise,'found hub persistence')).status,200);
  const foundOverview=overview();found.release.resolve();await bounded(found.done.promise,'found hub response');await foundOverview;await frame();
  check('Adding a discovered station preserves an unrelated manual location draft',{id:await location().inputValue(),name:await nickname().inputValue()},{id:String(manualId),name:''});
  check('The discovered station stores its submitted nickname',app.store.db.prepare('SELECT id,name FROM market_hubs WHERE id=?').get(foundId),{id:foundId,name:'Discovered nickname'});
  check('The unrelated manual location remains unsubmitted',!!app.store.db.prepare('SELECT id FROM market_hubs WHERE id=?').get(manualId),false);
  check('Additional draft boundaries use only three explicit mutations and one discovery',{quick:counts.quick,hubs:counts.hubs,discoveries},{quick:4,hubs:5,discoveries:1});
 }finally{
  for(const gate of gates)gate.release.resolve();await bounded(Promise.all(gates.filter(gate=>gate.started).map(gate=>gate.done.promise)),'held settings response cleanup');
  await page.unroute(app.origin+'/api/markets/quick',handler);await page.unroute(app.origin+'/api/markets/hubs',handler);page.off('request',countDiscovery);
 }
}
