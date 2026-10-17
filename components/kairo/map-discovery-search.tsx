"use client";

/**
 * Maps search controls: library results come from the bounded server search;
 * add/placement suggestions use the already-loaded Atlas. The workspace owns
 * selection and writes. Geographic group choices stage a preview, not a save.
 */

import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {ArrowUpRight, Layers3, MessageSquare, Plus, Search, X} from 'lucide-react';
import type {UniverseAtlas, UniverseSystem} from './universe-types';
import type {JSpaceWorkspaceMap} from './jspace-workspace';
import {wormholeClassLabel} from './universe-presentation.mjs';
import {mapPlacementGroupIndex, searchPlacementGroups} from './map-discovery-search-model.mjs';
import './map-discovery-search.css';

function systemMark(system:UniverseSystem) {
  return system.space === 'wormhole' ? wormholeClassLabel(system) : system.security >= .45 ? 'HS' : system.security > 0 ? 'LS' : 'NS';
}

function navigateResults(event:KeyboardEvent<HTMLInputElement>, open:boolean, count:number, active:number, setOpen:(value:boolean)=>void, setActive:(value:number)=>void, choose:(index:number)=>void) {
  if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); setOpen(false);}
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); setOpen(true);
    setActive(Math.max(0, Math.min(count - 1, !open ? 0 : active + (event.key === 'ArrowDown' ? 1 : -1))));
  } else if (event.key === 'Enter' && open && count) {event.preventDefault(); choose(Math.min(active, count - 1));}
}

/** Debounce reads and discard results after query/kind/owner changes; revision invalidates saved-map search context. */
export function MapLibrarySearch({request,revision,onOpen}:{request:(path:string)=>Promise<any>;revision?:string;onOpen:(mapId:string,systemId:number|null,connectionId?:string|null,notes?:boolean)=>void}) {
  const [query,setQuery] = useState(''), [open,setOpen] = useState(false), [active,setActive] = useState(0), [kind,setKind] = useState<'systems'|'notes'>('systems');
  const input = useRef<HTMLInputElement>(null), listId = useId();
  const [found,setFound]=useState<any[]>([]),[notes,setNotes]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let live=true;setFound([]);setNotes([]);setError('');
    if(!open||!query.trim()){setLoading(false);return;}
    setLoading(true);
    const timer=setTimeout(()=>request('/search?'+new URLSearchParams({q:query,kind})).then(value=>{if(live){if(kind==='systems')setFound(value.results);else setNotes(value.results);}}).catch(reason=>{if(live)setError(reason instanceof Error?reason.message:'Map search is unavailable.');}).finally(()=>{if(live)setLoading(false);}),200);
    return()=>{live=false;clearTimeout(timer);};
  },[query,kind,open,revision,request]);
  const count = kind === 'systems' ? found.length : notes.length, selected = Math.min(active,Math.max(0,count-1));
  function choose(index:number) {
    if (kind === 'systems') {const row=found[index]; if (!row) return; onOpen(row.map_id,row.system.system_id);}
    else {const row=notes[index]; if (!row) return; onOpen(row.map_id,row.archived ? null : row.system_id || null,row.connection_id,true);}
    setOpen(false); setQuery(''); setActive(0);
  }
  return <div className="map-discovery-search map-library-search" onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget as Node|null)) setOpen(false);}}>
    <Search size={18} aria-hidden="true"/>
    <input ref={input} aria-label="Search maps" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&count?`${listId}-${selected}`:undefined} placeholder="Search map…" value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true);}} onKeyDown={event=>navigateResults(event,open,count,selected,setOpen,setActive,choose)}/>
    {query&&<button className="map-search-clear" aria-label="Clear map search" onClick={()=>{setQuery('');setActive(0);input.current?.focus();}}><X size={16}/></button>}
    {open&&<div className="map-discovery-popover">
      <div className="map-search-kinds" role="group" aria-label="Search in maps">{(['systems','notes'] as const).map(value=><button key={value} aria-pressed={kind===value} onClick={()=>{setKind(value);setActive(0);input.current?.focus();}}>{value==='systems'?<Layers3 size={14}/>:<MessageSquare size={14}/>} {value==='systems'?'Systems':'Notes'}</button>)}</div>
      <div id={listId} role="listbox" aria-label={kind==='systems'?'Systems in your maps':'Notes in your maps'}>
        {kind==='systems'?found.map((row,index)=><button id={`${listId}-${index}`} key={`${row.map_id}:${row.system.system_id}`} role="option" aria-selected={selected===index} className={`map-search-result${selected===index?' is-active':''}`} onClick={()=>choose(index)}>
          <span className="map-search-mark">{systemMark(row.system)}</span><span className="map-search-result-copy"><strong>{row.alias||row.system.name}</strong><small>{row.alias?`${row.system.name} · `:''}{row.map_name}</small></span><ArrowUpRight size={16}/>
        </button>):notes.map((row,index)=><button id={`${listId}-${index}`} key={`${row.map_id}:${row.note_id}`} role="option" aria-selected={selected===index} className={`map-search-result map-search-note${selected===index?' is-active':''}`} onClick={()=>choose(index)}>
          <MessageSquare size={18}/><span className="map-search-result-copy"><strong>{row.location_label}</strong><span>{row.body}</span><small>{row.map_name} · {row.author_name}{row.archived?' · Retained note':''}</small></span><ArrowUpRight size={16}/>
        </button>)}
      </div>
      {!count&&<p className="map-search-empty" role={error?'alert':undefined}>{error|| (loading?'Searching your maps…':query.trim()?`No matching ${kind} in your maps.`:kind==='notes'?'Search notes, pilots or systems.':'Find a system in your maps.')}</p>}
    </div>}
  </div>;
}

export function MapAddSearch({atlas,map,readOnly=false,busy,focusRequest,onAdd,onStageGroup}:{atlas:UniverseAtlas;map:JSpaceWorkspaceMap;readOnly?:boolean;busy:boolean;focusRequest:number;onAdd:(id:number)=>Promise<void>;onStageGroup:(kind:'region'|'constellation',id:number)=>void}) {
  const [query,setQuery]=useState(''), [open,setOpen]=useState(false), [active,setActive]=useState(0), [kind,setKind]=useState<'system'|'constellation'|'region'>('system');
  const input=useRef<HTMLInputElement>(null), listId=useId(), text=query.trim().toLocaleLowerCase('en-GB');
  const nodes=useMemo(()=>new Set(map.nodes.map(node=>node.system_id)),[map.nodes]);
  const groupIndex=useMemo(()=>mapPlacementGroupIndex(atlas),[atlas]);
  const systems=useMemo(()=> (text ? atlas.systems.filter(system=>(!readOnly||nodes.has(system.system_id))&&(system.name.toLocaleLowerCase('en-GB').includes(text)||String(system.system_id)===text)).sort((a,b)=>Number(b.name.toLocaleLowerCase('en-GB')===text)-Number(a.name.toLocaleLowerCase('en-GB')===text)||a.name.localeCompare(b.name)) : atlas.systems.filter(system=>nodes.has(system.system_id))).slice(0,7),[atlas.systems,text,nodes,readOnly]);
  const effectiveKind=readOnly?'system':kind;
  const groups=useMemo(()=>effectiveKind==='system'?[]:searchPlacementGroups(groupIndex[effectiveKind],query),[effectiveKind,groupIndex,query]);
  const count=effectiveKind==='system'?systems.length:groups.length, selected=Math.min(active,Math.max(0,count-1));
  useEffect(()=>{if(focusRequest){setOpen(true);input.current?.focus();}},[focusRequest]);
  useEffect(()=>{setQuery('');setOpen(false);setActive(0);setKind('system');},[map.id]);
  function choose(index:number) {
    if (busy) return;
    if (effectiveKind==='system') {const system=systems[index];if(!system)return;void onAdd(system.system_id);}
    else {const group=groups[index];if(!group)return;onStageGroup(effectiveKind,group.id);}
    setOpen(false);setQuery('');setActive(0);
  }
  return <div className="map-discovery-search map-add-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
    {!readOnly?<select aria-label="Add to map" value={kind} disabled={busy} onChange={event=>{setKind(event.target.value as typeof kind);setQuery('');setActive(0);setOpen(true);input.current?.focus();}}><option value="system">System</option><option value="constellation">Constellation</option><option value="region">Region</option></select>:<Search size={18} aria-hidden="true"/>}
    <input ref={input} aria-label={effectiveKind==='system'?'Find a system to add to chain':`Find a ${effectiveKind} to add to map`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&count?`${listId}-${selected}`:undefined} value={query} placeholder={readOnly?'Find a tracked system…':`Find or add a ${effectiveKind}…`} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(0);}} onKeyDown={event=>navigateResults(event,open,count,selected,setOpen,setActive,choose)}/>
    {query&&<button className="map-search-clear" aria-label="Clear system search" onClick={()=>{setQuery('');setActive(0);input.current?.focus();}}><X size={16}/></button>}
    {open&&<div className="map-discovery-popover"><div id={listId} role="listbox" aria-label={effectiveKind==='system'?'Matching systems':`Matching ${effectiveKind}s`}>
      {effectiveKind==='system'?systems.map((system,index)=><button key={system.system_id} id={`${listId}-${index}`} role="option" aria-selected={selected===index} disabled={busy} className={`map-search-result${selected===index?' is-active':''}`} onClick={()=>choose(index)}><span className="map-search-mark">{systemMark(system)}</span><span className="map-search-result-copy"><strong>{system.name}</strong></span><small>{nodes.has(system.system_id)?'Show':'Add'}</small>{nodes.has(system.system_id)?<ArrowUpRight size={16}/>:<Plus size={16}/>}</button>):groups.map((group,index)=>{const missing=group.system_ids.filter(id=>!nodes.has(id)).length;return <button key={group.id} id={`${listId}-${index}`} role="option" aria-selected={selected===index} disabled={busy} className={`map-search-result${selected===index?' is-active':''}`} onClick={()=>choose(index)}><span className="map-search-mark"><Layers3 size={18}/></span><span className="map-search-result-copy"><strong>{group.name}</strong><small>{group.system_ids.length} systems{group.region_name?` · ${group.region_name}`:''}</small></span><small>{missing?`${missing} to add`:'On map'}</small><Plus size={16}/></button>;})}
    </div>{!count&&<p className="map-search-empty">{text?`No matching ${effectiveKind}.`:readOnly?'No tracked systems yet.':`Search for a ${effectiveKind} to begin.`}</p>}</div>}
  </div>;
}
