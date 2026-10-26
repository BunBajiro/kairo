"use client";

/**
 * Own private Maps reads, optimistic revisions, commands and selected-map UI.
 * The library fetches compact summaries plus only the selected map's detail;
 * renderers receive a derived scene and return intent through callbacks. Public
 * source/report overlays are inspected separately from writable saved maps.
 * See docs/INTERNAL-API.md and docs/UNIVERSE.md for command and scope contracts.
 */

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Activity, ArrowDownToLine, ArrowUpRight, Building2, Check, ChevronDown, Clock3, Compass, CircleHelp, Eye, Home, FileUp, Flag, Link2, LoaderCircle, LockKeyhole, MapPin, MessageSquare, Navigation, NotebookPen, Plus, Radio, RefreshCw, Search, Settings2, ShieldQuestion, Sparkles, Trash2, Undo2, Users, Waypoints, X} from 'lucide-react';
import type {UniverseAtlas, UniverseIntel, UniverseSystem} from './universe-types';
import type {UniverseRouteEdge} from './universe-map-operations.mjs';
import {JSpaceMap, type JSpaceMapData} from './jspace-map';
import {systemLocationLabel, wormholeClassLabel} from './universe-presentation.mjs';
import {LIFETIME_PRESETS, MASS_STATES, SHIP_SIZES, connectionLifePreset, connectionMassLabel, connectionLifeLabel, connectionLifeTone, connectionConditionPatch} from './jspace-connection-model.mjs';
import {JSpaceNodeEditor, JSpaceConnectionEditor, JSpaceObservations, JSpacePassages, JSpaceComments, JSpaceReference, JSpacePublicReport} from './jspace-workspace-panels';
import {JSpaceDestinations} from './jspace-destinations';
import {publicChainScene, connectionHasEnded, drawnConnectionPayload, createLayoutSaveScope, groupSystemObservations} from './jspace-workspace-model.mjs';
import {createJSpaceClock} from './jspace-clock.mjs';
import {createScopedRefresh} from './scoped-refresh.mjs';
import {useKairo} from './context';
import {MapLibrarySearch, MapAddSearch} from './map-discovery-search';
import {prepareMapGroup, type MapGroupPlacement} from './map-group-placement.mjs';
import './jspace-workspace.css';

export type JSpaceWorkspaceMap = JSpaceMapData & {description?: string; revision: number; passages?: any[]; observations?: any[]; comments?: any[]; activity?: any[]; signatures?: any[]; pings?: any[]; can_undo?: boolean; [key: string]: any};
/** Return the accepted map, or null for inapplicable/rejected work; the workspace owns error presentation. */
export type JSpaceCommand = (op: string, payload?: Record<string, unknown>) => Promise<JSpaceWorkspaceMap | null>;
export type JSpaceMapSummary = {id:string;name:string;description?:string;kind?:string|null;revision:number;created_at?:string;updated_at?:string;read_only?:boolean;node_count:number;connection_count:number;pilot_count:number;scope?:unknown;next_expiry_at?:string|null};
type WorkspaceState = {character_id: number; generated_at?: string; maps: JSpaceMapSummary[]; source_map?:JSpaceMapSummary|null; limits?: Record<string, number>};
function mapSummary(map:JSpaceWorkspaceMap):JSpaceMapSummary {const now=Date.now(),connections=map.connections.filter(value=>!connectionHasEnded(value,now)),expiries=connections.map(value=>Date.parse(value.expires_at||'')).filter(value=>Number.isFinite(value)&&value>now);return {id:map.id,name:map.name,description:map.description,kind:map.kind,revision:map.revision,created_at:map.created_at,updated_at:map.updated_at,read_only:map.read_only,node_count:map.nodes.length,connection_count:connections.length,pilot_count:map.pilots?.length||0,scope:map.scope,next_expiry_at:expiries.length?new Date(Math.min(...expiries)).toISOString():null};}
type Panel = 'create' | 'settings' | 'import' | 'add' | 'node' | 'connection' | 'observations' | 'passages' | 'comments' | 'activity' | 'reference' | 'destinations' | 'scanner' | 'navigate' | 'intel' | 'pilots' | null;
export type JSpaceSystemTool = 'system' | 'scanner' | 'navigate' | 'intel';
const SYSTEM_PANELS = ['node','reference','scanner','observations','comments','navigate','intel'];
export type JSpaceWorkspaceProps = {atlas: UniverseAtlas; intel: UniverseIntel | null; character: number; csrf: string; onInspectSystem: (id: number) => void; onOpenNotebook: (id: number) => void; onOpenIntel: (id: number) => void; onRouteToSystem: (id: number) => void; onShowKnownSpace?: (id: number) => void; onChanged?: () => void | Promise<unknown>; onMapChange?: (mapId:string) => void; externalPanelOpen?: boolean; externalPanelTool?: string; renderSystemTool?: (tool:JSpaceSystemTool,systemId:number,onSelect:(id:number)=>void,mapId?:string) => ReactNode; onDismissExternalPanel?: () => void; onRefresh?: () => Promise<unknown>; requestedSystemId?: number | null; routeSystemIds?: number[]; routeEdges?: UniverseRouteEdge[]};

const label = (value?: string) => (value || 'unknown').replaceAll('_', ' ');
export function jspaceTime(value?: string | null) {return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-GB', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'}) + ' EVE' : 'Time unreported';}
export function jspaceAge(value?: string | null, now = Date.now()) {const at = value ? Date.parse(value) : NaN; if (!Number.isFinite(at)) return 'Time unreported'; const minutes = Math.max(0, Math.floor((now - at) / 60000)); return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;}

export function JSpaceSheet({title, subtitle, children, onClose, modal = false}: {title: string; subtitle?: string; children: ReactNode; onClose: () => void; modal?: boolean}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {const prior = ref.current?.ownerDocument.activeElement as HTMLElement | null; (modal ? (ref.current?.querySelector<HTMLElement>('input')||ref.current?.querySelector<HTMLElement>('button')) : ref.current)?.focus({preventScroll: true}); return () => {if (prior?.isConnected) prior.focus({preventScroll: true});};}, [modal]);
  const sheet = <section ref={ref} className={'jspace-sheet'+(modal?' is-create':'')} role="dialog" aria-modal={modal} aria-label={title} tabIndex={-1} onKeyDown={event => {if (event.key === 'Escape' && !event.defaultPrevented) {event.preventDefault(); event.stopPropagation(); onClose();}else if(modal && event.key==='Tab'){const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]).filter(element=>element.getClientRects().length);const first=controls[0],last=controls.at(-1),active=ref.current?.ownerDocument.activeElement;if(event.shiftKey&&active===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();}}}}>
    <header className="jspace-sheet-heading"><div><span className="jspace-eyebrow">MAP WORKSPACE</span><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button className="jspace-icon-button" onClick={onClose} aria-label={'Close ' + title}><X size={20}/></button></header>
    <div className="jspace-sheet-body">{children}</div>
  </section>;
  return modal ? <div className="jspace-create-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>{sheet}</div> : sheet;
}

export function JSpaceWorkspace({atlas, intel, character, csrf, onInspectSystem, onOpenNotebook, onOpenIntel, onRouteToSystem, onShowKnownSpace, onChanged, onMapChange, externalPanelOpen, externalPanelTool, renderSystemTool, onDismissExternalPanel, onRefresh, requestedSystemId, routeSystemIds, routeEdges}: JSpaceWorkspaceProps) {
  const {boot}=useKairo();
  const [state, setState] = useState<WorkspaceState | null>(null), [selectedMap,setSelectedMap]=useState<JSpaceWorkspaceMap|null>(null), [mapId, setMapId] = useState(''), [selectedSystemId, setSelectedSystemId] = useState<number | null>(null), [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null), [mutationBusy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [fitRequest, setFitRequest] = useState(0), [clockNow, setNow] = useState(Date.now());
  const [publicSources, setPublicSources] = useState<Record<string,boolean>>({thera:false,turnur:false});
  const [layoutPendingCount, setPendingLayouts] = useState(0), [connecting, setConnecting] = useState(false);
  const layoutScope = useRef(createLayoutSaveScope('')), mutationScope = useRef({pilot:character});
  const hasPilot = Number.isSafeInteger(character) && character > 0;
  const [observationKind,setObservationKind]=useState<'structure'|'timer'|'scan'>('structure');
  const [draftFrom, setDraftFrom] = useState<number | null>(null), [frameSystemRequest, setFrameSystemRequest] = useState<{systemId:number;requestId:number}>();
  const [undoNotice, setUndoNotice] = useState<{pilot:number;mapId:string;revision:number;message:string;systemId?:number} | null>(null);
  const [searchRequest, setSearchRequest] = useState(0), [creationSourceId,setCreationSourceId]=useState<string|null>(null);
  const [placement,setPlacement]=useState<(MapGroupPlacement & {id:string;mapId:string;pilot:number;revision:number})|null>(null);
  useEffect(()=>{setPlacement(null);},[mapId,character]);
  const dismissExternalPanel = useRef(onDismissExternalPanel);dismissExternalPanel.current=onDismissExternalPanel;
  const handledRequest = useRef<number | null>(null), freshnessClock = useRef<ReturnType<typeof createJSpaceClock>|null>(null);
  const mounted = useRef(true), requestEpoch = useRef(0), busyRef = useRef(false), characterRef = useRef(character), mapRef = useRef<JSpaceWorkspaceMap | null>(null), workspace = useRef<HTMLDivElement>(null);
  characterRef.current = character;
  const byId = useMemo(() => new Map(atlas.systems.map(system => [system.system_id, system])), [atlas]);
  const selectedMapRef=useRef(mapId);selectedMapRef.current=mapId;
  const maps=state?.maps||[];
  const map = state?.character_id===character&&selectedMap?.id===mapId?selectedMap:null; mapRef.current = map;
  // Consume fresh data and wall time together; the clock effect only arms deadlines.
  const now=useMemo(()=>Date.now(),[clockNow,map,state?.maps,intel?.feeds]);
  const readOnly=map?.read_only===true,canWrite=hasPilot&&!readOnly;
  useEffect(()=>{onMapChange?.(map?.id||'');},[map?.id,onMapChange]);
  const layoutScopeKey = character + ':' + (map?.id || ''), pendingLayouts = layoutScope.current.key === layoutScopeKey ? layoutPendingCount : 0;
  const busy = mutationBusy || pendingLayouts > 0;
  const previousScene = useRef<JSpaceWorkspaceMap|null>(null), expiryRefresh = useRef('');
  const scene = useMemo<JSpaceWorkspaceMap|null>(() => publicChainScene(map,intel?.feeds,atlas.systems,readOnly?{}:publicSources,now,previousScene.current),[map,intel?.feeds,atlas.systems,publicSources,now]);
  useEffect(()=>{previousScene.current=scene;},[scene]);
  const node = scene?.nodes.find(value => value.system_id === selectedSystemId), system = selectedSystemId ? byId.get(selectedSystemId) : undefined;
  const connection = scene?.connections.find(value => value.id === selectedConnectionId);
  const selectedPublic = readOnly || !!(node as any)?.public_report;
  useEffect(() => {setUndoNotice(current => current && current.pilot === character && current.mapId === map?.id && current.revision === map?.revision && map?.can_undo ? current : null);}, [character, map?.id, map?.revision, map?.can_undo]);
  const request = useCallback(async (path = '', method = 'GET', body?: unknown) => {
    const response = await fetch('/api/universe/jspace' + path + (path.includes('?') ? '&' : '?') + 'character=' + character, {method, headers: {...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...(csrf ? {'X-Kairo-CSRF': csrf} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
    const data = await response.json().catch(() => ({error: 'Kairo could not read the map response.'}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'The map request failed.'), {status: response.status});
    return data;
  }, [character, csrf]);
  const refreshScope=useRef<ReturnType<typeof createScopedRefresh>|null>(null);
  // Epoch, pilot and selected-map identity fence both stages. Do not replace
  // this bounded read with the full library payload when refreshing one map.
  const readWorkspace=useCallback(async()=>{
    const epoch=++requestEpoch.current,pilot=character,wanted=selectedMapRef.current;
    try {
      const result:WorkspaceState=await request('/summaries');
      const exists=result.maps.some(value=>value.id===wanted)||result.source_map?.id===wanted;
      const detail:JSpaceWorkspaceMap|null=wanted&&exists&&epoch===requestEpoch.current&&pilot===characterRef.current&&wanted===selectedMapRef.current?await request('/maps/'+encodeURIComponent(wanted)):null;
      return {epoch,pilot,wanted,result,detail,failure:null};
    } catch(failure) {return {epoch,pilot,wanted,result:null,detail:null,failure};}
  },[request,character]);
  useEffect(()=>{
    const scope=createScopedRefresh({read:readWorkspace,canRead:()=>!busyRef.current&&!layoutScope.current.pending&&!workspace.current?.ownerDocument.hidden,publish:({epoch,pilot,wanted,result,detail,failure})=>{
      if(!mounted.current||epoch!==requestEpoch.current||pilot!==characterRef.current||wanted!==selectedMapRef.current)return;
      if(result){setState(result);setSelectedMap(detail);setError('');if(wanted&&!detail){selectedMapRef.current='';setMapId('');}}
      else setError(failure instanceof Error?failure.message:'The chain workspace is unavailable.');
      setLoading(false);
    }});
    refreshScope.current=scope;
    return()=>{scope.close();if(refreshScope.current===scope)refreshScope.current=null;};
  },[readWorkspace]);
  const reload=useCallback((silent=false)=>{if(!silent)setLoading(true);return refreshScope.current?.request({force:true})||Promise.resolve();},[readWorkspace]);
  useEffect(()=>{refreshScope.current?.resume();},[mutationBusy,layoutPendingCount]);
  useEffect(()=>{if(readOnly&&panel&&!['reference','connection','create','import','settings'].includes(panel))setPanel(system?'reference':null);},[readOnly,panel,system]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; requestEpoch.current++;};}, []);
  useEffect(() => {mutationScope.current={pilot:character};busyRef.current=false;setBusy(false);setConnecting(false);},[character]);
  useEffect(() => {layoutScope.current.cancel();const scope=createLayoutSaveScope(layoutScopeKey);layoutScope.current=scope;setPendingLayouts(0);return()=>scope.cancel();},[layoutScopeKey]);
  useEffect(() => {let saved: any = {};try {saved = JSON.parse(sessionStorage.getItem('kairo:jspace:workspace:' + character) || '{}');} catch {}handledRequest.current=null;setPublicSources({thera:saved.publicSources?.thera===true,turnur:saved.publicSources?.turnur===true});setState(null);setSelectedMap(null);selectedMapRef.current='';setMapId('');setSelectedSystemId(null);setSelectedConnectionId(null);setPanel(null);setCreationSourceId(null);setNotice('');void reload();}, [character, reload]);
  useEffect(()=>{if(mapId&&selectedMapRef.current===mapId)void reload();},[mapId,reload]);
  useEffect(() => {if (state?.character_id !== character) return;try {sessionStorage.setItem('kairo:jspace:workspace:' + character, JSON.stringify({publicSources}));} catch {}}, [state?.character_id, character,publicSources]);
  useEffect(() => {
    const owner=workspace.current?.ownerDocument || document;
    const clock=createJSpaceClock({onTick:setNow,isVisible:()=>!owner.hidden});freshnessClock.current=clock;
    const visible=()=>clock.visible();owner.addEventListener('visibilitychange',visible);
    return()=>{clock.close();freshnessClock.current=null;owner.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(() => {
    freshnessClock.current?.refresh([...(map?.connections||[]),...(!map?(state?.maps||[]).map(value=>({expires_at:value.next_expiry_at})):[]),...(map?.pings||[]),...(intel?.feeds?.connections||[]),...Object.values(intel?.feeds?.sources||{})],now);
  },[map?.connections,map?.pings,state?.maps,intel?.feeds,now]);
  useEffect(() => {
    const ended = map?map.connections.filter(connection=>connectionHasEnded(connection,now)).map(connection=>map.id+':'+connection.id+':'+connection.expires_at):(state?.maps||[]).filter(value=>value.next_expiry_at&&Date.parse(value.next_expiry_at)<=now).map(value=>value.id+':'+value.next_expiry_at);
    if (!ended.length) {expiryRefresh.current='';return;}
    const key=character+':'+ended.join('|');
    if (busy || expiryRefresh.current===key) return;
    expiryRefresh.current=key;
    // Rendering drops the edge at its deadline; reconcile every saved map and routing data now.
    void reload(true).then(()=>onChanged?.());
  }, [now, map?.connections, state?.maps, character, busy, reload, onChanged]);
  useEffect(() => {
    const owner=workspace.current?.ownerDocument||document;
    const refresh=()=>{void refreshScope.current?.request();};
    const changed=(event:Event)=>{const pilot=(event as CustomEvent).detail?.characterId;if(!pilot||pilot===character)refresh();};
    const visible=()=>{if(!owner.hidden)refresh();};
    window.addEventListener('kairo:universe-changed',changed);owner.addEventListener('visibilitychange',visible);const timer=window.setInterval(refresh,60000);
    return()=>{window.removeEventListener('kairo:universe-changed',changed);owner.removeEventListener('visibilitychange',visible);window.clearInterval(timer);};
  },[character]);
  useEffect(() => {if (panel) dismissExternalPanel.current?.();}, [panel]);
  useLayoutEffect(() => {
    if (!selectedSystemId || !SYSTEM_PANELS.includes(panel || '')) return;
    const body = workspace.current?.querySelector<HTMLElement>('.jspace-sheet-body');
    if (body) body.scrollTop = 0;
  }, [panel, selectedSystemId]);
  useEffect(() => {if (scene && selectedSystemId && !SYSTEM_PANELS.includes(panel||'') && !scene.nodes.some(value => value.system_id === selectedSystemId)) {setSelectedSystemId(null);if(['node','observations','comments'].includes(panel||''))setPanel(null);}if (scene && selectedConnectionId && !scene.connections.some(value => value.id === selectedConnectionId)) {setSelectedConnectionId(null);if(['connection','passages','comments'].includes(panel||''))setPanel(null);}}, [scene, selectedSystemId, selectedConnectionId,panel]);
  useEffect(() => {if (!map || state?.character_id !== character || loading || !requestedSystemId || handledRequest.current === requestedSystemId || !byId.has(requestedSystemId)) return;handledRequest.current = requestedSystemId;setSelectedSystemId(requestedSystemId);setSelectedConnectionId(null);if (scene?.nodes.some(value => value.system_id === requestedSystemId)) setFrameSystemRequest({systemId:requestedSystemId,requestId:Date.now()});else if(!externalPanelOpen) setPanel('reference');}, [requestedSystemId, loading, map?.id, scene?.nodes, byId, externalPanelOpen,state?.character_id,character]);
  useEffect(() => {if (!map || state?.character_id !== character || !externalPanelOpen || !requestedSystemId || !byId.has(requestedSystemId)) return;setSelectedSystemId(requestedSystemId);setSelectedConnectionId(null);setPanel(externalPanelTool==='explore'?'scanner':externalPanelTool==='route'||externalPanelTool==='jump'?'navigate':externalPanelTool==='intel'?'intel':'reference');dismissExternalPanel.current?.();}, [externalPanelOpen,externalPanelTool,requestedSystemId,byId,state?.character_id,character,map?.id]);
  // Publish the returned revision synchronously to mapRef as well as React;
  // the next queued gesture must submit against this accepted revision.
  function acceptMap(next:JSpaceWorkspaceMap,select=false){
    const summary=mapSummary(next);
    setState(current=>({...current,character_id:character,maps:current?.maps.some(value=>value.id===next.id)?current.maps.map(value=>value.id===next.id?summary:value):[...(current?.maps||[]),summary]}));
    if(select){selectedMapRef.current=next.id;setMapId(next.id);setSelectedSystemId(null);setSelectedConnectionId(null);setFitRequest(value=>value+1);}
    if(selectedMapRef.current===next.id){mapRef.current=next;setSelectedMap(next);}
  }
  // Accepted HTTP work may finish after navigation. Suppress stale publication,
  // not server execution; a 409 reloads current state without replaying the draft.
  async function perform(action: () => Promise<any>, success?: string) {
    if (busyRef.current) return null;
    busyRef.current = true;requestEpoch.current++;setBusy(true);setLoading(false);setError('');const pilot = character, scope=mutationScope.current, target=selectedMapRef.current;
    try {const result = await action();if (!mounted.current || pilot !== characterRef.current || scope!==mutationScope.current || target!==selectedMapRef.current) return null;if (success) setNotice(success);return result;}
    catch (failure: any) {if (mounted.current && pilot === characterRef.current && scope===mutationScope.current && target===selectedMapRef.current) {if (failure?.status === 409) {await reload(true);if(mounted.current && pilot===characterRef.current && scope===mutationScope.current)setError('This map changed in another window. The latest version is loaded. Review your changes and save again.');} else setError(failure?.message || 'The change could not be saved.');}return null;}
    finally {if(scope===mutationScope.current){busyRef.current = false;if (mounted.current) {setBusy(false);refreshScope.current?.resume();}}}
  }
  const command: JSpaceCommand = async (op, payload = {}) => {
    const current = mapRef.current;if (!current || current.read_only) return null;
    setUndoNotice(null);
    const next = await perform(() => request('/maps/' + encodeURIComponent(current.id) + '/commands', 'POST', {revision: current.revision, op, ...payload}));
    if (next) {acceptMap(next);if (['connection.save', 'connection.remove', 'nodes.remove', 'signature.save','group.add'].includes(op)) void onChanged?.();if (['connection.remove','nodes.remove'].includes(op)) void reload(true);}
    return next;
  };
  // Queue position intent, then resolve current revision only when its turn
  // starts. Scope failure cancels dependent gestures rather than blind retries.
  function moveNodes(positions: {system_id:number;x:number;y:number}[]) {
    const targetMap = mapRef.current?.id, pilot = character, scope=layoutScope.current;
    if (!canWrite || !targetMap || scope.key!==pilot+':'+targetMap || scope.closed || busyRef.current && !scope.pending) return Promise.resolve(null);
    const result=scope.run(async () => {
      if (!mounted.current || pilot !== characterRef.current || mapRef.current?.id !== targetMap) return null;
      const savedNodes = new Set(mapRef.current.nodes.map(value => value.system_id));
      const changes = positions.filter(value => savedNodes.has(value.system_id));
      if (!changes.length) return null;
      return command('nodes.position', {positions:changes});
    });
    setPendingLayouts(scope.pending);
    return result.finally(() => {if (mounted.current && layoutScope.current===scope) setPendingLayouts(scope.pending);});
  }
  async function connectSystems(fromId:number, toId:number, ports?:{from_port:'left'|'right'|'top'|'bottom';to_port:'left'|'right'|'top'|'bottom'}) {
    const current = mapRef.current, scope=mutationScope.current;
    if (!canWrite || !current || fromId === toId || busyRef.current || layoutScope.current.pending) return null;
    if (![fromId,toId].every(id => current.nodes.some(value => value.system_id === id))) return null;
    const gate = atlas.gates.some(value=>value.from_system_id===fromId&&value.to_system_id===toId||value.from_system_id===toId&&value.to_system_id===fromId);
    const kind = gate?'gate':'wormhole';
    const existing = current.connections.find(value => value.kind === kind && value.enabled !== false && value.life_status !== 'collapsed' && (!value.expires_at || Date.parse(value.expires_at) > Date.now()) && (value.from_system_id === fromId && value.to_system_id === toId || value.from_system_id === toId && value.to_system_id === fromId));
    if (existing) {setSelectedConnectionId(existing.id);setSelectedSystemId(null);setPanel(null);return current;}
    const before = new Set(current.connections.map(value => value.id));
    setConnecting(true);setNotice('');
    try {
      const next = await command('connection.save', {connection:{...(gate?{kind:'gate',from_system_id:fromId,to_system_id:toId}:drawnConnectionPayload(fromId,toId)),...ports}});
      if (next) {
        const edge = next.connections.find(value => !before.has(value.id) && value.from_system_id === fromId && value.to_system_id === toId);
        if (edge) {setSelectedConnectionId(edge.id);setSelectedSystemId(null);setPanel(null);}
      }
      return next;
    } finally {if (mounted.current && scope===mutationScope.current) setConnecting(false);}
  }
  function selectSystem(id: number | null) {if(id !== null) onDismissExternalPanel?.();setSelectedSystemId(id);if (id !== null) setSelectedConnectionId(null);if (id !== null && panel && !['add', 'activity'].includes(panel)) setPanel(null);}
  function selectConnection(id: string | null) {if(id !== null) onDismissExternalPanel?.();setSelectedConnectionId(id);if (id !== null) setSelectedSystemId(null);if (id !== null && panel && !['add', 'activity'].includes(panel)) setPanel(null);}
  function openCreate(sourceId:string|null=null) {setCreationSourceId(sourceId);setPanel('create');}
  function chooseMap(id: string) {onDismissExternalPanel?.();requestEpoch.current++;selectedMapRef.current=id;setSelectedMap(null);setMapId(id);if(!id){setLoading(false);void reload(true);}setSelectedSystemId(null);setSelectedConnectionId(null);setPanel(null);setNotice('');setFitRequest(value => value + 1);}
  async function addSystem(id: number) {
    if (!map) return;
    if (!canWrite) {if(map.nodes.some(node=>node.system_id===id)){setSelectedSystemId(id);setSelectedConnectionId(null);setPanel('reference');setFrameSystemRequest({systemId:id,requestId:Date.now()});}return;}
    const existing = map.nodes.find(value => value.system_id === id);
    if (!existing) {
      const origin = node || map.nodes.at(-1);
      if (!await command('node.save', {node: {system_id:id,x:origin ? origin.x + 300 : 0,y:origin?.y || 0,status:'unknown'}})) return;
    }
    onDismissExternalPanel?.();setSelectedSystemId(id);setSelectedConnectionId(null);setPanel(null);setFrameSystemRequest({systemId:id,requestId:Date.now()});
  }
  function openMapResult(id:string,systemId:number|null,connectionId?:string|null,notes=false) {
    const target=maps.find(value=>value.id===id);if(!target)return;
    onDismissExternalPanel?.();requestEpoch.current++;selectedMapRef.current=id;setSelectedMap(null);setMapId(id);setSelectedSystemId(systemId);setSelectedConnectionId(connectionId||null);
    setPanel(notes?'comments':connectionId?'connection':'reference');setNotice('');
    if(systemId)setFrameSystemRequest({systemId,requestId:Date.now()});
    else setFitRequest(value=>value+1);
  }
  function openNoteLocation(note:{system_id?:number|null;connection_id?:string|null}) {
    setSelectedSystemId(note.system_id||null);setSelectedConnectionId(note.connection_id||null);setPanel('comments');
    if(note.system_id&&map?.nodes.some(node=>node.system_id===note.system_id))setFrameSystemRequest({systemId:note.system_id,requestId:Date.now()});
    else if(note.connection_id){const edge=map?.connections.find(edge=>edge.id===note.connection_id);if(edge)setFrameSystemRequest({systemId:edge.from_system_id,requestId:Date.now()});}
  }
  function stageGroup(kind:'region'|'constellation',id:number) {
    if(!map||!canWrite||busy)return;
    try {const next=prepareMapGroup(atlas,map,intel?.links,kind,id);setPanel(null);setSelectedSystemId(null);setSelectedConnectionId(null);setError('');setPlacement({...next,id:map.id+':'+Date.now(),mapId:map.id,pilot:character,revision:map.revision});}
    catch(failure){setError(failure instanceof Error?failure.message:'This group could not be placed.');}
  }
  // A preview is tied to the exact map revision it was staged from. The server
  // still validates group membership and creates links when the command commits.
  async function confirmPlacement() {
    if(!placement||busy)return;
    if(placement.mapId!==map?.id||placement.pilot!==character||placement.revision!==map.revision){setPlacement(null);setError('The map changed during placement. Choose the group again to use its current layout.');return;}
    const next=await command('group.add',{group:placement.group,positions:placement.nodes.map(({system_id,x,y})=>({system_id,x,y}))});
    if(next){setPlacement(null);setFitRequest(value=>value+1);setNotice(placement.name+' added.');}
  }
  function focusSearch() {onDismissExternalPanel?.();setPanel(null);setSearchRequest(value => value + 1);}
  async function removeDiagram(systemIds?:number[], connectionId?:string) {
    const current=mapRef.current, pilot=character;
    if (!current || busy || !canWrite) return;
    const next=await command(connectionId ? 'connection.remove' : 'nodes.remove', connectionId ? {connection_id:connectionId} : {system_ids:systemIds});
    if (!next || mapRef.current?.id !== current.id || characterRef.current !== pilot) return;
    setPanel(null);setSelectedSystemId(null);setSelectedConnectionId(null);setNotice('');
    if (connectionId) setNotice('Connection deleted.');
    else setUndoNotice({pilot,mapId:next.id,revision:next.revision,message:systemIds?.length === 1 ? 'System removed from map' : `${systemIds?.length || 0} systems removed from map`,systemId:systemIds?.length === 1 ? systemIds[0] : undefined});
  }
  async function undoRemoval() {
    const current=mapRef.current, removal=undoNotice;
    if (!removal || busy || current?.id !== removal.mapId || current.revision !== removal.revision || character !== removal.pilot) return;
    const next=await command('undo');
    if (next) {setSelectedSystemId(removal.systemId || null);setSelectedConnectionId(null);}
  }
  function nodeAction(action: string, id: number) {
    if(readOnly){if(action==='kspace')onShowKnownSpace?.(id);else{setSelectedSystemId(id);setSelectedConnectionId(null);setPanel('reference');}return;}
    if (!['notebook','route'].includes(action)) onDismissExternalPanel?.();
    setSelectedSystemId(id);setSelectedConnectionId(null);const value=map?.nodes.find(node => node.system_id === id);
    if (action === 'notebook') setPanel('scanner');
    else if (action === 'route') {setPanel(null);onRouteToSystem(id);}
    else if (action === 'inspect') setPanel('reference');
    else if (action === 'kspace') {setPanel(null);onShowKnownSpace?.(id);}
    else if (['observations','structures','timers'].includes(action)) {setObservationKind(action==='structures'?'structure':action==='timers'?'timer':'scan');setPanel('observations');}
    else if(action==='comments')setPanel('comments');
    else if (action === 'remove') void removeDiagram([id]);
    else if (action === 'connect') {setDraftFrom(id);setPanel('connection');}
    else if (action === 'lock' && value) void command('node.save', {node:{system_id:id,locked:!value.locked}});
    else setPanel('node');
  }
  function quickNode(field:'status'|'role', value:string) {if (node && !selectedPublic) void command('node.save', {node:{system_id:node.system_id,[field]:value}});}
  function quickCondition(field:'mass'|'duration_hours'|'max_ship_size', value:string, id?:string) {const target=id ? mapRef.current?.connections.find(row => row.id===id) : connection;if (!readOnly && !busy && target && target.kind==='wormhole' && !target.public_report && !connectionHasEnded(target,Date.now())) void command('connection.save', {connection:{id:target.id,updated_at:target.updated_at,...connectionConditionPatch(field,value)}});}
  const currentPilot = (map?.pilots || []).find((pilot:any)=>pilot.character_id===character && pilot.tracking!==false);
  const locationId = currentPilot?.system_id || null;
  const signatures = (map?.signatures || []).filter((value: any) => value.system_id === selectedSystemId && !value.missing);
  const systemRecords = groupSystemObservations((map?.observations || []).filter(value => value.system_id === selectedSystemId && (!value.expires_at || Date.parse(value.expires_at) > now)));
  const noteCount = (map?.comments || []).filter(value => selectedConnectionId ? value.connection_id === selectedConnectionId : value.system_id === selectedSystemId).length;
  const livePilots = (map?.pilots || []).filter((pilot: any) => pilot.system_id === selectedSystemId);
  const publicControls = <div className="jspace-public-networks" aria-label="Public chain connections">{['thera','turnur'].map(source=><button key={source} className={'is-'+source} aria-label={'Show '+(source==='thera'?'Thera':'Turnur')+' reports on chain'} aria-pressed={!!publicSources[source]} title={'Show read-only '+(source==='thera'?'Thera':'Turnur')+' connections from EVE-Scout'} onClick={()=>{setPublicSources(current=>({...current,[source]:!current[source]}));setFitRequest(value=>value+1);}}><Radio size={16}/>{source==='thera'?'Thera':'Turnur'}<small>{intel?.feeds?.sources?.[source]?.status==='ready'?'EVE-Scout':label(intel?.feeds?.sources?.[source]?.status)}</small></button>)}{(busy || pendingLayouts > 0) && <span className="jspace-sync-status" role="status"><LoaderCircle size={15} className="jspace-spin"/>{connecting ? 'Connecting…' : pendingLayouts ? 'Saving layout…' : 'Saving…'}</span>}</div>;
  const systemPanel = !!system && !selectedConnectionId && SYSTEM_PANELS.includes(panel||'');
  function chooseToolSystem(id:number) {setSelectedSystemId(id);setSelectedConnectionId(null);if(scene?.nodes.some(value=>value.system_id===id))setFrameSystemRequest({systemId:id,requestId:Date.now()});}
  const selectedTitle = node && system ? node.alias || system.name : system ? system.name : connection ? `${byId.get(connection.from_system_id)?.name || connection.from_system_id} ↔ ${byId.get(connection.to_system_id)?.name || connection.to_system_id}` : '';
  return <div className="jspace-workspace" ref={workspace} data-map-id={map?.id || undefined} aria-label="J-Space chain workspace">
    <header className="jspace-workspace-toolbar"><div className="jspace-workspace-identity"><span className="jspace-workspace-emblem"><Waypoints size={24}/></span><div><span className="jspace-eyebrow">UNIVERSE</span>{map && !readOnly ? <label className="jspace-map-picker"><select aria-label="Active J-Space map" value={map.id} onChange={event => chooseMap(event.target.value)} disabled={busy}>{maps.map(value => <option value={value.id} key={value.id}>{value.name}</option>)}</select><ChevronDown size={17}/></label> : <h2>{readOnly?'Live source':'Maps'}</h2>}</div></div>
      {map ? <MapAddSearch atlas={atlas} map={map} readOnly={readOnly} busy={busy||!!placement} focusRequest={searchRequest} onAdd={addSystem} onStageGroup={stageGroup}/> : <MapLibrarySearch key={character} request={request} revision={state?.generated_at} onOpen={openMapResult}/>}
      <div className="jspace-toolbar-actions">{map&&<button aria-label="Back to J-Space maps" onClick={()=>chooseMap('')} disabled={busy}><Waypoints size={18}/><span>Maps</span></button>}{map && !readOnly && <><button aria-label="Add system" onClick={focusSearch} disabled={busy}><Plus size={18}/><span>Add system</span></button><button aria-label="Connect systems" onClick={() => {setDraftFrom(selectedSystemId);setSelectedConnectionId(null);setPanel('connection');}} disabled={busy || map.nodes.length < 2}><Link2 size={18}/><span>Connect</span></button><button aria-label="Map pilots" aria-pressed={panel==='pilots'} onClick={()=>setPanel(panel==='pilots'?null:'pilots')}><Users size={18}/><span>Pilots</span><b>{map.pilots?.length||0}</b></button><button className="jspace-icon-button" title="Undo map layout or annotation" aria-label="Undo map edit" disabled={busy || !map.can_undo} onClick={() => void command('undo')}><Undo2 size={18}/></button></>}<button className="jspace-icon-button" aria-label="Create a J-Space map" title="Create a map" onClick={() => openCreate()} disabled={busy || !hasPilot}><Plus size={20}/></button><button className="jspace-icon-button" aria-label="Import a J-Space map" title="Import a map" onClick={() => setPanel('import')} disabled={busy || !hasPilot}><FileUp size={19}/></button><button className="jspace-icon-button" aria-label={map&&!readOnly?'Map settings and export':'Maps settings'} title={map&&!readOnly?'Map settings and export':'Maps settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={19}/></button><button className="jspace-icon-button" aria-label="Refresh Universe data" title="Refresh map" disabled={busy || loading} onClick={() => void perform(async () => {if(onRefresh) await onRefresh();await reload(true);})}><RefreshCw size={18} className={loading ? 'jspace-spin' : ''}/></button></div>
    </header>
    {(error || notice || undoNotice) && <div className={'jspace-notice ' + (error ? 'is-error' : '')} role={error ? 'alert' : 'status'}>{error ? <ShieldQuestion size={18}/> : <Check size={18}/>}<span>{error || notice || undoNotice?.message}</span>{!error && undoNotice && <button className="jspace-notice-undo" disabled={busy} onClick={() => void undoRemoval()}><Undo2 size={16}/>Undo removal</button>}<button aria-label="Dismiss map message" onClick={() => {setError('');setNotice('');setUndoNotice(null);}}><X size={16}/></button></div>}
    {readOnly && map && <div className="jspace-source-notice"><span><Radio size={17}/><strong>Live source map — read-only.</strong> Used to populate scoped maps.</span><button disabled={busy} onClick={()=>openCreate(map.id)}><Plus size={17}/>Create new map</button></div>}
    {placement&&<div className="jspace-placement-notice" role="region" aria-label="Group placement"><span><Waypoints size={20}/><span><strong>{placement.name}</strong><small>{placement.nodes.length} new systems{placement.existing?' · '+placement.existing+' already placed':''} · Drag the group into position{placement.source!=='sde'?' · fallback layout':''}</small></span></span><div><button disabled={busy} onClick={()=>setPlacement(null)}><X size={17}/>Cancel placement</button><button className="jspace-primary" disabled={busy} onClick={()=>void confirmPlacement()}><Check size={17}/>Confirm placement</button></div></div>}
    <div className="jspace-workspace-stage" aria-busy={busy || loading}>
      {map ? <JSpaceMap placement={placement} onCancelPlacement={()=>setPlacement(null)} onMovePlacement={positions=>setPlacement(current=>current?{...current,nodes:current.nodes.map(node=>({...node,...positions.find(position=>position.system_id===node.system_id)}))}:null)} onConnectionCondition={quickCondition} overlays={intel?.systems || []} topActions={readOnly?null:publicControls} atlas={atlas} map={scene || map} selectedSystemId={selectedSystemId} selectedConnectionId={selectedConnectionId} locationSystemId={locationId} pilots={map.pilots || []} onSelectSystem={selectSystem} onSelectConnection={selectConnection} onMoveNodes={moveNodes} onConnectSystems={readOnly?undefined:connectSystems} allowDragWhileSaving={pendingLayouts > 0} onNodeAction={nodeAction} onConnectionAction={(action, id) => {setSelectedConnectionId(id);setSelectedSystemId(null);if(action === 'remove') void removeDiagram(undefined,id);else setPanel('connection');}} onAddSystem={readOnly?undefined:focusSearch} operations={map.operations} busy={busy || pendingLayouts > 0} now={now} fitRequest={fitRequest} characterId={character} frameSystemRequest={frameSystemRequest} routeSystemIds={routeSystemIds} routeEdges={routeEdges} onRemoveNodes={readOnly?undefined:ids => void removeDiagram(ids)}/> : <div className={'jspace-welcome'+(maps.length?' has-maps':'')}><span><Waypoints size={48}/></span><p className="jspace-eyebrow">YOUR EXPLORATION NETWORK</p><h2>{loading ? 'Opening your maps…' : maps.length ? 'Your maps.' : 'Make your first map.'}</h2><p>{maps.length?'Choose a map to continue exploring.':'Add systems, draw connections and keep your discoveries together.'}</p>{!loading&&!!maps.length&&<div className="jspace-map-library" aria-label="Your J-Space maps">{maps.map(value=><button className="jspace-map-library-card" key={value.id} aria-label={'Open map '+value.name} onClick={()=>chooseMap(value.id)}><Waypoints size={24}/><span><strong>{value.name}</strong>{value.description&&<span>{value.description}</span>}<small>{value.node_count} systems · {value.connection_count} connections · {value.pilot_count} pilots</small></span><ArrowUpRight size={18}/></button>)}</div>}{!loading && <div className="jspace-welcome-actions"><button className="jspace-primary" disabled={!hasPilot} onClick={() => openCreate()}><Plus size={18}/>{maps.length?'Create new map':'Create your first map'}</button><button disabled={!hasPilot} onClick={() => setPanel('import')}><FileUp size={18}/>Import a map</button></div>}{!hasPilot && !loading && <p className="jspace-guest-note">Select or connect an EVE pilot to create your private chain maps.</p>}</div>}
      {map && !panel && !externalPanelOpen && (node && system || connection) && <section className={'jspace-selection-card '+(connection?'is-connection':'is-system')} aria-label="Selected map context"><header>
        {node && system && <span className="jspace-context-class">{system.space==='wormhole'?wormholeClassLabel(system):'K'}</span>}
        <div><span className="jspace-eyebrow">{readOnly?'LIVE SOURCE':connection ? 'CONNECTION' : selectedPublic ? 'PUBLIC REPORT' : 'MAP CONTEXT'}</span><h3>{selectedTitle}</h3>{node?.alias && <p>{system?.name}</p>}</div><button className="jspace-icon-button" aria-label="Close selected map context" onClick={() => {setSelectedSystemId(null);setSelectedConnectionId(null);}}><X size={18}/></button></header>
        {node && system ? <>
          {!readOnly && <div className="jspace-context-metrics">
            <button aria-label="Scanner" onClick={() => setPanel('scanner')} title="Open scanner signatures"><NotebookPen size={20}/><strong>{signatures.length}</strong><span>Signatures</span></button>
            <button aria-label="Structures" disabled={selectedPublic} onClick={() => {setObservationKind('structure');setPanel('observations');}} title="Recorded structures"><Building2 size={20}/><strong>{systemRecords.structures.length}</strong><span>Structures</span></button><button aria-label="Timers" disabled={selectedPublic} onClick={() => {setObservationKind('timer');setPanel('observations');}} title="System timers"><Clock3 size={20}/><strong>{systemRecords.timers.length}</strong><span>Timers</span></button>
            <button aria-label="Notes" disabled={selectedPublic} onClick={() => setPanel('comments')} title="System field notes"><MessageSquare size={20}/><strong>{noteCount}</strong><span>Notes</span></button>
          </div>}
          {!selectedPublic && <><fieldset className="jspace-quick-field"><legend>Observed status</legend><div className="jspace-quick-status">{['unknown','unscanned','scanning','scanned','empty','occupied','friendly','hostile'].map(value => <button key={value} className={'is-'+value} aria-label={'Mark system '+value} aria-pressed={(node.status || 'unknown')===value} disabled={busy} onClick={() => quickNode('status',value)}><span className="jspace-status-glyph"/>{label(value)}</button>)}</div></fieldset>
          <div className="jspace-quick-role" aria-label="System role">{[{value:'',name:'No role',Icon:CircleHelp},{value:'home',name:'Home',Icon:Home},{value:'staging',name:'Staging',Icon:Flag}].map(({value,name,Icon}) => <button key={value} aria-label={'Set system role '+(value||'none')} aria-pressed={(node.role||'')===value} disabled={busy} onClick={() => quickNode('role',value)}><Icon size={15}/>{name}</button>)}</div></>}
          {node.label && <p className="jspace-node-label">{node.label}</p>}
          <div className="jspace-selection-actions jspace-context-tools">{!readOnly&&<><button onClick={() => onRouteToSystem(system.system_id)}><Navigation size={17}/>Navigate</button><button onClick={() => setPanel('intel')}><Radio size={17}/>Live intel{livePilots.length > 0 && <b>{livePilots.length}</b>}</button></>}<button onClick={() => setPanel('reference')}><Settings2 size={17}/>System details</button></div>
          {!selectedPublic && <div className="jspace-context-foot"><button aria-pressed={map.pings?.some(value=>value.system_id===system.system_id&&Date.parse(value.expires_at)>now) || false} disabled={busy} onClick={()=>{const ping=map.pings?.find(value=>value.system_id===system.system_id&&Date.parse(value.expires_at)>now);void command(ping?'ping.remove':'ping.add',ping?{ping_id:ping.id}:{ping:{system_id:system.system_id,label:'Rally here',duration_seconds:900}});}} title="Private rally marker · 15 minutes"><Flag size={16}/>{map.pings?.some(value=>value.system_id===system.system_id&&Date.parse(value.expires_at)>now)?'Clear rally':'Rally here'}</button>{node.locked && <span title="Position locked"><LockKeyhole size={15}/>Locked</span>}<button className="jspace-danger jspace-icon-button" aria-label="Remove system from map" title="Remove card; Undo restores the system, not its connections" disabled={busy || node.locked} onClick={() => void removeDiagram([system.system_id])}><Trash2 size={16}/></button></div>}
        </> : connection && <>
          {connection.kind==='wormhole'&&<><div className="jspace-connection-signatures" aria-label="Endpoint signatures; a dash means unreported"><code>{connection.from_signature || '—'}</code><Link2 size={19}/><code>{connection.to_signature || '—'}</code></div>
          <div className="jspace-connection-clock"><Clock3 size={18}/><span title={connection.life_observed_at ? 'Lifetime set '+jspaceTime(connection.life_observed_at) : 'Observed lifetime; precise expiry is optional in details'}>{connectionLifeLabel(connection)==='Unknown'?'Lifetime unknown':connection.life_status==='collapsed'?'Collapsed':connectionLifeLabel(connection)}</span><span className={'jspace-route-state '+(connection.confirmed?'':'is-caution')} title={connection.public_report?'Read-only EVE-Scout observation':connection.confirmed?'User confirmed; route eligibility still depends on access, expiry and conditions':'Verify the connection in Edit connection before routing'}>{connection.public_report?'Public':connection.confirmed?'Confirmed':'Unconfirmed'}</span></div>
          {!readOnly && !connection.public_report && connection.kind==='wormhole' && connection.life_status!=='collapsed' ? <>
            <fieldset className="jspace-quick-field"><legend>Observed mass</legend><div className="jspace-quick-condition">{MASS_STATES.map(({value,label:massLabel}) => <button key={value} className={'is-'+value} aria-label={'Set observed mass '+massLabel} aria-pressed={(connection.mass||'unknown')===value} disabled={busy || connection.life_status==='collapsed'} onClick={() => quickCondition('mass',value)}><span className={'jspace-mass-glyph is-'+value}/>{massLabel}</button>)}</div></fieldset>
            <fieldset className="jspace-quick-field"><legend>Lifetime</legend><div className="jspace-quick-condition">{LIFETIME_PRESETS.map(({value,label:bandLabel,tone}) => <button key={value} className={'is-'+tone} aria-label={'Set observed lifetime '+bandLabel} aria-pressed={connectionLifePreset(connection)===value} disabled={busy || connection.life_status==='collapsed'} onClick={() => quickCondition('duration_hours',String(value))} title={bandLabel+' from this observation'}><Clock3 size={16}/>{bandLabel}</button>)}</div></fieldset>
            <fieldset className="jspace-quick-field"><legend>Ship size</legend><div className="jspace-quick-condition">{SHIP_SIZES.map(({value,label:sizeLabel,description})=><button key={value} aria-label={'Set ship size '+sizeLabel} aria-pressed={connection.max_ship_size===value} title={description} disabled={busy} onClick={()=>quickCondition('max_ship_size',value)}>{sizeLabel}</button>)}</div></fieldset>
          </> : <div className="jspace-condition-summary"><div className={"is-"+(connection.mass||"unknown")}><span className={"jspace-mass-glyph is-"+(connection.mass||"unknown")}/><span>Mass<strong>{connectionMassLabel(connection)}</strong></span></div><div className={"is-"+connectionLifeTone(connection)}><Clock3 size={20}/><span>Life<strong>{connectionLifeLabel(connection)}</strong></span></div></div>}
          </>}{connection.kind!=='wormhole'&&<div className="jspace-permanent-summary"><Waypoints size={22}/><span><strong>{connection.kind==='gate'?'Stargate':'Ansiblex'}</strong><small>Permanent{connection.kind==='ansiblex'?(connection.map_id?' · Private map bridge':' · Configured network'):''}</small></span></div>}
          <div className="jspace-selection-actions"><button onClick={() => setPanel('connection')}><Settings2 size={17}/>{readOnly?'Inspect connection':connection.public_report?'Inspect public report':'Edit connection'}</button>{!readOnly && !connection.public_report && <>{connection.kind==='wormhole'&&<button aria-label="Passages" onClick={() => setPanel('passages')}><Activity size={17}/>Passages <b>{connection.passage_count || 0}</b></button>}<button aria-label="Notes" onClick={() => setPanel('comments')}><MessageSquare size={17}/>Notes <b>{noteCount}</b></button><button className="jspace-danger" disabled={busy} onClick={() => void removeDiagram(undefined,connection.id)} title="Delete this connection and its records"><Trash2 size={16}/>Delete connection</button></>}</div>
        </>}
      </section>}
      {panel && <JSpaceSheet modal={panel==='create'} title={systemPanel ? selectedTitle : {create: 'Create a map', settings: map&&!readOnly?'Map settings':'Maps settings', import: 'Import a map', add: map?'Add a system':'Find a system', node: 'System context', connection: connection ? 'Connection conditions' : 'Record a connection', observations: 'System observations', passages: 'Passage ledger', comments: 'Field notes', activity: 'Map activity', reference: 'System intelligence', destinations: 'Find an exit or service', scanner:'Scanner',navigate:'Navigation',intel:'Intelligence',pilots:'Map pilots'}[panel]} subtitle={systemPanel ? systemLocationLabel(system) : panel==='passages' ? selectedTitle : undefined} onClose={() => setPanel(null)}>
        {systemPanel && !readOnly && <nav className="jspace-sheet-tabs jspace-system-tabs" aria-label="System tools">{[{id:'reference',label:'System',Icon:Settings2},{id:'scanner',label:'Scanner',Icon:NotebookPen},{id:'observations',label:'Reports',Icon:Eye},{id:'comments',label:'Notes',Icon:MessageSquare},{id:'navigate',label:'Navigate',Icon:Navigation},{id:'intel',label:'Intel',Icon:Radio}].map(({id,label:tabLabel,Icon})=><button key={id} aria-current={panel===id||id==='reference'&&panel==='node'?'page':undefined} disabled={['observations','comments'].includes(id)&&(!map||!node||selectedPublic)} onClick={()=>{if(id==='navigate')onRouteToSystem(system!.system_id);else {if(id==='observations')setObservationKind('structure');setPanel(id as Panel);}}}><Icon size={16}/>{tabLabel}</button>)}</nav>}
        {map && connection && !readOnly && !connection.public_report && ['connection','passages','comments'].includes(panel) && <nav className="jspace-sheet-tabs" aria-label="Connection tools"><button aria-current={panel==='connection'?'page':undefined} onClick={() => setPanel('connection')}><Settings2 size={16}/>Details</button>{connection.kind==='wormhole'&&<button aria-current={panel==='passages'?'page':undefined} onClick={() => setPanel('passages')}><Activity size={16}/>Passages</button>}<button aria-current={panel==='comments'?'page':undefined} onClick={() => setPanel('comments')}><MessageSquare size={16}/>Notes</button><button aria-label="Back to connection controls" onClick={() => setPanel(null)}><Link2 size={16}/>Conditions</button></nav>}
        {panel === 'create'  && <MapForm key={creationSourceId||'new'} busy={busy} atlas={atlas} request={request} characters={boot.characters} currentPilotId={character} fromSource={!!creationSourceId} onSubmit={async values => {const result = await perform(() => request('/maps', 'POST', {...values,...(creationSourceId?{source_map_id:creationSourceId}:{})}), 'Map created.');if (result) {acceptMap(result, true);setPanel(null);}}}/>}
        {panel === 'settings' && state?.source_map && !readOnly && <div className="jspace-source-setting"><span><Radio size={20}/><span><strong>Live tracking source</strong><small>Read-only chain used to populate scoped maps.</small></span></span><button disabled={busy} onClick={()=>chooseMap(state.source_map!.id)}><Eye size={17}/>View live source</button></div>}
        {panel === 'settings' && readOnly && <p className="jspace-muted">This service follows the active pilot. Create your own map to add notes, edit connections and track a crew.</p>}
        {panel === 'settings' && map && !readOnly && <MapForm key={map.id} map={map} busy={busy} atlas={atlas} request={request} onSubmit={async (values,canClose) => {if (await command('map.update', values) && canClose()) setPanel(null);}} onExport={async (format='kairo') => {const result = await perform(() => request('/maps/' + encodeURIComponent(map.id) + '/export'+(format==='wanderer'?'?format=wanderer':'')));if (!result) return;const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'}));const a = document.createElement('a');a.href = url;a.download = map.name.replace(/[^a-z0-9_-]+/gi, '-') + (format==='wanderer'?'.wanderer-map.json':'.kairo-map.json');a.click();setTimeout(() => URL.revokeObjectURL(url), 1000);}} onDuplicate={async () => {const copy = await perform(() => request('/maps/' + encodeURIComponent(map.id) + '/duplicate', 'POST', {revision: map.revision}), 'Map duplicated. The copy has independent system and connection records.');if (copy) {acceptMap(copy, true);setPanel(null);}}} onDelete={async () => {const removed = await perform(() => request('/maps/' + encodeURIComponent(map.id), 'DELETE', {revision: map.revision}), 'Map and its private records removed.');if (removed !== null) {setState(current => current ? {...current, maps: current.maps.filter(value => value.id !== map.id)} : current);chooseMap('');}}}/>}
        {panel === 'import' && <MapImport busy={busy} preview={document => perform(() => request('/import/preview', 'POST', {document}))} importMap={async document => {const result = await perform(() => request('/import', 'POST', {document}), 'Imported as a new map. Imported connections require your confirmation before routing.');if (result) {acceptMap(result, true);setPanel(null);void onChanged?.();}}}/>}
        {panel === 'add' && <AddSystem atlas={atlas} map={map || {id:'catalogue',name:'Catalogue',revision:0,nodes:[],connections:[]}} busy={busy} onAdd={addSystem}/>}

        {panel === 'connection' && readOnly && connection ? <div className="jspace-form"><div className="jspace-connection-signatures"><code>{connection.from_signature||'—'}</code><Link2 size={18}/><code>{connection.to_signature||'—'}</code></div><strong>{connection.wh_type||'Wormhole'}</strong><div className="jspace-badges"><span>{connectionLifeLabel(connection)}</span><span>{connectionMassLabel(connection)}</span><span>{connection.max_ship_size||'Size unknown'}</span></div></div> : panel === 'connection' && map && connection?.public_report ? <JSpacePublicReport connection={connection} atlas={atlas} now={now} busy={busy} onAdopt={async verified=>{const report=connection.portal.report;const result=await command('connection.save',{connection:{add_missing_nodes:true,from_system_id:report.from_system_id,to_system_id:report.to_system_id,kind:'wormhole',confirmed:verified,accessible:verified,enabled:true,expires_at:report.expires_at,from_signature:report.from_signature,to_signature:report.to_signature,wh_type:report.wh_type,max_ship_size:report.max_ship_size,max_jump_mass_kg:report.max_jump_mass_kg,type_status:report.type_status,observed_at:report.observed_at,reported_source:report.source,report_id:String(report.id)}});if(result){setPanel(null);setSelectedConnectionId(null);setNotice(verified?'Verified public connection added to your map.':'Public observation added to your map without route confirmation.');}}}/> : panel === 'connection' && map && <JSpaceConnectionEditor key={map.id + ':' + (connection?.id || 'new') + ':' + (connection?.updated_at || '') + ':' + draftFrom} map={map} atlas={atlas} connection={connection} fromSystemId={draftFrom || selectedSystemId} busy={busy} command={command} onRemove={connection ? () => removeDiagram(undefined,connection.id) : undefined} onClose={() => setPanel(null)} onSaved={id => {setSelectedConnectionId(id);setSelectedSystemId(null);setPanel(null);}}/>}
        {panel === 'observations' && map && selectedSystemId && <JSpaceObservations key={map.id + ':' + selectedSystemId+':'+observationKind} initialKind={observationKind} map={map} systemId={selectedSystemId} busy={busy} command={command} now={now}/>}
        {panel === 'passages' && map && connection?.kind==='wormhole' && <JSpacePassages key={map.id + ':' + connection.id} map={map} connection={connection} atlas={atlas} busy={busy} command={command}/>}
        {panel === 'comments' && map && <JSpaceComments key={map.id + ':' + (selectedSystemId || selectedConnectionId || 'map')} map={map} systemId={selectedSystemId} connectionId={selectedConnectionId} busy={busy} command={command} now={now} byId={byId} onOpenNote={openNoteLocation}/>}
        {['node','reference'].includes(panel) && system && <>{!readOnly && (!node||selectedPublic) && <div className="jspace-reference-add"><p className="jspace-muted">This system is not on your active map.</p>{map ? <button disabled={busy} onClick={async () => {if (await command('node.save',{node:{system_id:system.system_id,x:(map.nodes.at(-1)?.x || 0)+300,y:map.nodes.at(-1)?.y || 0,status:'unknown'}})) {setPanel(null);setFrameSystemRequest({systemId:system.system_id,requestId:Date.now()});}}}><Plus size={17}/>Add to this map</button> : <button disabled={!canWrite} onClick={() => openCreate()}><Plus size={17}/>{canWrite?'Create a map':'Select a pilot to create maps'}</button>}</div>}{map && node && !selectedPublic && <JSpaceNodeEditor key={map.id + ':' + node.system_id} node={node} system={system} busy={busy} command={command} onRemove={() => removeDiagram([node.system_id])} onClose={() => setNotice('System context saved.')}/>}<JSpaceReference system={system} onShowKnownSpace={system.space === 'known' && onShowKnownSpace ? () => onShowKnownSpace(system.system_id) : undefined}/></>}
        {system && ['scanner','navigate','intel'].includes(panel) && renderSystemTool?.(panel as JSpaceSystemTool,system.system_id,chooseToolSystem,map?.id)}
        {panel === 'destinations' && map && <JSpaceDestinations atlas={atlas} originId={selectedSystemId || locationId} chainId={map.id} onSelectSystem={id => {setPanel(null);onInspectSystem(id);}} onRouteToSystem={id => {setPanel(null);onRouteToSystem(id);}}/>}
        {panel === 'pilots' && map && <MapPilots key={map.id} map={map} characters={boot.characters} busy={busy} command={command} byId={byId} onSelect={id=>{selectSystem(id);setFrameSystemRequest({systemId:id,requestId:Date.now()});}}/>}
        {panel === 'activity' && map && <div className="jspace-activity-list">{[...(map.activity || [])].slice(0, 60).map((entry: any, index: number) => <article key={entry.id || index}><Activity size={17}/><div><strong>{entry.summary || entry.label || label(entry.op || entry.action)}</strong><small>{jspaceTime(entry.created_at || entry.at)}{entry.actor_name ? ' · ' + entry.actor_name : ''}</small></div></article>)}{!map.activity?.length && <p className="jspace-muted">Changes to this map will appear here.</p>}</div>}
      </JSpaceSheet>}
    </div>
    {map && !readOnly && <footer className="jspace-workspace-footer"><span><Waypoints size={15}/>{map.nodes.length} systems · {scene?.connections.length||0} connections</span><span><Radio size={15}/>Private map</span><div><button onClick={() => setPanel('destinations')}><Navigation size={15}/>Find an exit</button><button onClick={() => {setSelectedSystemId(null);setSelectedConnectionId(null);setPanel('comments');}}><MessageSquare size={15}/>Map notes</button><button onClick={() => setPanel('activity')}><Activity size={15}/>Activity</button></div></footer>}
  </div>;
}

function MapPilots({map,characters,busy,command,byId,onSelect}:{map:JSpaceWorkspaceMap;characters:{id:number;name:string}[];busy:boolean;command:JSpaceCommand;byId:Map<number,UniverseSystem>;onSelect:(id:number)=>void}) {
  const [choice,setChoice]=useState('');
  const pilots=map.pilots||[],available=characters.filter(character=>!pilots.some((pilot:any)=>pilot.character_id===character.id));
  return <div className="jspace-map-pilots"><div className="jspace-record-list">{pilots.map((pilot:any)=><article key={pilot.character_id} className="jspace-map-pilot"><img src={`https://images.evetech.net/characters/${pilot.character_id}/portrait?size=64`} alt="" width="44" height="44"/><div className="jspace-map-pilot-identity"><strong>{pilot.name||characters.find(character=>character.id===pilot.character_id)?.name||pilot.character_id}</strong><button disabled={!pilot.system_id} onClick={()=>onSelect(pilot.system_id)}><MapPin size={13}/>{byId.get(pilot.system_id)?.name||'Location unavailable'}</button></div><button className="jspace-pilot-tracking" aria-label={'Track '+pilot.name} aria-pressed={pilot.tracking!==false} disabled={busy} onClick={()=>void command('pilot.tracking',{character_id:pilot.character_id,tracking:pilot.tracking===false})}><span/>{pilot.tracking===false?'Paused':'Tracking'}</button><button className="jspace-icon-button jspace-danger" aria-label={'Remove pilot '+pilot.name} disabled={busy} onClick={()=>void command('pilot.remove',{character_id:pilot.character_id})}><X size={16}/></button></article>)}</div>{!pilots.length&&<p className="jspace-muted">Add a pilot to track this map.</p>}{!!available.length&&<form className="jspace-form jspace-panel-section" onSubmit={async event=>{event.preventDefault();if(choice&&await command('pilot.add',{character_id:Number(choice)}))setChoice('');}}><label>Add connected pilot<select aria-label="Map pilot to add" value={choice} onChange={event=>setChoice(event.target.value)}><option value="">Choose a pilot…</option>{available.map(character=><option key={character.id} value={character.id}>{character.name}</option>)}</select></label><button className="jspace-primary" disabled={busy||!choice}><Plus size={17}/>Add pilot</button></form>}</div>;
}

const SCOPE_KINDS = [{key:'system_ids',collection:'systems',name:'Systems'},{key:'constellation_ids',collection:'constellations',name:'Constellations'},{key:'region_ids',collection:'regions',name:'Regions'},{key:'alliance_ids',collection:'alliances',name:'Alliances'},{key:'corporation_ids',collection:'corporations',name:'Corporations'},{key:'power_bloc_ids',collection:'power_blocs',name:'Power blocs'}];
type MapScope = Record<string,(number|string)[]>;
function MapScopeEditor({value,onChange,atlas,request,busy}:{value:MapScope;onChange:(value:MapScope)=>void;atlas:UniverseAtlas;request:(path:string)=>Promise<any>;busy:boolean}) {
  const [kind,setKind]=useState('system_ids'),[query,setQuery]=useState(''),[options,setOptions]=useState<any>(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true;void request('/scope-options').then(value=>{if(alive)setOptions(value);}).catch(failure=>{if(alive)setError(failure.message);});return()=>{alive=false;};},[request]);
  const category=SCOPE_KINDS.find(row=>row.key===kind)!,fallback=category.collection==='systems'?atlas.systems.map(system=>({id:system.system_id,name:system.name})):[],choices:any[]=options?.[category.collection]||fallback,selected=value[kind]||[],text=query.trim().toLowerCase();
  const matches=choices.filter(row=>!selected.includes(row.id)&&text&&(row.name.toLowerCase().includes(text)||String(row.id)===text)).slice(0,8),typedId=/^[1-9][0-9]*$/.test(text)?Number(text):null;
  const canUseId=['alliance_ids','corporation_ids'].includes(kind)&&typedId!==null&&Number.isSafeInteger(typedId)&&!selected.includes(typedId)&&!matches.some(row=>row.id===typedId),count=Object.values(value).reduce((total,rows)=>total+rows.length,0);
  function add(id:number|string){onChange({...value,[kind]:[...selected,id]});setQuery('');}
  return <fieldset className="jspace-scope-editor"><legend><Compass size={17}/>Map scope <span>{count?count+' anchors':'Everywhere'}</span></legend><p className="jspace-muted">Matching live chains populate this map. Any selected anchor can match.</p><div className="jspace-scope-chips">{SCOPE_KINDS.flatMap(category=>(value[category.key]||[]).map(id=><button type="button" key={category.key+':'+id} disabled={busy} title={category.name} aria-label={'Remove scope '+(options?.[category.collection]?.find((row:any)=>row.id===id)?.name||id)} onClick={()=>onChange({...value,[category.key]:(value[category.key]||[]).filter(item=>item!==id)})}><span>{options?.[category.collection]?.find((row:any)=>row.id===id)?.name||(category.key==='system_ids'?atlas.systems.find(system=>system.system_id===id)?.name:null)||category.name+' · '+id}</span><X size={13}/></button>))}</div><div className="jspace-scope-search"><select aria-label="Map scope category" value={kind} disabled={busy} onChange={event=>{setKind(event.target.value);setQuery('');}}>{SCOPE_KINDS.map(row=><option value={row.key} key={row.key}>{row.name}</option>)}</select><input aria-label="Find map scope anchor" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)} placeholder={['alliance_ids','corporation_ids'].includes(kind)?'Name or EVE ID…':'Search '+category.name.toLowerCase()+'…'}/></div>{!!matches.length&&<div className="jspace-scope-matches">{matches.map(row=><button type="button" key={row.id} disabled={busy} onClick={()=>add(row.id)}><Plus size={14}/>{row.name}</button>)}</div>}{canUseId&&<button type="button" className="jspace-scope-id" disabled={busy} onClick={()=>add(typedId!)}><Plus size={14}/>Use {category.name==='Alliances'?'alliance':'corporation'} ID {typedId}</button>}{!count&&<small className="jspace-muted">No anchors selected: track everywhere.</small>}{error&&<small role="alert">{error}</small>}</fieldset>;
}

function MapForm({map, busy, atlas, request, characters = [], currentPilotId, fromSource = false, onSubmit, onDelete, onExport, onDuplicate}: {map?: JSpaceWorkspaceMap; busy: boolean; atlas:UniverseAtlas;request:(path:string)=>Promise<any>;characters?:{id:number;name:string}[];currentPilotId?:number;fromSource?:boolean;onSubmit: (values: any, canClose: () => boolean) => Promise<void>; onDelete?: () => Promise<void>; onExport?: (format?:'kairo'|'wanderer') => Promise<void>; onDuplicate?: () => Promise<void>}) {
  const draftRevision=useRef(0),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [scope,setScope]=useState<MapScope>(map?.scope||{});
  const [track, setTrack] = useState(map?.track_passages===true);
  const [pilotIds,setPilotIds]=useState<number[]>(characters.some(pilot=>pilot.id===currentPilotId)?[currentPilotId!]:characters[0]?[characters[0].id]:[]);
  const selectedPilots=pilotIds.filter(id=>characters.some(pilot=>pilot.id===id));
  const [name, setName] = useState(map?.name || ''), [description, setDescription] = useState(map?.description || ''), [remove, setRemove] = useState(false);
  return <><form className="jspace-form" onSubmit={event => {event.preventDefault();if(!map&&!selectedPilots.length)return;const revision=draftRevision.current;void onSubmit({name: name.trim(), description, ...(map?{track_passages:track}:{pilot_ids:selectedPilots}),scope:Object.values(scope).some(values=>values.length)?scope:null},()=>mounted.current&&draftRevision.current===revision);}}><label>Map name<input aria-label="J-Space map name" value={name} onChange={event => {draftRevision.current++;setName(event.target.value);}} required maxLength={80} placeholder="Home chain, expedition, hunting grounds…" autoFocus/></label><label>Description<textarea aria-label="J-Space map description" value={description} onChange={event => {draftRevision.current++;setDescription(event.target.value);}} maxLength={2000} rows={2} placeholder="What is this map for?"/></label>{!map&&<fieldset className="jspace-create-pilots"><legend><Users size={17}/>Tracked pilots <span>{selectedPilots.length} selected</span></legend><div>{characters.map(pilot=><label key={pilot.id} className={selectedPilots.includes(pilot.id)?'is-selected':''}><input type="checkbox" aria-label={'Track pilot '+pilot.name} checked={selectedPilots.includes(pilot.id)} disabled={busy} onChange={event=>setPilotIds(current=>event.target.checked?[...current,pilot.id]:current.filter(id=>id!==pilot.id))}/><span className="jspace-create-pilot-portrait" aria-hidden="true"><Users size={20}/><img src={`https://images.evetech.net/characters/${pilot.id}/portrait?size=64`} alt="" width="36" height="36" onError={event=>{event.currentTarget.hidden=true;}}/></span><span>{pilot.name}</span></label>)}</div><small>{selectedPilots.length?'Travel by these pilots adds systems and connections.':'Select at least one connected pilot.'}</small></fieldset>}<MapScopeEditor value={scope} onChange={value=>{draftRevision.current++;setScope(value);}} atlas={atlas} request={request} busy={busy}/>{fromSource&&<p className="jspace-muted"><Radio size={17}/>Copy the selected pilots’ live chains, keeping their connection ages.</p>}{map&&<details className="jspace-tracking-advanced"><summary>Passage logging</summary><label className="jspace-checkbox"><input type="checkbox" checked={track} onChange={event=>{draftRevision.current++;setTrack(event.target.checked);}}/><span>Log sampled passages<small>Record observed crossings of verified connections. Pilot tracking stays on regardless.</small></span></label></details>}<button className="jspace-primary" disabled={busy || !name.trim() || !map&&!selectedPilots.length}><Check size={17}/>{map ? 'Save map details' : 'Create map'}</button></form>{map && <div className="jspace-settings-transfer"><button onClick={() => void onExport?.()} disabled={busy}><ArrowDownToLine size={18}/>Export map</button><button onClick={() => void onExport?.('wanderer')} disabled={busy}><ArrowDownToLine size={18}/>Export for Wanderer</button><button onClick={() => void onDuplicate?.()} disabled={busy}><Plus size={18}/>Duplicate map</button><p className="jspace-muted">Native export preserves the recorded context. Wanderer export includes systems, connections and signatures; it omits private observations, notes and passage history.</p><button className="jspace-danger" onClick={() => setRemove(true)} disabled={busy}><Trash2 size={17}/>Remove map</button>{remove && <div className="jspace-confirm"><p>Remove <strong>{map.name}</strong>? This map and its private records will be removed. Other maps are unchanged.</p><div><button className="jspace-danger" disabled={busy} onClick={() => void onDelete?.()}>Remove this map</button><button onClick={() => setRemove(false)}>Keep map</button></div></div>}</div>}</>;
}

function MapImport({busy, preview, importMap}: {busy: boolean; preview: (document: string) => Promise<any>; importMap: (document: string) => Promise<void>}) {
  const [text, setText] = useState(''), [result, setResult] = useState<any>(null), [fileError, setFileError] = useState('');
  return <div className="jspace-form"><p className="jspace-muted">Open a Kairo or compatible Wanderer map export. The preview checks systems, connections and records before creating a separate map.</p><label className="jspace-file-input"><FileUp size={22}/><span>Choose a map file</span><input aria-label="J-Space map import file" type="file" accept=".json,application/json" onChange={async event => {const file = event.target.files?.[0];if (!file) return;if (file.size > 4000000) {setFileError('Choose a map file smaller than 4 MB.');return;}setFileError('');setText(await file.text());setResult(null);}}/></label><label>Or paste map JSON<textarea aria-label="J-Space map import JSON" rows={9} value={text} onChange={event => {setText(event.target.value);setResult(null);}} maxLength={4000000}/></label>{fileError && <p role="alert" className="jspace-error-text">{fileError}</p>}<button disabled={busy || !text.trim()} onClick={async () => setResult(await preview(text))}><Search size={17}/>Preview import</button>{result && <div className="jspace-import-review"><h4>{result.name || 'Map preview'}</h4><div className="jspace-badges">{Object.entries(result.counts || {}).map(([key, value]) => <span key={key}>{String(value)} {label(key)}</span>)}</div>{[...(result.warnings || []), ...(result.errors || [])].map((value: any, index: number) => <p key={index}>{typeof value === 'string' ? value : value.message || JSON.stringify(value)}</p>)}<p className="jspace-muted">Imported connection reports remain unconfirmed until you verify them.</p><button className="jspace-primary" disabled={!result.valid || busy} onClick={() => void importMap(text)}><FileUp size={17}/>Import as a new map</button></div>}</div>;
}


function AddSystem({atlas, map, busy, onAdd}: {atlas: UniverseAtlas; map: JSpaceWorkspaceMap; busy: boolean; onAdd: (id: number) => Promise<void>}) {
  const [query, setQuery] = useState('');const text = query.trim().toLowerCase();const nodes = new Set(map.nodes.map(node => node.system_id));
  const found = (text ? atlas.systems.filter(system => system.name.toLowerCase().includes(text) || String(system.system_id) === text).sort((a, b) => Number(b.name.toLowerCase() === text) - Number(a.name.toLowerCase() === text) || a.name.localeCompare(b.name)) : []).slice(0, 24);
  return <div className="jspace-form"><label className="jspace-search"><Search size={19}/><input aria-label="Find a system to add to chain" value={query} onChange={event => setQuery(event.target.value)} placeholder="System name or ID…" autoFocus/></label><p className="jspace-muted">Add wormhole systems or K-Space exits. Placing a system does not create a connection.</p><div className="jspace-add-results">{found.map(system => <button key={system.system_id} disabled={busy} onClick={() => void onAdd(system.system_id)}><span className="jspace-class-mark">{system.space === 'wormhole' ? wormholeClassLabel(system) : 'K'}</span><span><strong>{system.name}</strong><small>{systemLocationLabel(system)}{nodes.has(system.system_id) ? ' · Already on this map' : ''}</small></span>{nodes.has(system.system_id) ? <ArrowUpRight size={18}/> : <Plus size={18}/>}</button>)}</div>{!found.length && <p className="jspace-muted">{text ? 'No matching system. Try its complete name or ID.' : 'Search for a system to begin this chain.'}</p>}</div>;
}
