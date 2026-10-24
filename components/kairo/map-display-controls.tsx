"use client";

/** Local map grouping controls; backend node membership, coordinates and connections are unchanged. */
import {useEffect,useMemo,useRef,useState} from 'react';
import {Settings2,X} from 'lucide-react';
import {normalizeMapDisplayPrefs,type MapDisplayPrefs} from './map-display-model.mjs';
import {MapperScaleControls} from './mapper-preferences-controls';
import type {MapperPreferences} from './mapper-preferences.mjs';
import type {UniverseSystem} from './universe-types';

const eventName='kairo-map-display-preferences';
/**
 * Own pilot/map-scoped localStorage preferences. Same-window events and storage
 * events keep mounted consumers aligned; unavailable storage leaves local state
 * usable. Return defaults during a key transition, never another map's groups.
 */
export function useMapDisplayPreferences(character:number,mapId:string) {
  const key=`kairo:mapper:groups:v1:${character}:${mapId}`;
  const read=()=>{try{return normalizeMapDisplayPrefs(JSON.parse(localStorage.getItem(key)||'null'));}catch{return normalizeMapDisplayPrefs(null);}};
  const [state,setState]=useState(()=>({key,value:read()}));
  useEffect(()=>{const load=()=>setState({key,value:read()});load();window.addEventListener('storage',load);window.addEventListener(eventName,load);return()=>{window.removeEventListener('storage',load);window.removeEventListener(eventName,load);};},[key]);
  const preferences=state.key===key?state.value:normalizeMapDisplayPrefs(null);
  const update=(value:MapDisplayPrefs)=>{const next=normalizeMapDisplayPrefs(value);setState({key,value:next});try{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event(eventName));}catch{}};
  return [preferences,update] as const;
}
export function MapDisplayControls({preferences,onChange,mapper,onMapperChange,systems,selectedIds,selectedId,onGroupCreated}:{preferences:MapDisplayPrefs;onChange:(value:MapDisplayPrefs)=>void;mapper:MapperPreferences;onMapperChange:(value:Partial<MapperPreferences>)=>void;systems:UniverseSystem[];selectedIds:number[];selectedId:number|null;onGroupCreated:()=>void}) {
  const [open,setOpen]=useState(false),[kind,setKind]=useState<'custom'|'region'|'constellation'>('custom'),[name,setName]=useState(''),[geography,setGeography]=useState(''),[parent,setParent]=useState('');
  const trigger=useRef<HTMLButtonElement|null>(null);
  function close(){setOpen(false);trigger.current?.focus({preventScroll:true});}
  const choices=useMemo(()=>{const values=new Map<number,string>();if(kind!=='custom')for(const system of systems){const id=kind==='region'?system.region_id:system.constellation_id;values.set(id,kind==='region'?system.region_name:system.constellation_name);}return [...values].sort((a,b)=>a[1].localeCompare(b[1]));},[systems,kind]);
  const selectedGeography=Number(geography)||choices[0]?.[0];
  const members=kind==='custom'?systems.filter(system=>selectedIds.includes(system.system_id)):systems.filter(system=>(kind==='region'?system.region_id:system.constellation_id)===selectedGeography);
  const parentId=Number(parent)||members.find(system=>system.system_id===selectedId)?.system_id||members[0]?.system_id;
  function create(event:React.FormEvent){event.preventDefault();if(!members.length||preferences.groups.length>=32)return;const id=kind==='custom'?`custom:${crypto.randomUUID()}`:`${kind}:${selectedGeography}`,group={id,kind,name:name.trim()||(kind==='custom'?'Custom chain':choices.find(([id])=>id===selectedGeography)?.[1]||'Group'),memberIds:members.map(system=>system.system_id),parentSystemId:members.some(system=>system.system_id===parentId)?parentId:members[0].system_id,collapsed:true};onGroupCreated();onChange({...preferences,groups:[...preferences.groups.filter(item=>item.id!==id),group]});setName('');setParent('');}
  return <div className="map-display-controls" onKeyDown={event=>{if(open&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();close();}}}><button ref={trigger} type="button" aria-expanded={open} aria-label="Map display controls" onClick={()=>setOpen(!open)}><Settings2 size={17}/><span>Display</span></button>{open&&<div className="map-display-panel" role="region" aria-label="Map display controls"><header><strong>Map display</strong><button type="button" aria-label="Close map display controls" onClick={close}><X size={16}/></button></header><MapperScaleControls preferences={mapper} onChange={onMapperChange}/><label className="map-display-toggle"><input type="checkbox" checked={mapper.focusDetail} onChange={event=>onMapperChange({focusDetail:event.target.checked})}/>Focus-based map detail</label><p>Node sizes and focus detail are also in Universe Mapper preferences.</p><form onSubmit={create}><strong>Create a display group</strong><label>Group by<select aria-label="Display group kind" value={kind} onChange={event=>{setKind(event.target.value as typeof kind);setGeography('');setParent('');}}><option value="custom">Selected systems</option><option value="region">Region</option><option value="constellation">Constellation</option></select></label>{kind==='custom'?<p>{members.length} selected systems. Shift-click systems or drag a selection box to build a custom chain.</p>:<label>{kind==='region'?'Region':'Constellation'}<select aria-label="Display group geography" value={selectedGeography||''} onChange={event=>setGeography(event.target.value)}>{choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}<label>Name<input aria-label="Display group name" maxLength={80} value={name} placeholder={kind==='custom'?'Custom chain':'Use geography name'} onChange={event=>setName(event.target.value)}/></label><label>Anchor system<select aria-label="Display group anchor" value={parentId||''} onChange={event=>setParent(event.target.value)}>{members.map(system=><option key={system.system_id} value={system.system_id}>{system.name}</option>)}</select></label><button type="submit" disabled={members.length<2||preferences.groups.length>=32}>Create collapsed group</button></form><p>Collapsed groups keep their anchor, entry/exit systems and selected or routed systems visible. Hidden members keep their positions and connections.</p>{preferences.groups.length>0&&<ul aria-label="Display groups">{preferences.groups.map(group=><li key={group.id}><span><strong>{group.name}</strong><small>{group.memberIds.length} saved members</small></span><button type="button" aria-label={`${group.collapsed?'Expand':'Collapse'} ${group.name}`} onClick={()=>onChange({...preferences,groups:preferences.groups.map(item=>item.id===group.id?{...item,collapsed:!item.collapsed}:item)})}>{group.collapsed?'Expand':'Collapse'}</button><button type="button" aria-label={`Remove display group ${group.name}`} onClick={()=>onChange({...preferences,groups:preferences.groups.filter(item=>item.id!==group.id)})}><X size={15}/></button></li>)}</ul>}</div>}</div>;
}
