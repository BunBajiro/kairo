'use strict';
const stage=document.getElementById('stage'),toastLane=document.getElementById('toasts');
let current={elements:[],opsec:{state:'unknown',hidden:true},paused:false,position:'top-right',toasts:[]},connected=false;
const seen=new Set(),active=new Map(),widgets=new Map(),timeWidgets=new Map();
let savedLayout='';
function setText(node,value){const text=String(value??'');if(node.textContent!==text)node.textContent=text;}
const pathname=location.pathname,onlyToasts=pathname==='/stream/toasts',onlyOpsec=pathname==='/stream/opsec',widgetId=pathname.startsWith('/stream/widget/')?pathname.split('/').pop():null;
const two=n=>String(n).padStart(2,'0');
function duration(end){if(!end)return '--:--:--';const n=Math.max(0,Math.floor((end-Date.now())/1000));return two(Math.floor(n/3600))+':'+two(Math.floor(n%3600/60))+':'+two(n%60);}
function elapsed(at){const n=Math.max(0,Math.floor((Date.now()-at)/1000));return two(Math.floor(n/3600))+':'+two(Math.floor(n%3600/60))+':'+two(n%60);}
function scale(){
    const s=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform=`scale(${s})`;
    Object.assign(toastLane.style,{width:'440px',transform:`scale(${s})`,fontSize:'16px',top:'',bottom:'',left:'',right:''});
    const [vertical,horizontal]=(current.position||'top-right').split('-');toastLane.dataset.side=horizontal;
    toastLane.style.transformOrigin=vertical+' '+horizontal;toastLane.style[vertical]=32*s+'px';toastLane.style[horizontal]=32*s+'px';
}
function elementText(e){if(e.bindingStatus&&!connected)return 'Source disconnected';if(e.startedAt)return elapsed(e.startedAt);if(e.kind==='clock')return new Date().toISOString().slice(11,19)+' EVE';if(e.kind==='countdown')return e.bindingStatus&&e.bindingStatus!=='ready'?e.text:duration(e.endsAt);return e.text;}
function part(tag,className,parent){const node=document.createElement(tag);node.className=className;parent.append(node);return node;}
function makeWidget(e){
    const node=document.createElement('section');node.className='element kairo-widget '+e.kind+(e.kind==='opsec'?'':' widget-enter');node.dataset.id=e.id;node.dataset.kind=e.kind;
    const label=part('span','widget-label',node),content=part('div','content widget-value',node),detail=part('div','widget-detail',node),bar=part('div','widget-bar',node),fill=part('div','widget-fill',bar);
    return {node,label,content,detail,bar,fill};
}
function render(){
    const opsec=connected?current.opsec:{state:'unknown',hidden:true},visible=new Set();
    timeWidgets.clear();
    if(!onlyToasts) for(const e of current.elements||[]){
        if(widgetId&&e.id!==widgetId||onlyOpsec&&e.kind!=='opsec'||current.paused&&e.kind!=='opsec'||e.kind==='opsec'&&!opsec.hidden)continue;
        visible.add(e.id);let widget=widgets.get(e.id);
        if(widget&&widget.node.dataset.kind!==e.kind){widget.node.remove();widgets.delete(e.id);widget=null;}
        if(!widget){widget=makeWidget(e);widgets.set(e.id,widget);}
        const {node,label,content,detail,bar,fill}=widget;
        node.dataset.context=opsec.state;node.dataset.appearance=e.appearance||'frame';
        Object.assign(node.style,{left:e.x+'px',top:e.y+'px',width:e.width+'px',height:e.height+'px',fontSize:e.fontSize+'px',background:e.kind==='opsec'?'#080b0f':e.kind==='panel'||e.appearance==='minimal'?`rgba(0,0,0,${e.opacity})`:'transparent'});node.style.setProperty('--accent',e.color);node.style.setProperty('--widget-opacity',e.opacity);
        setText(label,e.kind==='opsec'?e.label||'//IMPERIUM BROADCAST RULES':e.label);
        setText(content,e.kind==='opsec'?e.text||'//Element Disabled':elementText(e));
        if((!e.bindingStatus||connected&&e.bindingStatus==='ready')&&(e.kind==='clock'||e.kind==='countdown'||e.startedAt))timeWidgets.set(e.id,e);
        const detailText=e.kind==='countdown'&&e.bindingStatus==='ready'?[e.text,e.detail].filter(Boolean).join(' · '):e.detail||'';
        setText(detail,detailText);detail.hidden=!detailText;bar.hidden=!['goal','progress'].includes(e.kind);
        fill.style.width=Math.max(0,Math.min(100,e.value||0))+'%';
        if(e.kind==='divider')node.style.background=e.color;
        // Append only when ordering changes; ordinary data refreshes preserve
        // nodes, progress transitions and entrance animation state.
        const previous=stage.children[visible.size-1];if(previous!==node)stage.insertBefore(node,previous||null);
    }
    for(const [id,widget] of widgets)if(!visible.has(id)){widget.node.remove();widgets.delete(id);}
    scale();
    if(current.paused){toastLane.replaceChildren();active.clear();}
    for(const [id,node] of active)if(!(current.toasts||[]).some(t=>t.id===id)){node.remove();active.delete(id);}
    for(const t of current.toasts||[])showToast(t);
}
function playSound(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=660;gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18);osc.start();osc.stop(ctx.currentTime+.2);osc.onended=()=>ctx.close();}catch{}}
const signals={notification:['SIGNAL','+','info'],training:['TRAINING COMPLETE','↑','info'],industry:['INDUSTRY READY','▦','info'],objective:['OBJECTIVE COMPLETE','✓','success'],session:['FLIGHT LOG','↗','info'],kill:['KILL CONFIRMED','+','success'],loss:['LOSS RECORDED','−','danger'],navigation:['SYSTEM ENTERED','↗','info'],protection:['PROTECTION','!','warning']};
// Older rules with an empty message can still use their saved wording.
const toastText=t=>t.message?.trim()||t.title||'';
function showToast(t){
    if(onlyOpsec||widgetId||current.paused||t.expiresAt<=Date.now())return;
    if(active.has(t.id)){setText(active.get(t.id).querySelector('.toast-message'),toastText(t));return;}
    if(seen.has(t.id))return;seen.add(t.id);if(seen.size>500)seen.delete(seen.values().next().value);
    while(active.size>=3){const [id,node]=active.entries().next().value;node.remove();active.delete(id);}
    const node=document.createElement('article');node.className='toast kairo-toast';
    node.style.setProperty('--duration',Math.max(.18,(t.expiresAt-Date.now())/1000)+'s');
    const [topic,mark,tone]=signals[t.signal]||signals.notification;node.dataset.tone=tone;
    const meta=part('div','toast-meta',node),kicker=part('div','kicker',meta);part('span','signal-mark',kicker).textContent=mark;part('span','signal-topic',kicker).textContent=topic;
    part('time','',meta).textContent=new Date(t.showAt||Date.now()).toISOString().slice(11,16)+' EVE';
    part('p','toast-message',node).textContent=toastText(t);part('div','lifeline',node);
    toastLane.append(node);active.set(t.id,node);if(t.sound&&!current.muted)playSound();
    setTimeout(()=>{node.remove();active.delete(t.id);},Math.max(0,t.expiresAt-Date.now()));
}
// Recovery needs current geometry and static wording, not server timestamps or
// volatile bound values. Covers are always restored UNKNOWN/fail-closed.
function recoveryLayout(state){return {position:state.position,muted:state.muted,paused:state.paused,elements:(state.elements||[]).map(e=>{
    if(!e.bindingStatus)return e;
    const {text,detail,value,startedAt,endsAt,bindingStatus,...layout}=e;
    return {...layout,text:'Source disconnected',detail:'',value:0,startedAt:0,endsAt:0,bindingStatus:'disconnected'};
})};}
function persistLayout(){try{const next=JSON.stringify(recoveryLayout(current));if(next!==savedLayout){localStorage.setItem('kairo-safe-layout',next);savedLayout=next;}}catch{}}
try{const saved=JSON.parse(localStorage.getItem('kairo-safe-layout')||'null');if(saved?.elements){current={...current,...saved,toasts:[],opsec:{state:'unknown',hidden:true}};savedLayout=JSON.stringify(recoveryLayout(current));render();}}catch{}
const events=new EventSource('/events');
// Render protection immediately. Storage denial/quota failures must never block it.
events.addEventListener('state',e=>{try{current=JSON.parse(e.data);connected=true;render();persistLayout();}catch{}});
events.addEventListener('toast',e=>{try{showToast(JSON.parse(e.data));}catch{}});
events.onerror=()=>{connected=false;current.toasts=[];toastLane.replaceChildren();active.clear();render();};
setInterval(()=>{for(const [id,e] of timeWidgets){const content=widgets.get(id)?.content;if(content)setText(content,elementText(e));}},250);
addEventListener('resize',scale);scale();
