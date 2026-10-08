import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
export {loadSourceManifest,verifySource} from '../../../../../harness/source-manifest.mjs';

export const COMMIT='a7b1bf97b0073695926c443e52d523638e59e48d';
export const EPOCH=Date.parse('2026-10-07T10:00:00Z'),DAY=86400000,iso=t=>new Date(t).toISOString();
export const configurations=[100,1000,10000].flatMap(archived=>[1,4].map(pilots=>({id:`${archived}-${pilots}`,archived,pilots})));
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const hashValue=value=>hash(JSON.stringify(value));
export const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
export const writeJSON=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
export function assertLock(){assert.equal(process.env.KAIRO_SESSION_MATCHED_LOCK_HELD,'1','Parent must hold both Kairo benchmark locks');}
export function blockNetwork(){
    const denied=()=>{throw Error('External network forbidden in the S3 harness');};
    globalThis.fetch=denied;
    http.request=http.get=https.request=https.get=net.connect=net.createConnection=tls.connect=denied;
    const original=net.Socket.prototype.connect;net.Socket.prototype.connect=denied;syncBuiltinESMExports();
    return ()=>{net.Socket.prototype.connect=original;};
}
export async function verifyHarness(path){
    const manifest=await readJSON(path);assert.equal(manifest.schemaVersion,1);
    for(const row of manifest.files){const bytes=await readFile(row.path);assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.sha256,'Harness drift: '+row.path);}
    return manifest;
}
export function measure(operation){
    const memoryBefore=process.memoryUsage(),maxRSSBefore=process.resourceUsage().maxRSS,cpu=process.cpuUsage(),start=performance.now();
    const value=operation();
    return {value,measurement:{elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),memoryBefore,memoryAfter:process.memoryUsage(),maxRSSBeforeKiB:maxRSSBefore,maxRSSAfterKiB:process.resourceUsage().maxRSS}};
}
export async function fileSizes(directory){
    const files={};for(const suffix of ['', '-wal','-shm']){try{files['kairo.sqlite'+suffix]=(await stat(join(directory,'kairo.sqlite'+suffix))).size;}catch(e){if(e.code!=='ENOENT')throw e;files['kairo.sqlite'+suffix]=0;}}
    return files;
}
export async function storage(store,directory){
    return {...await fileSizes(directory),pageSize:store.db.prepare('PRAGMA page_size').get().page_size,pageCount:store.db.prepare('PRAGMA page_count').get().page_count,
        freelistCount:store.db.prepare('PRAGMA freelist_count').get().freelist_count};
}
const quoted=name=>'"'+name.replaceAll('"','""')+'"';
export function domainRows(store,normalizeSetting=row=>row.value){
    const result={};
    for(const {name}of store.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
        let rows=store.db.prepare('SELECT * FROM '+quoted(name)).all();
        if(name==='migrations')rows=rows.filter(row=>row.id!=='session-combat-eligibility-v080');
        if(name==='settings')rows=rows.map(row=>({...row,value:normalizeSetting(row)}));
        result[name]=rows.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
    }
    return result;
}
export function domainDigest(store,normalizeSetting){const rows=domainRows(store,normalizeSetting);return {sha256:hashValue(rows),tables:Object.fromEntries(Object.entries(rows).map(([name,value])=>[name,{rows:value.length,sha256:hashValue(value)}]))};}
export function migration(store,variant){
    const rows=store.db.prepare("SELECT * FROM migrations WHERE id='session-combat-eligibility-v080'").all();
    const index=store.db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name='idx_sessions_character_ended'").get();
    assert.equal(rows.length,variant==='candidate'?1:0);assert.equal(!!index,variant==='candidate');
    if(index)assert.match(index.sql,/ON sessions\(character_id,ended\)/);
    return {rows,index:index?.sql??null};
}
export async function validateSourceRole(source,variant,here){
    assert.equal(source.sourceCommit,COMMIT);
    const boundary=await readJSON(resolve(here,'source-boundary.json'));
    assert.equal(source.fingerprint,boundary[variant+'Fingerprint']);
}
export const limitations=[
    'Fresh SQLite connections/copies are used; the OS page cache is not forced cold.',
    'maxRSS is the process cumulative high-water mark, including untimed imports, source guards and digest checks; it is not retained memory for a phase.',
    'Only the S3 eligibility/migration intervention is measured. R1 and other a7 source remain unchanged.',
];
