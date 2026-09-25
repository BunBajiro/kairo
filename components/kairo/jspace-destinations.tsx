"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Building2,Compass,Copy,LocateFixed,Navigation,Route,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Choice} from './ui';
import {api} from './model';
import {useKairo} from './context';
import type {UniverseAtlas} from './universe-types';
import './jspace-destinations.css';

const categories=[{value:'highsec',label:'High-sec exit'},{value:'lowsec',label:'Low-sec exit'},{value:'trade_hubs',label:'Trade hubs'},{value:'blue_loot',label:'Blue-loot buyers'},{value:'red_loot',label:'Red-loot buyers'},{value:'security_status',label:'Security-status services'},{value:'thera',label:'Thera entrances'},{value:'turnur',label:'Turnur entrances'}];
type DestinationRoute={status:string;systemIds:number[];edges:any[];hops:number;cost:number;expiresAt?:string|null};
type Destination={systemId:number;name:string;security:number|null;hops:number;cost:number;stations:{stationId:number;name:string;primary?:boolean}[];route:DestinationRoute};
type SearchResult={status:string;results:Destination[];explanation:string;warnings:string[];excluded:any[];generatedAt:string;candidateCount:number;reference?:{source:string;sourceUrl:string;generatedAt:string}|null};
export type JSpaceDestinationsProps={atlas:UniverseAtlas;originId:number|null;chainId:string;onSelectSystem?:(id:number)=>void;onRouteResult?:(route:DestinationRoute)=>void;onRouteToSystem?:(id:number)=>void};

function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){return <label className="jspace-destination-toggle"><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/><span>{label}</span></label>;}
export function JSpaceDestinations({atlas,originId,chainId,onSelectSystem,onRouteResult,onRouteToSystem}:JSpaceDestinationsProps){
 const {character,boot}=useKairo();
 const [category,setCategory]=useState('highsec'),[security,setSecurity]=useState('any'),[mode,setMode]=useState('shortest'),[limit,setLimit]=useState('5');
 const [shipSize,setShipSize]=useState('unspecified'),[shipClass,setShipClass]=useState('subcapital'),[shipMass,setShipMass]=useState(''),[avoids,setAvoids]=useState('');
 const [wormholes,setWormholes]=useState(true),[thera,setThera]=useState(false),[turnur,setTurnur]=useState(false),[critical,setCritical]=useState(false),[eol,setEol]=useState(false),[unknown,setUnknown]=useState(false),[avoidHostile,setAvoidHostile]=useState(false),[avoidLow,setAvoidLow]=useState(false),[avoidNull,setAvoidNull]=useState(false);
 const [result,setResult]=useState<SearchResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expired,setExpired]=useState(false),[copyText,setCopyText]=useState(''),[notice,setNotice]=useState('');
 const request=useRef(0),alive=useRef(true),byId=useMemo(()=>new Map(atlas.systems.map(system=>[system.system_id,system])),[atlas]);
 const key=JSON.stringify([character,chainId,originId,category,security,mode,limit,shipSize,shipClass,shipMass,avoids,wormholes,thera,turnur,critical,eol,unknown,avoidHostile,avoidLow,avoidNull]);
 const currentKey=useRef(key);currentKey.current=key;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
 useEffect(()=>{request.current++;setResult(null);setBusy(false);setExpired(false);setCopyText('');setNotice('');setError('');},[key]);
 useEffect(()=>{if(!result)return;const times=result.results.map(row=>Date.parse(row.route.expiresAt||'')).filter(Number.isFinite);if(!times.length)return;const delay=Math.min(...times)-Date.now();if(delay<=0){setExpired(true);return;}const timer=setTimeout(()=>setExpired(true),Math.min(delay,2147483647));return()=>clearTimeout(timer);},[result]);
 async function search(event?:React.FormEvent){
  event?.preventDefault();const id=++request.current,submittedKey=key;setBusy(true);setError('');setNotice('');setExpired(false);setResult(null);
  try{
   const avoidSystemIds=avoids.split(',').map(value=>value.trim()).filter(Boolean).map(value=>{const system=atlas.systems.find(row=>row.name.toLowerCase()===value.toLowerCase()||String(row.system_id)===value);if(!system)throw new Error('Unknown avoided system: '+value);return system.system_id;});
   const data=await api('/universe/jspace/destinations?character='+character,'POST',{map_id:chainId,originId,category,security,limit:Number(limit),preferences:{mode,useWormholes:wormholes,useAnsiblex:false,useThera:thera,useTurnur:turnur,shipSize:shipSize==='unspecified'?null:shipSize,shipClass,shipMassKg:shipMass?Number(shipMass):null,allowUnknownWormholeSize:unknown,includeCritical:critical,includeEol:eol,avoidHostile,avoidLowsec:avoidLow,avoidNullsec:avoidNull,avoidSystemIds}},boot.csrf);
   if(alive.current&&request.current===id&&currentKey.current===submittedKey)setResult(data);
  }catch(error){if(alive.current&&request.current===id)setError(error instanceof Error?error.message:'Could not find destinations.');}
  finally{if(alive.current&&request.current===id)setBusy(false);}
 }
 function validRoute(row:Destination){if(expired||row.route.expiresAt&&Date.parse(row.route.expiresAt)<=Date.now()){setExpired(true);return false;}return true;}
 async function copyRoute(row:Destination){if(!validRoute(row))return;const text=row.route.systemIds.map((id,index)=>`${index}. ${byId.get(id)?.name||id}${index?' · '+(row.route.edges[index-1]?.kind==='wormhole'?'Wormhole':'Stargate'):''}`).join('\n');setCopyText(text);try{await navigator.clipboard.writeText(text);setNotice('Route copied.');}catch{setNotice('Select and copy the route below.');}}
 return <section className="jspace-destinations" aria-label="Find an exit or service">
  <header className="jspace-destination-heading"><Compass size={25}/><div><h3>Find an exit or service</h3><p>From <strong>{originId?byId.get(originId)?.name||originId:'a selected system'}</strong>, through the chain you know.</p></div></header>
  <form onSubmit={search} className="jspace-destination-form">
   <div className="jspace-destination-categories" aria-label="Destination categories">{categories.map(row=><button type="button" key={row.value} className={category===row.value?'is-selected':''} aria-pressed={category===row.value} onClick={()=>setCategory(row.value)}>{row.label}</button>)}</div>
   <div className="jspace-destination-fields"><label className="field-label">Route preference<Choice label="Destination route preference" value={mode} onChange={setMode} options={[{value:'shortest',label:'Fewest jumps'},{value:'safer',label:'Prefer safer travel'},{value:'prefer_low',label:'Prefer low-sec travel'}]}/></label><label className="field-label">Vessel size<Choice label="Destination vessel size" value={shipSize} onChange={setShipSize} options={[{value:'unspecified',label:'Not specified'},{value:'small',label:'Small · frigate / destroyer'},{value:'medium',label:'Medium · cruiser / battlecruiser'},{value:'large',label:'Large · battleship'},{value:'capital',label:'Capital'},{value:'supercapital',label:'Supercapital'}]}/></label></div>
   <details className="jspace-destination-options"><summary><ShieldCheck size={16}/>Connections and restrictions</summary><div>
    <Toggle checked={wormholes} onChange={setWormholes} label="Use confirmed wormholes in this chain"/>
    <Toggle checked={thera} onChange={setThera} label="Use fresh public Thera shortcuts"/><Toggle checked={turnur} onChange={setTurnur} label="Use fresh public Turnur shortcuts"/>
    <Toggle checked={critical} onChange={setCritical} label="Include observed critical-mass connections"/><Toggle checked={eol} onChange={setEol} label="Include observed end-of-life connections"/>
    <Toggle checked={unknown} onChange={setUnknown} label="Allow public reports with unknown ship limits"/>
    <Toggle checked={avoidHostile} onChange={setAvoidHostile} label="Avoid confirmed hostile standings"/><Toggle checked={avoidLow} onChange={setAvoidLow} label="Avoid low-sec transit"/><Toggle checked={avoidNull} onChange={setAvoidNull} label="Avoid null-sec transit"/>
    <label className="field-label">Vessel class<Choice label="Destination vessel class" value={shipClass} onChange={setShipClass} options={[{value:'subcapital',label:'Other subcapital'},{value:'freighter',label:'Freighter'},{value:'jump_freighter',label:'Jump freighter'},{value:'capital',label:'Other capital'},{value:'supercapital',label:'Supercapital'}]}/></label>
    <label className="field-label">Actual fitted mass (kg)<Input aria-label="Destination ship mass" type="number" min="1" max="1000000000000" value={shipMass} onChange={event=>setShipMass(event.target.value)} placeholder="Optional known mass"/></label>
    <label className="field-label">Avoid systems<Input aria-label="Destination avoided systems" value={avoids} onChange={event=>setAvoids(event.target.value)} placeholder="Comma-separated system names"/></label>
    <div className="jspace-destination-fields"><label className="field-label">Destination security<Choice label="Destination security filter" value={security} onChange={setSecurity} options={[{value:'any',label:'Any'},{value:'high',label:'High-sec only'},{value:'low',label:'Low-sec only'}]}/></label><label className="field-label">Results<Choice label="Destination result count" value={limit} onChange={setLimit} options={['1','3','5','10'].map(value=>({value,label:value}))}/></label></div>
   </div></details>
   <p className="jspace-destination-hint">Size-limited holes need a vessel size or known fitted mass. Public shortcuts stay off until selected. Finding a route does not send EVE waypoints.</p>
   <Button disabled={busy||!originId||!chainId}><Route size={17}/>{busy?'Finding connections…':'Find destinations'}<ArrowRight size={17}/></Button>
  </form>
  {error&&<p className="jspace-destination-error" role="alert">{error}</p>}
  {result&&<div className="jspace-destination-results" aria-live="polite">
   <p className="jspace-destination-hint">{result.explanation}</p>
   {expired&&<p className="jspace-destination-error" role="alert">A connection in these results has reached its recorded expiry. Search again for current routes.</p>}
   {result.results.map((row,index)=><article className="jspace-destination-card" key={row.systemId}>
    <header><span className="jspace-destination-rank">{index+1}</span><div><h4>{row.name}</h4><span>{row.security===null?'Security unknown':row.security.toFixed(1)+' security'}{row.hops===0?' · You are here':''}</span></div><div className="jspace-destination-hops"><strong>{row.hops}</strong><span>{row.hops===1?'jump':'jumps'}</span></div></header>
    {row.stations[0]&&<p className="jspace-destination-station"><Building2 size={17}/><span>{row.stations[0].name}{row.stations[0].primary&&<small>Principal market station in this reference</small>}</span></p>}
    <div className="jspace-destination-actions">{onRouteToSystem&&<Button variant="outline" disabled={expired} onClick={()=>{if(validRoute(row))onRouteToSystem(row.systemId);}}><Navigation size={16}/>Set destination</Button>}{onSelectSystem&&<Button variant="ghost" onClick={()=>onSelectSystem(row.systemId)}><LocateFixed size={16}/>Inspect</Button>}{onRouteResult&&<Button variant="ghost" disabled={expired} onClick={()=>{if(validRoute(row))onRouteResult(row.route);}}><Route size={16}/>Show route</Button>}<Button variant="ghost" disabled={expired} onClick={()=>void copyRoute(row)}><Copy size={16}/>Copy route</Button></div>
    <details><summary>Route and {row.stations.length?'station references':'connection detail'}</summary><ol>{row.route.systemIds.map((id,index)=><li key={index}><strong>{byId.get(id)?.name||id}</strong><span>{index===0?'Start':row.route.edges[index-1]?.kind==='wormhole'?'Wormhole':'Stargate'}</span></li>)}</ol>{row.route.expiresAt&&<p className="jspace-destination-hint">Earliest recorded connection expiry: {new Date(row.route.expiresAt).toISOString().replace('T',' ').slice(0,19)} EVE.</p>}{row.stations.length>0&&<ul>{row.stations.map(station=><li key={station.stationId}>{station.name}{station.primary?' · Principal market':''}</li>)}</ul>}</details>
   </article>)}
   {!result.results.length&&<div className="jspace-destination-empty"><Compass size={28}/><strong>No eligible route found</strong><p>Review confirmed connections, recorded expiry and vessel restrictions. A static badge does not supply a scanned destination.</p></div>}
   {!!result.excluded?.length&&<details className="jspace-destination-options"><summary>Why connections were excluded</summary><ul>{[...new Set(result.excluded.map(row=>row.reason))].map(reason=><li key={reason}>{reason}</li>)}</ul></details>}
   <details className="jspace-destination-options"><summary>Route evidence and reference data</summary>{result.warnings?.map(warning=><p key={warning}>{warning}</p>)}{result.reference&&<p><a href={result.reference.sourceUrl} target="_blank" rel="noreferrer">{result.reference.source}</a> · generated {result.reference.generatedAt.slice(0,10)}. This is a system route; station services and current buy orders are not verified.</p>}</details>
  </div>}
  {notice&&<p role="status" className="jspace-destination-hint">{notice}</p>}{copyText&&<details className="jspace-destination-options"><summary>Copyable route</summary><textarea aria-label="Destination route text" readOnly value={copyText} rows={6}/></details>}
 </section>;
}
