// External comparison only; never part of the implementation branch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createServer} from 'node:net';

if(process.argv[2]==='--capture'){
 const root=resolve(process.argv[3]),epoch=Date.parse('2026-09-18T12:00:00Z');Date.now=()=>epoch;
 const module=path=>import(pathToFileURL(join(root,path)).href);
 const {seedFixture,PILOT,DESTINATION}=await module('tests/performance/fixture.mjs');
 const {startKairo}=await module('server/index.mjs');
 const {sessionReport}=await module('server/history.mjs');
 const {journeyData}=await module('server/places.mjs');
 const port=async()=>{const s=createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const p=s.address().port;await new Promise(r=>s.close(r));return p;};
 const output={};
 for(const profile of ['typical','stress']){
  const dir=await mkdtemp(join(tmpdir(),'kairo-equivalence-'));let app;
  try{
   await seedFixture(dir,profile,epoch);
   const blocked=async()=>{throw new Error('External requests are forbidden');};
   const first=await port();let second=await port();while(first===second)second=await port();
   app=await startKairo({port:first,streamPort:second,dataDir:dir,noSync:true,fetcher:blocked,combatFetcher:blocked,sessionFeedFetcher:blocked,markets:{historyFetcher:blocked}});
   output[profile]={opsec:app.core.stream.getOPSEC(),state:app.core.snapshots(PILOT),names:app.core.names(),journey:journeyData(app.store,PILOT),session:sessionReport(app.store,'benchmark-session',PILOT),browse:app.core.markets.browse(DESTINATION,{category:'all'}),marketReport:app.core.markets.report(DESTINATION),imports:await app.core.markets.imports.analyse(DESTINATION)};
   app.store.set('equivalence:unrelated',true);
   output[profile].importsAfterWrite=await app.core.markets.imports.analyse(DESTINATION);
  }finally{await app?.close();await rm(dir,{recursive:true,force:true});}
 }
 process.stdout.write(JSON.stringify(output));
}else{
 const [baseline,candidate,out='performance-results']=process.argv.slice(2);assert.ok(baseline&&candidate);
 const capture=root=>JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--capture',resolve(root)],{cwd:resolve(root),encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000}));
 const before=capture(baseline),after=capture(candidate);
 for(const profile of Object.keys(before))for(const key of Object.keys(before[profile]))assert.deepEqual(after[profile][key],before[profile][key],profile+'/'+key);
 const oldMatching=(await import(pathToFileURL(resolve(baseline,'server/session-details.mjs')).href)).allianceSummary;
 const newMatching=(await import(pathToFileURL(resolve(candidate,'server/session-details.mjs')).href)).allianceSummary;
 let seed=732;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const epoch=Date.parse('2026-09-18T12:00:00Z'),iso=x=>new Date(epoch+x).toISOString();
 for(let trial=0;trial<250;trial++){
  const route=Array.from({length:30},(_,i)=>({id:i,systemId:1+Math.floor(random()*4),name:'System',entered:iso(i*30000),exited:iso((i+1)*30000)}));
  const records=Array.from({length:100},(_,i)=>({killmail_id:i%91,killmail_time:iso((Math.floor(random()*50)-10)*30000),solar_system_id:1+Math.floor(random()*5),victim:{alliance_id:random()<.3?77:88,ship_type_id:609},attackers:[{alliance_id:random()<.8?77:88}],zkb:{totalValue:random()<.2?null:Math.floor(random()*1e6)}}));
  assert.deepEqual(newMatching(route,records,77,epoch+1000000),oldMatching(route,records,77,epoch+1000000),'matching case '+trial);
 }
 const revision=root=>execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const result={passed:true,baseline:revision(baseline),candidate:revision(candidate),matchingCases:250,fixedTime:'2026-09-18T12:00:00Z',profiles:Object.fromEntries(Object.keys(before).map(p=>[p,Object.keys(before[p])])),note:'Full decoded response equality at fixed time; timing observations run separately with real time.'};
 await mkdir(out,{recursive:true});await writeFile(join(out,'equivalence.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Full before/after response equality passed for both fixtures and all nine projections.');
}
