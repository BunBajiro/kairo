import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioDrag,createStudioPreview,studioDragPoint,studioProjectionKey,studioSourceChanged,studioSourceRevision} from '../../components/kairo/studio-work.mjs';
import {bindingProjections} from '../../server/projections.mjs';
import {sanitizeConfig} from '../../server/stream.mjs';
const widget={id:'one',kind:'text',binding:'wallet.balance',characterId:42,sourceId:'',bindingDisplay:'both',x:40,y:40,width:500,height:100};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};};
// flush runs one captured batch only: jobs queued by callbacks wait for the
// next flush, matching a later frame/debounce turn rather than recursive delivery.
function timers(){let seq=0;const jobs=new Map();return {schedule:fn=>{jobs.set(++seq,fn);return seq;},cancel:id=>jobs.delete(id),flush(){const now=[...jobs.values()];jobs.clear();for(const fn of now)fn();},get size(){return jobs.size;}};}

test('geometry/wording/style edits preserve the actual endpoint projection input; binding and pilot edits invalidate it',()=>{
    const key=studioProjectionKey([widget]);
    assert.equal(studioProjectionKey([{...widget,x:72,y:96,width:800,height:300,text:'local wording',label:'local label',fontSize:42,color:'#123456',visible:false,opacity:.5}]),key);
    for(const part of [{characterId:43},{sourceId:'new-source'},{bindingDisplay:'numbers'},{binding:'pilot.ship'},{id:'two'},{kind:'progress'}])assert.notEqual(studioProjectionKey([{...widget,...part}]),key);
    assert.equal(studioProjectionKey([{...widget,kind:'clock'}]),'[]');
    const now=Date.now(),store={snapshot:()=>({data:100,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString()}),get:(_key,fallback)=>fallback},auth={characters:()=>[{id:42}]};
    const whole=sanitizeConfig({elements:[{...widget,x:500,text:'draft'}],rules:[]});
    const minimal=sanitizeConfig({elements:JSON.parse(key),rules:[]});
    assert.deepEqual(bindingProjections(store,auth,minimal.elements),bindingProjections(store,auth,whole.elements));
});

test('preview requests debounce and never publish a superseded pilot/source, including invalidation during an in-flight read',async()=>{
    const timer=timers(),reads=[],values=[];
    const owner=createStudioPreview({read:input=>{const d=deferred();reads.push({input,...d});return d.promise;},publish:value=>values.push(value),setTimer:timer.schedule,clearTimer:timer.cancel});
    owner.request('A');owner.request('B');timer.flush();assert.equal(reads.length,1);assert.equal(reads[0].input,'B');
    owner.request('C');timer.flush();assert.equal(reads.length,1,'one transport in flight');
    reads[0].resolve('stale B');await tick();assert.equal(reads.length,2);assert.deepEqual(values,[]);
    reads[1].resolve('latest C');await tick();assert.deepEqual(values,['latest C']);
    owner.request('D');timer.flush();owner.close();reads[2].resolve('after unmount');await tick();assert.deepEqual(values,['latest C']);assert.equal(timer.size,0);
});

test('preview disposal removes queued work and a current failure permits the next refresh',async()=>{
    const timer=timers(),errors=[],values=[];let calls=0;
    const owner=createStudioPreview({read:async()=>{if(++calls===1)throw new Error('temporary');return 'recovered';},publish:v=>values.push(v),onError:e=>errors.push(e.message),setTimer:timer.schedule,clearTimer:timer.cancel});
    owner.request('first');timer.flush();await tick();assert.deepEqual(errors,['temporary']);
    owner.request('second');timer.flush();await tick();assert.deepEqual(values,['recovered']);
    owner.request('unmounted');owner.close();timer.flush();await tick();assert.equal(calls,2);
});

test('drag bursts commit once per frame, clamp/grid correctly, and pointer-up commits the latest point before its frame',()=>{
    const frames=timers(),values=[],drag=createStudioDrag({commit:p=>values.push(p),requestFrame:frames.schedule,cancelFrame:frames.cancel});
    const start={...widget,px:100,py:100};
    for(let n=0;n<100;n++)drag.move(studioDragPoint(start,100+n,100+n,{width:960,height:540}));
    assert.equal(frames.size,1);assert.equal(values.length,0);frames.flush();assert.deepEqual(values,[{id:'one',x:240,y:240}]);
    drag.move({id:'one',x:500,y:500});drag.finish(studioDragPoint(start,9999,-9999,{width:960,height:540}));
    assert.deepEqual(values.at(-1),{id:'one',x:1420,y:0});assert.equal(frames.size,0);frames.flush();assert.equal(values.length,2);
    drag.move({id:'one',x:800,y:800});drag.cancel();frames.flush();assert.equal(values.length,2);
    assert.equal(studioDragPoint(start,1,1,{width:0,height:0}),null);
});

test('preview invalidation follows bound pilots/resources, manual Goals, Session activity and reconnect',()=>{
    const key=studioProjectionKey([widget]);
    assert.equal(studioSourceChanged(key,{characterId:43,resource:'snapshot',key:'wallet'}),false);
    assert.equal(studioSourceChanged(key,{characterId:42,resource:'snapshot',key:'ship'}),false);
    assert.equal(studioSourceChanged(key,{characterId:42,resource:'snapshot',key:'wallet'}),true);
    const goal=studioProjectionKey([{...widget,binding:'goal.progress',characterId:43}]);
    assert.equal(studioSourceChanged(goal,{characterId:43,resources:['goals']}),true);
    assert.equal(studioSourceChanged(goal,{characterId:42,resources:['goals']}),false);
    assert.equal(studioSourceChanged(goal,{characterId:43,resource:'snapshot',key:'assets'}),true);
    const session=studioProjectionKey([{...widget,binding:'session.report'}]);
    assert.equal(studioSourceChanged(session,{characterId:42,resources:['activity']}),true);
    assert.equal(studioSourceChanged(key,{resources:['recovery']}),true);
    assert.equal(studioSourceChanged('[]',{resources:['recovery']}),false);
    assert.equal(studioSourceRevision(key,42,{wallet:{status:'ready',updatedAt:'one'},ship:{status:'ready',updatedAt:'one'}},[]),studioSourceRevision(key,42,{wallet:{status:'ready',updatedAt:'one'},ship:{status:'ready',updatedAt:'two'}},[{id:'irrelevant'}]));
    assert.notEqual(studioSourceRevision(key,42,{wallet:{status:'ready',updatedAt:'one'}},[]),studioSourceRevision(key,42,{wallet:{status:'stale',updatedAt:'one'}},[]));
});
