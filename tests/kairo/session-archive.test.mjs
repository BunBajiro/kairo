import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionArchive,mergeSessionRows} from '../../components/kairo/session-archive.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const rows=(start,count)=>Array.from({length:count},(_,i)=>({id:String(start+i),label:'Session '+(start+i)}));

test('same-pilot invalidations supersede an old archive read with one retained follow-up',async()=>{
    const reads=[],published=[];
    const owner=createSessionArchive({read:offset=>{const d=deferred();reads.push({offset,...d});return d.promise;},publish:value=>published.push(value)});
    const done=owner.refresh();for(let i=0;i<10;i++)assert.equal(owner.refresh(),done);
    assert.equal(reads.length,1);reads[0].resolve({items:rows(0,30),more:true});await tick();assert.equal(reads.length,2);assert.equal(published.length,0);
    reads[1].resolve({items:rows(1,30),more:true});await done;assert.deepEqual(published[0].items,rows(1,30));owner.close();
});
test('refresh during load-more retains the request and the loaded prefix without duplicates',async()=>{
    const reads=[],published=[];let source=rows(0,90),block=false,pending;
    const owner=createSessionArchive({read:async offset=>{reads.push(offset);if(block){block=false;pending=deferred();return pending.promise;}return {items:source.slice(offset,offset+30),more:offset+30<source.length};},publish:value=>published.push(value)});
    await owner.refresh();block=true;const more=owner.loadMore();owner.refresh();
    source=[{id:'new',label:'New session'},...source];pending.resolve({items:rows(29,30),more:true});await more;
    const last=published.at(-1);assert.equal(last.items.length,60);assert.equal(new Set(last.items.map(row=>row.id)).size,60);assert.equal(last.items[0].id,'new');
    assert.deepEqual(reads,[0,30,0,30]);owner.close();
});
test('refresh preserves loaded pages, updates renamed older rows and retains tail more flag',async()=>{
    const source=rows(0,65),published=[],reads=[];
    const owner=createSessionArchive({read:async offset=>{reads.push(offset);return {items:source.slice(offset,offset+30),more:offset+30<source.length};},publish:value=>published.push(value)});
    await owner.refresh();await owner.loadMore();await owner.loadMore();assert.equal(published.at(-1).items.length,65);assert.equal(published.at(-1).more,false);
    source[55]={...source[55],label:'Renamed debrief'};await owner.refresh();
    assert.equal(published.at(-1).items[55].label,'Renamed debrief');assert.equal(published.at(-1).items.length,65);assert.equal(published.at(-1).more,false);assert.deepEqual(reads,[0,30,60,0,30,60]);owner.close();
});
test('unmount/pilot switch releases waiters and blocks late publication/errors',async()=>{
    const first=deferred(),values=[],errors=[];const old=createSessionArchive({read:()=>first.promise,publish:value=>values.push(value),onError:error=>errors.push(error)});
    const pending=old.refresh();old.close();await pending;
    const next=createSessionArchive({read:async()=>({items:[{id:'pilot-B'}],more:false}),publish:value=>values.push(value)});await next.refresh();first.resolve({items:[{id:'pilot-A'}],more:false});await tick();
    assert.deepEqual(values.map(value=>value.items[0].id),['pilot-B']);assert.deepEqual(errors,[]);next.close();
});
test('failed page leaves retained history and supports explicit retry',async()=>{
    let fail=false;const values=[],errors=[];const owner=createSessionArchive({read:async offset=>{if(fail)throw new Error('temporary');return {items:rows(offset,30),more:offset===0};},publish:value=>values.push(value),onError:error=>errors.push(error.message)});
    await owner.refresh();fail=true;await owner.loadMore();assert.equal(values.at(-1).items.length,30);assert.deepEqual(errors,['temporary']);
    fail=false;await owner.loadMore();assert.equal(values.at(-1).items.length,60);assert.equal(values.at(-1).more,false);owner.close();
});
test('linear ID merge preserves order and refreshed head wins duplicate rows',()=>{
    assert.deepEqual(mergeSessionRows([{id:'a',label:'old'},{id:'b'}],[{id:'a',label:'new'},{id:'c'}],true),[{id:'a',label:'new'},{id:'c'},{id:'b'}]);
});
test('failed required head refresh pauses a queued tail until successful retry',async()=>{
    const values=[],errors=[],reads=[];let held=null,failHead=false,source=rows(0,90);
    const owner=createSessionArchive({read:async offset=>{reads.push(offset);if(held&&offset===30){const pending=held;held=null;return pending.promise;}if(failHead&&offset===0)throw new Error('head unavailable');return {items:source.slice(offset,offset+30),more:offset+30<source.length};},publish:value=>values.push(value),onError:error=>errors.push(error.message)});
    await owner.refresh();const delayed=deferred();held=delayed;const more=owner.loadMore();owner.refresh();source=[{id:'new'},...source];failHead=true;delayed.resolve({items:rows(29,30),more:true});await more;
    assert.deepEqual(reads,[0,30,0]);assert.equal(values.length,1);assert.deepEqual(errors,['head unavailable']);
    failHead=false;await owner.refresh();assert.deepEqual(reads,[0,30,0,0,30]);assert.equal(values.at(-1).items.length,60);assert.equal(values.at(-1).items[0].id,'new');owner.close();
});
