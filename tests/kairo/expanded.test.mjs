import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {openVault} from '../../server/vault.mjs';
import {createBus} from '../../server/bus.mjs';
import {createStream,defaultStream} from '../../server/stream.mjs';
import {bindingProjection,renderToast} from '../../server/projections.mjs';
import {captureContext,changeSession,sessionReport} from '../../server/history.mjs';
import {rememberSystem,journeyData,savePlaceNote} from '../../server/places.mjs';
import {createOBS,defaultOBS,obsAuthentication,sanitizeOBS} from '../../server/obs.mjs';
import {startKairo} from '../../server/index.mjs';
const sample=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
async function storage(t){const dir=await mkdtemp(join(tmpdir(),'kairo-v2-')),store=openStore(dir);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {dir,store,vault:openVault(dir)};}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await delay(10);}assert.fail('Condition did not become true.');}
const publish=store=>e=>store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(e.characterId,e.type,e.module||'core',e.summary||e.type,JSON.stringify(e.payload||{}),e.at||new Date().toISOString());
test('v0.1 database migrates once without losing existing sessions, goals or stream copy',async t=>{
    const dir=await mkdtemp(join(tmpdir(),'kairo-upgrade-'));t.after(()=>rm(dir,{recursive:true,force:true}));const db=new DatabaseSync(join(dir,'kairo.sqlite'));
    db.exec("CREATE TABLE sessions(id TEXT PRIMARY KEY,character_id INTEGER NOT NULL,label TEXT NOT NULL,started TEXT NOT NULL,ended TEXT); INSERT INTO sessions VALUES('old',42,'Earlier flight','2026-08-01T00:00:00.000Z','2026-08-01T01:00:00.000Z');");db.close();
    let store=openStore(dir);store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('goal',42,'Keep this goal',10,3,'manual',0,'2026-01-01');const c=defaultStream();c.rules[1].message='Keep my custom wording';store.set('stream',c);store.close();store=openStore(dir);
    try{assert.equal(store.db.prepare('SELECT label FROM sessions').get().label,'Earlier flight');assert.equal(store.db.prepare('SELECT progress FROM goals').get().progress,3);assert.equal(store.get('stream').rules[1].message,'Keep my custom wording');assert.equal(store.db.prepare("SELECT COUNT(*) n FROM migrations WHERE id='core-v2'").get().n,1);const r=sessionReport(store,'old',42);assert.equal(r.stats.walletDelta,null);assert.equal(r.durationSeconds,3600);}finally{store.close();}
});
test('selected goal projects approved fields live, and never switches to another character or deleted goal',async t=>{
    const {store}=await storage(t),auth={characters:()=>[{id:42},{id:43}]};
    store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('goal',42,'Buy a carrier',100,25,'manual',0,'2026-01-01');
    const e={id:'widget',kind:'progress',binding:'goal.progress',sourceId:'goal',characterId:42,bindingDisplay:'both',visible:true};
    assert.deepEqual(bindingProjection(store,auth,e),{text:'Buy a carrier',detail:'25 / 100',value:25,bindingStatus:'ready'});
    store.db.prepare('UPDATE goals SET progress=60').run();assert.equal(bindingProjection(store,auth,e).value,60);
    assert.equal(bindingProjection(store,auth,{...e,characterId:43}).bindingStatus,'unavailable');
    const bus=createBus(),stream=createStream(store,bus);t.after(()=>stream.close());stream.save({...defaultStream(),elements:[e]});stream.setBindings({widget:bindingProjection(store,auth,e)});
    const output=stream.state();assert.equal(output.elements[0].text,'Buy a carrier');for(const key of ['sourceId','characterId','binding','refresh_token'])assert.equal(key in output.elements[0],false);
    store.db.prepare('DELETE FROM goals').run();assert.equal(bindingProjection(store,auth,e).bindingStatus,'unavailable');
});
test('ESI bindings reject stale, disabled and disconnected character data',async t=>{
    const {store}=await storage(t),auth={characters:()=>[{id:42}]},e={binding:'wallet.balance',characterId:42};store.saveSnapshot(42,'wallet',sample(1200000));assert.equal(bindingProjection(store,auth,e).text,'1,200,000 ISK');store.set('module:wallet',false);assert.equal(bindingProjection(store,auth,e).bindingStatus,'unavailable');store.set('module:wallet',true);store.saveSnapshot(42,'wallet',{...sample(50),expiresAt:'2000-01-01'});assert.equal(bindingProjection(store,auth,e).bindingStatus,'unavailable');assert.equal(bindingProjection(store,{characters:()=>[]},e).bindingStatus,'unavailable');
});
test('context toasts whitelist tokens, obey character filters and redact at delivery and later state changes',async t=>{
    const {store}=await storage(t),bus=createBus(),stream=createStream(store,bus);t.after(()=>stream.close());
    const c=defaultStream(),rule=c.rules.find(r=>r.event==='killmail.kill');Object.assign(rule,{enabled:true,characterId:42,message:'{{hull}} in {{system}} · {{refresh_token}}',delay:.04,cooldown:0});stream.save(c);stream.setOPSEC({state:'safe',hidden:false,reason:'Approved'});
    const event={type:'killmail.kill',characterId:42,payload:{ship_type_id:99,hull_name:'Rifter',system_name:'Secret system',refresh_token:'NEVER-SEND',damage_taken:100}};
    assert.equal(stream.emit({...event,characterId:43}),false);assert.equal(stream.emit(event),true);stream.setOPSEC({state:'hostile',hidden:true,reason:'Hostile sovereignty.'});await delay(60);
    let n=stream.state().toasts[0];assert.equal(n.message,'Rifter in Protected location · —');assert.equal(JSON.stringify(stream.state()).includes('NEVER-SEND'),false);
    stream.setOPSEC({state:'safe',hidden:false,reason:'Approved'});assert.ok(stream.state().toasts[0].message.includes('Secret system'));
    stream.setOPSEC({state:'unknown',hidden:true,reason:'Stale'});assert.equal(stream.state().toasts[0].message.includes('Secret system'),false);
    assert.ok(renderToast(store,event,{...rule,allowLocation:true},{hidden:true}).message.includes('Secret system'));
    stream.save({...stream.config(),paused:true});assert.deepEqual(stream.state().toasts,[]);
});
test('named sessions capture wallet and SP samples, diverse events, late combat, character and time boundaries',async t=>{
    const {store}=await storage(t),emit=publish(store);store.saveSnapshot(42,'wallet',sample(1000));store.saveSnapshot(42,'skills',sample({total_sp:100}));store.saveSnapshot(42,'location',sample({solar_system_id:3001,system:{name:'Home'}}));
    const {id}=changeSession(store,emit,42,{action:'start',label:'Fleet night'});await delay(3);assert.throws(()=>changeSession(store,emit,42,{action:'start'}));
    emit({type:'wallet.entry',characterId:42,payload:{amount:50}});emit({type:'wallet.entry',characterId:42,payload:{amount:-10}});emit({type:'skill.completed',characterId:42,payload:{skill_id:123,level:4}});emit({type:'industry.ready',characterId:42});emit({type:'goal.completed',characterId:42});emit({type:'ship.changed',characterId:42});emit({type:'note.created',characterId:42});emit({type:'killmail.kill',characterId:43});emit({type:'killmail.loss',characterId:42,at:'2000-01-01'});
    const during=new Date().toISOString();store.saveSnapshot(42,'wallet',sample(1040));store.saveSnapshot(42,'skills',sample({total_sp:120}));await delay(3);changeSession(store,emit,42,{action:'end'});await delay(3);
    emit({type:'killmail.kill',characterId:42,at:during});emit({type:'goal.completed',characterId:42});
    const r=sessionReport(store,id,42);assert.equal(r.session.label,'Fleet night');assert.equal(r.stats.kills,1);assert.equal(r.stats.losses,0);assert.equal(r.stats.walletDelta,40);assert.equal(r.stats.skillpointDelta,20);assert.equal(r.stats.goals,1);assert.equal(r.stats.skillLevels,1);assert.equal(r.stats.jobs,1);assert.equal(r.stats.income,50);assert.equal(r.stats.expenses,10);assert.equal(r.stats.systems,1);assert.throws(()=>sessionReport(store,id,43));
    assert.equal(captureContext(store,43).wallet,null);
});
test('session reports paginate events but keep totals across the entire session',async t=>{
    const {store}=await storage(t);store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)').run('s',42,'Long session','2026-01-01','2026-02-01');for(let i=0;i<135;i++)publish(store)({type:'goal.completed',characterId:42,at:'2026-01-02'});const first=sessionReport(store,'s',42),next=sessionReport(store,'s',42,100);assert.equal(first.events.length,100);assert.equal(first.more,true);assert.equal(first.stats.goals,135);assert.equal(next.events.length,35);assert.equal(next.more,false);assert.notEqual(first.events[0].id,next.events[0].id);
});
test('place notes keep system, constellation and region identities separate and enrich the visual travel ledger',async t=>{
    const {store}=await storage(t);for(const kind of ['system','constellation','region'])savePlaceNote(store,kind,10,{name:kind,body:'Private '+kind,tags:['logistics','logistics','  home  '],status:'home'});
    rememberSystem(store,{system_id:10,name:'UALX-3',constellation_id:20,security_status:-.7,position:{x:1e17,y:2e17,z:-3e17}},{name:'Constellation',region_id:30},{name:'Tenerifis'});
    store.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,10,'UALX-3','2026-09-01');const d=journeyData(store,42);assert.equal(d.systems[0].x,1e17);assert.equal(d.systems[0].region_name,'Tenerifis');assert.equal(d.systems[0].annotation,'Private system');assert.deepEqual(d.systems[0].tags,['logistics','home']);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM place_notes').get().n,3);assert.throws(()=>savePlaceNote(store,'character',1,{}));
});
// Minimal real WebSocket server: exercises Node's native client and OBS v5 framing/authentication without installed dependencies.
async function mockOBS(t,{password='fixture-password',holdFirstHello=false}={}) {
    const requests=[],sockets=new Set();let handler,hold,fail='',authRejected=false;
    const server=createServer();server.on('upgrade',(req,socket)=>{
        sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
        const key=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');
        function frame(value,opcode=1){const p=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));const head=p.length<126?Buffer.from([128|opcode,p.length]):Buffer.from([128|opcode,126,p.length>>8,p.length&255]);socket.write(Buffer.concat([head,p]));}
        socket.send=frame;if(holdFirstHello)holdFirstHello=false;else frame({op:0,d:{rpcVersion:1,obsWebSocketVersion:'5.5.0',authentication:{salt:'fixture-salt',challenge:'fixture-challenge'}}});let buf=Buffer.alloc(0);
        socket.on('data',bytes=>{buf=Buffer.concat([buf,bytes]);while(buf.length>=2){const opcode=buf[0]&15,masked=!!(buf[1]&128);let n=buf[1]&127,h=2;if(n===126){if(buf.length<4)return;n=buf.readUInt16BE(2);h=4;}if(n===127){socket.destroy();return;}const maskOffset=h;if(masked)h+=4;if(buf.length<h+n)return;const p=Buffer.from(buf.subarray(h,h+n));if(masked)for(let i=0;i<p.length;i++)p[i]^=buf[maskOffset+i%4];buf=buf.subarray(h+n);if(opcode===8){frame(p,8);socket.end();return;}if(opcode===9){frame(p,10);continue;}if(opcode!==1)continue;const m=JSON.parse(p.toString());
            if(m.op===1){if(m.d.authentication!==obsAuthentication(password,{salt:'fixture-salt',challenge:'fixture-challenge'})){authRejected=true;const code=Buffer.alloc(2);code.writeUInt16BE(4009);frame(code,8);socket.end();}else frame({op:2,d:{negotiatedRpcVersion:1}});}
            if(m.op===6){requests.push(m.d);const respond=(responseData={},ok=true)=>frame({op:7,d:{requestType:m.d.requestType,requestId:m.d.requestId,requestStatus:{result:ok,code:ok?100:600},responseData}});
                if(handler?.(m.d,respond)===true)continue;
                if(fail===m.d.requestType){respond({},false);continue;}
                if(m.d.requestType==='GetSceneCollectionList')respond({currentSceneCollectionName:'Kairo test'});
                else if(m.d.requestType==='GetSceneList')respond({scenes:[{sceneName:'Game'},{sceneName:'Covered'}],currentProgramSceneName:'Game'});
                else if(m.d.requestType==='GetInputList')respond({inputs:[{inputName:'EVE capture',inputKind:'game_capture'},{inputName:'Microphone',inputKind:'wasapi_input_capture'}]});
                else if(m.d.requestType==='GetSceneItemList')respond({sceneItems:[{sceneItemId:7,sourceName:'EVE capture',sceneItemEnabled:true}]});
                else if(m.d.requestType==='GetSourceFilterList')respond({filters:[{filterName:'Blur',filterEnabled:false}]});
                else respond({});
            }
        }});
    });await new Promise(r=>server.listen(0,'127.0.0.1',r));
    t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
    return {port:server.address().port,requests,setHandler:f=>handler=f,setFail:f=>fail=f,clients:sockets,kick(code=4011){for(const s of sockets){const p=Buffer.alloc(2);p.writeUInt16BE(code);s.send(p,8);s.end();}},get authRejected(){return authRejected;}};
}
const source=(enabled,overrides={})=>({id:'source',kind:'source',sceneName:'Game',sourceName:'EVE capture',sceneItemId:7,enabled,...overrides});
test('OBS authenticates over a real local websocket, hides/mutes before shows and scenes, and keeps its password out of config',async t=>{
    const {store,vault}=await storage(t),mock=await mockOBS(t),obs=createOBS(store,vault,{requestTimeout:500,reconnectDelay:30});t.after(()=>obs.close());
    const c=defaultOBS();Object.assign(c,{enabled:true,automation:true,port:mock.port,collection:'Kairo test',password:'fixture-password'});c.rules.unknown=[{id:'scene',kind:'scene',sceneName:'Covered'},source(true,{id:'cover',sceneName:'Covered'}),{id:'audio',kind:'audio',sourceName:'Microphone',enabled:false},source(false)];
    await obs.save(c);await until(()=>obs.status().appliedState==='unknown');
    const types=mock.requests.filter(r=>r.requestType.startsWith('Set')).map(r=>r.requestType);assert.deepEqual(types,['SetInputMute','SetSceneItemEnabled','SetSceneItemEnabled','SetCurrentProgramScene']);
    const setters=mock.requests.filter(r=>r.requestType==='SetSceneItemEnabled');assert.equal(setters[0].requestData.sceneItemEnabled,false);assert.equal(setters[1].requestData.sceneItemEnabled,true);
    assert.equal(JSON.stringify(obs.config()).includes('fixture-password'),false);assert.equal(store.get('obs.password').includes('fixture-password'),false);assert.equal(vault.decrypt(store.get('obs.password')).password,'fixture-password');
    const targets=await obs.inventory();assert.equal(targets.collection,'Kairo test');assert.equal(targets.scenes[0].items[0].sceneItemId,7);
});
test('OBS abandons obsolete reveals during a state change and never runs a scene switch after a failed hide',async t=>{
    const {store,vault}=await storage(t),mock=await mockOBS(t),obs=createOBS(store,vault,{requestTimeout:500});t.after(()=>obs.close());
    const c={...defaultOBS(),enabled:true,automation:true,port:mock.port,collection:'Kairo test',password:'fixture-password'};c.rules.highsec=[source(true)];c.rules.hostile=[source(false)];c.rules.unknown=[source(false),{id:'scene',kind:'scene',sceneName:'Covered'}];
    await obs.save(c);await until(()=>obs.status().appliedState==='unknown');mock.requests.length=0;
    let release;mock.setHandler((d,respond)=>{if(d.requestType==='GetSceneItemList'&&!release){release=()=>respond({sceneItems:[{sceneItemId:7,sourceName:'EVE capture'}]});return true;}});
    obs.setState('highsec');await until(()=>!!release);obs.setState('hostile');release();mock.setHandler(null);await until(()=>obs.status().appliedState==='hostile');assert.equal(mock.requests.some(r=>r.requestData.sceneItemEnabled===true),false);
    mock.requests.length=0;mock.setFail('SetSceneItemEnabled');obs.setState('unknown');await until(()=>obs.status().error.includes('failed'));assert.equal(mock.requests.some(r=>r.requestType==='SetCurrentProgramScene'),false);
});
test('OBS refuses stale source identities or a different collection, and an OBS kick does not auto-reconnect',async t=>{
    const {store,vault}=await storage(t),mock=await mockOBS(t),obs=createOBS(store,vault,{requestTimeout:500,reconnectDelay:20});t.after(()=>obs.close());
    const c={...defaultOBS(),enabled:true,automation:true,port:mock.port,collection:'Kairo test',password:'fixture-password'};c.rules.unknown=[source(false,{sourceName:'Removed source'})];await obs.save(c);await until(()=>obs.status().error.includes('no longer matches'));assert.equal(mock.requests.some(r=>r.requestType.startsWith('Set')),false);
    await obs.save({...c,collection:'Another collection'});await until(()=>obs.status().error.includes('collection changed'));mock.kick();await until(()=>!obs.status().connected);await delay(70);assert.equal(mock.clients.size,0);assert.equal(obs.status().error.includes('manually'),true);
    assert.throws(()=>sanitizeOBS({...defaultOBS(),port:80}));assert.throws(()=>sanitizeOBS({...defaultOBS(),automation:true}));
});
test('OBS reconnects to the latest protection state and rejects a wrong password',async t=>{
    const {store,vault}=await storage(t),mock=await mockOBS(t),obs=createOBS(store,vault,{requestTimeout:500,reconnectDelay:25});t.after(()=>obs.close());
    const c={...defaultOBS(),enabled:true,automation:true,port:mock.port,collection:'Kairo test',password:'wrong'};await assert.rejects(obs.save(c));assert.ok(mock.authRejected);await delay(40);assert.equal(mock.clients.size,0);
    c.password='fixture-password';c.rules.unknown=[source(false)];c.rules.highsec=[source(true)];c.rules.manual=[source(false)];await obs.save(c);await until(()=>obs.status().appliedState==='unknown');
    for(const s of mock.clients)s.destroy();await until(()=>!obs.status().connected);mock.requests.length=0;obs.setState('highsec');obs.setState('manual');await until(()=>obs.status().appliedState==='manual');assert.ok(mock.requests.some(r=>r.requestData.sceneItemEnabled===false));assert.equal(mock.requests.some(r=>r.requestData.sceneItemEnabled===true),false);
});
test('OBS reconnect clears an interrupted collection transition and resumes inventory and protection',async t=>{
    const {store,vault}=await storage(t),mock=await mockOBS(t),obs=createOBS(store,vault,{requestTimeout:500});t.after(()=>obs.close());
    const c={...defaultOBS(),enabled:true,automation:true,port:mock.port,collection:'Kairo test',password:'fixture-password'};c.rules.unknown=[source(false)];c.rules.manual=[source(false)];
    await obs.save(c);await until(()=>obs.status().appliedState==='unknown');mock.requests.length=0;
    for(const s of mock.clients)s.send({op:5,d:{eventType:'CurrentSceneCollectionChanging'}});
    await until(()=>obs.status().changing);obs.setState('manual');
    await assert.rejects(obs.inventory(),/changing scene collections/);
    assert.equal(mock.requests.length,0,'the original socket remains protected during its collection transition');
    await obs.reconnect();await until(()=>obs.status().appliedState==='manual');
    assert.equal(obs.status().connected,true);assert.equal(obs.status().changing,false);
    assert.ok(mock.requests.some(r=>r.requestType==='SetSceneItemEnabled'&&r.requestData.sceneItemEnabled===false),'the new connection applies the latest protection state');
    const targets=await obs.inventory();assert.equal(targets.collection,'Kairo test');assert.equal(targets.scenes[0].items[0].sceneItemId,7);
});
test('OBS saves a new port or password while the startup connection is still pending',async t=>{
    for(const change of ['port','password'])await t.test(change,async t=>{
        const {store,vault}=await storage(t),original=await mockOBS(t,{holdFirstHello:true}),target=change==='port'?await mockOBS(t):original;
        const c={...defaultOBS(),enabled:true,automation:true,port:original.port,collection:'Kairo test'};c.rules.unknown=[source(false)];
        store.set('obs',c);store.set('obs.password',vault.encrypt({password:change==='password'?'old-password':'fixture-password'}));
        const obs=createOBS(store,vault,{requestTimeout:500});t.after(()=>obs.close());
        await until(()=>original.clients.size===1&&obs.status().connecting);
        await obs.save({...c,...(change==='port'?{port:target.port}:{password:'fixture-password'})});
        await until(()=>obs.status().appliedState==='unknown');
        assert.equal(obs.status().connected,true);assert.equal(obs.status().connecting,false);assert.equal(obs.status().error,'');
        assert.ok(target.requests.some(r=>r.requestType==='SetSceneItemEnabled'&&r.requestData.sceneItemEnabled===false));
        assert.equal((await obs.inventory()).collection,'Kairo test');
    });
});
test('HTTP feature APIs preserve data after restart and remain inaccessible to browser sources',async t=>{
    const dir=await mkdtemp(join(tmpdir(),'kairo-feature-http-'));let app;const opts={port:18400,streamPort:18401,dataDir:dir,noSync:true,fetcher:async()=>new Response('[]',{headers:{'Content-Type':'application/json'}})};
    t.after(async()=>{await app?.close();await rm(dir,{recursive:true,force:true});});app=await startKairo(opts);
    const root=await fetch(app.origin),cookie=root.headers.get('set-cookie').split(';')[0],boot=await fetch(app.origin+'/api/bootstrap',{headers:{Cookie:cookie}}).then(r=>r.json()),headers={Cookie:cookie,Origin:app.origin,'Content-Type':'application/json','X-Kairo-CSRF':boot.csrf};
    const req=async(path,method='GET',body)=>{const r=await fetch(app.origin+'/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.ok,true,await r.clone().text());return r.json();};
    const g=await req('/goals','POST',{title:'Linked objective',target:20});await req('/goals/'+g.id,'PUT',{progress:8});
    const c=defaultStream();c.elements=[{id:'goal-widget',kind:'progress',visible:true,binding:'goal.progress',characterId:0,sourceId:g.id,bindingDisplay:'both'}];await req('/stream','PUT',c);
    await req('/places/system/30004807','PUT',{name:'UALX-3',body:'Private staging details',tags:['home'],status:'home'});
    let stream=await fetch(app.streamOrigin+'/state').then(r=>r.json());assert.equal(stream.elements[0].value,40);assert.equal(stream.elements[0].text,'Linked objective');assert.equal(JSON.stringify(stream).includes('Private staging details'),false);
    for(const path of ['/api/obs','/api/places','/api/sessions','/api/stream/sources'])assert.equal((await fetch(app.streamOrigin+path)).status,404);
    assert.equal((await fetch(app.origin+'/api/obs',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
    await app.close();app=await startKairo(opts);stream=await fetch(app.streamOrigin+'/state').then(r=>r.json());assert.equal(stream.elements[0].value,40);
});
