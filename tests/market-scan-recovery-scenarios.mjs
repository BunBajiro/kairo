// Compiled Markets progress over real HTTP/SQLite and ESI owners. Only the
// provider response is synthetic; deferred transport owns the retry boundary.
import assert from 'node:assert/strict';
const JITA=60003760,AMARR=60008494,TYPE=1403,DAY=86400000;
const iso=value=>new Date(value).toISOString();
export function createMarketScanRecoveryFixture({scenario,deferred,denyNetwork}){
 const reference=scenario==='market-scan-exhausted',cancel=scenario==='market-scan-cancel';
 const selected=reference?AMARR:JITA,failedPage=reference?2:8,gate={seen:deferred(),release:deferred()},requests=[],counts=new Map();
 let closed=false,now=Date.now();
 const order=(hub,page,price=200)=>({order_id:hub*100+page,type_id:TYPE,location_id:hub,is_buy_order:false,price,volume_remain:10,min_volume:1,range:'station',issued:iso(now-DAY),duration:90});
 const response=(data,pages=1)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','X-Pages':String(pages),'Cache-Control':'max-age=300',ETag:'"scan-fixture"'}});
 const fetcher=async(input,options={})=>{
  const url=new URL(String(input));
  if(url.origin!=='https://esi.evetech.net'||options.method!=='GET')return denyNetwork(input);
  if(url.pathname==='/markets/10000002/history'&&url.searchParams.get('type_id')===String(TYPE)&&!reference)return response([]);
  const region=Number(url.pathname.match(/^\/markets\/(\d+)\/orders$/)?.[1]),hub=region===10000002?JITA:region===10000043?AMARR:0;
  if(!hub||url.searchParams.get('order_type')!=='all'||url.searchParams.has('type_id')||hub===AMARR&&!reference)return denyNetwork(input);
  const page=Number(url.searchParams.get('page')),key=hub+':'+page,attempt=(counts.get(key)||0)+1;counts.set(key,attempt);
  requests.push({hub,page,attempt});
  if(hub===AMARR){assert.equal(page,1);return response([order(hub,page,300)]);}
  assert.ok(page>=1&&page<=failedPage,'Only the fixture book pages may be requested');
  if(page===failedPage&&attempt===2){gate.seen.resolve();await gate.release.promise;}
  const malformed=page===failedPage&&(attempt===1||reference);
  return response([order(hub,page,malformed?-1:200)],failedPage);
 };
 const seed=app=>{
  now=Date.now();app.store.set('market:quick',[TYPE]);
  app.store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(TYPE,'Audit market item');
  for(const hub of [JITA,AMARR]){
   const stamp=iso(now-DAY),summary={at:stamp,observed:stamp,expires:iso(now+DAY),mode:'full',jobId:'prior-complete-book',items:1,pages:1};
   app.store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(hub,hub,TYPE,0,100,5,1,'station',stamp,90);
   app.store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(hub,TYPE,null,100,100,5,0,1,0,stamp,iso(now+DAY),'prior-complete-book');
   app.store.db.prepare('UPDATE market_hubs SET last_scan=?,last_full_scan=? WHERE id=?').run(JSON.stringify(summary),JSON.stringify(summary),hub);
  }
 };
 const close=()=>{if(!closed){closed=true;gate.release.resolve();}};
 return {selected,reference,cancel,failedPage,gate,requests,fetcher,seed,close,markets:{historySource:'esi',spacingMs:0}};
}
export async function marketScanRecovery({page,app,check,frame,scanFixture,output,meta}){
 const fixture=scanFixture,jobPanel=page.locator('.market-job'),full=page.getByRole('button',{name:'Full scan',exact:true});
 const book=hub=>({orders:app.store.db.prepare('SELECT order_id,price,volume FROM market_orders WHERE hub_id=? ORDER BY order_id').all(hub),scan:app.store.db.prepare('SELECT last_scan FROM market_hubs WHERE id=?').get(hub).last_scan});
 const before=book(JITA),mutations=[];
 const track=request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&['/api/markets/scan','/api/markets/cancel'].includes(path))mutations.push(path);};
 const overview=async()=>{const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/markets'&&r.status()===200);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;await frame();};
 page.on('request',track);
 try{
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});
  if(fixture.reference)await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:/^Amarr$/})}).click();
  await full.waitFor();check('The cold market book contains the prior complete prices',book(fixture.selected).orders.map(row=>row.price),[100]);
  const accepted=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/markets/scan'&&r.request().method()==='POST');await full.click();
  const acceptedResponse=await accepted;assert.equal(acceptedResponse.status(),202);const admitted=await acceptedResponse.json();
  // The ten-second fixture deadline is only an abort guard; admission is driven
  // by the actual provider call. No sleep is used to infer a retry happened.
  await Promise.race([fixture.gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Market recovery request was not admitted');})]);
  await overview();const recovering=app.core.markets.overview().job;
  check('Recovery remains the same running order-scan job',{id:recovering.id,status:recovering.status,phase:recovering.phase,retries:recovering.retries},{id:admitted.id,status:'running',phase:'orders',retries:1});
  check('The existing progress panel shows the bounded recovery attempt',await jobPanel.locator('p').innerText(),`Jita · page ${fixture.failedPage} · retry 1/2 in 1s`);
  check('Recovery keeps the existing Cancel control usable',await jobPanel.getByRole('button',{name:'Cancel scan',exact:true}).isEnabled(),true);
  check('Recovery prevents another scan from the current controls',await full.isDisabled(),true);
  check('A recovery attempt does not count the malformed page as accepted',recovering.pages,fixture.reference?2:7);
  check('The previous Jita book remains complete during recovery',book(JITA),before);
  check('Completed-book context remains visible during recovery',(await jobPanel.locator('.meta').innerText()).includes(`${fixture.reference?1:0} completed books`),true);
  await page.screenshot({path:output+'/'+meta.engine+'-'+meta.width+'-'+meta.scenario+'-retry.png'});
  if(fixture.cancel){
   const cancelled=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/markets/cancel'&&r.request().method()==='POST');
   await jobPanel.getByRole('button',{name:'Cancel scan',exact:true}).click();assert.equal((await cancelled).status(),200);await frame();
   check('Cancel acknowledges stopping while the admitted response is held',await jobPanel.getByRole('button',{name:'Stopping…',exact:true}).isDisabled(),true);
  }
  fixture.gate.release.resolve();await app.core.markets.idle();await overview();const terminal=app.core.markets.overview().job;
  check('Recovery settles without replacing the accepted job identity',terminal.id,admitted.id);
  check('The existing scan heading reflects the terminal outcome',await jobPanel.locator('.eyebrow').innerText(),fixture.cancel?'CANCELLED':fixture.reference?'SCAN STOPPED':'SCAN COMPLETE');
  check('A settled scan removes Cancel and restores Full scan',{cancel:await jobPanel.getByRole('button',{name:'Cancel scan',exact:true}).count(),enabled:await full.isEnabled()},{cancel:0,enabled:true});
  if(fixture.cancel){
   check('Cancellation prevents retry-response publication',book(JITA),before);
   check('Cancellation leaves no partial completed book',terminal.books,[]);
   check('Cancellation adds no further recovery attempt',{retries:terminal.retries,requests:fixture.requests.length},{retries:1,requests:9});
  }else if(fixture.reference){
   const detail=await jobPanel.locator('p').innerText();
   check('Exhausted recovery reports the original failure and explicit outcome',['ESI returned a malformed order.','Recovery attempts exhausted.','Previous book retained.'].every(message=>detail.includes(message)),true);
   check('Exhausted retry preserves the earlier completed hub',{books:terminal.books.map(row=>row.hubId),prices:book(AMARR).orders.map(row=>row.price)},{books:[AMARR],prices:[300]});
   check('Exhausted retry retains the previous reference book',book(JITA),before);
   check('Stopped scan keeps completed-book context visible',(await jobPanel.innerText()).includes('1 completed books')&&(await jobPanel.innerText()).includes('Completed books are kept.'),true);
   check('Recovery is capped at two extra provider attempts',{retries:terminal.retries,requests:fixture.requests.length},{retries:2,requests:5});
  }else{
   check('Recovered scan promotes the complete replacement book',{books:terminal.books.map(row=>row.hubId),prices:book(JITA).orders.map(row=>row.price)},{books:[JITA],prices:Array(8).fill(200)});
   check('Recovered completion counts each accepted page once',{pages:terminal.pages,retries:terminal.retries,requests:fixture.requests.length},{pages:8,retries:1,requests:9});
   check('Recovered UI shows the completed book without a stale failure',(await jobPanel.innerText()).includes('1 completed books')&&!(await jobPanel.innerText()).includes('Recovery attempts exhausted'),true);
  }
  check('Recovery adds no implicit browser scan commands',mutations,fixture.cancel?['/api/markets/scan','/api/markets/cancel']:['/api/markets/scan']);
  check('Terminal recovery clears temporary staging',app.store.db.prepare('SELECT COUNT(*) n FROM market_stage').get().n,0);
 }finally{page.off('request',track);fixture.close();await app.core.markets.idle();}
}
