import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverseOwnerSearch,OWNER_SEARCH_SCOPE} from '../../server/universe-owner-search.mjs';

const AT=Date.parse('2026-09-27T12:00:00Z');
async function fixture(t,request) {
    const dir=await mkdtemp(join(tmpdir(),'kairo-owners-')),store=openStore(dir),calls=[];
    const characters=[{id:42,scopes:[OWNER_SEARCH_SCOPE]},{id:43,scopes:[]},{id:44,scopes:[OWNER_SEARCH_SCOPE],needsReauth:true}];
    const service=createUniverseOwnerSearch(store,{characters:()=>characters},{request:async(path,input)=>{calls.push({path,input});return request(path,input);}},{now:()=>AT});
    const seed=(id,name,category,expires=AT+3600000)=>store.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?,?)').run('esi-name:'+id,JSON.stringify({id,name,category}),null,expires,AT,'{}');
    t.after(async()=>{await service.close();store.close();await rm(dir,{recursive:true,force:true});});
    return {service,store,calls,seed};
}

test('partial owner search uses scoped ESI and returns only IDs with verified matching entity categories',async t=>{
    const {service,calls}=await fixture(t,async(path,input)=>path.includes('/search?')?{data:{alliance:[900,901,900,-1,902]}}:{data:[{id:900,name:'Brave Collective',category:'alliance'},{id:901,name:'Brave Corporation',category:'corporation'},{id:902,name:'',category:'alliance'},{id:999,name:'Brave Stranger',category:'alliance'}]});
    const result=await service.search(42,{kind:'alliance',q:' Bra '});
    assert.equal(result.mode,'search');assert.equal(result.search_available,true);assert.deepEqual(result.results,[{id:900,name:'Brave Collective',kind:'alliance',logo_url:'https://images.evetech.net/alliances/900/logo?size=64'}]);
    const query=new URL('https://esi.evetech.net'+calls[0].path);assert.equal(query.pathname,'/characters/42/search');assert.equal(query.searchParams.get('categories'),'alliance');assert.equal(query.searchParams.get('strict'),'false');assert.equal(query.searchParams.get('search'),'Bra');
    assert.equal(calls[0].input.characterId,42);assert.equal(calls[0].input.ttl,3600);assert.deepEqual(calls[1].input.body,[900,901,902]);
});

test('missing search scope and reauth pilots can resolve full names publicly without knowing an ID',async t=>{
    const {service,calls}=await fixture(t,async(path,input)=>path==='/universe/ids'?{data:{corporations:[{id:800,name:'Brave Newbies Inc.'},{id:801,name:'Different Name'}],alliances:[{id:900,name:'Brave Newbies Inc.'}]}}:{data:[{id:800,name:'Brave Newbies Inc.',category:'corporation'}]});
    for(const pilot of [43,44]) {
        const result=await service.search(pilot,{kind:'corporation',q:'brave newbies inc.'});assert.equal(result.mode,'exact');assert.equal(result.search_available,false);assert.equal(result.notice,null);assert.equal(result.results[0].id,800);assert.match(result.results[0].logo_url,/corporations\/800/);
    }
    const partial=await service.search(43,{kind:'corporation',q:'Brave'});assert.equal(partial.results.length,0);assert.match(partial.notice,/full name/);
    assert.ok(calls.every(call=>!call.input.characterId));assert.deepEqual(calls[1].input.body,[800]);
});

test('fresh typed cached names support immediate exact lookup and safe partial fallback without guessing entity types',async t=>{
    const {service,calls,seed}=await fixture(t,async()=>{throw new Error('ESI unavailable');});
    seed(900,'Brave Collective','alliance');seed(901,'Brave Corp','corporation');seed(902,'Brave Old','alliance',AT-1);
    const exact=await service.search(43,{kind:'alliance',q:'Brave Collective'});assert.equal(exact.mode,'cached');assert.equal(calls.length,0);assert.equal(exact.results[0].id,900);
    const partial=await service.search(42,{kind:'alliance',q:'Brave'});assert.equal(partial.mode,'cached');assert.deepEqual(partial.results.map(row=>row.id),[900]);assert.match(partial.notice,/previously verified/);
});

test('search coalesces matching concurrent requests and bounds name hydration to twenty identities',async t=>{
    let release,started;const paused=new Promise(resolve=>release=resolve),begun=new Promise(resolve=>started=resolve);
    const {service,calls}=await fixture(t,async(path,input)=>{if(path.includes('/search?')){started();await paused;return {data:{corporation:Array.from({length:45},(_,i)=>800+i)}};}return {data:input.body.map(id=>({id,name:'Corp '+id,category:'corporation'}))};});
    const first=service.search(42,{kind:'corporation',q:'Corp'}),second=service.search(42,{kind:'corporation',q:'Corp'});await begun;release();
    const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.equal(calls.length,2);assert.equal(a.results.length,20);assert.equal(a.truncated,true);assert.equal(calls[1].input.body.length,20);
});

test('invalid input, stale lookup and wrong-category numeric IDs cannot produce selectable identities',async t=>{
    let stale=true;const {service,calls}=await fixture(t,async(path)=>path.includes('/search?')?{data:{alliance:[900]},stale}:{data:[{id:900,name:'Corporation Only',category:'corporation'}]});
    await assert.rejects(service.search(999,{kind:'alliance',q:'Brave'}),/connected pilot/);await assert.rejects(service.search(42,{kind:'character',q:'Brave'}),/alliance or corporation/);
    for(const q of ['ab','a'.repeat(101),'Bad\nQuery']) await assert.rejects(service.search(42,{kind:'alliance',q}),/3–100/);
    assert.equal(calls.length,0);await assert.rejects(service.search(42,{kind:'alliance',q:'Brave'}),/temporarily unavailable/);
    stale=false;assert.deepEqual((await service.search(42,{kind:'alliance',q:'900'})).results,[]);
});
