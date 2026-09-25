"use client";
import {useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import {Activity, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock, Focus, Globe2, HelpCircle, MapPin, Plus, Search, Settings2, Shield, Swords, TriangleAlert, Users, Waypoints, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {stamp} from './model';
import type {UniverseAtlas, UniverseIntel, UniverseSystem} from './universe-types';
import type {PoliticalAtlas, PoliticalNeighbour, PoliticalRegion, PoliticalTerritory} from '../../lib/universe-political-atlas.mjs';
import './universe-politics.css';

type Membership = {alliance_id?:number;group_id?:string|null;name?:string;color?:string;source:string;evidence_label?:string;reason?:string};
type Group = {id:string;name:string;color:string;source:'configured'|'inferred';alliance_ids:number[];member_names?:{alliance_id:number;name:string}[];config_revision?:number|string;evidence?:{label?:string;cooperative_encounters?:number;hostile_encounters?:number;distinct_days?:number;territory_neighbor_pairs?:number;[key:string]:unknown}};
const number=(n:unknown)=>typeof n==='number'?n.toLocaleString('en-GB'):'—';
const activityNumber=(n:number|null)=>n===null?'—':n.toLocaleString('en-GB',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1});
const entryStyle=(index:number)=>({'--bloc-entry-delay':Math.min(index,5)*35+'ms'} as CSSProperties);
function sourceLabel(source:string){return source==='configured'?'User configured':source==='inferred'?'Inferred':source==='independent'?'Kept independent':'Unassigned';}
type Assessment = {status?:string;inference_enabled?:boolean;generated_at?:string|null;groups?:{source:string}[]};
export function inferenceAssessmentNotice(politics?:Assessment){
 if(!politics)return null;
 if(politics.inference_enabled===false||politics.status==='disabled')return {kind:'disabled',title:'Inferred fallback is off',detail:'Configured blocs still apply. Other alliances stay separate.',when:null};
 if(politics.status!=='stale'&&politics.status!=='unavailable')return null;
 const at=politics.generated_at,hasDate=!!at&&Number.isFinite(Date.parse(at));
 const minutes=hasDate?Math.max(0,Math.floor((Date.now()-Date.parse(at!))/60000)):0;
 const quantity=minutes<60?minutes:minutes<1440?Math.floor(minutes/60):Math.floor(minutes/1440),unit=minutes<60?'minute':minutes<1440?'hour':'day';
 const age=minutes<1?'just now':quantity+' '+unit+(quantity===1?'':'s')+' ago';
 const when=hasDate?'Last assessment: '+stamp(at!)+' · '+age:'No inference assessment is available yet.';
 const retained=politics.groups?.some(group=>group.source==='inferred');
 return politics.status==='stale'
  ?{kind:'stale',title:'Inferred relationships may be outdated',detail:(retained?'Showing the previous estimate. Fresh evidence is unavailable. ':'Fresh relationship evidence is unavailable. ')+'Configured memberships are unchanged.',when}
  :{kind:'unavailable',title:'Inference is unavailable',detail:'Not enough usable combat evidence. Configured blocs still apply; other alliances stay separate.',when};
}

export function PowerBlocMembership({membership,onInspect}:{membership?:Membership|null;onInspect:(id:string|null)=>void}){
 if(!membership)return null;
 const grouped=membership.source==='configured'||membership.source==='inferred';
 return <div key={(membership.group_id||membership.alliance_id||'none')+membership.source} className={'universe-membership '+membership.source}>
  <div className="universe-membership-heading"><Users size={17}/><span>Power bloc</span><span className={'universe-source-badge '+membership.source}>{sourceLabel(membership.source)}</span></div>
  {grouped?<button className="universe-member-link" onClick={()=>onInspect(membership.group_id||null)}><i style={{background:membership.color||'#8e9ba9'}}/><strong>{membership.name}</strong><ChevronRight size={18}/></button>:<strong>{membership.source==='independent'?'Independent alliance':'No supported affiliation'}</strong>}
  <p>{membership.source==='configured'?'Membership set by you.':membership.source==='inferred'?(membership.evidence_label||'Estimated affiliation. May not match a formal coalition.'):(membership.reason||'The alliance retains its own identity and territory.')}</p>
 </div>;
}

const share = (count:number,total:number) => total > 0 ? count / total * 100 : 0;
const percentage = (value:number) => value > 0 && value < .1 ? '<0.1%' : value.toFixed(1) + '%';
const kind = (territory:PoliticalTerritory) => territory.key.startsWith('bloc:') ? 'blocs' : /^f\d+$/.test(territory.key) ? 'factions' : 'owners';
const territorySource = (territory:PoliticalTerritory) => territory.source === 'sovereignty' ? (kind(territory)==='factions' ? 'Faction sovereignty' : 'Sovereignty owner') : sourceLabel(territory.source);

function RegionHolding({region,total,color,onInspect}:{region:PoliticalRegion;total:number;color:string;onInspect:()=>void}) {
 const portion=share(region.systemCount,total);
 return <button className="universe-territory-region" onClick={onInspect} aria-label={'Explore holdings in '+region.name}>
  <span><strong>{region.name}</strong><span>{number(region.systemCount)} systems</span><ArrowUpRight size={16}/></span>
  <span className="universe-territory-track" aria-hidden="true"><i style={{width:portion+'%',background:color}}/></span>
  <small>{percentage(portion)} of this territory’s observed holdings</small>
 </button>;
}

function FrontierNeighbour({neighbour,systems,onSelectTerritory,onSelectSystem}:{neighbour:PoliticalNeighbour;systems:Map<number,UniverseSystem>;onSelectTerritory:(key:string|null)=>void;onSelectSystem:(id:number)=>void}) {
 const [gateLimit,setGateLimit]=useState(6);
 const systemName=(id:number)=>systems.get(id)?.name||'System '+id;
 return <article className="universe-territory-neighbour">
  <button className="universe-territory-neighbour-heading" onClick={()=>onSelectTerritory(neighbour.key)} aria-label={'Inspect neighbouring territory '+neighbour.name}><i style={{background:neighbour.color}}/><strong>{neighbour.name}</strong><ChevronRight size={18}/></button>
  <details className="universe-frontier-gates"><summary><Waypoints size={16}/>{number(neighbour.gateCount)} frontier {neighbour.gateCount===1?'gate':'gates'}<span>Endpoints</span></summary>
   <div className="universe-frontier-connections">{neighbour.connections.slice(0,gateLimit).map(gate=><div className="universe-frontier-connection" key={gate.fromSystemId+'-'+gate.toSystemId}><button onClick={()=>onSelectSystem(gate.fromSystemId)} aria-label={'Inspect frontier system '+systemName(gate.fromSystemId)}>{systemName(gate.fromSystemId)}</button><ArrowRight size={15} aria-hidden="true"/><button onClick={()=>onSelectSystem(gate.toSystemId)} aria-label={'Inspect frontier system '+systemName(gate.toSystemId)}>{systemName(gate.toSystemId)}</button></div>)}</div>
   {neighbour.connections.length>gateLimit&&<Button variant="ghost" className="universe-territory-more" onClick={()=>setGateLimit(value=>value+12)}>Show more gate endpoints</Button>}
  </details>
 </article>;
}

export function PowerBlocExplorer({intel,atlas,politicalAtlas,selectedTerritoryKey,onSelectTerritory,onFocusTerritory,onSettings,onSelectSystem,onSelectRegion}:{
 intel:UniverseIntel|null;atlas:UniverseAtlas|null;politicalAtlas:PoliticalAtlas|null;
 selectedTerritoryKey:string|null;onSelectTerritory:(key:string|null)=>void;onFocusTerritory:(key:string)=>void;onSettings:()=>void;onSelectSystem:(id:number)=>void;onSelectRegion:(id:number)=>void;
}) {
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[rowLimit,setRowLimit]=useState(20);
 const politics=intel?.politics, assessment=inferenceAssessmentNotice(politics), coverage=politics?.coverage;
 const groups:Group[]=politics?.groups||[], territories=politicalAtlas?.territories||[];
 const available=politicalAtlas?.available===true;
 const total=politicalAtlas?.totalSovereignSystems||0, shareAvailable=available&&total>0, selected=territories.find(territory=>territory.key===selectedTerritoryKey);
 const group=selected?.key.startsWith('bloc:')?groups.find(item=>'bloc:'+item.id===selected.key):undefined;
 const memberIds=selected?.key.startsWith('bloc:')?selected.allianceIds:[];
 const systemMap=useMemo(()=>new Map((atlas?.systems||[]).map(system=>[system.system_id,system])),[atlas?.systems]);
 const ownedByAlliance=useMemo(()=>{const owners=new Map<number,number[]>(),overlays=new Map((intel?.systems||[]).map(system=>[system.system_id,system]));const observed=new Set((politicalAtlas?.territories||[]).flatMap(territory=>territory.systemIds));for(const systemId of observed){const id=overlays.get(systemId)?.sovereignty?.alliance_id;if(id){const held=owners.get(id)||[];held.push(systemId);owners.set(id,held);}}return owners;},[intel?.systems,politicalAtlas?.territories]);
 const needle=query.trim().toLowerCase();
 const rows=territories.filter(territory=>(filter==='all'||kind(territory)===filter)&&(!needle||[territory.name,...territory.regions.map(region=>region.name),...(groups.find(item=>'bloc:'+item.id===territory.key)?.member_names||[]).map(member=>member.name)].join(' ').toLowerCase().includes(needle))).sort((a,b)=>b.systemIds.length-a.systemIds.length||a.name.localeCompare(b.name));
 const memberName=(id:number)=>group?.member_names?.find(member=>member.alliance_id===id)?.name||intel?.systems.find(system=>system.sovereignty?.alliance_id===id)?.sovereignty?.alliance_name||'Alliance '+id;
 const selectedShare=selected?share(selected.systemIds.length,total):0;
 const sourceDetail=selected?.source==='configured'?'Membership set by you. Inference never changes this bloc.':selected?.source==='independent'?'Kept independent in your settings. Membership inference is excluded.':selected?.source==='unassigned'?'No supported bloc affiliation. This owner keeps its own territory.':'Ownership reported in the current sovereignty snapshot.';
 return <section className="universe-bloc-explorer universe-political-explorer" aria-label="Power bloc intelligence">
  <div className="universe-tool-heading"><Globe2 size={23}/><div><h3>Political atlas</h3><p>Holdings, reach and frontier gates.</p></div><button className="universe-config-icon" onClick={onSettings} aria-label="Configure Universe power blocs" title="Configure power blocs"><Settings2 size={20}/></button></div>
  {!available&&<div className="universe-political-cache universe-political-unavailable" role="status"><TriangleAlert size={18}/><span><strong>Awaiting sovereignty data</strong><small>Configured memberships are available; holdings and frontier gates are unknown.</small></span></div>}
  {available&&politicalAtlas?.stale&&<div className="universe-political-cache" role="status"><Clock size={18}/><span><strong>Cached political snapshot</strong><small>Some ownership, activity or relationship data is stale.</small></span></div>}
  {assessment&&(!selected||selected.source==='inferred')&&<div className={'universe-assessment-notice '+assessment.kind} role="status">{assessment.kind==='disabled'?<Settings2 size={19}/>:<TriangleAlert size={19}/>}<div><strong>{assessment.title}</strong><p>{assessment.detail}</p>{assessment.when&&<small>{assessment.when}</small>}</div></div>}
  {selected?<div className="universe-bloc-selection" key={selected.key}>
   <button className="universe-bloc-back" onClick={()=>onSelectTerritory(null)}><ArrowLeft size={17}/>All territories</button>
   <div className={'universe-bloc-focus '+selected.source} style={{borderLeftColor:selected.color,'--bloc-colour':selected.color} as CSSProperties}>
    <span className="universe-bloc-focus-mark" aria-hidden="true">{kind(selected)==='blocs'?<Users size={28}/>:<Shield size={28}/>}</span>
    <span className={'universe-source-badge '+selected.source}>{selected.source==='inferred'?<HelpCircle size={14}/>:<Check size={14}/>} {territorySource(selected)}</span>
    <h3>{selected.name}</h3>
    <div className="universe-bloc-stats"><span><strong>{number(available?selected.systemIds.length:null)}</strong>Owned systems</span><span><strong>{number(available?selected.regions.length:null)}</strong>Regions with holdings</span></div>
    <div className="universe-territory-share"><div><span>Sovereignty share</span><strong>{shareAvailable?percentage(selectedShare):'—'}</strong></div><span className="universe-territory-track" role={shareAvailable?'meter':undefined} aria-label={shareAvailable?'Share of observed owned systems':'Ownership share unavailable'} aria-valuenow={shareAvailable?selectedShare:undefined} aria-valuemin={shareAvailable?0:undefined} aria-valuemax={shareAvailable?100:undefined} aria-valuetext={shareAvailable?percentage(selectedShare)+' of '+number(total)+' observed owned systems':undefined}><i style={{width:selectedShare+'%',background:selected.color}}/></span><small>{shareAvailable?'of '+number(total)+' observed owned systems · system count, not area':available?'No owned systems in this snapshot.':'Ownership share awaits a sovereignty snapshot.'}</small></div>
   </div>
   <div className="universe-territory-actions"><Button onClick={()=>onFocusTerritory(selected.key)} disabled={!selected.systemIds.length}><Focus size={18}/>Frame territory</Button><Button variant="outline" onClick={()=>onSelectTerritory(null)}><X size={17}/>Clear spotlight</Button></div>
   {selected.source==='inferred'?<p className="universe-inference-note"><HelpCircle size={18}/><span>Estimated affiliation. This may not be a formal coalition.</span></p>:<p className="universe-small-note universe-territory-provenance">{sourceDetail}</p>}
   <section className="universe-territory-holdings" aria-label="Regional holdings"><div className="universe-territory-section-title"><MapPin size={18}/><h4>Regional holdings</h4><span>{available?selected.regions.length:'—'}</span></div>
    {selected.regions.length?<><div className="universe-territory-regions">{selected.regions.slice(0,4).map(region=><RegionHolding key={region.regionId} region={region} total={selected.systemIds.length} color={selected.color} onInspect={()=>onSelectRegion(region.regionId)}/>)}</div>{selected.regions.length>4&&<details className="universe-disclosure universe-territory-more-regions"><summary>{selected.regions.length-4} more regions</summary><div className="universe-territory-regions">{selected.regions.slice(4).map(region=><RegionHolding key={region.regionId} region={region} total={selected.systemIds.length} color={selected.color} onInspect={()=>onSelectRegion(region.regionId)}/>)}</div></details>}</>:<p className="universe-small-note">{available?'No owned systems in the observed snapshot.':'Regional holdings await a sovereignty snapshot.'}</p>}
   </section>
   <section className="universe-territory-frontiers" aria-label="Stargate frontier neighbours"><div className="universe-territory-section-title"><Waypoints size={18}/><h4>Stargate frontiers</h4><span>{available?selected.neighbours.length:'—'}</span></div><p className="universe-territory-caption">Physical gate connections, not diplomatic relationships.</p>
    {selected.neighbours.length?<><div className="universe-territory-neighbours">{selected.neighbours.slice(0,4).map(neighbour=><FrontierNeighbour key={neighbour.key} neighbour={neighbour} systems={systemMap} onSelectTerritory={onSelectTerritory} onSelectSystem={onSelectSystem}/>)}</div>{selected.neighbours.length>4&&<details className="universe-disclosure universe-territory-more-neighbours"><summary>{selected.neighbours.length-4} more neighbouring territories</summary><div className="universe-territory-neighbours">{selected.neighbours.slice(4).map(neighbour=><FrontierNeighbour key={neighbour.key} neighbour={neighbour} systems={systemMap} onSelectTerritory={onSelectTerritory} onSelectSystem={onSelectSystem}/>)}</div></details>}</>:<p className="universe-small-note">{available?'No gates to another observed owner.':'Frontier ownership is not available yet.'}</p>}
   </section>
   {kind(selected)==='blocs'&&<><div className="universe-bloc-member-heading"><h4>Member alliances</h4><span>{memberIds.length}</span></div><div className="universe-bloc-members">{memberIds.map((id,index)=>{const owned=ownedByAlliance.get(id)||[];return <div key={id} style={entryStyle(index)}><span className="universe-alliance-mark"><Shield size={17}/></span><div><strong>{memberName(id)}</strong><small>{available?number(owned.length)+' sovereign systems':'Holdings unknown'}</small></div>{owned.length>0&&<button title="Inspect an owned system" aria-label={'Inspect a system owned by '+memberName(id)} onClick={()=>onSelectSystem(owned[0])}><ArrowUpRight size={18}/></button>}</div>;})}</div></>}
   <details className="universe-disclosure universe-territory-activity"><summary><Activity size={17}/>Activity snapshot</summary><div className="universe-evidence-grid"><div><Swords size={17}/><strong title={number(selected.activity.shipKills)}>{activityNumber(selected.activity.shipKills)}</strong><span>Ship kills</span></div><div><Shield size={17}/><strong title={number(selected.activity.podKills)}>{activityNumber(selected.activity.podKills)}</strong><span>Pod kills</span></div><div><Waypoints size={17}/><strong title={number(selected.activity.jumps)}>{activityNumber(selected.activity.jumps)}</strong><span>Gate jumps</span></div></div><p className="universe-territory-caption">Activity in these systems, from cached ESI samples. A dash means incomplete data, not zero.</p></details>
   {group?.source==='inferred'&&<details className="universe-disclosure universe-territory-inference"><summary><HelpCircle size={17}/>Why this group was inferred</summary><div className="universe-evidence-grid"><div><Swords size={17}/><strong>{number(group.evidence?.cooperative_encounters)}</strong><span>Shared encounters</span></div><div><Clock size={17}/><strong>{number(group.evidence?.distinct_days)}</strong><span>Distinct days</span></div><div><Shield size={17}/><strong>{number(group.evidence?.hostile_encounters)}</strong><span>Opposing encounters</span></div><div><Globe2 size={17}/><strong>{number(group.evidence?.territory_neighbor_pairs)}</strong><span>Neighbouring holdings</span></div></div>{group.evidence?.label&&<p className="universe-evidence-label">{group.evidence.label}</p>}</details>}
   {selected.source==='configured'&&<Button variant="outline" className="universe-wide" onClick={onSettings}><Settings2 size={17}/>Edit this configuration</Button>}
  </div>:<>
   <div className="universe-bloc-source-counts" aria-label="Political ownership coverage"><div><Shield size={18}/><strong>{number(territories.length)}</strong><span>Territories</span></div><div><Globe2 size={18}/><strong>{number(available?total:null)}</strong><span>Observed owned systems</span></div></div>
   <div className="universe-bloc-search"><Search size={17}/><Input aria-label="Search power blocs and member alliances" placeholder="Find a bloc, owner or region…" value={query} onChange={event=>{setQuery(event.target.value);setRowLimit(20);}}/></div>
   <div className="universe-bloc-filters" role="group" aria-label="Political territory kind">{[{id:'all',label:'All'},{id:'blocs',label:'Blocs'},{id:'owners',label:'Owners'},{id:'factions',label:'Factions'}].map(item=><button key={item.id} className={filter===item.id?'active':''} aria-pressed={filter===item.id} onClick={()=>{setFilter(item.id);setRowLimit(20);}}>{item.label}</button>)}</div>
   <p className="universe-territory-caption universe-territory-share-label">{shareAvailable?'Bars show share of '+number(total)+' observed owned systems.':'Ownership shares await a usable sovereignty sample.'}</p>
   <div className="universe-bloc-list">{rows.slice(0,rowLimit).map((territory,index)=><button key={territory.key} style={entryStyle(index)} onClick={()=>onSelectTerritory(territory.key)} className={'universe-bloc-row '+territory.source}><i className="universe-bloc-swatch" style={{background:territory.color}}/><span><strong>{territory.name}</strong><small className="universe-bloc-row-metrics"><span><Globe2 size={15}/>{available?number(territory.systemIds.length)+' systems':'Holdings unknown'}</span><span>{shareAvailable?percentage(share(territory.systemIds.length,total)):'—'}</span></small><span className="universe-territory-track" aria-hidden="true"><i style={{width:share(territory.systemIds.length,total)+'%',background:territory.color}}/></span><span className={'universe-source-badge '+territory.source}>{territorySource(territory)}</span></span><ChevronRight size={18}/></button>)}</div>
   {rows.length>rowLimit&&<Button variant="outline" className="universe-wide universe-territory-more" onClick={()=>setRowLimit(value=>value+20)}>Show more territories · {rows.length-rowLimit} remaining</Button>}
   {!rows.length&&<div className="universe-bloc-empty"><Globe2 size={30}/><h4>{query?'No matching territories':!politicalAtlas?.available?'No sovereignty snapshot yet':filter==='blocs'?'Build your political map':'No territories in this view'}</h4><p>{query?'Try a bloc, member alliance, faction or region.':!politicalAtlas?.available?'Reported ownership will appear after the sovereignty feed refreshes.':filter==='blocs'?'Create named blocs in Settings. Inference fills gaps when evidence supports it.':'Try another territory filter.'}</p>{!query&&filter==='blocs'&&<Button variant="outline" onClick={onSettings}><Plus size={17}/>Configure power blocs</Button>}</div>}
   <div className="universe-unassigned-key"><i/><span><strong>Each owner keeps its identity</strong><small>Unassigned and independent alliances retain their own territory.</small></span></div>
  </>}
  <details className="universe-disclosure universe-evidence-coverage"><summary>Evidence & coverage<span>{politicalAtlas?.available?(politicalAtlas.stale?'Cached':'Available'):'Awaiting data'}</span></summary><p>Sovereignty shares count observed owned K-space systems, not map area. They use the full roster regardless of the visible map filter.</p><dl><dt>Observed owned systems</dt><dd>{number(available?total:null)}</dd><dt>Unclaimed or unobserved</dt><dd>{number(politicalAtlas?.unobservedSystemCount)}</dd><dt>Observed killmails</dt><dd>{number(coverage?.killmails)}</dd><dt>Alliances in combat sample</dt><dd>{number(coverage?.alliance_count)}</dd>{coverage?.oldest_at&&<><dt>Evidence begins</dt><dd>{stamp(coverage.oldest_at)}</dd></>}{coverage?.newest_at&&<><dt>Latest evidence</dt><dd>{stamp(coverage.newest_at)}</dd></>}{politics?.generated_at&&<><dt>Last relationship assessment</dt><dd>{stamp(politics.generated_at)}</dd></>}</dl><p>{coverage?.label||'Inference uses local observations and is not a complete picture of New Eden.'}</p>{coverage?.truncated&&<p className="universe-small-note">Combat evidence is a bounded sample.</p>}<p className="universe-small-note">Gate frontiers show geography. Pilot standings are separate.</p></details>
 </section>;
}
