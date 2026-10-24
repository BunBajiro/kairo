import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {createOBS,defaultOBS,sanitizeOBS} from '../../server/obs.mjs';
import {classifyOPSEC,createProtectionTracker} from '../../server/opsec.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';
import {createStream,defaultStream,sanitizeConfig} from '../../server/stream.mjs';
import {createBus} from '../../server/bus.mjs';
import {startKairo} from '../../server/index.mjs';
import {protectionStates,upgradeProtectionRules} from '../../public/stream/protection.js';
const at=Date.now(),sample=(data,extra={})=>({status:'ready',data,updatedAt:new Date(at).toISOString(),expiresAt:new Date(at+600000).toISOString(),...extra});
const base=()=>({now:at,characterId:42,available:true,location:sample({solar_system_id:30001000}),system:{security_status:-.1},fw:sample([]),sovereignty:sample([{system_id:30001000,alliance_id:99011223}]),profile:sample({corporation_id:98000001,alliance_id:99000001}),contacts:sample([]),corporation_contacts:sample([],{ownerId:98000001}),alliance_contacts:sample([],{ownerId:99000001}),settings:{allowHighsec:false}});
const contact=standing=>({contact_type:'alliance',contact_id:99011223,standing});
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-spaces-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}

test('Good and Excellent are Blue; Bad and Terrible are Hostile in every contact source',()=>{
    for(const [key,source] of [['contacts','personal'],['corporation_contacts','corporation'],['alliance_contacts','alliance']]){
        for(const [standing,state] of [[5,'blue'],[10,'blue'],[-5,'hostile'],[-10,'hostile'],[0,'neutral']]){
            const c=base();c[key]={...c[key],data:[contact(standing)]};const result=classifyOPSEC(c);
            assert.equal(result.state,state,key+' '+standing);assert.equal(result.standingSource,source);assert.equal(result.hidden,true);
        }
    }
});
test('standing precedence includes explicit Neutral and rejects stale, denied and wrong-membership lists',()=>{
    const c=base();c.alliance_contacts.data=[contact(5)];c.corporation_contacts.data=[contact(-5)];
    assert.equal(classifyOPSEC(c).state,'hostile');c.contacts.data=[contact(0)];assert.equal(classifyOPSEC(c).state,'neutral');
    assert.equal(classifyOPSEC({...c,settings:{blueAlliances:[99011223]}}).state,'blue');
    assert.equal(classifyOPSEC({...c,settings:{hostileAlliances:[99011223]}}).state,'hostile');
    for(const invalid of [{status:'stale'},{status:'error',errorStatus:403},{ownerId:99009999},{truncated:true}]){
        const x=base();x.alliance_contacts={...x.alliance_contacts,data:[contact(5)],...invalid};assert.equal(classifyOPSEC(x).state,'unknown');
    }
    assert.equal(classifyOPSEC(base()).state,'neutral');
    const empty=base();for(const key of ['contacts','corporation_contacts','alliance_contacts'])empty[key]={status:'missing_scope',data:null};
    assert.equal(classifyOPSEC(empty).state,'unknown');
});
test('space categories distinguish security, Pochven, Abyssal and Anoikis before general null-sec',()=>{
    const c={...base(),sovereignty:sample([])};
    for(const [security,state] of [[1,'highsec'],[.5,'highsec'],[.45,'highsec'],[.449,'lowsec'],[.4,'lowsec'],[.1,'lowsec'],[.01,'lowsec'],[0,'neutral'],[-1,'neutral']]){
        const result=classifyOPSEC({...c,system:{security_status:security}});assert.equal(result.state,state,String(security));assert.equal(result.hidden,true);
    }
    assert.equal(classifyOPSEC({...c,system:{security_status:1},settings:{allowHighsec:true}}).hidden,false);
    for(const [systemId,regionId,state] of [[30000142,10000070,'triglavian'],[32000001,12000001,'triglavian'],[32999999,undefined,'triglavian'],[31000001,11000001,'anoikis'],[31999999,undefined,'anoikis']]){
        const result=classifyOPSEC({...c,location:sample({solar_system_id:systemId}),constellation:{region_id:regionId},fw:null,sovereignty:null});assert.equal(result.state,state);assert.equal(result.hidden,true);
    }
    for(const id of [34000001,36000001])assert.equal(classifyOPSEC({...c,location:sample({solar_system_id:id})}).state,'unknown');
    assert.equal(classifyOPSEC({...c,system:{security_status:1,constellation_id:20000001}}).state,'unknown');
    assert.equal(classifyOPSEC({...c,fw:sample([{solar_system_id:30001000}])}).state,'fw');
    assert.equal(classifyOPSEC({...c,manual:true,location:null}).state,'manual');
});
test('new covered categories retain brief jump continuity; released High-Sec never carries through missing location',()=>{
    for(const [state,overrides] of [['lowsec',{system:{security_status:.3}}],['neutral',{system:{security_status:0}}],['anoikis',{location:sample({solar_system_id:31000001})}],['triglavian',{location:sample({solar_system_id:32000001})}]]){
        const track=createProtectionTracker(),c={...base(),sovereignty:sample([]),...overrides};assert.equal(track(c).state,state);
        assert.equal(track({...c,now:at+5000,location:{...c.location,status:'stale'}}).state,state);
        assert.equal(track({...c,now:at+30000,location:null}).state,'unknown');
    }
    const track=createProtectionTracker(),c={...base(),sovereignty:sample([]),system:{security_status:1},settings:{allowHighsec:true}};
    assert.equal(track(c).hidden,false);const gap=track({...c,location:null});assert.equal(gap.state,'unknown');assert.equal(gap.hidden,true);
});
test('OBS upgrade retains Unknown actions for new categories and handles old Safe policy without an automatic reveal',async t=>{
    const {store}=await storage(t),hide={id:'hide',kind:'audio',sourceName:'EVE audio',enabled:false},show={...hide,id:'show',enabled:true};
    const old={...defaultOBS(),rules:{blue:[hide],unknown:[hide],safe:[show]}};
    const migrated=upgradeProtectionRules(old.rules);for(const s of ['lowsec','neutral','triglavian','anoikis'])assert.deepEqual(migrated[s],[hide]);assert.deepEqual(migrated.highsec,[show]);
    store.set('obs',old);store.set('opsec',{allowHighsec:false});let obs=createOBS(store,{});
    assert.deepEqual(obs.config().rules.highsec,[hide]);assert.deepEqual(obs.config().legacySafeRules,[show]);
    await obs.save({...obs.config(),rules:{...obs.config().rules,neutral:[]}});await obs.close();obs=createOBS(store,{});
    try{assert.deepEqual(obs.config().rules.neutral,[]);assert.deepEqual(Object.keys(sanitizeOBS(obs.config()).rules),protectionStates);obs.setState('lowsec');assert.equal(obs.status().state,'lowsec');}finally{await obs.close();}
});
test('organization collectors request scoped membership routes and discard contacts after membership changes',async t=>{
    const {dir,store}=await storage(t),calls=[];let allianceId=99000001;
    const request=async(path,options)=>{calls.push({path,options});let data=[];
        if(path==='/characters/42')data={corporation_id:98000001,alliance_id:allianceId};
        else if(path.endsWith('/location'))data={solar_system_id:30001000};
        else if(path.startsWith('/universe/systems/'))data={name:'EX-0LQ',security_status:-.1};
        else if(path==='/sovereignty/systems')data={solar_systems:[{solar_system_id:30001000,claim:{alliance:{alliance_id:99011223}}}]};
        else if(path.startsWith('/alliances/')&&path.endsWith('/contacts'))data=allianceId===99000001?[contact(5)]:[];
        return sample(data);
    };
    const core=await createCore(store,{characters:()=>[{id:42,scopes:allScopes}]},{request,paged:request,names:async ids=>Object.fromEntries(ids.map(id=>[id,id===99011223?'Sigma Grindset':'Entity '+id])),health:()=>({})},dir,{noSync:true});
    try{
        await core.syncProtection();assert.equal(core.stream.getOPSEC().state,'blue');assert.equal(core.stream.getOPSEC().standingSource,'alliance');assert.equal(core.names()[99011223],'Sigma Grindset');
        for(const route of ['/corporations/98000001/contacts','/alliances/99000001/contacts'])assert.equal(calls.find(c=>c.path===route)?.options.characterId,42);
        allianceId=99000002;core.requestSync(42);await core.syncProtection();
        assert.equal(store.snapshot(42,'alliance_contacts').ownerId,99000002);assert.equal(core.stream.getOPSEC().state,'neutral');
        assert.ok(calls.some(c=>c.path==='/alliances/99000002/contacts'));
    }finally{await core.close();}
});
test('Abyssal observations remain classifiable when ESI cannot provide public system details',async t=>{
    const {dir,store}=await storage(t),request=async path=>{
        if(path.startsWith('/universe/systems/'))throw Object.assign(new Error('System details unavailable'),{status:404});
        if(path.endsWith('/location'))return sample({solar_system_id:32000001});
        return sample(path==='/sovereignty/systems'?{solar_systems:[]}:[]);
    };
    const core=await createCore(store,{characters:()=>[{id:42,scopes:['esi-location.read_location.v1']}]},{request,paged:request,names:async()=>({}),health:()=>({})},dir,{noSync:true});
    try{await core.syncProtection();assert.equal(store.snapshot(42,'location').status,'ready');assert.equal(core.stream.getOPSEC().state,'triglavian');}finally{await core.close();}
});
test('system lookup resolves Sigma Grindset and Sportmodel via ESI names without a connected pilot',async t=>{
    const dir=await mkdtemp(join(tmpdir(),'kairo-owner-http-'));const owners={'EX-0LQ':[30001181,99011223,'Sigma Grindset'],'CB4-Q2':[30001205,99012279,'Sportmodel']};
    const app=await startKairo({port:18420,streamPort:18421,dataDir:dir,noSync:true,fetcher:async(url,options)=>{
        const path=new URL(url).pathname;let data={};
        if(path==='/universe/ids')data={systems:[{id:owners[JSON.parse(options.body)[0]][0]}]};
        if(path.startsWith('/universe/systems/'))data={name:'Test system',security_status:-.1};
        if(path==='/universe/names')data=JSON.parse(options.body).map(id=>({id,name:Object.values(owners).find(o=>o[1]===id)?.[2]}));
        return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
    }});t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
    app.store.saveSnapshot(0,'sovereignty',sample(Object.values(owners).map(([system_id,alliance_id])=>({system_id,alliance_id}))));
    const cookie=(await fetch(app.origin)).headers.get('set-cookie').split(';')[0],boot=await fetch(app.origin+'/api/bootstrap',{headers:{Cookie:cookie}}).then(r=>r.json());
    for(const asset of ['/render.js','/render.css','/widgets.css'])assert.equal((await fetch(app.streamOrigin+asset)).status,200,'Browser-source asset '+asset);
    for(const [name,[,alliance,owner]] of Object.entries(owners)){
        const r=await fetch(app.origin+'/api/universe/search',{method:'POST',headers:{Cookie:cookie,Origin:app.origin,'X-Kairo-CSRF':boot.csrf,'Content-Type':'application/json'},body:JSON.stringify({name})});assert.equal(r.status,200);assert.equal((await r.json()).names[alliance],owner);
    }
});
test('styled stream keeps the empty default, opaque covers and approved notification metadata',async t=>{
    const {store}=await storage(t),bus=createBus(),stream=createStream(store,bus);
    try {
    assert.deepEqual(stream.state().elements,[]);assert.deepEqual(stream.state().toasts,[]);
    const config=sanitizeConfig({...defaultStream(),elements:[{id:'cover',kind:'opsec',visible:true,opacity:.1,appearance:'minimal'},{id:'blank',kind:'panel',visible:true,appearance:'minimal',text:''}]});
    stream.save(config);assert.equal(stream.state().elements[0].opacity,1);assert.equal(stream.state().elements[1].appearance,'minimal');assert.equal(stream.state().elements[1].text,'');
    stream.emit({type:'killmail.loss',payload:{secret:'PRIVATE',signal:'UNTRUSTED'}},true);
    assert.equal(stream.state().toasts[0].signal,'loss');assert.equal(JSON.stringify(stream.state()).includes('PRIVATE'),false);assert.equal(JSON.stringify(stream.state()).includes('UNTRUSTED'),false);
    } finally { stream.close(); }
});
