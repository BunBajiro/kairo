import {Worker} from 'node:worker_threads';
import {setTimeout as delay} from 'node:timers/promises';
export const DAY=86400000,CORE_HUBS=new Set([60003760,60008494,60011866,60005686]);
const iso=n=>new Date(n).toISOString(),date=n=>iso(n).slice(0,10),origin='https://data.everef.net/market-history/';
export function historyWindow(rows,days=30,now=Date.now()){
 const end=Date.parse(date(now)),start=end-days*DAY,unique=new Map();
 for(const r of rows||[]){const at=Date.parse(r.date);if(at>=start&&at<end&&Number.isFinite(r.volume)&&r.volume>=0&&Number.isFinite(r.average)&&r.average>=0)unique.set(r.date,r);}
 const data=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)),volume=data.reduce((n,r)=>n+r.volume,0);
 return {period:days,volume,daily_volume:volume/days,average:volume?data.reduce((n,r)=>n+r.volume*r.average,0)/volume:null,reported_days:data.length,active_days:data.filter(r=>r.volume>0).length,from:date(start),to:date(end-DAY),latest:data.at(-1)?.date||null,days:data};
}
export const historySummary=(rows,now=Date.now())=>historyWindow(rows,30,now);
export function saveHistory(store,region,id,rows,updated,expires,source,now=Date.now()){
 const h=historySummary(rows,now);
 store.db.prepare('INSERT INTO market_history VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(region_id,type_id) DO UPDATE SET body=excluded.body,updated=excluded.updated,expires=excluded.expires,daily_volume=excluded.daily_volume,average=excluded.average,reported_days=excluded.reported_days,period_from=excluded.period_from,period_to=excluded.period_to').run(region,id,JSON.stringify(rows),updated,expires,h.daily_volume,h.average,h.reported_days,h.from,h.to);
 store.db.prepare('INSERT INTO market_history_meta VALUES(?,?,?) ON CONFLICT(region_id,type_id) DO UPDATE SET source=excluded.source').run(region,id,source);
}
export function decodeArchive(bytes,date,{signal,timeoutMs=45000}={}){
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./market-history-worker.mjs',import.meta.url),{workerData:{bytes,date},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128}});let done=false;
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);}
  const abort=()=>finish(new Error('History import cancelled.')),timer=setTimeout(()=>finish(new Error('History decoding timed out.')),timeoutMs);
  worker.once('message',m=>finish(m.error?new Error(m.error):null,m));worker.once('error',e=>finish(e));worker.once('exit',()=>{if(!done)finish(new Error('History decoder stopped before completing.'));});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}
export function createHistoryArchive(store,{fetcher=fetch,now=()=>Date.now(),spacingMs=250,decode=decodeArchive}={}){
 let controller=null,lastRequest=0;const db=store.db;
 async function download(path,limit,signal){const cooldown=store.get('market:everef:retry',0);if(cooldown>now())throw new Error('EVE Ref asked us to wait. Retry after '+iso(cooldown)+'.');const wait=spacingMs-(now()-lastRequest);if(wait>0)await delay(wait,undefined,{signal});lastRequest=now();
  const response=await fetcher(origin+path,{headers:{'User-Agent':'Kairo/0.6.0 (local EVE dashboard; market history)','Accept':path.endsWith('.json')?'application/json':'application/octet-stream'},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  if(!response.ok){const retry=response.headers.get('retry-after');const seconds=Number(retry),at=retry?(Number.isFinite(seconds)?now()+seconds*1000:Date.parse(retry)):NaN;if(response.status===429||response.status>=500||Number.isFinite(at))store.set('market:everef:retry',Math.max(now()+60000,Number.isFinite(at)?at:now()+300000));throw new Error('EVE Ref history is unavailable (HTTP '+response.status+'). Cached history is kept.');}
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('EVE Ref download exceeds the size limit.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('EVE Ref returned no history body.');let size=0;const chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('EVE Ref download exceeds the size limit.');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}return Buffer.concat(chunks,size);
 }
 async function update({check=()=>{},progress=()=>{}}={}){
  if(controller)throw new Error('A history import is already running.');controller=new AbortController();const signal=controller.signal;const end=Date.parse(date(now())),start=end-30*DAY;
  try{
   check();progress('Checking EVE Ref daily archives',{phase:'history',historyTotal:30,historyDone:0,historySource:'EVE Ref'});
   let manifest=store.get('market:everef:manifest',null);
   if(!manifest||manifest.expires<=now()){const totals=JSON.parse((await download('totals.json',2*1024*1024,signal)).toString('utf8'));if(!totals||typeof totals!=='object'||Array.isArray(totals)||Object.entries(totals).some(([d,n])=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isSafeInteger(n)||n<0))throw new Error('EVE Ref returned an invalid archive index.');manifest={totals,expires:now()+3600000};store.set('market:everef:manifest',manifest);}
   let missing=0,downloaded=0;const insert=db.prepare('INSERT INTO market_history_days VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(region_id,type_id,date) DO UPDATE SET average=excluded.average,highest=excluded.highest,lowest=excluded.lowest,volume=excluded.volume,order_count=excluded.order_count,modified=excluded.modified');
   // Newest first: interrupted first imports already retain the most useful days.
   for(let i=1;i<=30;i++){check();const d=date(end-i*DAY),total=manifest.totals[d];progress('EVE Ref · '+d+' · four hub regions',{historyDone:i-1});if(!total){missing++;continue;}
    const prior=db.prepare('SELECT * FROM market_history_archives WHERE date=?').get(d);
    if(!prior||prior.total!==total||Date.parse(prior.updated)+7*DAY<=now()){
     const bytes=await download(d.slice(0,4)+'/market-history-'+d+'.csv.bz2',8*1024*1024,signal),parsed=await decode(bytes,d,{signal});check();if(parsed.records<total)throw new Error('EVE Ref archive is incomplete relative to its index. Retry later; earlier history is kept.');
     db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM market_history_days WHERE date=?').run(d);for(const r of parsed.rows)insert.run(r.region_id,r.type_id,r.date,r.average,r.highest,r.lowest,r.volume,r.order_count,r.http_last_modified);db.prepare('INSERT INTO market_history_archives VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET total=excluded.total,records=excluded.records,updated=excluded.updated').run(d,total,parsed.records,iso(now()));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}downloaded++;
    }
    await delay(0);progress('EVE Ref · '+d+' cached',{historyDone:i});
   }
   const archives=db.prepare('SELECT * FROM market_history_archives WHERE date>=? AND date<? ORDER BY date').all(date(start),date(end));if(!archives.length)throw new Error('EVE Ref has no completed daily archives in the last 30 days.');
   const signature=JSON.stringify([date(end),archives]);
   if(store.get('market:everef:projection','')!==signature){
    progress('Building cached 3-, 7- and 30-day histories',{historyDone:30});
    for(const region of [10000002,10000043,10000032,10000042]){
     const rows=db.prepare('SELECT * FROM market_history_days WHERE region_id=? AND date>=? AND date<? ORDER BY type_id,date').all(region,date(start),date(end)),byType=new Map();for(const r of rows){if(!byType.has(r.type_id))byType.set(r.type_id,[]);byType.get(r.type_id).push({date:r.date,average:r.average,highest:r.highest,lowest:r.lowest,volume:r.volume,order_count:r.order_count});}
     // Keep old dates in existing cache; windows always use the actual calendar.
     let n=0;for(const [id,data] of byType){check();const old=db.prepare('SELECT body FROM market_history WHERE region_id=? AND type_id=?').get(region,id);const older=old?JSON.parse(old.body).filter(r=>r.date<date(start)):[];saveHistory(store,region,id,[...older,...data],iso(now()),iso(now()+DAY),'EVE Ref',now());if(++n%100===0)await delay(0);}
    }
    store.set('market:everef:projection',signature);
   }
   const status={source:'EVE Ref',updated:iso(now()),from:date(start),to:date(end-DAY),archiveDays:archives.length,missingDays:30-archives.length,downloaded,latest:archives.at(-1)?.date};store.set('market:everef:status',status);return status;
  }finally{controller=null;}
 }
 return {update,status:()=>store.get('market:everef:status',null),cancel(){controller?.abort();}};
}
