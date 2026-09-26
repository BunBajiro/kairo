"use client";

import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowUpRight, Check, CircleDot, Clock3, Compass, Crosshair, Expand, Flag, GitBranch, GripVertical, HelpCircle, Home, Link2, LockKeyhole, MapPin, MessageSquare, MoreHorizontal, MousePointer2, Navigation, NotebookPen, Orbit, Plus, Radio, Route, ScanLine, Settings2, ShieldQuestion, Sparkles, Trash2, UnlockKeyhole, Users, X, ZoomIn, ZoomOut} from 'lucide-react';
import type {UniverseAtlas, UniverseSystem} from './universe-types';
import {wormholeClassLabel} from './universe-presentation.mjs';
import {operationalSystems, type UniverseRouteEdge} from './universe-map-operations.mjs';
import {draggedChainPositions, chainConnectionTarget, chainConnectionPreview, boundChainCamera, CHAIN_NODE_HEIGHT, CHAIN_NODE_WIDTH, chainBounds, chainEdgeGeometry, chainZoomLimits, fitChainCamera, placeChainPopover, placeChainEdgeLabels, traceChainPath, visibleChainLabels, zoomChainAt, type ChainCamera, type ChainPoint} from './jspace-map-geometry.mjs';
import './jspace-map.css';

export type JSpaceMapNode = {system_id:number;x:number;y:number;locked?:boolean;alias?:string;label?:string;status?:'unknown'|'unscanned'|'scanning'|'scanned'|'occupied'|'hostile'|'friendly'|'empty';tags?:string[];role?:''|'home'|'staging';description?:string;public_report?:boolean;public_source?:'thera'|'turnur'};
export type JSpaceMapConnection = {id:string;link_id?:string;from_system_id:number;to_system_id:number;life_status?:'unknown'|'stable'|'eol'|'critical'|'collapsed';locked?:boolean;kind?:string;confirmed?:boolean;accessible?:boolean;active?:boolean;expired?:boolean;enabled?:boolean;mass?:string;wh_type?:string;from_signature?:string;to_signature?:string;max_ship_size?:string|null;expires_at?:string|null;[key:string]:any};
export type JSpaceMapData = {id:string;name:string;revision:number;description?:string;nodes:JSpaceMapNode[];connections:JSpaceMapConnection[];[key:string]:any};
export type JSpaceNodeAction = 'inspect'|'notebook'|'route'|'edit'|'remove'|'connect'|'lock'|'observations'|'comments';
export type JSpaceMapProps = {
  atlas:UniverseAtlas;map:JSpaceMapData;characterId?:number;selectedSystemId:number|null;selectedConnectionId?:string|null;
  locationSystemId?:number|null;pilots?:any[];operations?:any;busy?:boolean;allowDragWhileSaving?:boolean;now?:number;fitRequest?:number;frameSystemRequest?:{systemId:number;requestId:number};
  onSelectSystem:(id:number|null)=>void;onSelectConnection:(id:string|null)=>void;
  onMoveNodes:(positions:{system_id:number;x:number;y:number}[])=>Promise<unknown>|void;
  onConnectSystems?:(fromId:number,toId:number)=>Promise<unknown>|void;
  onNodeAction:(action:JSpaceNodeAction,systemId:number)=>void;
  onConnectionAction:(action:'edit'|'remove',id:string)=>void;onAddSystem?:()=>void;
  onRemoveNodes?:(systemIds:number[])=>void;onSelectionChange?:(systemIds:number[])=>void;
  routeSystemIds?:number[];routeEdges?:UniverseRouteEdge[];topActions?:ReactNode;
};
type ChainSystem = UniverseSystem & {wormhole?:{classLabel?:string;shattered?:boolean;frigateOnly?:boolean;hub?:boolean;statics?:{type:string;destinationClasses:{id:number;label:string;name:string}[]|null}[];effect?:{name:string;power:number}|null}};
type Hint = {title:string;text:string;point:ChainPoint};
type Menu = {kind:'node'|'edge';id:number|string;point:ChainPoint};
type NodePosition={system_id:number;x:number;y:number};
type ConnectionDraft={fromId:number;side:'left'|'right';point:ChainPoint;targetId:number|null;state:'drawing'|'pending';scope:string};
type DragEdges={link:JSpaceMapConnection;offset:number;from:ChainPoint;to:ChainPoint;paths:SVGPathElement[];caption:HTMLButtonElement|null;leader:SVGPathElement|null};
type Gesture = {kind:'pan';start:ChainPoint;camera:ChainCamera}|{kind:'node';id:number;start:ChainPoint;originals:NodePosition[];moved:boolean;locked?:boolean;zoom:number;scope:string;version:number;positions:NodePosition[];elements:Map<number,HTMLElement>;edges:DragEdges[]}|{kind:'pinch';distance:number;center:ChainPoint;camera:ChainCamera}|{kind:'connect';start:ChainPoint;moved:boolean}|{kind:'box';start:ChainPoint;end:ChainPoint;original:number[]};
const savedCameras=new Map<string,ChainCamera>();
const statusLabels:Record<string,string> = {unknown:'Status unknown',unscanned:'Unscanned',scanning:'Scanning',scanned:'Scanned',occupied:'Occupied',hostile:'Hostile',friendly:'Friendly',empty:'Reported empty'};
const classColours:Record<string,string> = {C1:'#a9d6af',C2:'#8acbd1',C3:'#d7cf8c',C4:'#dba474',C5:'#d98d98',C6:'#b7a0ea',C13:'#b7a0ea',Thera:'#bdabeb',HS:'#a1d7af',LS:'#dfb97d',NS:'#dd9199',Drifter:'#9cc8df'};
const pointDistance=(a:ChainPoint,b:ChainPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const middle=(a:ChainPoint,b:ChainPoint)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const titleCase=(value?:string)=>value?value.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase()):'Unknown';
function systemClass(system?:ChainSystem) {return system?.space==='wormhole' ? system.wormhole?.classLabel || wormholeClassLabel(system) : system ? system.security>=.5?'HS':system.security>0?'LS':'NS' : '?';}
function classBadge(label:string) {return /^Thera/i.test(label)?'TH':/Drifter/i.test(label)?'DR':/^Class (\d+)$/.test(label)?label.replace(/^Class /,'C'):/unknown/i.test(label)?'?':label;}
function staticClassBadge(label:string) {return ({'High-sec':'HS','Low-sec':'LS','Null-sec':'NS'} as Record<string,string>)[label]||classBadge(label);}
function badgeCount(value:number) {return value>9?'9+':String(value);}
function connectionStateLabel(connection:JSpaceMapConnection,now:number) {return connection.life_status==='collapsed'?'Collapsed':connection.expired||connection.expires_at&&Date.parse(connection.expires_at)<=now?'Expired':connection.life_status==='eol'?'EOL':connection.life_status==='critical'?'Critical':'';}
function expiresLabel(connection:JSpaceMapConnection, now:number) {
  const expiry=connection.expires_at?Date.parse(connection.expires_at):NaN;
  if (connection.life_status==='collapsed') return 'Collapsed';
  if (connection.expired || Number.isFinite(expiry)&&expiry<=now) return 'Reported expiry passed';
  if (!Number.isFinite(expiry)) return 'Expiry unreported';
  const minutes=Math.max(1,Math.ceil((expiry-now)/60000));
  return minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m to reported expiry`:`${minutes}m to reported expiry`;
}
function connectionSummary(connection:JSpaceMapConnection,now:number) {return [connection.public_report?`EVE-Scout · ${titleCase(connection.reported_source||connection.source)}${connection.stale?' · stale':''}`:connection.confirmed?'Confirmed':'Unconfirmed',connection.life_status&&connection.life_status!=='unknown'?titleCase(connection.life_status):null,expiresLabel(connection,now),connection.mass&&connection.mass!=='unknown'?`Mass ${connection.mass}`:null,connection.max_ship_size?`${titleCase(connection.max_ship_size)} ships`:null,connection.from_signature||connection.to_signature?`${connection.from_signature||'?'} ↔ ${connection.to_signature||'?'}`:null].filter(Boolean).join(' · ');}


export function JSpaceMap({atlas,map,characterId=0,selectedSystemId,selectedConnectionId=null,locationSystemId=null,pilots,operations,busy=false,allowDragWhileSaving=false,now=Date.now(),fitRequest=0,frameSystemRequest,onSelectSystem,onSelectConnection,onMoveNodes,onConnectSystems,onNodeAction,onConnectionAction,onAddSystem,onRemoveNodes,onSelectionChange,routeSystemIds=[],routeEdges=[],topActions}:JSpaceMapProps) {
  const viewport=useRef<HTMLDivElement|null>(null), hintElement=useRef<HTMLDivElement|null>(null),menuElement=useRef<HTMLDivElement|null>(null), animation=useRef<{id:number;window:Window}|null>(null), cameraRef=useRef<ChainCamera>({x:50,y:50,zoom:1});
  const [camera,setCamera]=useState(cameraRef.current),[size,setSize]=useState({width:900,height:620}),[draft,setDraft]=useState<Record<number,ChainPoint>>({}),[interacting,setInteracting]=useState(false),[hint,setHint]=useState<Hint|null>(null),[menu,setMenu]=useState<Menu|null>(null),[following,setFollowing]=useState(false),[traceFrom,setTraceFrom]=useState<number|null>(null),[group,setGroup]=useState<number[]>([]),[selectionBox,setSelectionBox]=useState<{start:ChainPoint;end:ChainPoint}|null>(null),[overviewOpen,setOverviewOpen]=useState(true),[followPilot,setFollowPilot]=useState('current'),[connecting,setConnecting]=useState<ConnectionDraft|null>(null);
  const cameraKey=`kairo:jspace:camera:${characterId}:${map.id}`,activeCameraKey=useRef(cameraKey),scopeVersion=useRef(0),interactionScope=useRef(cameraKey+':0');
  const pointers=useRef(new Map<number,ChainPoint>()),gesture=useRef<Gesture|null>(null),dragVersion=useRef(0),lastClick=useRef<{id:number;time:number}|null>(null);
  const gestureRect=useRef<DOMRect|null>(null),connectionRef=useRef<ConnectionDraft|null>(null),previewPath=useRef<SVGPathElement|null>(null),nodeElements=useRef(new Map<number,HTMLElement>()),edgeElements=useRef(new Map<string,SVGGElement>()),captionElements=useRef(new Map<string,HTMLButtonElement>()),pendingPositions=useRef(new Map<number,{version:number;position:ChainPoint;settled:boolean}>());
  const helpId=useId(),hintId=useId();
  const systems=useMemo(()=>new Map(atlas.systems.map(system=>[system.system_id,system as ChainSystem])),[atlas.systems]);
  const nodes=useMemo(()=>map.nodes.filter(node=>systems.has(node.system_id)).map(node=>({...node,...draft[node.system_id]})),[map.nodes,systems,draft]);
  const nodeById=useMemo(()=>new Map(nodes.map(node=>[node.system_id,node])),[nodes]);
  const links=useMemo(()=>map.connections.filter(connection=>nodeById.has(connection.from_system_id)&&nodeById.has(connection.to_system_id)),[map.connections,nodeById]);
  const limits=useMemo(()=>chainZoomLimits(map.nodes,size),[map.nodes,size]);
  const current=useRef({nodes,size,limits,mapId:map.id,busy,onMoveNodes,onSelectSystem,onSelectConnection,onNodeAction});
  current.current={nodes,size,limits,mapId:map.id,busy,onMoveNodes,onSelectSystem,onSelectConnection,onNodeAction};
  const observations=useMemo(()=>operationalSystems({...operations,...(pilots?{pilots}:{})},now),[operations,pilots,now]);
  const systemRecords=useMemo(()=>{
    const index=new Map<number,{signatures:any[];observations:any[];comments:any[]}>();
    for(const kind of ['signatures','observations','comments'] as const)for(const record of map[kind]||[]){if(!record.system_id||kind==='signatures'&&record.missing||kind==='observations'&&(record.expired||record.expires_at&&Date.parse(record.expires_at)<=now))continue;const records=index.get(record.system_id)||{signatures:[],observations:[],comments:[]};records[kind].push(record);index.set(record.system_id,records);}
    return index;
  },[map.signatures,map.observations,map.comments,now]);
  const allPilots=pilots||operations?.pilots||[],followPilotRecord=allPilots.find((pilot:any)=>String(pilot.character_id)===followPilot),followSystemId=followPilot==='current'?locationSystemId:followPilotRecord?.status==='ready'&&Date.parse(followPilotRecord?.expires_at)>now?followPilotRecord.system_id:null;
  const followablePilots=allPilots.filter((pilot:any)=>pilot.status==='ready'&&Date.parse(pilot.expires_at)>now&&nodeById.has(pilot.system_id));
  const overviewLabels=useMemo(()=>camera.zoom<.85?visibleChainLabels(nodes,camera,size,[connecting?.fromId,selectedSystemId,locationSystemId]):new Set(nodes.map(node=>node.system_id)),[nodes,camera,size,selectedSystemId,locationSystemId,connecting?.fromId]);
  const overviewBounds=useMemo(()=>{const bounds=chainBounds(nodes);return{x:bounds.minX-60,y:bounds.minY-60,width:bounds.maxX-bounds.minX+120,height:bounds.maxY-bounds.minY+120};},[nodes]);
  const trace=useMemo(()=>traceFrom&&selectedSystemId?traceChainPath(nodes,links,traceFrom,selectedSystemId,now):{nodes:[],edges:[]},[nodes,links,traceFrom,selectedSystemId,now]);
  const traceNodes=new Set(trace.nodes),traceEdges=new Set(trace.edges);
  const routeNodes=new Set(routeSystemIds),routeLinks=new Set(links.filter(link=>routeEdges.some(edge=>edge.kind==='wormhole'&&(edge.id?[link.id,link.link_id].includes(edge.id):edge.from_system_id===link.from_system_id&&edge.to_system_id===link.to_system_id||edge.from_system_id===link.to_system_id&&edge.to_system_id===link.from_system_id))).map(link=>link.id));
  const edgeGeometry=useMemo(()=>{
    const groups=new Map<string,JSpaceMapConnection[]>();
    for(const link of links){const key=[link.from_system_id,link.to_system_id].sort((a,b)=>a-b).join(':');groups.set(key,[...(groups.get(key)||[]),link]);}
    return placeChainEdgeLabels(links.map(link=>{const group=groups.get([link.from_system_id,link.to_system_id].sort((a,b)=>a-b).join(':'))!,offset=(group.findIndex(item=>item.id===link.id)-(group.length-1)/2)*38,labelWidth=Math.max(104,Math.min(240,42+(link.wh_type||'Wormhole').length*8+(connectionStateLabel(link,now).length?connectionStateLabel(link,now).length*7+24:0)+(link.mass&&link.mass!=='unknown'?22:0)+(link.max_ship_size==='small'?48:0)+(link.locked?20:0)));return {link,offset,labelWidth,...chainEdgeGeometry(nodeById.get(link.from_system_id)!,nodeById.get(link.to_system_id)!,offset)};}),nodes);
  },[links,nodeById,nodes,now]);

  function stopAnimation(){if(animation.current){animation.current.window.cancelAnimationFrame(animation.current.id);animation.current=null;}}
  function saveCamera(){const value=savedCameras.get(activeCameraKey.current)||cameraRef.current;try{viewport.current?.ownerDocument.defaultView?.sessionStorage.setItem(activeCameraKey.current,JSON.stringify(value));}catch{}}
  function applyCamera(value:ChainCamera){cameraRef.current=value;savedCameras.set(activeCameraKey.current,value);setCamera(value);}
  function moveCamera(value:ChainCamera,smooth=true){
    if(gesture.current?.kind==='node'||connectionRef.current)return;stopAnimation();
    const owner=viewport.current?.ownerDocument.defaultView;
    if(!owner||!smooth||owner.document.hidden||owner.matchMedia('(prefers-reduced-motion: reduce)').matches){applyCamera(value);saveCamera();return;}
    const start=cameraRef.current;let started:number|undefined;
    const frame=(time:number)=>{if(started===undefined)started=time;const progress=Math.min(1,(time-started)/270),eased=1-Math.pow(1-progress,3);applyCamera({x:start.x+(value.x-start.x)*eased,y:start.y+(value.y-start.y)*eased,zoom:start.zoom+(value.zoom-start.zoom)*eased});if(progress<1)animation.current={id:owner.requestAnimationFrame(frame),window:owner};else{animation.current=null;saveCamera();}};
    animation.current={id:owner.requestAnimationFrame(frame),window:owner};
  }
  function fit(smooth=true){setFollowing(false);setHint(null);moveCamera(fitChainCamera(current.current.nodes,current.current.size),smooth);}
  function frameSystem(id:number,smooth=true){const node=current.current.nodes.find(item=>item.system_id===id);if(!node)return;const zoom=Math.max(1,current.current.limits.min,Math.min(1.15,cameraRef.current.zoom));moveCamera({x:current.current.size.width/2-(node.x+CHAIN_NODE_WIDTH/2)*zoom,y:current.current.size.height/2-(node.y+CHAIN_NODE_HEIGHT/2)*zoom,zoom},smooth);setHint(null);}
  function zoom(factor:number,point={x:size.width/2,y:size.height/2}){setFollowing(false);setHint(null);moveCamera(boundChainCamera(zoomChainAt(cameraRef.current,point,factor,current.current.limits),current.current.nodes,current.current.size));}
  function showHint(title:string,text:string,target:HTMLElement|SVGElement){const box=target.getBoundingClientRect(),root=viewport.current?.getBoundingClientRect();if(root)setHint({title,text,point:{x:box.left-root.left+box.width/2,y:box.bottom-root.top}});}
  function hintEvents(title:string,text=''){return {onPointerEnter:(event:React.PointerEvent<HTMLElement>)=>showHint(title,text,event.currentTarget),onPointerLeave:()=>setHint(null),onFocus:(event:React.FocusEvent<HTMLElement>)=>showHint(title,text,event.currentTarget),onBlur:()=>setHint(null)};}
  function point(event:{clientX:number;clientY:number}):ChainPoint{const rect=viewport.current!.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}

  useLayoutEffect(()=>{const node=viewport.current;if(!node)return;const owner=node.ownerDocument.defaultView as (Window&{ResizeObserver?:typeof ResizeObserver})|null;const update=()=>{const rect=node.getBoundingClientRect();setSize({width:Math.max(1,rect.width),height:Math.max(1,rect.height)});};update();const observer=owner?.ResizeObserver?new owner.ResizeObserver(update):null;observer?.observe(node);return()=>observer?.disconnect();},[]);
  const initialMap=useRef<string|null>(null),lastSize=useRef(size);
  useLayoutEffect(()=>{
    if(initialMap.current!==cameraKey){
      cancelInteraction();clearConnection();pendingPositions.current.clear();interactionScope.current=cameraKey+':'+(++scopeVersion.current);++dragVersion.current;if(initialMap.current)saveCamera();initialMap.current=cameraKey;activeCameraKey.current=cameraKey;stopAnimation();setDraft({});setMenu(null);setHint(null);setTraceFrom(null);setFollowing(false);setGroup([]);
      const rect=viewport.current?.getBoundingClientRect(),actualSize=rect?{width:Math.max(1,rect.width),height:Math.max(1,rect.height)}:size,actualLimits=chainZoomLimits(map.nodes,actualSize);lastSize.current=actualSize;
      let saved=savedCameras.get(cameraKey);if(!saved){try{saved=JSON.parse(viewport.current?.ownerDocument.defaultView?.sessionStorage.getItem(cameraKey)||'null');}catch{}}
      const valid=saved&&[saved.x,saved.y,saved.zoom].every(Number.isFinite)&&saved.zoom>=actualLimits.min&&saved.zoom<=actualLimits.max;
      applyCamera(valid?boundChainCamera(saved!,map.nodes,actualSize):fitChainCamera(map.nodes,actualSize));
    }else if(size.width!==lastSize.current.width||size.height!==lastSize.current.height){
      const previous=lastSize.current;lastSize.current=size;
      applyCamera(cameraRef.current.zoom<limits.min?fitChainCamera(nodes,size):boundChainCamera({...cameraRef.current,x:cameraRef.current.x+(size.width-previous.width)/2,y:cameraRef.current.y+(size.height-previous.height)/2},nodes,size));
    }else if(cameraRef.current.zoom<limits.min&&!gesture.current){applyCamera(fitChainCamera(nodes,size));}
  },[cameraKey,size.width,size.height,limits.min]);
  useEffect(()=>{const owner=viewport.current?.ownerDocument.defaultView;const save=()=>{const value=savedCameras.get(cameraKey);if(value)try{owner?.sessionStorage.setItem(cameraKey,JSON.stringify(value));}catch{}};owner?.addEventListener('pagehide',save);return()=>{save();owner?.removeEventListener('pagehide',save);};},[cameraKey]);
  const previousFit=useRef(fitRequest);useEffect(()=>{if(previousFit.current!==fitRequest){previousFit.current=fitRequest;fit();}},[fitRequest]);
  useEffect(()=>{if(following&&followSystemId)frameSystem(followSystemId);},[following,followSystemId,map.id]);
  useEffect(()=>{if(frameSystemRequest)frameSystem(frameSystemRequest.systemId);},[frameSystemRequest?.requestId]);
  useEffect(()=>{onSelectionChange?.(group);},[group]);
  useEffect(()=>{setGroup(old=>{const next=old.filter(id=>nodeById.has(id));return next.length===old.length?old:next;});},[map.nodes]);
  useEffect(()=>()=>stopAnimation(),[]);
  useEffect(()=>{const document=viewport.current?.ownerDocument;const onHidden=()=>{if(document?.hidden){stopAnimation();cancelRef.current();saveCamera();}};document?.addEventListener('visibilitychange',onHidden);return()=>document?.removeEventListener('visibilitychange',onHidden);},[]);
  useLayoutEffect(()=>{for(const [node,position] of [[hintElement.current,hint?.point],[menuElement.current,menu?.point]] as const){if(node&&position){const next=placeChainPopover(position,{width:node.offsetWidth,height:node.offsetHeight},size);node.style.left=next.x+'px';node.style.top=next.y+'px';}}},[hint,menu,size]);
  useEffect(()=>{if(menu)menuElement.current?.querySelector<HTMLButtonElement>(':scope > button:not(:disabled)')?.focus({preventScroll:true});},[menu]);
  const wheelHandler=useRef<(event:WheelEvent)=>void>(()=>{});
  wheelHandler.current=event=>{if((event.target as Element)?.closest('.jspace-map-menu,.jspace-map-help,.jspace-map-minimap,.jspace-map-selection'))return;event.preventDefault();if(gesture.current?.kind==='node'||connectionRef.current)return;zoom(Math.exp(-Math.max(-180,Math.min(180,event.deltaY))*.0025),point(event));};
  useEffect(()=>{const node=viewport.current;if(!node)return;const handler=(event:WheelEvent)=>wheelHandler.current(event);node.addEventListener('wheel',handler,{passive:false});return()=>node.removeEventListener('wheel',handler);},[]);

  function syncPending(){setDraft(Object.fromEntries([...pendingPositions.current].map(([id,value])=>[id,value.position])));}
  function clearSettled(){const active=gesture.current;for(const [id,value] of pendingPositions.current)if(value.settled&&!(active?.kind==='node'&&active.originals.some(node=>node.system_id===id)))pendingPositions.current.delete(id);syncPending();}
  function persistPositions(positions:NodePosition[],version:number,scope=interactionScope.current){
    for(const position of positions)pendingPositions.current.set(position.system_id,{version,position,settled:false});syncPending();
    Promise.resolve().then(()=>interactionScope.current===scope?onMoveNodes(positions):null).catch(()=>null).finally(()=>{
      if(interactionScope.current!==scope)return;
      for(const position of positions){const value=pendingPositions.current.get(position.system_id);if(value?.version===version)value.settled=true;}clearSettled();
    });
  }
  function paintDrag(active:Extract<Gesture,{kind:'node'}>){
    const moved=new Map(active.positions.map(position=>[position.system_id,position]));
    for(const [id,element] of active.elements){const position=moved.get(id)!;element.style.transform=`translate3d(${position.x-parseFloat(element.style.left||'0')}px,${position.y-parseFloat(element.style.top||'0')}px,0)`;element.classList.add('is-dragging');}
    for(const edge of active.edges){const path=chainEdgeGeometry(moved.get(edge.link.from_system_id)||edge.from,moved.get(edge.link.to_system_id)||edge.to,edge.offset).path;for(const element of edge.paths)element.setAttribute('d',path);if(edge.caption)edge.caption.style.visibility='hidden';if(edge.leader)edge.leader.style.visibility='hidden';}
  }
  function restoreDrag(active:Extract<Gesture,{kind:'node'}>,positions?:NodePosition[]){
    const final=new Map((positions||current.current.nodes).map(node=>[node.system_id,node]));
    for(const [id,element] of active.elements){const value=final.get(id);if(value){element.style.left=value.x+'px';element.style.top=value.y+'px';}element.style.transform='';element.classList.remove('is-dragging');}
    for(const edge of active.edges){if(edge.caption)edge.caption.style.visibility='';if(edge.leader)edge.leader.style.visibility='';const from=final.get(edge.link.from_system_id)||edge.from,to=final.get(edge.link.to_system_id)||edge.to,path=chainEdgeGeometry(from,to,edge.offset).path;for(const element of edge.paths)element.setAttribute('d',path);}
  }
  function setConnection(value:ConnectionDraft|null){connectionRef.current=value;setConnecting(value);}
  function clearConnection(){const old=connectionRef.current;if(old?.targetId)nodeElements.current.get(old.targetId)?.classList.remove('is-connect-target');setConnection(null);}
  function cancelInteraction(){
    const active=gesture.current;gesture.current=null;++dragVersion.current;if(active?.kind==='node')restoreDrag(active);
    const ids=[...pointers.current.keys()];pointers.current.clear();for(const id of ids)if(viewport.current?.hasPointerCapture(id))viewport.current.releasePointerCapture(id);
    setInteracting(false);setSelectionBox(null);if(connectionRef.current?.state==='drawing')clearConnection();clearSettled();gestureRect.current=null;
  }
  function localPoint(event:{clientX:number;clientY:number}){const rect=gestureRect.current||viewport.current!.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function previewExtent(){return cameraRef.current.zoom<.85?140*Math.max(1,.65/cameraRef.current.zoom):CHAIN_NODE_WIDTH/2;}
  function updateConnection(p:ChainPoint){
    const active=connectionRef.current;if(!active||active.state!=='drawing')return;
    const world={x:(p.x-cameraRef.current.x)/cameraRef.current.zoom,y:(p.y-cameraRef.current.y)/cameraRef.current.zoom},rect=gestureRect.current||viewport.current!.getBoundingClientRect(),hit=viewport.current?.ownerDocument.elementFromPoint(p.x+rect.left,p.y+rect.top)?.closest<HTMLElement>('.jspace-node'),hitNode=hit?nodeById.get(Number(hit.dataset.systemId)):null,target=hitNode?(!hitNode.public_report&&hitNode.system_id!==active.fromId?hitNode:null):chainConnectionTarget(current.current.nodes,world,active.fromId),from=current.current.nodes.find(node=>node.system_id===active.fromId);
    if(active.targetId!==target?.system_id){if(active.targetId)nodeElements.current.get(active.targetId)?.classList.remove('is-connect-target');if(target)nodeElements.current.get(target.system_id)?.classList.add('is-connect-target');}
    active.point=world;active.targetId=target?.system_id||null;if(from)previewPath.current?.setAttribute('d',chainConnectionPreview(from,active.side,world,target,previewExtent()));
  }
  function beginConnection(id:number,side:'left'|'right'){
    const node=nodeById.get(id);if(!node||!onConnectSystems||busy||node.public_report)return;
    cancelInteraction();stopAnimation();setFollowing(false);setHint(null);setMenu(null);onSelectSystem(null);onSelectConnection(null);
    setConnection({fromId:id,side,point:{x:node.x+(side==='right'?CHAIN_NODE_WIDTH+55:-55),y:node.y+CHAIN_NODE_HEIGHT/2},targetId:null,state:'drawing',scope:interactionScope.current});
  }
  function completeConnection(targetId:number){
    const active=connectionRef.current,target=nodeById.get(targetId);if(!active||active.state!=='drawing'||active.fromId===targetId||!target||target.public_report||!onConnectSystems||active.scope!==interactionScope.current)return;
    nodeElements.current.get(active.targetId||0)?.classList.remove('is-connect-target');const pending={...active,targetId,state:'pending' as const};setConnection(pending);setInteracting(false);
    Promise.resolve().then(()=>active.scope===interactionScope.current?onConnectSystems(active.fromId,targetId):null).catch(()=>null).finally(()=>{if(connectionRef.current===pending)clearConnection();});
  }
  function connectionPointer(event:ReactPointerEvent,node:JSpaceMapNode,side:'left'|'right'){
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();
    if(connectionRef.current?.state==='drawing'&&connectionRef.current.fromId!==node.system_id){completeConnection(node.system_id);return;}
    beginConnection(node.system_id,side);if(!connectionRef.current)return;
    gestureRect.current=viewport.current!.getBoundingClientRect();const p=localPoint(event);pointers.current.set(event.pointerId,p);gesture.current={kind:'connect',start:p,moved:false};viewport.current?.setPointerCapture(event.pointerId);setInteracting(true);
  }
  function startPointer(event:ReactPointerEvent,node?:JSpaceMapNode){
    if(event.button!==0&&event.button!==1)return;
    const target=event.target as Element;if(node&&target.closest('button:not(.jspace-node-grab),input,select,textarea,a,[role="menu"]'))return;
    if(!node&&target.closest('button,.jspace-node,.jspace-map-menu,.jspace-map-help,.jspace-map-minimap,.jspace-map-selection'))return;
    if(connectionRef.current){if(node&&connectionRef.current.state==='drawing'){event.preventDefault();event.stopPropagation();completeConnection(node.system_id);}return;}
    event.preventDefault();event.stopPropagation();stopAnimation();setHint(null);setMenu(null);setFollowing(false);
    if(!pointers.current.size)gestureRect.current=viewport.current!.getBoundingClientRect();const p=localPoint(event);pointers.current.set(event.pointerId,p);viewport.current?.setPointerCapture(event.pointerId);
    if(pointers.current.size===2){const previous=gesture.current;if(previous?.kind==='node')restoreDrag(previous);const points=[...pointers.current.values()];gesture.current={kind:'pinch',distance:Math.max(1,pointDistance(points[0],points[1])),center:middle(points[0],points[1]),camera:cameraRef.current};clearSettled();setInteracting(true);return;}
    if(node){onSelectSystem(node.system_id);onSelectConnection(null);nodeElements.current.get(node.system_id)?.querySelector<HTMLButtonElement>('.jspace-node-grab')?.focus({preventScroll:true});
      if(event.shiftKey||event.ctrlKey||event.metaKey){setGroup(old=>old.includes(node.system_id)?old.filter(id=>id!==node.system_id):[...old,node.system_id]);gesture.current=null;return;}
      const selected=group.includes(node.system_id)?group:[node.system_id];setGroup(selected);const originals=nodes.filter(item=>selected.includes(item.system_id)&&!item.locked&&!item.public_report).map(item=>({system_id:item.system_id,x:item.x,y:item.y})),ids=new Set(originals.map(item=>item.system_id));
      const edges=edgeGeometry.filter(edge=>ids.has(edge.link.from_system_id)||ids.has(edge.link.to_system_id)).map(edge=>{const element=edgeElements.current.get(edge.link.id);return{link:edge.link,offset:edge.offset,from:nodeById.get(edge.link.from_system_id)!,to:nodeById.get(edge.link.to_system_id)!,paths:Array.from(element?.querySelectorAll<SVGPathElement>('.jspace-edge-underlay,.jspace-edge-line,.jspace-edge-hit')||[]),caption:captionElements.current.get(edge.link.id)||null,leader:element?.querySelector<SVGPathElement>('.jspace-edge-label-leader')||null};});
      gesture.current={kind:'node',id:node.system_id,start:p,originals,positions:originals,moved:false,locked:node.locked||node.public_report||busy&&!allowDragWhileSaving,zoom:cameraRef.current.zoom,scope:interactionScope.current,version:++dragVersion.current,elements:new Map(originals.flatMap(item=>{const element=nodeElements.current.get(item.system_id);return element?[[item.system_id,element] as const]:[];})),edges};}
    else{viewport.current?.focus({preventScroll:true});if(event.shiftKey){gesture.current={kind:'box',start:p,end:p,original:event.ctrlKey||event.metaKey?group:[]};setSelectionBox({start:p,end:p});}else gesture.current={kind:'pan',start:p,camera:cameraRef.current};}
    setInteracting(true);
  }
  function pointerMove(event:ReactPointerEvent){
    if(!pointers.current.has(event.pointerId)||!gesture.current)return;const p=localPoint(event);pointers.current.set(event.pointerId,p);const active=gesture.current;
    if(active.kind==='connect'){if(pointDistance(p,active.start)>4)active.moved=true;updateConnection(p);}
    else if(active.kind==='pinch'&&pointers.current.size>=2){const points=[...pointers.current.values()],center=middle(points[0],points[1]),next=zoomChainAt(active.camera,active.center,pointDistance(points[0],points[1])/active.distance,current.current.limits);next.x+=center.x-active.center.x;next.y+=center.y-active.center.y;applyCamera(boundChainCamera(next,current.current.nodes,current.current.size));}
    else if(active.kind==='pan')applyCamera(boundChainCamera({...active.camera,x:active.camera.x+p.x-active.start.x,y:active.camera.y+p.y-active.start.y},current.current.nodes,current.current.size));
    else if(active.kind==='box'){active.end=p;setSelectionBox({start:active.start,end:active.end});}
    else if(active.kind==='node'&&!active.locked){if(pointDistance(p,active.start)>4)active.moved=true;if(active.moved){active.positions=draggedChainPositions(active.originals,active.start,p,active.zoom);paintDrag(active);}}
  }
  function pointerEnd(event:ReactPointerEvent,cancelled=false){
    if(!pointers.current.has(event.pointerId))return;const active=gesture.current;
    if(cancelled){cancelInteraction();return;}
    if(active?.kind==='connect')updateConnection(localPoint(event));
    pointers.current.delete(event.pointerId);if(active?.kind==='pinch'&&pointers.current.size===1)gesture.current={kind:'pan',start:[...pointers.current.values()][0],camera:cameraRef.current};else if(!pointers.current.size){gesture.current=null;setInteracting(false);}
    if(viewport.current?.hasPointerCapture(event.pointerId))viewport.current.releasePointerCapture(event.pointerId);saveCamera();
    if(active?.kind==='connect'){const connection=connectionRef.current;if(connection?.targetId)completeConnection(connection.targetId);else if(active.moved)clearConnection();return;}
    if(active?.kind==='box'){setSelectionBox(null);const left=Math.min(active.start.x,active.end.x),right=Math.max(active.start.x,active.end.x),top=Math.min(active.start.y,active.end.y),bottom=Math.max(active.start.y,active.end.y);setGroup([...new Set([...active.original,...nodes.filter(node=>{const x=cameraRef.current.x+node.x*cameraRef.current.zoom,y=cameraRef.current.y+node.y*cameraRef.current.zoom;return x<=right&&x+CHAIN_NODE_WIDTH*cameraRef.current.zoom>=left&&y<=bottom&&y+CHAIN_NODE_HEIGHT*cameraRef.current.zoom>=top;}).map(node=>node.system_id)])]);return;}
    if(active?.kind==='node'){
      if(active.scope!==interactionScope.current){restoreDrag(active);return;}
      if(active.moved){active.positions=draggedChainPositions(active.originals,active.start,localPoint(event),active.zoom);restoreDrag(active,active.positions);persistPositions(active.positions,active.version,active.scope);}
      else{const time=Date.now();if(lastClick.current?.id===active.id&&time-lastClick.current.time<330){onNodeAction('notebook',active.id);lastClick.current=null;}else lastClick.current={id:active.id,time};clearSettled();}
    }
  }
  useLayoutEffect(()=>{const active=gesture.current;if(active?.kind==='node'&&active.moved)paintDrag(active);if(connectionRef.current?.state==='drawing'){const value=connectionRef.current,from=nodeById.get(value.fromId);if(value.targetId)nodeElements.current.get(value.targetId)?.classList.add('is-connect-target');if(from)previewPath.current?.setAttribute('d',chainConnectionPreview(from,value.side,value.point,value.targetId?nodeById.get(value.targetId):null,previewExtent()));}});
  const cancelRef=useRef(cancelInteraction);cancelRef.current=cancelInteraction;
  useEffect(()=>{const owner=viewport.current?.ownerDocument.defaultView;const cancel=()=>cancelRef.current();owner?.addEventListener('blur',cancel);return()=>{owner?.removeEventListener('blur',cancel);cancel();};},[]);
  function nodeKey(event:React.KeyboardEvent<HTMLButtonElement>,node:JSpaceMapNode){
    const direction=({ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}} as Record<string,ChainPoint>)[event.key];
    if(event.key==='F10'&&event.shiftKey){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect(),root=viewport.current!.getBoundingClientRect();setMenu({kind:'node',id:node.system_id,point:{x:rect.left-root.left+rect.width,y:rect.top-root.top}});return;}
    if(!direction)return;event.preventDefault();
    if(event.altKey){if(node.locked||node.public_report||busy&&!allowDragWhileSaving)return;const amount=event.shiftKey?100:20,selected=group.includes(node.system_id)?group:[node.system_id],positions=nodes.filter(item=>selected.includes(item.system_id)&&!item.locked&&!item.public_report).map(item=>({system_id:item.system_id,x:item.x+direction.x*amount,y:item.y+direction.y*amount}));persistPositions(positions,++dragVersion.current);return;}
    const candidates=nodes.filter(item=>item.system_id!==node.system_id&&(item.x-node.x)*direction.x+(item.y-node.y)*direction.y>0).sort((a,b)=>pointDistance(a,node)-pointDistance(b,node));
    if(candidates[0]){onSelectSystem(candidates[0].system_id);onSelectConnection(null);viewport.current?.querySelector<HTMLButtonElement>(`[data-system-id="${candidates[0].system_id}"] .jspace-node-grab`)?.focus({preventScroll:true});frameSystem(candidates[0].system_id);}
  }
  function openMenu(event:React.MouseEvent,nodeId?:number,edgeId?:string){event.preventDefault();event.stopPropagation();setHint(null);setMenu({kind:nodeId?'node':'edge',id:nodeId||edgeId!,point:point(event)});if(nodeId){onSelectSystem(nodeId);onSelectConnection(null);}else onSelectConnection(edgeId!);}
  const selectedNode=selectedSystemId?nodeById.get(selectedSystemId):null;
  const hintPosition=hint?placeChainPopover(hint.point,{width:Math.min(320,size.width-24),height:155},size):null;
  const menuPosition=menu?placeChainPopover(menu.point,{width:230,height:menu.kind==='node'?350:140},size):null;
  const menuPublic=menu?.kind==='node'?nodeById.get(Number(menu.id))?.public_report:links.find(link=>link.id===menu?.id)?.public_report;
  const removableGroup=nodes.filter(node=>group.includes(node.system_id)&&!node.locked&&!node.public_report).map(node=>node.system_id);

  return <section className="jspace-map" data-testid="jspace-map" data-camera-x={camera.x} data-camera-y={camera.y} data-camera-zoom={camera.zoom} data-group-size={group.length} aria-label={`${map.name} wormhole chain`}>
    <div className="jspace-map-toolbar">
      <div className="jspace-map-identity"><GitBranch size={20} aria-hidden="true"/><div><strong>{map.name}</strong><span>{nodes.length} systems · {links.length} connections</span></div></div>
      <div className="jspace-map-controls">
        <button type="button" aria-label="Fit chain" title="Fit the whole recorded chain" onClick={()=>fit()}><Expand size={18}/><span>Fit chain</span></button>
        <button type="button" aria-label="Frame selected system" title="Bring the selected system into view" disabled={!selectedNode} onClick={()=>selectedSystemId&&frameSystem(selectedSystemId)}><Crosshair size={18}/></button>
        {followablePilots.length>0&&<select className="jspace-follow-select" aria-label="Pilot to follow" value={followPilot} onChange={event=>setFollowPilot(event.target.value)}><option value="current">Current pilot</option>{followablePilots.map((pilot:any)=><option key={pilot.character_id} value={String(pilot.character_id)}>{pilot.name||'Pilot '+pilot.character_id}</option>)}</select>}
        <button type="button" aria-label="Follow current pilot" title={followSystemId&&nodeById.has(followSystemId)?'Keep the chosen pilot in view':'The pilot’s current system is not on this chain'} aria-pressed={following} disabled={!followSystemId||!nodeById.has(followSystemId)} onClick={()=>setFollowing(!following)}><Navigation size={18}/><span>Follow</span></button>
        <span className="jspace-map-control-divider"/>
        <button type="button" aria-label="Zoom out of chain" title="Zoom out" disabled={camera.zoom<=limits.min+.001} onClick={()=>zoom(.8)}><ZoomOut size={18}/></button>
        <output aria-label="Chain zoom" data-zoom={camera.zoom}>{Math.round(camera.zoom*100)}%</output>
        <button type="button" aria-label="Zoom in on chain" title="Zoom in" disabled={camera.zoom>=limits.max-.001} onClick={()=>zoom(1.25)}><ZoomIn size={18}/></button>
      </div>
      {(group.length>1||topActions)&&<div className="jspace-map-secondary-controls">
      {group.length>1&&<div className="jspace-map-selection" aria-label="Selected chain systems"><Check size={16}/><strong>{group.length} selected</strong>{group.length>removableGroup.length&&<span>{group.length-removableGroup.length} locked or public</span>}{onRemoveNodes&&<button type="button" aria-label="Remove unlocked systems" disabled={busy||!removableGroup.length} onClick={()=>onRemoveNodes(removableGroup)}><Trash2 size={15}/>Remove unlocked</button>}<button type="button" aria-label="Clear chain selection" onClick={()=>setGroup([])}><X size={16}/></button></div>}
        {topActions&&<div className="jspace-map-source-actions">{topActions}</div>}
      </div>}
    </div>
    <div ref={viewport} className={'jspace-map-viewport '+(interacting?'is-interacting':'')} tabIndex={0} aria-label="Interactive wormhole chain" aria-describedby={helpId} data-zoom={camera.zoom} onPointerDown={event=>startPointer(event)} onPointerMove={pointerMove} onPointerUp={event=>pointerEnd(event)} onPointerCancel={event=>pointerEnd(event,true)} onLostPointerCapture={event=>{if(pointers.current.has(event.pointerId))cancelInteraction();}} onKeyDown={event=>{if(event.key==='Escape'){cancelInteraction();setMenu(null);setHint(null);setGroup([]);onSelectConnection(null);viewport.current?.focus({preventScroll:true});}if(event.target===event.currentTarget){if(event.key==='0'||event.key==='Home'){event.preventDefault();fit();}if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.25);}if(event.key==='-'){event.preventDefault();zoom(.8);}}}} style={{'--chain-zoom':camera.zoom,'--overview-label-scale':Math.max(1,.65/camera.zoom),'--overview-port-offset':(140*Math.max(1,.65/camera.zoom))+'px',backgroundPosition:`${camera.x}px ${camera.y}px`,backgroundSize:`${40*camera.zoom}px ${40*camera.zoom}px`} as CSSProperties}>
      <div className="jspace-map-fade"><div className="jspace-map-world" style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`}} data-detail={camera.zoom<.85?'overview':'full'}>
        <svg className="jspace-map-edges" aria-label="Recorded wormhole connections">
          {edgeGeometry.map(({link,path,leader})=>{const expired=link.expired||link.life_status==='collapsed'||!!link.expires_at&&Date.parse(link.expires_at)<=now,selected=selectedConnectionId===link.id;return <g key={link.id} ref={element=>{if(element)edgeElements.current.set(link.id,element);else edgeElements.current.delete(link.id);}} data-connection-id={link.id} data-public-source={link.public_report?link.reported_source||link.source:undefined} data-life={link.life_status||'unknown'} data-mass={link.mass||'unknown'} className={'jspace-map-edge '+(selected?'is-selected ':'')+([link.from_system_id,link.to_system_id].includes(selectedSystemId||0)?'is-adjacent ':'')+(traceEdges.has(link.id)?'is-traced ':'')+(routeLinks.has(link.id)?'is-route ':'')+(expired?'is-expired ':'')+(!link.confirmed?'is-unconfirmed ':'')+(link.max_ship_size==='small'?'is-small ':'')}>
            <path className="jspace-edge-underlay" d={path}/><path className="jspace-edge-line" d={path}/>{leader&&<path className="jspace-edge-label-leader" d={`M ${leader.from.x} ${leader.from.y} L ${leader.to.x} ${leader.to.y}`} aria-hidden="true"/>}<path className="jspace-edge-hit" d={path} aria-label={`${systems.get(link.from_system_id)?.name} to ${systems.get(link.to_system_id)?.name}. ${connectionSummary(link,now)}`} onPointerDown={event=>{event.stopPropagation();onSelectConnection(link.id);onSelectSystem(null);setMenu(null);}} onPointerEnter={event=>showHint(`${systems.get(link.from_system_id)?.name} ↔ ${systems.get(link.to_system_id)?.name}`,connectionSummary(link,now),event.currentTarget)} onPointerLeave={()=>setHint(null)} onContextMenu={event=>openMenu(event,undefined,link.id)}/>
          </g>;})}
          {connecting&&nodeById.has(connecting.fromId)&&<path ref={previewPath} data-testid="jspace-connection-preview" data-state={connecting.state} className="jspace-connection-preview" d={chainConnectionPreview(nodeById.get(connecting.fromId)!,connecting.side,connecting.point,connecting.targetId?nodeById.get(connecting.targetId):null,previewExtent())}/>}
        </svg>
        {edgeGeometry.map(({link,label})=>{const condition=connectionStateLabel(link,now);return <button key={link.id} type="button" ref={element=>{if(element)captionElements.current.set(link.id,element);else captionElements.current.delete(link.id);}} className={'jspace-edge-label '+(selectedConnectionId===link.id?'is-selected':'')} data-connection-label={link.id} data-life={link.life_status||'unknown'} data-mass={link.mass||'unknown'} data-expired={condition==='Expired'||condition==='Collapsed'} data-confirmed={!!link.confirmed} style={{left:label.x,top:label.y}} aria-label={`Inspect connection ${systems.get(link.from_system_id)?.name} to ${systems.get(link.to_system_id)?.name}`} onClick={()=>{onSelectConnection(link.id);onSelectSystem(null);setMenu(null);}} {...hintEvents(link.wh_type||'Wormhole connection',connectionSummary(link,now))} onContextMenu={event=>openMenu(event,undefined,link.id)}><Link2 size={15}/><span>{link.wh_type||'Wormhole'}</span>{link.mass&&link.mass!=='unknown'&&<span className="jspace-mass-marker" data-mass={link.mass} aria-hidden="true"><i/><i/><i/></span>}{condition&&<span className="jspace-edge-alert"><Clock3 size={12}/>{condition}</span>}{link.max_ship_size==='small'&&<span>Small</span>}{link.locked&&<LockKeyhole size={13}/>}</button>;})}
        {nodes.map(node=>{
          const records=systemRecords.get(node.system_id),signatures=records?.signatures||[],recordedObservations=records?.observations||[],comments=records?.comments||[],timers=recordedObservations.filter(value=>value.timer_at),nextTimer=timers.filter(value=>Date.parse(value.timer_at)>now).sort((a,b)=>Date.parse(a.timer_at)-Date.parse(b.timer_at))[0];
          const system=systems.get(node.system_id)!,reference=system.wormhole,label=systemClass(system),effect=reference?.effect?.name||system.effect,observation=observations.get(node.system_id),present=[...(observation?.pilots||[]),...(observation?.fleet||[])],stale=present.length>0&&present.every((pilot:any)=>pilot.stale),staticTypes=[...(reference?.statics||[])].sort((a,b)=>(a.destinationClasses?.[0]?.id||99)-(b.destinationClasses?.[0]?.id||99)),selected=selectedSystemId===node.system_id,ownLocation=locationSystemId===node.system_id,unlinked=signatures.filter((signature:any)=>!signature.connection_ids?.length&&!signature.connection_id&&/wormhole/i.test(signature.type||signature.name||'')),ping=(map.pings||[]).find((value:any)=>value.system_id===node.system_id&&Date.parse(value.expires_at)>now);
          const describe=[label,node.alias||node.label,node.status&&node.status!=='unknown'?statusLabels[node.status]:null,node.public_report?`EVE-Scout · ${titleCase(node.public_source)}`:null,node.locked?'Position locked':null,ownLocation?'Your location':null,node.role==='home'?'Home system':node.role==='staging'?'Staging system':null].filter(Boolean).join(' · ');
          return <article key={node.system_id} ref={element=>{if(element)nodeElements.current.set(node.system_id,element);else nodeElements.current.delete(node.system_id);}} className={'jspace-node '+(selected?'is-selected ':'')+(connecting?.fromId===node.system_id?'is-connect-source ':'')+(ownLocation?'is-location ':'')+(traceNodes.has(node.system_id)?'is-traced ':'')+(routeNodes.has(node.system_id)?'is-route ':'')+(node.locked?'is-locked ':'')+(overviewLabels.has(node.system_id)?'':'is-lod-hidden ')+(group.includes(node.system_id)?'is-group-selected ':'')+(ping?'has-rally ':'')} data-system-id={node.system_id} data-group-selected={group.includes(node.system_id)} data-public-source={node.public_report?node.public_source:undefined} data-status={node.status||'unknown'} data-node-x={node.x} data-node-y={node.y} style={{left:node.x,top:node.y,'--system-accent':classColours[label]||'#b8c7dc'} as CSSProperties} aria-label={`${system.name} · ${describe}`} onPointerDown={event=>startPointer(event,node)} onPointerEnter={event=>{if(camera.zoom<.85&&!overviewLabels.has(node.system_id))showHint(system.name,describe,event.currentTarget);}} onPointerLeave={()=>setHint(null)} onContextMenu={event=>openMenu(event,node.system_id)}>
            <div className="jspace-node-heading"><button type="button" className="jspace-node-grab" tabIndex={camera.zoom<.85&&!overviewLabels.has(node.system_id)?-1:0} aria-label={`Select ${system.name}`} aria-pressed={selected} aria-describedby={hint?.title===system.name?hintId:undefined} onClick={()=>{if(connectionRef.current?.state==='drawing')completeConnection(node.system_id);else{onSelectSystem(node.system_id);onSelectConnection(null);}}} onKeyDown={event=>nodeKey(event,node)} onFocus={event=>showHint(system.name,describe,event.currentTarget)} onBlur={()=>setHint(null)} onPointerEnter={event=>showHint(system.name,describe,event.currentTarget)} onPointerLeave={()=>setHint(null)}><span className="jspace-node-class" title={label} aria-label={label}>{classBadge(label)}</span><span className="jspace-node-name"><strong>{system.name}</strong></span></button>
              {!!staticTypes.length&&<div className="jspace-node-statics">{staticTypes.slice(0,3).map(item=>{const destination=(item.destinationClasses||[]).map(value=>staticClassBadge(value.label)).join('/')||'?',title=`${item.type} → ${(item.destinationClasses||[]).map(value=>value.label).join(' / ')||'?'}`;return <span key={item.type} tabIndex={0} role="img" aria-label={title} className="jspace-static" style={{'--static-accent':classColours[staticClassBadge(item.destinationClasses?.[0]?.label||'')]||'#bdcddd'} as CSSProperties} onPointerEnter={event=>{event.stopPropagation();showHint(title,'Expected static',event.currentTarget);}} onPointerLeave={()=>setHint(null)} onFocus={event=>showHint(title,'Expected static',event.currentTarget)} onBlur={()=>setHint(null)}><strong>{destination}</strong></span>;})}</div>}
            </div>
            <footer className="jspace-node-footer">
              <span className="jspace-node-alias" title={node.alias||node.label||undefined}>{node.alias||node.label||''}</span>
              {node.status&&node.status!=='unknown'&&<span className="jspace-node-status" tabIndex={0} role="img" aria-label={statusLabels[node.status]} {...hintEvents(statusLabels[node.status])}><i/></span>}
              <span className="jspace-node-states">
                {effect&&<span tabIndex={0} role="img" className="jspace-node-state" aria-label={String(effect)} {...hintEvents(String(effect).replaceAll('_',' '),reference?.effect?.power?`C${reference.effect.power} strength`:'')}><Orbit size={14}/></span>}
                {reference?.shattered&&<span tabIndex={0} role="img" className="jspace-node-state" aria-label="Shattered system" {...hintEvents('Shattered system')}><Sparkles size={14}/></span>}
                {node.role&&<span tabIndex={0} role="img" className="jspace-node-state is-role" aria-label={node.role==='home'?'Home system':'Staging system'} {...hintEvents(node.role==='home'?'Home system':'Staging system')}>{node.role==='home'?<Home size={14}/>:<Flag size={14}/>}</span>}
                {node.public_report&&<span tabIndex={0} role="img" className="jspace-node-source" aria-label={'EVE-Scout · '+titleCase(node.public_source)} {...hintEvents('EVE-Scout · '+titleCase(node.public_source))}>{node.public_source==='thera'?'TH':'TU'}</span>}
                {node.locked&&<span tabIndex={0} role="img" className="jspace-node-state" aria-label="Position locked" {...hintEvents('Position locked')}><LockKeyhole size={13}/></span>}
              </span>
              {present.length>0&&<span tabIndex={0} role="img" className={'jspace-node-pilots '+(stale?'is-stale':'')} aria-label={`${present.length} pilots${stale?' · stale':''}`} {...hintEvents(`${present.length} pilots${stale?' · stale':''}`,present.slice(0,4).map((pilot:any)=>pilot.name||pilot.character_name||'Pilot '+pilot.character_id).join(', '))}><Users size={13}/>{badgeCount(present.length)}</span>}
              <span className="jspace-node-metrics">
                <button type="button" className="jspace-node-metric" data-kind="signatures" data-empty={!signatures.length} aria-label={`Open scanner in ${system.name}`} aria-description={`${signatures.length} signatures`} onClick={()=>{setHint(null);onNodeAction('notebook',node.system_id);}} {...hintEvents(`${signatures.length} ${signatures.length===1?'signature':'signatures'}`,'Open scanner')}><ScanLine size={14}/><span>{badgeCount(signatures.length)}</span></button>
                {!node.public_report&&!!recordedObservations.length&&<button type="button" className="jspace-node-metric" data-kind="observations" data-alert={recordedObservations.some(value=>value.kind==='hazard'||value.standing==='hostile')} aria-label={`Open observations in ${system.name}`} aria-description={`${recordedObservations.length} observations${timers.length?", "+timers.length+" timers":""}`} onClick={()=>{setHint(null);onNodeAction('observations',node.system_id);}} {...hintEvents(`${recordedObservations.length} ${recordedObservations.length===1?'observation':'observations'}${timers.length?' · '+timers.length+' timers':''}`,nextTimer?`Next timer ${new Date(nextTimer.timer_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} EVE`:'Open observations')}>{timers.length?<Clock3 size={14}/>:<Radio size={14}/>}<span>{badgeCount(recordedObservations.length)}</span></button>}
                {!node.public_report&&!!comments.length&&<button type="button" className="jspace-node-metric" data-kind="comments" aria-label={`Open notes in ${system.name}`} aria-description={`${comments.length} notes`} onClick={()=>{setHint(null);onNodeAction('comments',node.system_id);}} {...hintEvents(`${comments.length} ${comments.length===1?'note':'notes'}`,'Open notes')}><MessageSquare size={14}/><span>{badgeCount(comments.length)}</span></button>}
              </span>
              <button type="button" aria-label={`Actions for ${system.name}`} title="System actions" {...hintEvents('System actions')} onClick={event=>openMenu(event,node.system_id)}><MoreHorizontal size={18}/></button>
            </footer>
            {onConnectSystems&&!node.public_report&&(['left','right'] as const).map(side=><button key={side} type="button" className="jspace-connection-handle" data-system-id={node.system_id} data-side={side} aria-label={`Connect from ${system.name} (${side})`} title="Drag to connect" disabled={busy||connecting?.state==='pending'} onPointerDown={event=>connectionPointer(event,node,side)} onClick={event=>{if(event.detail!==0)return;if(connectionRef.current?.state==='drawing'&&connectionRef.current.fromId!==node.system_id)completeConnection(node.system_id);else beginConnection(node.system_id,side);}}><Plus size={13}/></button>)}
            {ownLocation&&<span className="jspace-node-location-mark" tabIndex={0} role="img" aria-label="Current pilot location" {...hintEvents("Your location")}/>}
            {ping&&<span className="jspace-node-rally" title={'Rally · '+(ping.label||'Rally')}><Flag size={14}/>{ping.label||'Rally'}</span>}
            {!!unlinked.length&&<div className="jspace-node-unlinked" aria-label={`Unlinked wormhole signatures in ${system.name}`}>{unlinked.slice(0,2).map((signature:any)=><button key={signature.id} type="button" onClick={()=>onNodeAction('notebook',node.system_id)} aria-label={`Open unlinked signature ${signature.signature_id} in ${system.name}`} onPointerEnter={event=>showHint(signature.signature_id,'Unlinked wormhole',event.currentTarget)} onPointerLeave={()=>setHint(null)}><ScanLine size={14}/>{signature.signature_id}</button>)}{unlinked.length>2&&<button type="button" onClick={()=>onNodeAction('notebook',node.system_id)} aria-label={`Open ${unlinked.length} unlinked wormhole signatures in ${system.name}`}>+{unlinked.length-2}</button>}</div>}
          </article>;
        })}
      </div></div>
      {connecting&&<div className="jspace-connect-status" role="status"><Link2 size={16}/><span>{connecting.state==='pending'?'Saving connection…':`Connect ${systems.get(connecting.fromId)?.name} to a system`}</span>{connecting.state==='drawing'&&<button type="button" aria-label="Cancel connection" onClick={clearConnection}><X size={16}/></button>}</div>}
      {selectionBox&&<div className="jspace-selection-box" aria-hidden="true" style={{left:Math.min(selectionBox.start.x,selectionBox.end.x),top:Math.min(selectionBox.start.y,selectionBox.end.y),width:Math.abs(selectionBox.end.x-selectionBox.start.x),height:Math.abs(selectionBox.end.y-selectionBox.start.y)}}/>}
      {!nodes.length&&<div className="jspace-map-empty"><span><GitBranch size={38}/></span><h3>Your chain starts here</h3><p>Add a system to start mapping.</p>{onAddSystem&&<button type="button" onClick={onAddSystem}><Plus size={18}/>Add a system</button>}</div>}
      {!!nodes.length&&<div className="jspace-map-plaque"><GitBranch size={16}/><span>Exploration chain</span></div>}
      {following&&<div className="jspace-map-follow-status"><Navigation size={15}/>Following {followPilot==='current'?'your pilot':followPilotRecord?.name||'pilot'}<button type="button" onClick={()=>setFollowing(false)} aria-label="Stop following pilot"><X size={15}/></button></div>}
      {!!nodes.length&&<aside className={'jspace-map-minimap '+(overviewOpen?'is-open':'')} aria-label="Chain overview"><button type="button" aria-label={overviewOpen?'Collapse chain overview':'Expand chain overview'} aria-expanded={overviewOpen} onClick={()=>setOverviewOpen(!overviewOpen)}><Compass size={15}/><span>Overview</span><span>{overviewOpen?'−':'+'}</span></button>{overviewOpen&&<svg viewBox={`${overviewBounds.x} ${overviewBounds.y} ${overviewBounds.width} ${overviewBounds.height}`} role="img" aria-label="Chain overview, click to center the map" tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key==='Home'){event.preventDefault();fit();}}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect(),scale=Math.min(rect.width/overviewBounds.width,rect.height/overviewBounds.height),offsetX=(rect.width-overviewBounds.width*scale)/2,offsetY=(rect.height-overviewBounds.height*scale)/2,x=(event.clientX-rect.left-offsetX)/scale+overviewBounds.x,y=(event.clientY-rect.top-offsetY)/scale+overviewBounds.y;setFollowing(false);moveCamera(boundChainCamera({...cameraRef.current,x:size.width/2-x*cameraRef.current.zoom,y:size.height/2-y*cameraRef.current.zoom},nodes,size));}}>{edgeGeometry.map(({link,path})=><path key={link.id} d={path} className={routeLinks.has(link.id)?'is-route':''}/>)}{nodes.map(node=><rect key={node.system_id} x={node.x} y={node.y} width={CHAIN_NODE_WIDTH} height={CHAIN_NODE_HEIGHT} rx={12} className={selectedSystemId===node.system_id?'is-selected':node.system_id===locationSystemId?'is-location':''}/>)}<rect className="jspace-minimap-camera" x={-camera.x/camera.zoom} y={-camera.y/camera.zoom} width={size.width/camera.zoom} height={size.height/camera.zoom}/></svg>}</aside>}
      {traceFrom&&<div className="jspace-map-trace-status"><Route size={16}/><span>Trace from {systems.get(traceFrom)?.name}{selectedSystemId&&selectedSystemId!==traceFrom?' · '+(trace.edges.length?trace.edges.length+' connections':'No recorded path'):''}<small>Topology only · ship and access limits are not evaluated</small></span><button type="button" onClick={()=>setTraceFrom(null)} aria-label="Clear connection trace"><X size={16}/></button></div>}
      {hint&&hintPosition&&!menu&&!interacting&&<div ref={hintElement} id={hintId} role="tooltip" className="jspace-map-hint" style={{left:hintPosition.x,top:hintPosition.y,maxWidth:size.width-24,maxHeight:size.height-24}}><strong>{hint.title}</strong>{hint.text&&<p>{hint.text}</p>}</div>}
      {menu&&menuPosition&&<div ref={menuElement} className="jspace-map-menu" role="group" aria-label={menu.kind==='node'?'System actions':'Connection actions'} style={{left:menuPosition.x,top:menuPosition.y,maxWidth:size.width-24,maxHeight:size.height-24}} onPointerDown={event=>event.stopPropagation()}>
        <header><strong>{menu.kind==='node'?systems.get(Number(menu.id))?.name:'Connection'}</strong><button type="button" aria-label="Close chain actions" onClick={()=>setMenu(null)}><X size={16}/></button></header>
        {menu.kind==='node'?<>{([['inspect','Inspect system',CircleDot],['notebook','Open notebook',NotebookPen],['connect','Connect this system',Link2],['route','Set route destination',Navigation],['observations','System observations',Radio],['comments','Field notes',MessageSquare],['edit','Edit system details',Settings2],['lock',nodeById.get(Number(menu.id))?.locked?'Unlock position':'Lock position',nodeById.get(Number(menu.id))?.locked?UnlockKeyhole:LockKeyhole]] as const).filter(([action])=>!menuPublic||['inspect','notebook','route'].includes(action)).map(([action,label,Icon])=><button key={action} type="button" disabled={busy&&['edit','connect','lock'].includes(action)} onClick={()=>{if(action==='connect'&&onConnectSystems)beginConnection(Number(menu.id),'right');else onNodeAction(action,Number(menu.id));setMenu(null);}}><Icon size={16}/>{label}</button>)}{!menuPublic&&<><button type="button" onClick={()=>{setTraceFrom(Number(menu.id));setMenu(null);}}><Route size={16}/>Trace connections from here</button><button type="button" className="is-destructive" disabled={busy||nodeById.get(Number(menu.id))?.locked} onClick={()=>{onNodeAction('remove',Number(menu.id));setMenu(null);}}><Trash2 size={16}/>Remove from this map</button></>}</>:<><button type="button" disabled={busy} onClick={()=>{onConnectionAction('edit',String(menu.id));setMenu(null);}}><Settings2 size={16}/>{menuPublic?'Inspect public report':'Edit connection'}</button>{!menuPublic&&<button type="button" className="is-destructive" disabled={busy||links.find(link=>link.id===menu.id)?.locked} onClick={()=>{onConnectionAction('remove',String(menu.id));setMenu(null);}}><Trash2 size={16}/>Remove from this map</button>}</>}
      </div>}
    </div>
    <div className="jspace-map-bottom"><div className="jspace-map-key" aria-label="Connection legend"><span title="A connection recorded in your map"><i/>Recorded</span><span title="Observation has not been explicitly confirmed"><i className="is-unconfirmed"/>Unconfirmed</span><span title="Reported end of life or critical lifetime"><i className="is-eol"/>End of life</span><span title="User-reported critical mass"><i className="is-critical"/>Critical mass</span><span title="Reported expired or collapsed; kept as historical context"><i className="is-expired"/>Expired</span>{routeSystemIds.length>1&&<span title="The current calculated navigation route"><i className="is-route"/>Calculated route</span>}</div><details className="jspace-map-help"><summary><HelpCircle size={17}/>Map controls</summary><p id={helpId}>Drag the background to pan; scroll or pinch to zoom. Drag a card to arrange it; drag a side handle to another card to connect. Shift or Ctrl-click selects a group; Shift-drag the background selects an area. Dragging a selected card moves the unlocked group together. Double-click a header to open its notebook.</p><p>Keyboard: Tab explores nodes and connections. Arrow keys move between systems; Alt + arrows move an unlocked selection. Shift + F10 opens actions. Home fits the chain. Enter a connection handle, then another system to connect. Escape cancels.</p></details></div>
  </section>;
}
