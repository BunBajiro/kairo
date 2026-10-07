import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../public/stream/render.js',import.meta.url),'utf8');
function browser({saved=null,path='/stream'}={}){
    let now=Date.parse('2026-10-07T10:00:00Z'),textWrites=0,storageWrites=0,denyStorage=false,stored=saved;
    class Node {
        constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.dataset={};this.style={setProperty(name,value){this[name]=value;}};this.value='';this.className='';}
        set textContent(value){textWrites++;this.value=String(value);}
        get textContent(){return this.value;}
        append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
        insertBefore(node,before){node.remove();node.parent=this;const i=this.children.indexOf(before);if(i<0)this.children.push(node);else this.children.splice(i,0,node);}
        remove(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}}
        replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.append(...nodes);}
        querySelector(selector){const name=selector.slice(1);for(const child of this.children){if(child.className.split(' ').includes(name))return child;const match=child.querySelector(selector);if(match)return match;}return null;}
    }
    const stage=new Node('main'),toasts=new Node('aside'),intervals=[],timeouts=[],listeners=new Map(),handlers=new Map();let events;
    class FakeDate extends Date{constructor(value){super(arguments.length?value:now);}static now(){return now;}}
    class EventSource{constructor(){events=this;}addEventListener(name,callback){handlers.set(name,callback);}}
    const context=vm.createContext({document:{getElementById:id=>id==='stage'?stage:toasts,createElement:tag=>new Node(tag)},location:{pathname:path},innerWidth:1920,innerHeight:1080,window:{},Date:FakeDate,EventSource,setInterval:callback=>intervals.push(callback),setTimeout:callback=>timeouts.push(callback),addEventListener:(name,callback)=>listeners.set(name,callback),localStorage:{getItem:()=>stored,setItem:(_key,value)=>{if(denyStorage)throw new Error('Quota exceeded');storageWrites++;stored=value;}}});
    vm.runInContext(source,context,{filename:'public/stream/render.js'});
    return {stage,toasts,emit(state){handlers.get('state')({data:JSON.stringify(state)});},toast(value){handlers.get('toast')({data:JSON.stringify(value)});},disconnect(){events.onerror();},tick(ms=0){now+=ms;for(const callback of intervals)callback();},get now(){return now;},get textWrites(){return textWrites;},get storageWrites(){return storageWrites;},get stored(){return stored;},deny(){denyStorage=true;},widget(id){return stage.children.find(node=>node.dataset.id===id);}};
}
const element=(id,kind='text',part={})=>({id,kind,x:40,y:60,width:400,height:120,fontSize:24,color:'#97ebce',opacity:.7,label:'',text:'Static',visible:true,appearance:'frame',...part});
const state=(elements,part={})=>({elements,opsec:{state:'clear',hidden:false},paused:false,muted:true,position:'top-right',toasts:[],...part});

test('actual renderer only writes changed time text; paused/ineligible widgets do no clock work',()=>{
    const b=browser(),elements=[element('clock','clock'),element('static'),element('bound','countdown',{bindingStatus:'unavailable',text:'Source unavailable'})];
    b.emit(state(elements));const initial=b.textWrites;
    for(let n=0;n<3;n++)b.tick(250);assert.equal(b.textWrites,initial,'three same-second ticks do not assign text');
    b.tick(250);assert.equal(b.textWrites,initial+1);assert.equal(b.widget('clock').querySelector('.content').textContent,'10:00:01 EVE');
    b.emit(state(elements));assert.equal(b.textWrites,initial+1,'unchanged state does not assign widget text');
    b.emit(state(elements,{paused:true}));const paused=b.textWrites;b.tick(1000);assert.equal(b.textWrites,paused);assert.equal(b.stage.children.length,0);
});

test('volatile binding/timestamp/protection packets do not rewrite storage; latest recovery geometry is persisted',()=>{
    const b=browser(),cover=element('cover','opsec',{x:200,width:520,text:'Protected'}),bound=element('balance','text',{bindingStatus:'ready',text:'100 ISK',value:10,detail:'old'});
    b.emit(state([cover,bound],{version:1,serverTime:10}));assert.equal(b.storageWrites,1);
    b.emit(state([cover,{...bound,text:'200 ISK',value:20,detail:'new',startedAt:100}],{version:2,serverTime:20,toasts:[],opsec:{state:'manual',hidden:true}}));
    assert.equal(b.storageWrites,1);assert.equal(b.widget('cover').dataset.context,'manual','protection is immediate');
    assert.equal(b.widget('balance').querySelector('.content').textContent.includes(':'),true);
    const moved={...cover,x:800,width:700};b.emit(state([moved,bound]));assert.equal(b.storageWrites,2);
    const saved=JSON.parse(b.stored);assert.equal(saved.elements[0].x,800);assert.equal(saved.elements[0].width,700);assert.equal(saved.elements[1].text,'Source disconnected');assert.equal(saved.opsec,undefined);assert.equal(saved.serverTime,undefined);
    const restored=browser({saved:b.stored});assert.equal(restored.widget('cover').dataset.context,'unknown');assert.equal(restored.widget('cover').style.left,'800px');assert.equal(restored.widget('cover').style.width,'700px');assert.equal(restored.widget('balance').querySelector('.content').textContent,'Source disconnected');
});

test('storage failure never blocks protection, latest cover geometry or disconnect/reconnect safety',()=>{
    const b=browser();b.deny();const cover=element('cover','opsec');
    b.emit(state([cover]));assert.equal(b.widget('cover'),undefined);
    b.emit(state([{...cover,x:444,width:800}],{opsec:{state:'manual',hidden:true}}));
    assert.equal(b.widget('cover').dataset.context,'manual');assert.equal(b.widget('cover').style.left,'444px');
    b.emit(state([{...cover,x:500,width:900}]));assert.equal(b.widget('cover'),undefined);
    b.disconnect();assert.equal(b.widget('cover').dataset.context,'unknown');assert.equal(b.widget('cover').style.left,'500px');assert.equal(b.widget('cover').style.width,'900px');
    b.emit(state([{...cover,x:600,width:1000}]));assert.equal(b.widget('cover'),undefined,'verified clear reconnect releases the cover');assert.equal(b.storageWrites,0);
});

test('renderer preserves node order, toast bounds and immediate disconnect disposal',()=>{
    const b=browser(),one=element('one'),two=element('two');b.emit(state([one,two]));const first=b.widget('one');
    b.emit(state([two,one]));assert.equal(b.stage.children[1],first);assert.deepEqual(b.stage.children.map(n=>n.dataset.id),['two','one']);
    for(let i=0;i<5;i++)b.toast({id:'toast-'+i,message:'event '+i,expiresAt:b.now+6000});assert.equal(b.toasts.children.length,3);
    const writes=b.textWrites;b.toast({id:'toast-4',message:'event 4',expiresAt:b.now+6000});assert.equal(b.textWrites,writes);
    b.disconnect();assert.equal(b.toasts.children.length,0);
});

test('a widget-only source clocks only its visible widget and restores an OPSEC widget fail-closed',()=>{
    const b=browser({path:'/stream/widget/one'});b.emit(state([element('one','clock'),element('two','clock')]));const writes=b.textWrites;b.tick(1000);assert.equal(b.textWrites,writes+1);assert.equal(b.stage.children.length,1);
    const protection=browser({path:'/stream/opsec'});protection.emit(state([element('one','clock'),element('cover','opsec')],{opsec:{state:'manual',hidden:true}}));const p=protection.textWrites;protection.tick(1000);assert.equal(protection.textWrites,p);assert.deepEqual(protection.stage.children.map(n=>n.dataset.id),['cover']);
});
