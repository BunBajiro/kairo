// Read-only source extraction into disposable synthetic SQLite databases.
// Query/identity/footprint diagnostic only: no elapsed-time acceptance claims.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';
const self=fileURLToPath(import.meta.url);
if(process.env.KAIRO_MAPS_EXPIRY_LOCKED!=='1'){
  const code=await new Promise((done,bad)=>{const child=spawn('flock',['-n','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_MAPS_EXPIRY_LOCKED:'1'}});child.on('error',bad);child.on('exit',code=>done(code??1));});process.exit(code);
}
const [beforeArg,afterArg,outputArg]=process.argv.slice(2);assert.ok(beforeArg&&afterArg&&outputArg,'Provide before manifest, after manifest, new output JSON');
const manifests=[await loadSourceManifest(beforeArg),await loadSourceManifest(afterArg)],output=resolve(outputArg),hash=value=>createHash('sha256').update(value).digest('hex');
const sourceBytes=await Promise.all(manifests.map(source=>readFile(join(source.root,'server/universe.mjs'))));
const extract=bytes=>{const source=bytes.toString(),schema=source.match(/store\.db\.exec\(`(CREATE TABLE IF NOT EXISTS universe_records\([\s\S]*?)`\);/)?.[1];assert.ok(schema,'Universe schema boundary changed');const queries={};for(const key of ['nextWormholeExpiry','expiredWormholes','expiredPilotWormholes']){const match=source.match(new RegExp('const '+key+' = store\\.db\\.prepare\\(("(?:[^"\\\\]|\\\\.)*")\\)'));assert.ok(match,'Universe query declaration changed: '+key);queries[key]=JSON.parse(match[1]);}return{schema,queries};};
const definitions=sourceBytes.map(extract),now=Date.parse('2026-09-25T18:00:00Z'),at=new Date(now).toISOString(),identity=rows=>rows.map(row=>{const body=JSON.parse(row.body);return{characterId:row.character_id,id:body.id,body};}).sort((a,b)=>a.characterId-b.characterId||a.id.localeCompare(b.id));
const report={schemaVersion:1,reconstructedHarness:true,diagnosticOnly:true,performanceAcceptance:false,startedAt:new Date().toISOString(),node:process.version,harnessSha256:hash(await readFile(self)),sources:manifests.map((source,index)=>({commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty,universeSha256:hash(sourceBytes[index])})),fixtures:[],complete:false,limitations:['SQLite EXPLAIN QUERY PLAN is planner evidence, not an observed count of visited VM rows.','Database page bytes measure this synthetic schema and distribution only; index upgrade/startup and canonical write latency require a separate controlled timing lane.','These isolated extracted queries do not replace Universe lifecycle/import/revision correctness tests or the unchanged Maps adapter.']};
const dir=await mkdtemp(join(tmpdir(),'kairo-expiry-plans-'));
try{
 for(const maps of [1,8,24]){
  const rows=[];for(let p=0;p<4;p++)for(let m=0;m<maps;m++)for(let link=0;link<100;link++){
   const type=link%20,expires=type===0?new Date(now-1000).toISOString():type===1?null:type===2?'not-a-date':type===3?'2026-09-25T19:00:00+01:00':new Date(now+3600000+link*1000).toISOString();
   const body={id:`pilot-${42+p}-map-${m}-link-${link}`,kind:link===99?'ansiblex':'wormhole',map_id:`map-${m}`,from_system_id:31000001,to_system_id:31000002,life_status:type===1||type===3?'collapsed':'stable',expires_at:expires,confirmed:true,accessible:true};
   rows.push([42+p,'link',body.id,JSON.stringify(body),at]);
  }
  const fixture={mapsPerPilot:maps,pilots:4,linksPerMap:100,rows:rows.length,inputDigest:hash(JSON.stringify(rows)),sources:[]};
  for(let index=0;index<definitions.length;index++){
   const definition=definitions[index],db=new DatabaseSync(join(dir,`${maps}-${index}.sqlite`));
   try{
    db.exec(definition.schema);const insert=db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)');db.exec('BEGIN');for(const row of rows)insert.run(...row);db.exec('COMMIT');
    const bytes=()=>Number(db.prepare('PRAGMA page_count').get().page_count)*Number(db.prepare('PRAGMA page_size').get().page_size),entry={databaseBytes:bytes(),indexes:db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='index' AND tbl_name='universe_records' ORDER BY name").all(),queries:{}};
    for(const[name,sql]of Object.entries(definition.queries)){
     const args=name==='nextWormholeExpiry'?[]:name==='expiredWormholes'?[at]:(sql.includes('UNION ALL')?[42,42,at]:[42,at]);
     const result=db.prepare(sql).all(...args),rowsIdentity=name==='nextWormholeExpiry'?result:identity(result);
     if(name!=='nextWormholeExpiry')assert.equal(new Set(rowsIdentity.map(row=>row.characterId+':'+row.id)).size,rowsIdentity.length,'Collapsed dated links returned twice');
     entry.queries[name]={sql,args,plan:db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args),rows:result.length,digest:hash(JSON.stringify(rowsIdentity)),result:rowsIdentity};
    }
    fixture.sources.push(entry);
   }finally{db.close();}
  }
  for(const key of Object.keys(definitions[0].queries))assert.deepEqual(fixture.sources[0].queries[key].result,fixture.sources[1].queries[key].result,`Expiry identity changed: ${maps} maps / ${key}`);
  // Keep full returned identities in raw evidence; no timing is collected.
  report.fixtures.push(fixture);
 }
 for(const source of manifests)await verifySource(source);assert.equal(hash(await readFile(self)),report.harnessSha256);report.sourceVerified=true;report.complete=true;
}catch(error){report.failure=error.stack;throw error;}
finally{report.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify({complete:report.complete,diagnosticOnly:true,fixtures:report.fixtures.length,output}));
