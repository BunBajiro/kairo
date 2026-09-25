"use client";
import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {ArrowUpRight, Globe2, MapPin, Search, Users, X} from 'lucide-react';
import {Input} from '@/components/ui/input';
import type {UniverseAtlas} from './universe-types';
import type {PoliticalTerritory} from '../../lib/universe-political-atlas.mjs';
import './universe-search.css';

type Destination = {id:string;name:string;detail:string;kind:'system'|'region'|'territory';value:string;search:string;color?:string};
type Props = {atlas:UniverseAtlas;territories:PoliticalTerritory[];ownershipAvailable?:boolean;space:'known'|'wormhole';onSelectSystem:(id:number)=>void;onSelectRegion:(id:number)=>void;onSelectTerritory:(key:string)=>void};

/** One keyboard-accessible entry point into the atlas; all results use local data. */
export function UniverseSearch({atlas,territories,ownershipAvailable=false,space,onSelectSystem,onSelectRegion,onSelectTerritory}:Props){
 const id=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const knownRegions=useMemo(()=>new Set(atlas.systems.filter(system=>system.space==='known').map(system=>system.region_id)),[atlas]);
 const catalogue=useMemo<Destination[]>(()=>[
  ...atlas.systems.filter(system=>system.space==='known'||system.space==='wormhole').map(system=>({id:'system-'+system.system_id,name:system.name,detail:system.region_name+' · '+(system.space==='wormhole'?'J-Space':'K-Space'),kind:'system' as const,value:String(system.system_id),search:system.name.toLocaleLowerCase()+' '+system.system_id})),
  ...atlas.regions.filter(region=>knownRegions.has(region.region_id)).map(region=>({id:'region-'+region.region_id,name:region.name,detail:'Region · frame its systems',kind:'region' as const,value:String(region.region_id),search:region.name.toLocaleLowerCase()})),
  ...territories.map(territory=>({id:'territory-'+territory.key,name:territory.name,detail:(territory.source==='inferred'?'Inferred group':territory.source==='configured'?'Configured bloc':territory.source==='independent'?'Kept independent':territory.source==='unassigned'?'Unassigned owner':territory.key.startsWith('f')?'Faction sovereignty':'Sovereignty owner')+' · '+(ownershipAvailable?territory.systemIds.length.toLocaleString('en-GB')+' observed systems':'awaiting ownership data'),kind:'territory' as const,value:territory.key,search:territory.name.toLocaleLowerCase(),color:territory.color})),
 ],[atlas,territories,knownRegions,ownershipAvailable]);
 const results=useMemo(()=>{
  const text=query.trim().toLocaleLowerCase();if(!text)return [];
  const rank=(item:Destination)=>item.name.toLocaleLowerCase()===text||item.value===text?0:item.name.toLocaleLowerCase().startsWith(text)?1:2;
  return catalogue.filter(item=>item.search.includes(text)).sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name)||a.kind.localeCompare(b.kind)).slice(0,10);
 },[catalogue,query]);
 const expanded=open&&!!query.trim(),selected=Math.min(active,Math.max(0,results.length-1));
 useEffect(()=>{setActive(0);},[query]);
 useEffect(()=>{
  if(!expanded)return;const option=document.getElementById(id+'-option-'+selected),panel=root.current?.querySelector<HTMLElement>('.universe-search-popover');
  if(!option||!panel)return;
  if(option.offsetTop<panel.scrollTop)panel.scrollTop=option.offsetTop;
  else if(option.offsetTop+option.offsetHeight>panel.scrollTop+panel.clientHeight)panel.scrollTop=option.offsetTop+option.offsetHeight-panel.clientHeight;
 },[expanded,selected,id]);
 useEffect(()=>{
  const shortcut=(event:KeyboardEvent)=>{
   if(event.key!=='/'||event.ctrlKey||event.altKey||event.metaKey||event.defaultPrevented)return;
   const target=event.target instanceof Element?event.target:null;
   if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="combobox"]'))return;
   const dialog=document.querySelector('dialog[open],[role="dialog"][data-state="open"]');
   if(dialog&&!dialog.contains(root.current))return;
   event.preventDefault();input.current?.focus();setOpen(true);
  };
  document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut);
 },[]);
 function choose(destination:Destination){
  setOpen(false);setQuery('');setActive(0);
  if(destination.kind==='system')onSelectSystem(Number(destination.value));
  else if(destination.kind==='region')onSelectRegion(Number(destination.value));
  else onSelectTerritory(destination.value);
 }
 return <div ref={root} className="universe-search universe-global-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
  <Search size={19} aria-hidden="true"/>
  <Input ref={input} aria-label="Find a solar system" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={id+'-results'} aria-describedby={id+'-hint'} aria-activedescendant={expanded&&results[selected]?id+'-option-'+selected:undefined} autoComplete="off" placeholder={space==='known'?'Search systems, regions, blocs…':'Find a wormhole or region…'} value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true);}} onKeyDown={event=>{
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(value=>results.length?(value+(event.key==='ArrowDown'?1:-1)+results.length)%results.length:0);}
   else if(event.key==='Enter'&&results[selected]){event.preventDefault();choose(results[selected]);}
   else if(event.key==='Escape'&&(expanded||query)){event.preventDefault();event.stopPropagation();setOpen(false);setQuery('');}
  }}/>
  <span className="sr-only" id={id+'-hint'}>Search systems, known-space regions and observed political territories. Use arrow keys and Enter to choose. Press slash to focus search.</span>
  {query?<button aria-label="Clear system search" onClick={()=>{setQuery('');input.current?.focus();}}><X size={18}/></button>:<kbd aria-hidden="true">/</kbd>}
  {expanded&&<div className="universe-search-popover">
   <div className="universe-search-caption"><span>Navigate New Eden</span><small>↑ ↓ choose · Enter open</small></div>
   <div id={id+'-results'} role="listbox" aria-label="Universe search results">
    {results.map((destination,index)=>{const Icon=destination.kind==='system'?MapPin:destination.kind==='region'?Globe2:Users;return <button type="button" role="option" aria-selected={selected===index} id={id+'-option-'+index} key={destination.id} tabIndex={-1} className={selected===index?'is-active':''} onPointerDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(destination)}><span className="universe-search-kind" style={destination.color?{color:destination.color}:undefined}><Icon size={20}/></span><span><strong>{destination.name}</strong><small>{destination.detail}</small></span><ArrowUpRight size={17}/></button>;})}
   </div>
   {!results.length&&<p role="status">No matching systems, regions or territories.</p>}
  </div>}
 </div>;
}
