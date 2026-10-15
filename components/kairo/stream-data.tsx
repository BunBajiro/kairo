"use client";
import {Link2,Braces} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Choice} from './ui';
import {useKairo} from './context';
import type {StreamElement,ToastRule} from './model';
export function StreamBinding({element:e,patch,sources,projection}:{element:StreamElement;patch:(p:Partial<StreamElement>)=>void;sources:any;projection:any}){
 const {boot}=useKairo();if(['opsec','clock','divider'].includes(e.kind))return null;const char=e.characterId??(boot.settings.opsec.characterId||boot.characters[0]?.id||0);
 const choices=e.kind==='goal'?[{value:'goal.progress',label:'Goals · an existing objective'}]:e.kind==='progress'?[{value:'goal.progress',label:'Goals · an existing objective'},{value:'training.remaining',label:'Training · current skill progress'},{value:'industry.next',label:'Industry · next job progress'}]:e.kind==='countdown'?[{value:'training.remaining',label:'Training · current skill'},{value:'industry.next',label:'Industry · next job'}]:[{value:'goal.progress',label:'Goals · an existing objective'},{value:'session.elapsed',label:'Sessions · active session timer'},{value:'session.report',label:'Sessions · session kills / losses'},{value:'goals.completed',label:'Goals · completed count'},{value:'wallet.balance',label:'Wallet · balance'},{value:'pilot.ship',label:'Pilot · current hull'},{value:'training.remaining',label:'Training · current skill'},{value:'industry.next',label:'Industry · next job'}];
 const goals=(sources?.goals||[]),options=goals.map((g:any)=>({value:g.id,label:g.title+' · '+(boot.characters.find(c=>c.id===g.character_id)?.name||(g.character_id?'Disconnected character':'Local'))+(g.done?' · complete':'')}));if(e.sourceId&&!options.some((o:any)=>o.value===e.sourceId))options.push({value:e.sourceId,label:'Goal unavailable · select another'});
 return <div className="binding-controls"><label className="field-label"><span className="flex gap-2 items-center"><Link2 size={14}/> Pull from Kairo</span><Choice label="Widget data source" value={e.binding||'none'} onChange={binding=>patch({binding,characterId:char,bindingDisplay:e.bindingDisplay||'both'})} options={[{value:'none',label:'Custom text / value'},...choices]}/></label>{e.binding&&e.binding!=='none'&&<>{e.binding!=='goal.progress'&&<label className="field-label">Character<Choice label="Widget source character" value={String(char)} onChange={v=>patch({characterId:Number(v),sourceId:''})} options={[{value:'0',label:'Local goals (no character)'},...boot.characters.map(c=>({value:String(c.id),label:c.name}))]}/></label>}{e.binding==='goal.progress'&&<><label className="field-label">Existing goal<Choice label="Existing Kairo goal" value={e.sourceId||'choose'} onChange={sourceId=>patch({sourceId:sourceId==='choose'?'':sourceId,characterId:goals.find((g:any)=>g.id===sourceId)?.character_id??char})} options={[{value:'choose',label:goals.length?'Choose an objective':'Create a goal in Kairo first'},...options]}/></label><label className="field-label">Text content<Choice label="Goal text content" value={e.bindingDisplay||'both'} onChange={bindingDisplay=>patch({bindingDisplay})} options={[{value:'both',label:'Title and progress numbers'},{value:'title',label:'Title only'},{value:'numbers',label:'Progress numbers only'}]}/></label><p className="meta">The bar follows this goal’s percentage. Updates in Goals appear in OBS automatically.</p></>}<div className="binding-preview"><span className="eyebrow">LINK PREVIEW</span><strong>{projection?.text||(projection?.startedAt?'Active session timer':'Waiting for source')}</strong>{projection?.detail&&<small>{projection.detail}</small>}{['goal','progress'].includes(e.kind)&&<div className="mini-binding-bar"><i style={{width:(projection?.value||0)+'%'}}/></div>}<span className="meta">{projection?.bindingStatus==='unavailable'?'Source missing, stale, disabled or not authorized.':projection?.bindingStatus==='idle'?'Source has no active item.':'Follows the selected record when saved.'}</span></div><p className="meta">Saving approves these fields for your stream. Goal names, balances and hull names can become visible to viewers.</p></>}</div>;
}
const toastSignals:Record<string,[string,string,string]>={
 'test.toast':['SIGNAL','+','info'],
 'skill.completed':['TRAINING COMPLETE','↑','info'],
 'industry.ready':['INDUSTRY READY','▦','info'],
 'goal.completed':['OBJECTIVE COMPLETE','✓','success'],
 'session.started':['FLIGHT LOG','↗','info'],
 'session.ended':['FLIGHT LOG','↗','info'],
 'killmail.kill':['KILL CONFIRMED','+','success'],
 'killmail.loss':['LOSS RECORDED','−','danger'],
 'location.changed':['SYSTEM ENTERED','↗','info'],
 'opsec.changed':['PROTECTION','!','warning']
};
export function ToastContextControls({rule:r,schema,onChange}:{rule:ToastRule;schema:any;onChange:(p:Partial<ToastRule>)=>void}){
 const {boot,opsec}=useKairo();if(!schema)return null;
 const preview=(text:string)=>text.replace(/\{\{\s*(\w+)\s*\}\}/g,(_,key)=>['system','region'].includes(key)&&opsec?.hidden&&!r.allowLocation?'Protected location':String(schema.sample?.[key]??'—'));
 const [topic,mark,tone]=toastSignals[r.event]||toastSignals['test.toast'];
 return <div className="toast-context-controls">
  <div className="flex gap-2 items-center justify-between"><span className="meta">Event context fields</span><Button size="sm" variant="ghost" onClick={()=>onChange({title:schema.title,message:schema.message})}><Braces size={13}/> Use event context</Button></div>
  <div className="token-buttons">{schema.fields.map((field:string)=><button key={field} title={'Append '+field+' to message'} onClick={()=>onChange({message:(r.message+' {{'+field+'}}').slice(0,240)})}>{'{{'+field+'}}'}</button>)}</div>
  <label className="field-label">Fire for<Choice label="Notification character" value={String(r.characterId||0)} onChange={v=>onChange({characterId:Number(v)})} options={[{value:'0',label:'All connected characters'},...boot.characters.map(c=>({value:String(c.id),label:c.name}))]}/></label>
  {schema.fields.some((f:string)=>['system','region'].includes(f))&&<label className="setting-row"><span className="meta">Allow location fields while protected</span><Switch aria-label="Allow notification location while protected" checked={!!r.allowLocation} onCheckedChange={allowLocation=>onChange({allowLocation})}/></label>}
  <div className="toast-preview">
   <span className="toast-preview-label">EXAMPLE PREVIEW</span>
   <div className="kairo-toast toast-sample" data-tone={tone}>
    <div className="toast-meta"><div className="kicker"><span className="signal-mark">{mark}</span><span className="signal-topic">{topic}</span></div><time>12:34 EVE</time></div>
    <p className="toast-message">{preview(r.message).trim()||preview(r.title)}</p>
    <div className="lifeline"/>
   </div>
  </div>
 </div>;
}
