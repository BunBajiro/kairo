"use client";
import {useMemo, useState} from 'react';
import {ArrowLeft, ArrowUpRight, Check, ChevronRight, Clock, Globe2, HelpCircle, Plus, Search, Settings2, Shield, Swords, TriangleAlert, Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {stamp} from './model';
import type {UniverseIntel} from './universe-types';

type Membership = {alliance_id?:number;group_id?:string|null;name?:string;color?:string;source:string;evidence_label?:string;reason?:string};
type Group = {id:string;name:string;color:string;source:'configured'|'inferred';alliance_ids:number[];member_names?:{alliance_id:number;name:string}[];config_revision?:number|string;evidence?:{label?:string;cooperative_encounters?:number;hostile_encounters?:number;distinct_days?:number;territory_neighbor_pairs?:number;[key:string]:unknown}};
const number=(n:unknown)=>typeof n==='number'?n.toLocaleString('en-GB'):'—';
function sourceLabel(source:string){return source==='configured'?'User configured':source==='inferred'?'Inferred':source==='independent'?'Kept independent':'Unassigned';}
type Assessment = {status?:string;inference_enabled?:boolean;generated_at?:string|null;groups?:{source:string}[]};
export function inferenceAssessmentNotice(politics?:Assessment){
 if(!politics)return null;
 if(politics.inference_enabled===false||politics.status==='disabled')return {kind:'disabled',title:'Inferred fallback is off',detail:'Your configured blocs and independent-alliance choices determine this view. Unconfigured alliances stay unassigned.',when:null};
 if(politics.status!=='stale'&&politics.status!=='unavailable')return null;
 const at=politics.generated_at,hasDate=!!at&&Number.isFinite(Date.parse(at));
 const minutes=hasDate?Math.max(0,Math.floor((Date.now()-Date.parse(at!))/60000)):0;
 const quantity=minutes<60?minutes:minutes<1440?Math.floor(minutes/60):Math.floor(minutes/1440),unit=minutes<60?'minute':minutes<1440?'hour':'day';
 const age=minutes<1?'just now':quantity+' '+unit+(quantity===1?'':'s')+' ago';
 const when=hasDate?'Last assessment: '+stamp(at!)+' · '+age:'No inference assessment is available yet.';
 const retained=politics.groups?.some(group=>group.source==='inferred');
 return politics.status==='stale'
  ?{kind:'stale',title:'Inferred relationships may be outdated',detail:(retained?'Earlier inferred groups are still shown while fresh observations are unavailable. ':'Fresh relationship evidence is unavailable. ')+'Configured memberships continue to use your settings.',when}
  :{kind:'unavailable',title:'Inference is unavailable',detail:'There is not enough usable combat evidence to assess affiliations. Configured blocs still apply; other alliances stay unassigned.',when};
}

export function PowerBlocMembership({membership,onInspect}:{membership?:Membership|null;onInspect:(id:string|null)=>void}){
 if(!membership)return null;
 const grouped=membership.source==='configured'||membership.source==='inferred';
 return <div className={'universe-membership '+membership.source}>
  <div className="universe-membership-heading"><Users size={17}/><span>Power bloc</span><span className={'universe-source-badge '+membership.source}>{sourceLabel(membership.source)}</span></div>
  {grouped?<button className="universe-member-link" onClick={()=>onInspect(membership.group_id||null)}><i style={{background:membership.color||'#8e9ba9'}}/><strong>{membership.name}</strong><ChevronRight size={18}/></button>:<strong>{membership.source==='independent'?'Independent alliance':'No supported affiliation'}</strong>}
  <p>{membership.source==='configured'?'Membership set in your Universe configuration.':membership.source==='inferred'?(membership.evidence_label||'Estimated from observed relationships. May not match a formal coalition.'):(membership.reason||'The alliance retains its own identity and territory.')}</p>
 </div>;
}

export function PowerBlocExplorer({intel,selectedGroup,onSelectGroup,onSettings,onSelectSystem}:{intel:UniverseIntel|null;selectedGroup:string|null;onSelectGroup:(id:string|null)=>void;onSettings:()=>void;onSelectSystem:(id:number)=>void}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const politics=intel?.politics;
 const assessment=inferenceAssessmentNotice(politics);
 const groups:Group[]=politics?.groups||[];
 const systems=useMemo(()=>{const counts=new Map<string,number>();for(const system of intel?.systems||[]){const id=system.power_bloc?.group_id;if(id)counts.set(id,(counts.get(id)||0)+1);}return counts;},[intel?.systems]);
 const group=groups.find(g=>g.id===selectedGroup);
 const rows=groups.filter(g=>(filter==='all'||g.source===filter)&&(!query||[g.name,...(g.member_names||[]).map(member=>member.name)].join(' ').toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>(systems.get(b.id)||0)-(systems.get(a.id)||0)||a.name.localeCompare(b.name));
 const coverage=politics?.coverage;
 const memberName=(g:Group,id:number,_index:number)=>(g.member_names||[]).find(member=>member.alliance_id===id)?.name||'Alliance '+id;
 return <section className="universe-bloc-explorer" aria-label="Power bloc intelligence">
  <div className="universe-tool-heading"><Users size={23}/><div><h3>Power blocs</h3><p>{assessment?.kind==='disabled'?'Your configured power blocs.':'Your groups, with inferred fallback.'}</p></div><button className="universe-config-icon" onClick={onSettings} aria-label="Configure Universe power blocs" title="Configure power blocs"><Settings2 size={20}/></button></div>
  {assessment&&<div className={'universe-assessment-notice '+assessment.kind} role="status">{assessment.kind==='disabled'?<Settings2 size={19}/>:<TriangleAlert size={19}/>}<div><strong>{assessment.title}</strong><p>{assessment.detail}</p>{assessment.when&&<small>{assessment.when}</small>}</div></div>}
  {group?<>
   <button className="universe-bloc-back" onClick={()=>onSelectGroup(null)}><ArrowLeft size={16}/>All power blocs</button>
   <div className={'universe-bloc-focus '+group.source} style={{borderLeftColor:group.color}}><span className={'universe-source-badge '+group.source}>{group.source==='configured'?<Check size={13}/>:<HelpCircle size={13}/>} {sourceLabel(group.source)}</span><h3>{group.name}</h3><div className="universe-bloc-stats"><span><strong>{number(group.alliance_ids.length)}</strong>Alliances</span><span><strong>{number(systems.get(group.id)||0)}</strong>Sovereign systems</span></div></div>
   {group.source==='inferred'?<>
    <p className="universe-inference-note"><HelpCircle size={18}/><span>This is an estimate from observed relationships. It may not match a formal coalition.</span></p>
    <div className="universe-evidence-grid"><div><Swords size={17}/><strong>{number(group.evidence?.cooperative_encounters)}</strong><span>Shared encounters</span></div><div><Clock size={17}/><strong>{number(group.evidence?.distinct_days)}</strong><span>Distinct days</span></div><div><Shield size={17}/><strong>{number(group.evidence?.hostile_encounters)}</strong><span>Opposing encounters</span></div><div><Globe2 size={17}/><strong>{number(group.evidence?.territory_neighbor_pairs)}</strong><span>Neighbouring holdings</span></div></div>
    {group.evidence?.label&&<p className="universe-evidence-label">{group.evidence.label}</p>}
   </>:<p className="universe-small-note">This membership is set by you. Inference cannot add alliances to it or change it.</p>}
   <div className="universe-bloc-member-heading"><h4>Member alliances</h4><span>{group.alliance_ids.length}</span></div>
   <div className="universe-bloc-members">{group.alliance_ids.map((id,index)=>{const owned=(intel?.systems||[]).filter(s=>s.sovereignty?.alliance_id===id);return <div key={id}><span className="universe-alliance-mark"><Shield size={17}/></span><div><strong>{memberName(group,id,index)}</strong><small>{number(owned.length)} sovereign systems</small></div>{owned.length>0&&<button title="Inspect an owned system" aria-label={'Inspect a system owned by '+memberName(group,id,index)} onClick={()=>onSelectSystem(owned[0].system_id)}><ArrowUpRight size={18}/></button>}</div>;})}</div>
   {group.source==='configured'&&<Button variant="outline" className="universe-wide" onClick={onSettings}><Settings2 size={17}/>Edit this configuration</Button>}
  </>:<>
   <div className="universe-bloc-search"><Search size={17}/><Input aria-label="Search power blocs and member alliances" placeholder="Find a bloc or alliance…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="universe-bloc-filters" role="group" aria-label="Membership source">{[{id:'all',label:'All'},{id:'configured',label:'Configured'},{id:'inferred',label:'Inferred'}].map(f=><button key={f.id} className={filter===f.id?'active':''} aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div>
   <div className="universe-bloc-list">{rows.map(g=><button key={g.id} onClick={()=>onSelectGroup(g.id)} className={'universe-bloc-row '+g.source}><i className="universe-bloc-swatch" style={{background:g.color}}/><span><strong>{g.name}</strong><small>{g.alliance_ids.length} alliances · {number(systems.get(g.id)||0)} systems</small><span className={'universe-source-badge '+g.source}>{sourceLabel(g.source)}</span></span><ChevronRight size={18}/></button>)}</div>
   {!rows.length&&<div className="universe-bloc-empty"><Users size={30}/><h4>{query?'No matching power blocs':filter==='configured'?'Build your political map':'No supported groups yet'}</h4><p>{query?'Try a bloc name or member alliance.':filter==='inferred'?'Inference needs repeated cooperation across separate encounters. Thin or missing evidence leaves alliances unassigned.':'Create named blocs and add member alliances in Settings. Inference only fills gaps when the evidence supports it.'}</p>{!query&&<Button variant="outline" onClick={onSettings}><Plus size={17}/>Configure power blocs</Button>}</div>}
   <div className="universe-unassigned-key"><i/><span><strong>Unassigned stays separate</strong><small>Alliances with insufficient evidence retain their own territory.</small></span></div>
  </>}
  <details className="universe-disclosure universe-evidence-coverage"><summary>Evidence & coverage<span>{politics?.status?.replaceAll('_',' ')||'Loading'}</span></summary><p>{coverage?.label||'Inference uses locally observed combat. It is not a complete picture of New Eden.'}</p><dl><dt>Observed killmails</dt><dd>{number(coverage?.killmails)}</dd><dt>Alliances observed</dt><dd>{number(coverage?.alliance_count)}</dd>{coverage?.oldest_at&&<><dt>Evidence begins</dt><dd>{stamp(coverage.oldest_at)}</dd></>}{coverage?.newest_at&&<><dt>Latest evidence</dt><dd>{stamp(coverage.newest_at)}</dd></>}{politics?.generated_at&&<><dt>Last assessment</dt><dd>{stamp(politics.generated_at)}</dd></>}</dl>{coverage?.truncated&&<p className="universe-small-note">This assessment uses a bounded sample of cached combat.</p>}<p className="universe-small-note">Shared opponents and territory are supporting signals. Pilot standings remain a separate view.</p></details>
 </section>;
}
