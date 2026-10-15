"use client";

import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {ChevronDown, Crosshair, Flag, Focus, HelpCircle, LocateFixed, Map as MapIcon, Maximize2, Minus, Plus, Route, Shapes, Type, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {UniverseAtlas, UniverseBackground, UniverseIndicator, UniverseIntel, UniverseOverlay, UniverseStandingFilter, UniverseSystem, UniverseTerritoryFocus} from './universe-types';
import type {ReplayMapFrame} from './session-replay';
import {createAtlasLayouts} from './universe-map-layouts.mjs';
import {historicalSovereigntyLabel} from './session-replay-sovereignty.mjs';
import {pointBounds, fitCamera, clampCamera, resizeCamera, geometryRevision, paintRevision, createTerritoryGeometry, territoryComponents, territoryOwnerAt} from './universe-map-math.mjs';
import type {Geometry, TerritoryStyle} from './universe-map-math.mjs';
import {wheelZoomFactor, anchoredWheelCamera, pinchCamera, dragCoast, overviewTransform, overviewViewport, projectedDistanceScale} from './universe-map-navigation.mjs';
import './universe-map-motion.css';
import {allocateTerritoryColours, territoryColourEntities, FACTION_TERRITORY_COLOURS} from '@/lib/universe-territory-colours.mjs';
import type {TerritoryColour, TerritoryColourGroup} from '@/lib/universe-territory-colours.mjs';
import {buildGateGraph, routeWatchDistances, tacticalLayout, operationalSystems, feedSystems, observationAge, ageLabel, projectedHull, matchingReachability, usablePublicConnections} from './universe-map-operations.mjs';
import type {UniverseRouteEdge, UniverseTacticalOptions, OperationalSystem, FeedMarker} from './universe-map-operations.mjs';
import {mapLabelBounds, labelEdgeOpacity, labelCollisionBounds} from './universe-map-labels.mjs';
import type {LabelRect} from './universe-map-labels.mjs';
import {buildPortalNetworks} from './universe-map-portals.mjs';
import type {PortalEndpoint} from './universe-map-portals.mjs';
import {UniverseMapContext, positionMapContext} from './universe-map-context';
import type {MapSymbolContext} from './universe-map-context';
import {systemLocationLabel} from './universe-presentation.mjs';

type Point = {system: UniverseSystem; x: number; y: number};
type View = {x: number; y: number; scale: number};
type TerritoryHit = {key: string; name: string; colour: string; source: string; count: number};
type MarkerCluster = {key:string;x:number;y:number;systemIds:number[]};
type SymbolHit = {symbol: MapSymbolContext; x: number; y: number; radius: number; priority: number; segment?: {x: number; y: number}; systemIds?: number[]};
type Drag = {id: number; x: number; y: number; originX: number; originY: number; moved: boolean; vx: number; vy: number; lastAt: number};
type MapProps = {
  atlas: UniverseAtlas; intel: UniverseIntel | null;
  selectedSystemId: number | null; onSelectSystem: (id: number) => void;
  background: UniverseBackground; indicator: UniverseIndicator;
  routeSystemIds?: number[]; showConnections?: boolean; showSpecialLinks?: boolean;
  focusedRegionId?: number | null;
  space?: 'known' | 'wormhole'; standingFilter?: UniverseStandingFilter;
  replay?: ReplayMapFrame | null; onReplayManualPan?: () => void;
  territoryFocus?: UniverseTerritoryFocus | null; onInspectTerritory?: (key: string) => void; onClearTerritoryFocus?: () => void; onFrameTerritory?: () => void;
  routeEdges?: UniverseRouteEdge[]; tactical?: UniverseTacticalOptions; surfaceKey?: number; workspaceKey?: string; onRouteToSystem?: (id: number) => void; onOpenNotebook?: (id: number) => void;
};
const PALETTE = {
  excellent: '#78acf8', good: '#76d4e9', neutral: '#9ba4b0', bad: '#edb071', terrible: '#eb7984', unknown: '#606d7d',
};
const INDICATOR_LABELS: Record<UniverseIndicator, string> = {
  none: 'No indicators', ship_kills: 'Ship kills', pod_kills: 'Pod kills', npc_kills: 'NPC kills', jumps: 'Gate jumps',
  mining: 'Your mining ledger', industry: 'Manufacturing cost index', fw: 'Faction warfare', incursions: 'Incursions',
  npc_delta: 'NPC activity change', adm: 'Activity defence multiplier',
};
const LAYERS: Record<UniverseBackground, string> = {power_blocs: 'Power blocs', sovereignty: 'Sovereignty', standings: 'Pilot standings', security: 'Security status', activity: 'Ship & pod kills', none: 'Unshaded'};
const FW_STATES: Record<string, string> = {frontline:'Frontline', command_operations:'Command operations', rearguard:'Rearguard', unknown:'State unavailable'};
const EMPTY: number[] = [];
const EMPTY_EDGES: UniverseRouteEdge[] = [], DEFAULT_TACTICAL: UniverseTacticalOptions = {};
// Decorative, deterministic backdrop only. These tiny low-contrast marks are not map systems.
const AMBIENT_STARS = Array.from({length: 92}, (_, i) => ({x: ((i * 137.508 + 19) % 1000), y: ((i * i * 19.31 + i * 7.7 + 13) % 680), r: i % 9 === 0 ? .75 : .4}));
function motionAllowed(owner: Document = document) {return !owner.hidden && !(owner.defaultView || window).matchMedia('(prefers-reduced-motion: reduce)').matches;}

function securityColour(security: number): string {return security >= .45 ? '#85dcb5' : security > 0 ? '#dfb975' : '#d68092';}
function sovereigntyName(sov: UniverseOverlay['sovereignty']): string | undefined {
  if (sov?.alliance_id) return sov.alliance_name || `Alliance ${sov.alliance_id}`;
  if (sov?.faction_id) return sov.faction_name || FACTION_TERRITORY_COLOURS[sov.faction_id]?.name || `Faction ${sov.faction_id}`;
  if (sov?.corporation_id) return sov.corporation_name || `Corporation ${sov.corporation_id}`;
  return undefined;
}
function standingLabel(overlay?: UniverseOverlay): keyof typeof PALETTE {
  const label = overlay?.standing?.label;
  return label && label in PALETTE ? label as keyof typeof PALETTE : 'unknown';
}
function passesStanding(overlay: UniverseOverlay | undefined, filter: UniverseStandingFilter): boolean {
  const label = standingLabel(overlay);
  return filter === 'all' || (filter === 'friendly' ? label === 'excellent' || label === 'good' : filter === 'hostile' ? label === 'bad' || label === 'terrible' : label === filter);
}
function indicatorValue(overlay: UniverseOverlay | undefined, indicator: UniverseIndicator): number {
  if (!overlay) return 0;
  switch (indicator) {
    case 'ship_kills': case 'pod_kills': case 'npc_kills': return Number(overlay.kills?.[indicator] || 0);
    case 'jumps': return Number(overlay.jumps || 0);
    case 'mining': return Number(overlay.mining?.quantity || 0);
    case 'incursions': return overlay.incursions?.length || 0;
    case 'fw': return overlay.faction_warfare ? Math.max(1, Number(overlay.faction_warfare.victory_points || 0)) : 0;
    case 'industry': return Number(overlay.industry?.find(index => index.activity === 'manufacturing')?.cost_index || 0) * 100;
    default: return 0;
  }
}

function reportedIndicator(overlay: UniverseOverlay | undefined, indicator: UniverseIndicator, intel: UniverseIntel | null): number | null {
  if (indicator === 'ship_kills' || indicator === 'pod_kills' || indicator === 'npc_kills') return overlay?.kills?.[indicator] ?? intel?.defaults?.kills?.[indicator] ?? null;
  if (indicator === 'jumps') return overlay?.jumps ?? intel?.defaults?.jumps ?? null;
  if (indicator === 'industry') {const index = overlay?.industry?.find(item => item.activity === 'manufacturing'); return index ? Number(index.cost_index) * 100 : null;}
  if (indicator === 'mining') return overlay?.mining?.quantity ?? (intel?.sources.mining?.status === 'ready' ? 0 : null);
  if (indicator === 'fw') return overlay?.faction_warfare ? indicatorValue(overlay, indicator) : intel?.sources.fw?.status === 'ready' ? 0 : null;
  if (indicator === 'incursions') return overlay?.incursions?.length || (intel?.sources.incursions?.status === 'ready' ? 0 : null);
  return null;
}
function layerStyle(point: Point, overlay: UniverseOverlay | undefined, layer: UniverseBackground, palette: ReadonlyMap<string, TerritoryColour>): TerritoryStyle {
  const bloc = overlay?.power_bloc;
  if (layer === 'power_blocs' && bloc?.group_id && (bloc.source === 'configured' || bloc.source === 'inferred')) {const key = `bloc:${bloc.group_id}`, paint = palette.get(key); return {colour: paint?.fill || '#77879a', outlineColour: paint?.outline, key, strength: 1, name: bloc.name, source: bloc.source};}
  if (layer === 'standings') {const label = standingLabel(overlay); return {colour: PALETTE[label], key: label, strength: label === 'unknown' ? .25 : 1};}
  if (layer === 'security' && point.system.security_known === false) return {colour: '#718397', key: 'unknown', strength: .25};
  if (layer === 'security') return {colour: securityColour(point.system.security), key: point.system.security >= .45 ? 'high' : point.system.security > 0 ? 'low' : 'null', strength: .8};
  if (layer === 'activity') {
    const value = Number(overlay?.kills?.ship_kills || 0) + Number(overlay?.kills?.pod_kills || 0);
    return {colour: value > 20 ? '#ed7e87' : '#eaba79', key: 'activity', strength: value ? Math.min(1.5, .25 + Math.log1p(value) / 4) : 0};
  }
  const sov = overlay?.sovereignty;
  const id = sov?.alliance_id || sov?.faction_id || sov?.corporation_id;
  const key = id ? `${sov?.alliance_id ? 'a' : sov?.faction_id ? 'f' : 'c'}${id}` : 'unknown', paint = palette.get(key);
  return {colour: paint?.fill || '#77879a', outlineColour: paint?.outline, key, strength: id ? 1 : 0, name: sovereigntyName(sov), source: layer === 'power_blocs' && sov?.alliance_id ? bloc?.source || 'unassigned' : 'sovereignty'};
}

function activeLink(link: NonNullable<UniverseIntel['links']>[number]) {
  return link.enabled !== false && link.active !== false && !link.expired && (!link.expires_at || Date.parse(link.expires_at) > Date.now());
}

/** A stable discovery graph: only observed/pinned systems and explicit links enter J-space. */
function discoveryPoints(atlas: UniverseAtlas, intel: UniverseIntel | null, selectedSystemId: number | null = null, replay?: ReplayMapFrame | null, publicVisible = true): Point[] {
  const systems = new Map(atlas.systems.map(system => [system.system_id, system])), discovered = new Set<number>();
  if (replay) {
    for (const id of replay.discoveredSystemIds) if (systems.get(id)?.space === 'wormhole') discovered.add(id);
  }
  if (systems.get(selectedSystemId || 0)?.space === 'wormhole') discovered.add(selectedSystemId!);
  if (!replay) {
  for (const pin of intel?.pins || []) if (systems.get(Number(pin.system_id))?.space === 'wormhole') discovered.add(Number(pin.system_id));
  for (const id of intel?.discoveredSystemIds || []) if (systems.get(id)?.space === 'wormhole') discovered.add(id);
  if (intel?.location?.system_id && systems.get(intel.location.system_id)?.space === 'wormhole') discovered.add(intel.location.system_id);
  if (intel?.operations?.location?.system_id && systems.get(intel.operations.location.system_id)?.space === 'wormhole') discovered.add(intel.operations.location.system_id);
  }
  const edges = replay ? replay.allTravel.filter(link => systems.get(link.from_system_id)?.space === 'wormhole' || systems.get(link.to_system_id)?.space === 'wormhole') : [...(intel?.links || []).filter(link => link.kind === 'wormhole' && activeLink(link)), ...(publicVisible ? usablePublicConnections(intel?.feeds) : [])];
  if (!replay) {
  for (const link of intel?.links || []) if (link.kind === 'wormhole') {
    // Remember the discovered J-space endpoints after their connection expires.
    if (systems.get(link.from_system_id)?.space === 'wormhole') discovered.add(link.from_system_id);
    if (systems.get(link.to_system_id)?.space === 'wormhole') discovered.add(link.to_system_id);
  }
  }
  for (const edge of edges) {if (systems.has(edge.from_system_id)) discovered.add(edge.from_system_id); if (systems.has(edge.to_system_id)) discovered.add(edge.to_system_id);}
  const neighbours = new Map<number, number[]>();
  for (const edge of edges) if (discovered.has(edge.from_system_id) && discovered.has(edge.to_system_id)) {
    neighbours.set(edge.from_system_id, [...(neighbours.get(edge.from_system_id) || []), edge.to_system_id]);
    neighbours.set(edge.to_system_id, [...(neighbours.get(edge.to_system_id) || []), edge.from_system_id]);
  }
  const remaining = new Set([...discovered].sort((a, b) => a - b)), components: number[][] = [];
  for (const id of remaining) {
    const queue = [id], component: number[] = []; remaining.delete(id);
    for (let index = 0; index < queue.length; index++) {const current = queue[index]; component.push(current); for (const next of neighbours.get(current) || []) if (remaining.delete(next)) queue.push(next);}
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length || a[0] - b[0]);
  const result: Point[] = [], columns = Math.max(1, Math.ceil(Math.sqrt(components.length))), cell = 250;
  components.forEach((component, index) => {
    const centreX = (index % columns) * cell + cell / 2, centreY = Math.floor(index / columns) * cell + cell / 2;
    if (component.length === 1) {const system = systems.get(component[0]); if (system) result.push({system, x: centreX, y: centreY}); return;}
    const known = component.find(id => systems.get(id)?.space === 'known'), root = known || component[0];
    const rootSystem = systems.get(root); if (rootSystem) result.push({system: rootSystem, x: centreX, y: centreY});
    const others = component.filter(id => id !== root);
    others.forEach((id, i) => {const system = systems.get(id); if (!system) return; const angle = i * Math.PI * 2 / others.length - Math.PI / 2; const radius = 75 + Math.min(28, others.length * 1.2); result.push({system, x: centreX + Math.cos(angle) * radius, y: centreY + Math.sin(angle) * radius});});
  });
  return result;
}

/** World-space vector paths: flat fills and true bisector edges stay crisp at any zoom. */
function createTerritories(geometry: Geometry, styles: TerritoryStyle[]) {
  const groups = new Map<string, {style: TerritoryStyle; fill: Path2D; border: Path2D}>();
  for (const cell of geometry.cells) {
    const style = styles[cell.index]; if (!cell.polygon.length || !style.strength) continue;
    const key = `${style.key}:${style.dim ? 1 : 0}:${style.strength}`;
    let group = groups.get(key);
    if (!group) {group = {style, fill: new Path2D(), border: new Path2D()}; groups.set(key, group);}
    cell.polygon.forEach((vertex, i) => {
      if (i === 0) group!.fill.moveTo(vertex.x, vertex.y); else group!.fill.lineTo(vertex.x, vertex.y);
      const previous = cell.polygon[(i + cell.polygon.length - 1) % cell.polygon.length], neighbour = vertex.from >= 0 ? styles[vertex.from] : null;
      // Hidden neighbours retain their own cells. They cannot donate land to visible allies.
      if (!neighbour || neighbour.key !== style.key) {group!.border.moveTo(previous.x, previous.y); group!.border.lineTo(vertex.x, vertex.y);}
    });
    group.fill.closePath();
  }
  return {geometry, styles, groups: [...groups.values()], labels: territoryComponents(geometry, styles)};
}

export function UniverseMap({atlas, intel, selectedSystemId, onSelectSystem, background, indicator, routeSystemIds = EMPTY, routeEdges = EMPTY_EDGES, tactical = DEFAULT_TACTICAL, surfaceKey = 0, workspaceKey, showConnections = true, showSpecialLinks = true, focusedRegionId, space = 'known', standingFilter = 'all', replay = null, onReplayManualPan, territoryFocus = null, onInspectTerritory, onClearTerritoryFocus, onFrameTerritory, onRouteToSystem, onOpenNotebook}: MapProps) {
  const helpId = useId(), wrapper = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({x: 0, y: 0, scale: 1}), dimensions = useRef({width: 900, height: 570, dpr: 1});
  const pendingFrame = useRef<number | null>(null), paintRef = useRef<() => void>(() => {});
  const cameraFrame = useRef<number | null>(null), cameraTarget = useRef<View | null>(null);
  const cameraOwner = useRef<'user' | 'replay' | null>(null);
  const atmosphere = useRef<HTMLDivElement>(null), acquisition = useRef<HTMLDivElement>(null);
  const sceneAnimation = useRef<Animation | null>(null);
  const sizeInitialized = useRef(false);
  const surface = useCallback(() => wrapper.current?.ownerDocument || document, []);
  const frameWindow = useRef<Window | null>(null);
  const requestFrame = useCallback((callback: FrameRequestCallback) => {const owner = surface().defaultView || window; frameWindow.current = owner; return owner.requestAnimationFrame(callback);}, [surface]);
  const cancelFrame = useCallback((frame: number) => {(frameWindow.current || window).cancelAnimationFrame(frame);}, []);
  const [clock, setClock] = useState(() => Date.now());
  const [intelPulse, setIntelPulse] = useState<{id:string;systemIds:number[]}|null>(null), seenReports = useRef<Set<string> | null>(null), seenReportCharacter = useRef<number|null>(null);
  const intelPulseNodes = useRef(new Map<number, HTMLDivElement>());
  const markerClusters = useRef<MarkerCluster[]>([]), [hoveredCluster, setHoveredCluster] = useState<MarkerCluster|null>(null);

  const symbolHits = useRef<SymbolHit[]>([]), symbolContextElement = useRef<HTMLDivElement>(null);
  const [hoveredSymbol, setHoveredSymbol] = useState<SymbolHit | null>(null), hoveredSymbolRef = useRef<SymbolHit | null>(null);
  const hoveredPointer = useRef<{x:number;y:number}|null>(null);
  const [pinnedSymbol, setPinnedSymbol] = useState<SymbolHit | null>(null), pinnedSymbolRef = useRef<SymbolHit | null>(null);
  const [symbolNavigator, setSymbolNavigator] = useState(false), [symbolQuery, setSymbolQuery] = useState(''), [symbolChoices, setSymbolChoices] = useState<SymbolHit[]>([]);
  const [portalNetwork, setPortalNetwork] = useState<'thera' | 'turnur' | null>(null);
  const symbolLauncher = useRef<HTMLButtonElement>(null);

  const territory = useRef<ReturnType<typeof createTerritories> | null>(null);
  const geometryCache = useRef<{key: string; geometry: Geometry} | null>(null);
  const lastTerritoryKey = useRef('');
  const pointer = useRef<Drag | null>(null), activePointers = useRef(new Map<number, {x: number; y: number}>());
  const pinch = useRef<{camera: View; midpoint: {x: number; y: number}; distance: number} | null>(null);
  const pendingSystemFocus = useRef<number | null>(null);
  const overviewRect = useRef<SVGRectElement>(null), scaleBar = useRef<HTMLSpanElement>(null), scaleLabel = useRef<HTMLSpanElement>(null), scaleDescription = useRef<HTMLDivElement>(null);
  const hoveredTerritoryRef = useRef<TerritoryHit | null>(null), [hoveredTerritory, setHoveredTerritory] = useState<TerritoryHit | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const framedRequest = useRef('');
  const hoveredRef = useRef<number | null>(null), [hovered, setHovered] = useState<number | null>(null);
  const [labels, setLabels] = useState(true), [zoom, setZoom] = useState(1), [dragging, setDragging] = useState(false);
  const baseScale = useRef(1), overlays = useMemo(() => new Map((intel?.systems || []).map(value => [value.system_id, value])), [intel?.systems]);
  const mapLocation = intel?.operations?.location ?? (intel?.location ? {...intel.location, source:'esi', updated_at:intel.location.updatedAt, expires_at:(intel.location as any).expiresAt} : null);
  const locationReady = mapLocation?.status === 'ready' && (!mapLocation.expires_at || Date.parse(mapLocation.expires_at) > clock);
  const currentLocationId = locationReady ? mapLocation?.system_id : null;
  const territoryPalette = useMemo<ReadonlyMap<string, TerritoryColour>>(() => {
    if (intel?.politics?.territory_colours) return new Map(Object.entries(intel.politics.territory_colours as Record<string, TerritoryColour>));
    // One complete roster serves the whole view; changing filters or space never reallocates colour.
    const groups = new Map<string, TerritoryColourGroup>((intel?.politics?.groups || []).map((group: TerritoryColourGroup) => [group.id, group]));
    for (const overlay of intel?.systems || []) {const bloc = overlay.power_bloc; if (bloc?.group_id && !groups.has(bloc.group_id)) groups.set(bloc.group_id, {id: bloc.group_id, color: bloc.color, source: bloc.source, name: bloc.name});}
    return allocateTerritoryColours(territoryColourEntities((intel?.systems || []).flatMap(overlay => overlay.sovereignty ? [overlay.sovereignty] : []), [...groups.values()]));
  }, [intel?.politics?.territory_colours, intel?.politics?.groups, intel?.systems]);
  const layouts = useMemo(() => createAtlasLayouts(atlas.systems), [atlas.systems]);
  const graph = useMemo(() => buildGateGraph(atlas.gates), [atlas.gates]);
  const projection = space !== 'known' || replay && tactical.projection === 'radar' ? 'physical' : tactical.projection || 'physical';
  const tacticalCenter = tactical.centerSystemId || selectedSystemId || currentLocationId || layouts.firstSystemId;
  const localLayout = useMemo(() => projection === 'radar' ? tacticalLayout(atlas.systems, graph, {mode: 'radar', centerSystemId: tacticalCenter, hops: tactical.hops || 3}) : null, [atlas.systems, graph, projection, tacticalCenter, tactical.hops]);
  const allPoints = useMemo(() => space === 'known' ? localLayout?.points || layouts.get(projection === 'schematic' ? 'schematic' : 'physical') : discoveryPoints(atlas, intel, selectedSystemId, replay, tactical.feedsVisible !== false), [layouts, projection, localLayout, space, space === 'wormhole' ? intel : null, space === 'wormhole' ? selectedSystemId : null, space === 'wormhole' && !replay ? clock : null, space === 'wormhole' ? replay?.discoveredSystemIds : null, space === 'wormhole' ? replay?.allTravel : null, tactical.feedsVisible]);
  const geometryPoints = useMemo(() => allPoints.map(point => ({id: point.system.system_id, x: point.x, y: point.y})), [allPoints]);
  const geometryKey = useMemo(() => geometryRevision(geometryPoints), [geometryPoints]);
  const points = allPoints;
  const bounds = useMemo(() => {const matching = projection !== 'radar' && focusedRegionId ? allPoints.filter(point => point.system.region_id === focusedRegionId) : allPoints; return pointBounds(matching.length ? matching : allPoints);}, [allPoints, focusedRegionId, projection]);
  const boundsRef = useRef(bounds); boundsRef.current = bounds;
  const fittedScope = useRef({geometryKey, focusedRegionId});
  const territoryStyles = useMemo(() => allPoints.map(point => ({...layerStyle(point, overlays.get(point.system.system_id), background, territoryPalette), dim: !passesStanding(overlays.get(point.system.system_id), standingFilter) || Boolean(focusedRegionId && focusedRegionId !== point.system.region_id)})), [allPoints, overlays, background, standingFilter, focusedRegionId, territoryPalette]);
  const territoryKey = useMemo(() => `${geometryKey}#${background}#${paintRevision(territoryStyles)}`, [geometryKey, background, territoryStyles]);
  const byId = useMemo(() => new Map(points.map(point => [point.system.system_id, point])), [points]);
  const territorySummary = useMemo(() => {
    const result = new Map<string, TerritoryHit>();
    for (const style of territoryStyles) {if (!style.strength || !style.name) continue; const group = result.get(style.key); if (group) group.count++; else result.set(style.key, {key: style.key, name: style.name, colour: style.colour, source: style.source || 'sovereignty', count: 1});}
    return result;
  }, [territoryStyles]);
  const overview = useMemo(() => overviewTransform(bounds), [bounds]);
  const overviewPath = useMemo(() => points.filter(point => point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY).map(point => `M${(point.x * overview.scale + overview.x).toFixed(1)},${(point.y * overview.scale + overview.y).toFixed(1)}h.1`).join(''), [points, overview, bounds]);
  const overviewRoute = useMemo(() => routeSystemIds.slice(1).map((id, index) => {const a = byId.get(routeSystemIds[index]), b = byId.get(id); return a && b ? `M${a.x * overview.scale + overview.x},${a.y * overview.scale + overview.y}L${b.x * overview.scale + overview.x},${b.y * overview.scale + overview.y}` : '';}).join(''), [routeSystemIds, byId, overview]);
  const worldUnitsPerLightYear = layouts.worldUnitsPerLightYear;
  const regionPoints = useMemo(() => {
    const groups = new Map<number, {name: string; x: number; y: number; count: number}>();
    for (const point of points) {const id = point.system.region_id, group = groups.get(id) || {name: point.system.region_name, x: 0, y: 0, count: 0}; group.x += point.x; group.y += point.y; group.count++; groups.set(id, group);}
    return [...groups].map(([id, group]) => ({id, ...group, x: group.x / group.count, y: group.y / group.count}));
  }, [points]);
  const replayTrail = useMemo(() => new Set(replay?.trailSystemIds || EMPTY), [replay?.trailSystemIds]);
  const pins = useMemo(() => new Set<number>((replay ? [] : intel?.pins || []).map(pin => Number(pin.system_id)).filter(Number.isFinite)), [intel?.pins, Boolean(replay)]);
  const cynoPins = useMemo(() => new Set<number>((replay ? [] : intel?.pins || []).filter((pin:any)=>pin.event_kind==='cyno').map((pin:any)=>Number(pin.system_id))),[intel?.pins,Boolean(replay)]);
  const route = useMemo(() => new Set(routeSystemIds), [routeSystemIds]);
  const watchDistances = useMemo(() => routeWatchDistances(graph, routeSystemIds.length ? routeSystemIds : tacticalCenter ? [tacticalCenter] : [], 6), [graph, routeSystemIds, tacticalCenter]);
  const operational = useMemo(() => replay ? new Map<number, OperationalSystem>() : operationalSystems(intel?.operations, clock), [intel?.operations, clock, Boolean(replay)]);
  const feeds = useMemo(() => replay || tactical.feedsVisible === false ? new Map<number, FeedMarker[]>() : feedSystems(intel?.feeds, clock), [intel?.feeds, clock, tactical.feedsVisible, Boolean(replay)]);
  const mapFeeds = useMemo(() => new Map<number, FeedMarker[]>([...feeds].map(([id, markers]): [number, FeedMarker[]] => [id, tactical.pointsVisible ? markers.filter(marker => marker.kind !== 'wormhole') : markers.filter(marker => ['storm', 'campaign', 'combat'].includes(marker.kind))]).filter(([, markers]) => markers.length)), [feeds, tactical.pointsVisible]);
  const watchedThreats = useMemo(() => [...operational.values()].filter(value => watchDistances.has(value.systemId) && value.reports.some((report: any) => ['hostile', 'combat', 'decloak'].includes(report.kind))), [operational, watchDistances]);
  const verifiedReachability = matchingReachability(tactical.rangeOrigins, tactical.reachability) && !replay;
  const reach = useMemo(() => new Set(verifiedReachability ? tactical.reachability?.unionSystemIds || [] : []), [tactical.reachability, verifiedReachability]);
  const overlap = useMemo(() => new Set(verifiedReachability ? tactical.reachability?.overlapSystemIds || [] : []), [tactical.reachability, verifiedReachability]);
  const overlapHull = useMemo(() => projectedHull([...overlap].map(id => byId.get(id)).filter((point): point is Point => !!point)), [overlap, byId]);
  const portalNetworks = useMemo(() => replay || tactical.feedsVisible === false ? [] : buildPortalNetworks(intel?.feeds, atlas.systems, clock), [intel?.feeds, atlas.systems, clock, Boolean(replay), tactical.feedsVisible]);
  const portalEndpoints = useMemo(() => portalNetworks.flatMap(network => network.endpoints).filter(endpoint => byId.has(endpoint.systemId) && (!focusedRegionId || byId.get(endpoint.systemId)?.system.region_id === focusedRegionId)), [portalNetworks, byId, focusedRegionId]);
  const publicLinks = useMemo(() => replay ? [] : usablePublicConnections(intel?.feeds, clock), [intel?.feeds, clock, Boolean(replay)]);
  const feedIndicatorValues = useMemo(() => new Map<number, number>((indicator === 'npc_delta' ? intel?.feeds?.npc_deltas || [] : indicator === 'adm' ? intel?.feeds?.development || [] : []).filter((row: any) => Number.isFinite(indicator === 'adm' ? row.adm : row.delta)).map((row: any) => [row.system_id, indicator === 'adm' ? row.adm : row.delta])), [indicator, intel?.feeds]);
  const indicatorMax = useMemo(() => Math.max(1, ...points.map(point => Math.abs(feedIndicatorValues.get(point.system.system_id) ?? indicatorValue(overlays.get(point.system.system_id), indicator)))), [points, overlays, indicator, feedIndicatorValues]);

  const redraw = useCallback(() => {
    if (surface().hidden || pendingFrame.current !== null || cameraFrame.current !== null) return;
    pendingFrame.current = requestFrame(() => {pendingFrame.current = null; paintRef.current();});
  }, [surface, requestFrame]);
  useEffect(() => {setClock(Date.now());}, [intel?.operations, intel?.feeds, surfaceKey]);
  useEffect(() => {
    if (replay) return;
    const owner = surface(), now = Date.now();
    const reports = intel?.operations?.intel || [], pilots = intel?.operations?.pilots || [];
    const deadlines: number[] = [];
    for (const record of [...reports, ...pilots, ...(intel?.feeds?.connections || []), ...Object.values(intel?.feeds?.sources || {}) as any[], ...(intel?.operations?.location ? [intel.operations.location] : []), ...(intel?.operations?.fleet ? [intel.operations.fleet] : [])]) {
      const observed = Date.parse(record.observed_at || record.updated_at || '');
      for (const value of [observed + 30_000, observed + 150_000, Date.parse(record.expires_at || '')]) if (Number.isFinite(value) && value > now) deadlines.push(value);
    }
    // Age labels advance at most once a minute while relevant data is visible; there is no idle RAF.
    if (reports.some((record: any) => observationAge(record, now) !== 'expired') || pilots.length || (intel?.feeds?.connections || []).length) deadlines.push(Math.floor(now / 60_000) * 60_000 + 60_000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (deadlines.length && !owner.hidden) timer = setTimeout(() => setClock(Date.now()), Math.max(50, Math.min(...deadlines) - now + 10));
    const visible = () => {if (!owner.hidden) setClock(Date.now());}; owner.addEventListener('visibilitychange', visible);
    return () => {if (timer) clearTimeout(timer); owner.removeEventListener('visibilitychange', visible);};
  }, [intel?.operations, intel?.feeds, Boolean(replay), clock, surfaceKey, surface]);
  useEffect(() => {
    const reports = intel?.operations?.intel || [];
    const known = seenReportCharacter.current === intel?.character_id ? seenReports.current : null; seenReportCharacter.current = intel?.character_id || null; seenReports.current = new Set(reports.map((report: any) => String(report.id)));
    if (replay || intel?.operations?.config?.enabled === false || tactical.operationsVisible === false) {setIntelPulse(null); return;}
    if (!known || !motionAllowed(surface())) return;
    const recent = reports.filter((report: any) => !known.has(String(report.id)) && observationAge(report) === 'fresh');
    const systemIds = [...new Set<number>(recent.flatMap((report: any) => report.system_ids || []))].filter(id => byId.has(id)).slice(0, 8);
    if (!systemIds.length) return;
    setIntelPulse({id: recent.map((report: any) => report.id).join(':'), systemIds});
  }, [intel?.operations?.intel, Boolean(replay), tactical.operationsVisible, surface]);
  useEffect(() => {if (!intelPulse) return; const timer = setTimeout(() => setIntelPulse(null), 1600); return () => clearTimeout(timer);}, [intelPulse?.id]);
  const clearHover = useCallback(() => {hoveredRef.current = null; hoveredTerritoryRef.current = null; setHovered(null); setHoveredTerritory(null); setHoveredCluster(null); hoveredSymbolRef.current = null; hoveredPointer.current = null; setHoveredSymbol(null); redraw();}, [redraw]);
  useEffect(() => {clearHover();}, [territoryKey, clearHover]);
  const dismissContext = useCallback((restoreFocus = false) => {pinnedSymbolRef.current = null; setPinnedSymbol(null); hoveredSymbolRef.current = null; hoveredPointer.current = null; setHoveredSymbol(null); setSymbolNavigator(false); if (restoreFocus) canvas.current?.focus({preventScroll: true}); redraw();}, [redraw]);
  useEffect(() => {dismissContext(); setPortalNetwork(null);}, [Boolean(replay), tactical.feedsVisible, space, intel?.character_id, dismissContext]);
  useEffect(() => {
    const owner = surface();
    const dismiss = (event: KeyboardEvent) => {const target=event.target as HTMLElement|null; if(event.defaultPrevented || !target || !wrapper.current?.parentElement?.contains(target) || (target.closest('[role="dialog"]') && !target.closest('.universe-map-context'))) return; if (event.key === 'Escape' && (pinnedSymbolRef.current || hoveredSymbolRef.current || symbolNavigator || portalNetwork)) {event.preventDefault(); event.stopPropagation(); dismissContext(true); setPortalNetwork(null);}};
    owner.addEventListener('keydown', dismiss); return () => owner.removeEventListener('keydown', dismiss);
  }, [surface, surfaceKey, dismissContext, symbolNavigator, portalNetwork]);
  const updateZoom = useCallback(() => setZoom(view.current.scale / baseScale.current), []);
  const cancelCameraMotion = useCallback(() => {
    if (cameraFrame.current !== null) cancelFrame(cameraFrame.current);
    cameraFrame.current = null; cameraTarget.current = null; cameraOwner.current = null;
  }, [cancelFrame]);
  const animateCamera = useCallback((destination: View, duration = 480, owner: 'user' | 'replay' = 'user') => {
    cancelCameraMotion();
    const current = {...view.current}, target = clampCamera(destination, boundsRef.current, dimensions.current);
    // Controls reflect the requested scale immediately, so a quick opposite action stays available.
    setZoom(target.scale / baseScale.current);
    if (!duration || !motionAllowed(surface()) || Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.scale - current.scale) < .001) {
      view.current = target; redraw(); return;
    }
    if (pendingFrame.current !== null) {cancelFrame(pendingFrame.current); pendingFrame.current = null;}
    cameraTarget.current = target; cameraOwner.current = owner;
    const started = (surface().defaultView || window).performance.now();
    const advance = (now: number) => {
      if (surface().hidden) {view.current = target; cameraTarget.current = null; cameraFrame.current = null; cameraOwner.current = null; return;}
      const progress = Math.min(1, (now - started) / duration), eased = 1 - (1 - progress) ** 3;
      // Interpolating all three coordinates with one easing curve preserves the wheel anchor.
      view.current = {x: current.x + (target.x - current.x) * eased, y: current.y + (target.y - current.y) * eased, scale: current.scale + (target.scale - current.scale) * eased};
      paintRef.current();
      if (progress < 1) cameraFrame.current = requestFrame(advance);
      else {cameraFrame.current = null; cameraTarget.current = null; cameraOwner.current = null; updateZoom();}
    };
    cameraFrame.current = requestFrame(advance);
  }, [cancelCameraMotion, redraw, updateZoom, requestFrame, cancelFrame, surface]);
  const manualMovement = useCallback(() => {cancelCameraMotion(); clearHover(); updateZoom(); if (replay) onReplayManualPan?.();}, [cancelCameraMotion, clearHover, updateZoom, Boolean(replay), onReplayManualPan]);
  const fit = useCallback((smooth = false) => {
    const target = fitCamera(boundsRef.current, dimensions.current);
    baseScale.current = target.scale; animateCamera(target, smooth ? 650 : 0);
  }, [animateCamera]);
  const fitRef = useRef(fit); fitRef.current = fit;
  const constrainView = useCallback(() => {view.current = clampCamera(view.current, boundsRef.current, dimensions.current);}, []);
  const zoomAt = useCallback((factor: number, x = dimensions.current.width / 2, y = dimensions.current.height / 2, duration = 480) => {
    const next = anchoredWheelCamera(view.current, cameraTarget.current, factor, {x, y}, boundsRef.current, dimensions.current);
    manualMovement();
    animateCamera(next, duration);
  }, [animateCamera, manualMovement]);
  const focusSystem = useCallback((id: number | null | undefined, magnify = true) => {
    const point = id ? byId.get(id) : undefined; if (!point) return;
    const {width, height} = dimensions.current, scale = magnify ? Math.max(view.current.scale, Math.min(7, baseScale.current * 8)) : view.current.scale;
    animateCamera({x: width / 2 - point.x * scale, y: height / 2 - point.y * scale, scale}, 760);
  }, [byId, animateCamera]);
  const focusSystemRef = useRef(focusSystem); focusSystemRef.current = focusSystem;
  const requestSystemFocus = useCallback((id: number | null | undefined) => {
    const point = id ? byId.get(id) : null; if (!point) return;
    manualMovement();
    if (!replay && focusedRegionId && point.system.region_id !== focusedRegionId) {pendingSystemFocus.current = id!; onSelectSystem(id!); return;}
    focusSystem(id);
  }, [byId, manualMovement, Boolean(replay), focusedRegionId, onSelectSystem, focusSystem]);
  const frameSystems = useCallback((ids: number[]) => {
    const candidates = ids.map(id => byId.get(id)).filter((point): point is Point => !!point && (!focusedRegionId || point.system.region_id === focusedRegionId));
    if (!candidates.length) return;
    manualMovement(); animateCamera(fitCamera(pointBounds(candidates), dimensions.current), 720);
  }, [byId, focusedRegionId, manualMovement, animateCamera]);


  const portalSymbol = useCallback((endpoint: PortalEndpoint): MapSymbolContext => ({id: `portal:${endpoint.id}`, kind: 'portal', title: `${endpoint.source === 'thera' ? 'Thera' : 'Turnur'} connection`, description: endpoint.source === 'thera' ? 'This ring marks a reported entrance to Thera. All Thera entrances share the same wormhole hub.' : 'A reported wormhole entrance to Turnur. Its diamond distinguishes the network from Thera’s ring.', systemId: endpoint.systemId, systemName: endpoint.system.name, source: 'EVE-Scout', updatedAt: endpoint.observedAt, portalNetwork: endpoint.source, portal: endpoint}), []);
  // Resolve cards against live sources rather than retaining a snapshot from an old canvas frame.
  const resolveSymbol = useCallback((hit: SymbolHit): SymbolHit | null => {
    const value = hit.symbol, id = value.systemId || 0, point = byId.get(id), op = operational.get(id);
    const replace = (symbol: MapSymbolContext) => ({...hit, symbol});
    if (value.portal) {const endpoint = portalEndpoints.find(endpoint => `portal:${endpoint.id}` === value.id); return endpoint ? replace(portalSymbol(endpoint)) : null;}
    if (value.kind === 'portal-cluster') {
      const endpoints = portalEndpoints.filter(endpoint => value.entrances?.some(entrance => entrance.id === `portal:${endpoint.id}`));
      return endpoints.length ? replace({...value,title:`${endpoints.length} ${value.portalNetwork === 'thera' ? 'Thera' : 'Turnur'} connections`,entrances:endpoints.map(endpoint => ({id:`portal:${endpoint.id}`,systemId:endpoint.systemId,systemName:endpoint.system.name,label:endpoint.usable?'Fresh report':endpoint.state.replaceAll('_',' ')}))}) : null;
    }
    if (value.kind === 'cluster') {
      const ids = (hit.systemIds || []).filter(systemId => {const current=operational.get(systemId);return byId.has(systemId) && (tactical.operationsVisible!==false&&!!current?.reports.length || tactical.pilotsVisible!==false&&!!current&&(current.pilots.length+current.fleet.length)>0 || !!mapFeeds.get(systemId)?.length);});
      return ids.length ? {...replace({...value,title:`${ids.length} systems with context`,entrances:ids.map(systemId=>({id:`system:${systemId}`,systemId,systemName:byId.get(systemId)!.system.name}))}),systemIds:ids} : null;
    }
    if (!point) return null;
    if (value.kind === 'intel') {
      if (tactical.operationsVisible===false || !op?.reports.length) return null;
      const report=op.reports.find((row:any)=>['hostile','combat','decloak'].includes(row.kind)) || op.reports[0];
      return replace({...value,title:report.kind==='clear'?'Reported clear':['hostile','combat','decloak'].includes(report.kind)?'Reported threat':'Intel observation',description:`${report.raw || report.text || report.kind}. Reports are observations, not verified safety.`,source:report.source || 'Private intel',updatedAt:report.observed_at || report.created_at,details:[{label:'Freshness',value:report.age || 'unknown'},{label:'Reports',value:String(op.reports.length)}]});
    }
    if (value.kind === 'pilots') {
      const occupants = op ? [...op.pilots,...op.fleet] : [];
      if (tactical.pilotsVisible===false || !occupants.length) return null;
      return replace({...value,title:`${occupants.length} pilot${occupants.length===1?'':'s'} reported here`,description:`${occupants.map((pilot:any)=>pilot.name || `Pilot ${pilot.character_id}`).join(' · ')}. Observed positions can change between updates.`,updatedAt:occupants[0]?.updated_at,details:[{label:'Last known / offline',value:String(occupants.filter((pilot:any)=>pilot.stale || pilot.online===false).length)}]});
    }
    if (value.kind === 'notebook') return tactical.operationsVisible!==false && op && op.signatures.length+op.upgrades.length ? replace({...value,description:`${op.signatures.length} recorded signatures · ${op.upgrades.length} configured upgrades. Open the notebook to review or update these records.`}) : null;
    if (value.kind === 'connection') return showSpecialLinks && !replay && (intel?.links || []).some(link=>`link:${link.id || link.from_system_id+':'+link.to_system_id}`===value.id && activeLink(link)) ? hit : null;
    if (value.kind === 'route') return !replay && routeEdges.some(edge=>`route:${edge.from_system_id}:${edge.to_system_id}:${edge.kind}`===value.id) ? hit : null;
    if (value.kind === 'cyno') return cynoPins.has(id) ? hit : null;
    if (value.kind === 'range') {
      if(replay)return null;
      if(value.id.startsWith('range-origin:')){const origin=tactical.rangeOrigins?.find(origin=>origin.systemId===id);return origin?replace({...value,description:`${origin.rangeLy} light years of configured range. Dashed circles show projected outer limits, not guaranteed 3D reach.`}):null;}
      return verifiedReachability&&reach.has(id)?replace({...value,title:overlap.has(id)?'In every origin’s jump range':'In verified jump range'}):null;
    }
    if (value.kind === 'indicator') {const current=feedIndicatorValues.get(id) ?? indicatorValue(overlays.get(id),indicator);return indicator!=='none'&&current ? replace({...value,title:INDICATOR_LABELS[indicator],description:`${current.toLocaleString()}${indicator==='npc_delta'?' change between rolling one-hour snapshots, not new kills.':''}`}) : null;}
    if (value.kind === 'faction-warfare') {const fw=overlays.get(id)?.faction_warfare;return indicator==='fw' && fw?.operational_state_source==='derived_gate_adjacency' && fw.operational_state!=='unknown' ? replace({...value,title:FW_STATES[fw.operational_state] || 'Faction warfare state'}) : null;}
    if (value.id.startsWith('system-context:')) return pins.has(id)||replayTrail.has(id)||selectedSystemId===id ? replace({...value,title:pins.has(id)?'Pinned system':selectedSystemId===id?'Selected system':'Session trail',description:pins.has(id)?'Your saved map pin marks this system.':selectedSystemId===id?'This is the system selected in the inspector.':'This system appears in the recorded session trail up to this replay instant.'}) : null;
    if (value.kind === 'location') return id===(replay?replay.systemId:currentLocationId) ? replace({...value,title:replay?'Replay location':locationReady?'Your observed location':'Last known location',source:replay?'Session replay':mapLocation?.source==='chat_log'?'Local EVE log':'EVE ESI',updatedAt:mapLocation?.updated_at}) : null;
    if (['system','station'].includes(value.kind)) return hit;
    const marker = mapFeeds.get(id)?.find(marker=>marker.kind===value.kind);
    return marker ? replace({...value,title:marker.name,description:marker.detail,source:marker.source,updatedAt:marker.at,details:marker.stale?[{label:'Freshness',value:'Stale — retained for context'}]:undefined}) : null;
  }, [portalEndpoints,portalSymbol,byId,operational,mapFeeds,tactical,showSpecialLinks,Boolean(replay),replay?.systemId,intel?.links,routeEdges,cynoPins,verifiedReachability,reach,overlap,feedIndicatorValues,overlays,indicator,pins,replayTrail,selectedSystemId,currentLocationId,locationReady,mapLocation?.source,mapLocation?.updated_at]);
  useEffect(() => {
    const pinned=pinnedSymbolRef.current,hovered=hoveredSymbolRef.current;
    if(pinned){const fresh=resolveSymbol(pinned);pinnedSymbolRef.current=fresh;setPinnedSymbol(fresh);}
    if(hovered){const fresh=resolveSymbol(hovered);hoveredSymbolRef.current=fresh;setHoveredSymbol(fresh);}
    setSymbolChoices(previous=>previous.map(resolveSymbol).filter((hit):hit is SymbolHit=>!!hit));
  }, [resolveSymbol]);
  const pinSymbol = useCallback((hit: SymbolHit) => {const fresh=resolveSymbol(hit);setSymbolNavigator(false);hoveredSymbolRef.current=null;hoveredPointer.current=null;setHoveredSymbol(null);pinnedSymbolRef.current=fresh;setPinnedSymbol(fresh);redraw();}, [redraw,resolveSymbol]);
  const exploreNetwork = useCallback((source: 'thera' | 'turnur') => {
    const network = portalNetworks.find(value => value.source === source); if (!network) return;
    const selecting = portalNetwork !== source; setPortalNetwork(selecting ? source : null); dismissContext();
    if (selecting) frameSystems(network.endpoints.map(endpoint => endpoint.systemId));
  }, [portalNetworks, portalNetwork, dismissContext, frameSystems]);
  const openSymbols = useCallback(() => {setSymbolChoices([...symbolHits.current].sort((a, b) => b.priority - a.priority || a.symbol.title.localeCompare(b.symbol.title))); setSymbolNavigator(value => !value); setSymbolQuery('');}, []);

  useEffect(() => {
    const element = wrapper.current; if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect(), prior = dimensions.current;
      dimensions.current = {width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: Math.min(2, element.ownerDocument.defaultView?.devicePixelRatio || 1)};
      if (canvas.current) {canvas.current.width = Math.round(dimensions.current.width * dimensions.current.dpr); canvas.current.height = Math.round(dimensions.current.height * dimensions.current.dpr);}
      if (!sizeInitialized.current) {sizeInitialized.current = true; fitRef.current();}
      else {cancelCameraMotion(); view.current = resizeCamera(view.current, prior, dimensions.current, boundsRef.current); baseScale.current = fitCamera(boundsRef.current, dimensions.current).scale; updateZoom(); redraw();}
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, [redraw, cancelCameraMotion, updateZoom]);
  useEffect(() => {
    const regionChanged = fittedScope.current.geometryKey === geometryKey && fittedScope.current.focusedRegionId !== focusedRegionId;
    fittedScope.current = {geometryKey, focusedRegionId};
    cancelCameraMotion(); fitRef.current(regionChanged && !replay);
  }, [geometryKey, focusedRegionId, cancelCameraMotion]);
  const cameraMemoryKey = workspaceKey ? `kairo-map-camera:${workspaceKey}:${projection}:${focusedRegionId || 'all'}` : '';
  useEffect(() => {
    if (!cameraMemoryKey || replay || !sizeInitialized.current) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(cameraMemoryKey) || 'null');
      if (saved && [saved.cx,saved.cy,saved.zoom].every(Number.isFinite) && saved.zoom >= 1 && saved.zoom <= 75) {
        const scale=fitCamera(boundsRef.current,dimensions.current).scale*saved.zoom;
        animateCamera({x:dimensions.current.width/2-saved.cx*scale,y:dimensions.current.height/2-saved.cy*scale,scale},0);
      } else fitRef.current(false);
    } catch {}
    return () => {
      const camera=cameraTarget.current || view.current;
      try {sessionStorage.setItem(cameraMemoryKey,JSON.stringify({cx:(dimensions.current.width/2-camera.x)/camera.scale,cy:(dimensions.current.height/2-camera.y)/camera.scale,zoom:camera.scale/baseScale.current}));} catch {}
    };
  }, [cameraMemoryKey,geometryKey,Boolean(replay),animateCamera]);
  useEffect(() => {
    if (space !== 'known' || projection === 'radar' || background === 'none' || replay && background !== 'sovereignty') {territory.current = null; lastTerritoryKey.current = ''; redraw(); return;}
    if (lastTerritoryKey.current === territoryKey) return;
    // Keep the last complete generation visible while preparing the replacement.
    // Ownership cells survive layer/filter/standing changes and unrelated ESI refreshes.
    let cancelled = false, worker: Worker | null = null;
    const publish = (geometry: Geometry) => {
      if (cancelled) return;
      geometryCache.current = {key: geometryKey, geometry};
      territory.current = createTerritories(geometry, territoryStyles);
      lastTerritoryKey.current = territoryKey; redraw();
    };
    const timer = window.setTimeout(() => {
      if (geometryCache.current?.key === geometryKey) {publish(geometryCache.current.geometry); return;}
      if (typeof Worker === 'undefined') {publish(createTerritoryGeometry(geometryPoints)); return;}
      try {worker = new Worker(new URL('./universe-map-worker.mjs', import.meta.url), {type: 'module'});}
      catch {publish(createTerritoryGeometry(geometryPoints)); return;}
      worker.onmessage = ({data}: MessageEvent<{geometry?: Geometry; error?: string}>) => {
        if (data.geometry) publish(data.geometry);
        else publish(createTerritoryGeometry(geometryPoints));
        worker?.terminate();
      };
      worker.onerror = () => {worker?.terminate(); if (!cancelled) publish(createTerritoryGeometry(geometryPoints));};
      worker.postMessage({points: geometryPoints});
    }, 0);
    return () => {cancelled = true; window.clearTimeout(timer); worker?.terminate();};
  }, [territoryKey, geometryKey, space, projection, background, Boolean(replay), redraw]);
  useEffect(() => {
    if (pendingSystemFocus.current && !replay) {const id = pendingSystemFocus.current, point = byId.get(id); if (point && (!focusedRegionId || point.system.region_id === focusedRegionId)) {pendingSystemFocus.current = null; focusSystemRef.current(id); return;}}
    if (!selectedSystemId || replay) return;
    const point = byId.get(selectedSystemId); if (!point) return;
    const x = point.x * view.current.scale + view.current.x, y = point.y * view.current.scale + view.current.y;
    if (x < 35 || y < 35 || x > dimensions.current.width - 35 || y > dimensions.current.height - 35) focusSystemRef.current(selectedSystemId, false);
    redraw();
  }, [selectedSystemId, geometryKey, redraw, focusedRegionId, Boolean(replay)]);
  useEffect(() => {
    if (!replay) return;
    if (!replay.follow || !replay.systemId) {if (cameraOwner.current === 'replay') cancelCameraMotion(); return;}
    const point = byId.get(replay.systemId); if (!point) return;
    const {width, height} = dimensions.current, scale = Math.max(view.current.scale, Math.min(3.5, baseScale.current * 7));
    animateCamera({x: width / 2 - point.x * scale, y: height / 2 - point.y * scale, scale}, replay.smooth ? 700 : 0, 'replay');
    return () => {if (cameraOwner.current === 'replay') cancelCameraMotion();};
  }, [replay?.focusKey, replay?.follow, geometryKey, cancelCameraMotion, animateCamera]);
  useEffect(() => {
    const request = `${territoryFocus?.key || ''}:${territoryFocus?.requestId || 0}`;
    if (replay || !territoryFocus?.requestId) {framedRequest.current = request; return;}
    if (request === framedRequest.current) return;
    framedRequest.current = request; frameSystems(territoryFocus.systemIds);
  }, [territoryFocus?.key, territoryFocus?.requestId, frameSystems, Boolean(replay)]);
  useEffect(() => {
    const element = canvas.current;
    sceneAnimation.current?.cancel();
    if (element && motionAllowed(surface())) sceneAnimation.current = element.animate([{opacity: .3}, {opacity: 1}], {duration: 440, easing: 'cubic-bezier(.2,.7,.2,1)'});
    return () => {sceneAnimation.current?.cancel(); sceneAnimation.current = null;};
  }, [background, space, projection, surface]);
  useEffect(() => {
    const owner = surface(), preference = (owner.defaultView || window).matchMedia('(prefers-reduced-motion: reduce)');
    const stopMotion = () => {
      const target = cameraTarget.current;
      cancelCameraMotion(); if (target) view.current = target;
      if (pendingFrame.current !== null) {cancelFrame(pendingFrame.current); pendingFrame.current = null;}
      sceneAnimation.current?.cancel();
      wrapper.current?.getAnimations({subtree: true}).forEach(animation => animation.cancel());
      pointer.current = null; activePointers.current.clear(); pinch.current = null; setDragging(false);
      setIntelPulse(null);
      updateZoom();
    };
    const visibility = () => {if (owner.hidden) stopMotion(); else redraw();};
    const reduced = () => {if (preference.matches) {stopMotion(); redraw();}};
    owner.addEventListener('visibilitychange', visibility); preference.addEventListener('change', reduced); redraw();
    return () => {owner.removeEventListener('visibilitychange', visibility); preference.removeEventListener('change', reduced); cancelCameraMotion(); if (pendingFrame.current !== null) {cancelFrame(pendingFrame.current); pendingFrame.current = null;} sceneAnimation.current?.cancel();};
  }, [cancelCameraMotion, redraw, updateZoom, cancelFrame, surface, surfaceKey]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const wheel = (event: WheelEvent) => {event.preventDefault(); const rect = element.getBoundingClientRect(); zoomAt(wheelZoomFactor(event.deltaY, event.deltaMode, dimensions.current.height), event.clientX - rect.left, event.clientY - rect.top, 260);};
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  useEffect(() => () => {if (pendingFrame.current !== null) cancelFrame(pendingFrame.current); cancelCameraMotion();}, [cancelCameraMotion, cancelFrame]);

  paintRef.current = () => {
    if (surface().hidden) return;
    const context = canvas.current?.getContext('2d'); if (!context) return;
    const {width, height, dpr} = dimensions.current, camera = view.current;
    const screen = (point: Point) => ({x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y});
    const hits: SymbolHit[] = [];
    const register = (symbol: MapSymbolContext, x: number, y: number, radius = 11, priority = 1, segment?: {x: number; y: number}, systemIds?: number[]) => {
      if (segment ? Math.max(x, segment.x) < 0 || Math.min(x, segment.x) > width || Math.max(y, segment.y) < 0 || Math.min(y, segment.y) > height : x < -radius || y < -radius || x > width + radius || y > height + radius) return;
      hits.push({symbol, x, y, radius, priority, segment, systemIds});
    };
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height); context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    const paintLabel = (text: string, x: number, y: number, fontSize: number, colour: string, opacity = 1, bounds?: LabelRect) => {
      const alpha = labelEdgeOpacity(bounds || mapLabelBounds(x, y, context.measureText(text), fontSize), {width, height}) * opacity;
      if (alpha <= 0) return false;
      context.save(); context.globalAlpha = alpha;
      // Text uses a small screen-space round outline. Never inherit a path's miter or dash state.
      context.lineJoin = 'round'; context.lineCap = 'round'; context.miterLimit = 1.5;
      context.lineWidth = 2.5; context.setLineDash([]); context.shadowBlur = 0;
      context.strokeStyle = '#07111bde'; context.strokeText(text, x, y);
      context.fillStyle = colour; context.fillText(text, x, y); context.restore();
      return true;
    };
    const frame = overviewViewport(camera, dimensions.current, overview);
    if (overviewRect.current) for (const [key, value] of Object.entries(frame)) overviewRect.current.setAttribute(key, value.toFixed(2));
    if (space === 'known' && projection === 'physical') {
      const scale = projectedDistanceScale(camera.scale, worldUnitsPerLightYear);
      if (scale) {if (scaleBar.current) scaleBar.current.style.width = `${scale.width}px`; if (scaleLabel.current) scaleLabel.current.textContent = scale.label; scaleDescription.current?.setAttribute('aria-label', `Projected distance: ${scale.label}. This is not a 3-D jump range.`);}
    }
    // Atmospheric depth is static at rest and composited separately from the crisp data canvas.
    if (atmosphere.current) atmosphere.current.style.transform = `translate3d(${Math.max(-24, Math.min(24, camera.x * .012))}px, ${Math.max(-18, Math.min(18, camera.y * .012))}px, 0)`;
    const acquiredPoint = byId.get((replay ? replay.systemId : selectedSystemId) || 0);
    if (acquisition.current) {
      const p = acquiredPoint ? screen(acquiredPoint) : null;
      acquisition.current.style.visibility = p && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height ? 'visible' : 'hidden';
      if (p) acquisition.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    }
    for (const [systemId, element] of intelPulseNodes.current) {const point = byId.get(systemId), p = point ? screen(point) : null; element.style.visibility = p && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height ? 'visible' : 'hidden'; if (p) element.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;}
    const field = (!replay || background === 'sovereignty') && space === 'known' && projection !== 'radar' && background !== 'none' ? territory.current : null;
    if (projection === 'radar' && localLayout) {
      const origin = byId.get(tacticalCenter || 0), bands = new Map<number, number>();
      if (origin) {
        const p = screen(origin);
        for (const point of points) {const distance = localLayout.distances.get(point.system.system_id)?.distance; if (distance) bands.set(distance, Math.hypot(point.x - origin.x, point.y - origin.y));}
        context.strokeStyle = '#47708a48'; context.fillStyle = '#a8c8da'; context.lineWidth = 1; context.font = '14px "Cascadia Code", Consolas, monospace'; context.setLineDash([3, 7]);
        for (const [distance, radius] of bands) {context.beginPath(); context.arc(p.x, p.y, radius * camera.scale, 0, Math.PI * 2); context.stroke(); const y = p.y - radius * camera.scale - 7; paintLabel(`${distance} ${distance === 1 ? 'gate' : 'gates'}`, p.x + 8, y, 14, '#a8c8da');}
        context.setLineDash([]);
      }
    }
    if (field) {
      context.save(); context.translate(camera.x, camera.y); context.scale(camera.scale, camera.scale);
      for (const {style, fill, border} of field.groups) {
        context.fillStyle = style.colour; context.globalAlpha = (style.dim ? .025 : .14) * style.strength; context.fill(fill);
        context.strokeStyle = style.outlineColour || style.colour; context.globalAlpha = style.dim ? .07 : .57;
        context.lineWidth = .85 / camera.scale; context.lineJoin = 'round';
        context.setLineDash(style.source === 'inferred' ? [5 / camera.scale, 4 / camera.scale] : []); context.stroke(border);
      }
      const hoverKey = hoveredTerritoryRef.current?.key, selectedKey = territoryFocus?.key;
      for (const {style, border} of field.groups) if (style.key === selectedKey || style.key === hoverKey) {
        context.strokeStyle = style.outlineColour || style.colour; context.globalAlpha = .98;
        context.lineWidth = (style.key === selectedKey ? 2.2 : 1.6) / camera.scale;
        context.setLineDash(style.source === 'inferred' ? [6 / camera.scale, 4 / camera.scale] : []); context.stroke(border);
      }
      context.restore();
    }
    const visible = points.filter(point => {const p = screen(point); return p.x > -35 && p.x < width + 35 && p.y > -35 && p.y < height + 35;});
    if (showConnections && space === 'known') {
      context.strokeStyle = camera.scale > 2 ? '#8391a539' : '#8391a521'; context.lineWidth = .65; context.beginPath();
      for (const gate of atlas.gates) {const from = byId.get(gate.from_system_id), to = byId.get(gate.to_system_id); if (!from || !to) continue; const a = screen(from), b = screen(to); if ((a.x < 0 && b.x < 0) || (a.y < 0 && b.y < 0) || (a.x > width && b.x > width) || (a.y > height && b.y > height)) continue; context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();
      const hover = byId.get(hoveredRef.current || 0);
      if (hover) for (const next of graph.get(hover.system.system_id) || []) {
        const target = byId.get(next); if (!target) continue; const a = screen(hover), b = screen(target);
        context.strokeStyle = hover.system.region_id !== target.system.region_id ? '#e6bf83' : hover.system.constellation_id !== target.system.constellation_id ? '#94bfea' : '#8bd8cd'; context.lineWidth = 1.7; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
      }
    }
    if (showSpecialLinks && !replay) for (const link of intel?.links || []) {
      if (!activeLink(link) || (space === 'wormhole' && link.kind !== 'wormhole')) continue;
      const from = byId.get(link.from_system_id), to = byId.get(link.to_system_id); if (!from || !to) continue;
      const a = screen(from), b = screen(to);
      register({id:`link:${link.id || link.from_system_id + ':' + link.to_system_id}`,kind:'connection',title:link.kind === 'wormhole' ? 'Private wormhole connection' : 'Ansiblex connection',description:`${from.system.name} → ${to.system.name}. ${link.kind === 'wormhole' ? 'A user-recorded temporary connection; confirm its condition before travel.' : 'A configured jump bridge; availability and access can change.'}`,source:'Your connection list',systemId:from.system.system_id,systemName:from.system.name,details:link.expires_at ? [{label:'Expires',value:link.expires_at}] : undefined},a.x,a.y,7,2,b);
      context.strokeStyle = link.kind === 'wormhole' ? '#c1a0ebad' : '#80dddead'; context.setLineDash(link.kind === 'wormhole' ? [3, 5] : [7, 4]); context.lineWidth = 1.35; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    if (showSpecialLinks && tactical.feedsVisible !== false && !replay && (space === 'wormhole' || portalNetwork === 'turnur')) for (const link of publicLinks) {
      const from = byId.get(link.from_system_id), to = byId.get(link.to_system_id); if (!from || !to) continue;
      const a = screen(from), b = screen(to); context.strokeStyle = '#bca2de95'; context.lineWidth = 1.25; context.setLineDash([2, 5]); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    context.setLineDash([]);
    if (!replay) for (const pin of intel?.pins || []) {
      if (!pin.to_system_id) continue; const from = byId.get(Number(pin.system_id)), to = byId.get(Number(pin.to_system_id)); if (!from || !to) continue;
      const a = screen(from), b = screen(to); context.strokeStyle = /^#[0-9a-f]{6}$/i.test(pin.color || '') ? pin.color : '#b99cdf'; context.lineWidth = Math.max(1, Math.min(8, Number(pin.line_width) || 1.5)); context.setLineDash(pin.line_style === 'dotted' ? [2, 5] : pin.line_style === 'dashed' ? [7, 5] : []); context.beginPath(); context.moveTo(a.x, a.y);
      if (pin.line_curve === 'arc') {const dx = b.x - a.x, dy = b.y - a.y, length = Math.max(1, Math.hypot(dx, dy)), offset = Math.min(65, length * .18); context.quadraticCurveTo((a.x + b.x) / 2 - dy / length * offset, (a.y + b.y) / 2 + dx / length * offset, b.x, b.y);} else context.lineTo(b.x, b.y);
      context.stroke(); context.setLineDash([]);
    }
    if (replay) {
      context.strokeStyle = '#e1bb87a3'; context.lineWidth = 1.6; context.setLineDash([3, 5]); context.beginPath();
      for (const edge of replay.travel) {const from = byId.get(edge.from_system_id), to = byId.get(edge.to_system_id); if (!from || !to) continue; const a = screen(from), b = screen(to); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke(); context.setLineDash([]);
      for (const id of replay.eventSystemIds) {const point = byId.get(id); if (!point) continue; const p = screen(point); context.strokeStyle = '#e6a6cb'; context.lineWidth = 1.2; context.strokeRect(p.x - 12, p.y - 12, 24, 24);}
    }
    if (!replay && routeEdges.length) {
      for (const edge of routeEdges) {
        const from = byId.get(edge.from_system_id), to = byId.get(edge.to_system_id); if (!from || !to) continue;
        const a = screen(from), b = screen(to), kind = edge.kind;
        register({id:`route:${edge.from_system_id}:${edge.to_system_id}:${kind}`,kind:'route',title:kind === 'jump' ? 'Jump-drive route leg' : kind === 'ansiblex' ? 'Ansiblex route leg' : kind === 'wormhole' ? 'Wormhole route leg' : 'Stargate route leg',description:`Planned travel: ${from.system.name} → ${to.system.name}. The arrow indicates direction.`,source:'Your route plan',systemId:to.system.system_id,systemName:to.system.name},a.x,a.y,7,3,b);
        context.strokeStyle = kind === 'jump' ? '#f1c282' : kind === 'ansiblex' ? '#78dce6' : kind === 'wormhole' ? '#c8a6f2' : '#a4f1d4';
        context.lineWidth = 2.1; context.setLineDash(kind === 'jump' ? [9, 5] : kind === 'ansiblex' ? [7, 3] : kind === 'wormhole' ? [2, 5] : []);
        context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length > 42) {const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2; context.setLineDash([]); context.beginPath(); context.moveTo(x - ux * 6 - uy * 4, y - uy * 6 + ux * 4); context.lineTo(x, y); context.lineTo(x - ux * 6 + uy * 4, y - uy * 6 - ux * 4); context.stroke();}
      }
      context.setLineDash([]);
    } else if (routeSystemIds.length > 1) {
      context.strokeStyle = '#a4f1d4'; context.lineWidth = 2; context.beginPath();
      for (let i = 1; i < routeSystemIds.length; i++) {const from = byId.get(routeSystemIds[i - 1]), to = byId.get(routeSystemIds[i]); if (!from || !to) continue; const a = screen(from), b = screen(to); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();
    }
    if (!replay && tactical.operationsVisible !== false && tactical.routeWatch !== false) {
      const inspected = new Set([selectedSystemId, hoveredRef.current, ...(intelPulse?.systemIds || [])]);
      for (const systemId of inspected) {
        if (!systemId || !operational.get(systemId)?.reports.some((report: any) => ['hostile', 'combat', 'decloak'].includes(report.kind))) continue;
        let current: number|null = systemId, steps = 0; context.strokeStyle = '#edac9b'; context.lineWidth = 1.65; context.setLineDash([3, 4]); context.beginPath();
        while (current && steps++ < 6) {const next: number|null|undefined = watchDistances.get(current)?.nextSystemId; if (!next) break; const from = byId.get(current), to = byId.get(next); if (from && to) {const a = screen(from), b = screen(to); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} current = next;}
        context.stroke(); context.setLineDash([]);
      }
    }
    if (!replay && indicator === 'fw') {
      const marked = new Set<string>();
      for (const point of visible) {
        const fw = overlays.get(point.system.system_id)?.faction_warfare;
        if (!fw || fw.operational_state_source !== 'derived_gate_adjacency' || fw.operational_state === 'unknown') continue;
        const p = screen(point), faction = Number(fw.occupier_faction_id ?? fw.occupier_id), colour = FACTION_TERRITORY_COLOURS[faction]?.fill || '#c3d0df';
        context.strokeStyle = colour; context.lineWidth = fw.operational_state === 'frontline' ? 2 : 1.2; context.setLineDash([]); context.beginPath();
        if (fw.operational_state === 'frontline') {context.moveTo(p.x, p.y - 10); context.lineTo(p.x + 10, p.y); context.lineTo(p.x, p.y + 10); context.lineTo(p.x - 10, p.y); context.closePath();}
        else if (fw.operational_state === 'command_operations') context.rect(p.x - 7, p.y - 7, 14, 14);
        else {context.moveTo(p.x - 6, p.y + 7); context.lineTo(p.x, p.y + 11); context.lineTo(p.x + 6, p.y + 7);}
        context.stroke();
        register({id:`fw:${point.system.system_id}`,kind:'faction-warfare',title:FW_STATES[fw.operational_state] || 'Faction warfare state',description:'Derived from fresh occupancy and neighbouring stargates. Diamonds mark frontlines, squares command operations, chevrons rearguards.',systemId:point.system.system_id,systemName:point.system.name,source:'EVE ESI · derived gate adjacency'},p.x,p.y,13,5);
        if (fw.operational_state !== 'frontline') continue;
        for (const neighborId of fw.frontline_neighbors || []) {
          const target = byId.get(Number(neighborId)), other = overlays.get(Number(neighborId))?.faction_warfare;
          const key = [point.system.system_id, Number(neighborId)].sort((a,b)=>a-b).join(':');
          if (!target || marked.has(key) || other?.operational_state !== 'frontline' || other?.operational_state_source !== 'derived_gate_adjacency') continue;
          const otherFaction = Number(other.occupier_faction_id ?? other.occupier_id); if (otherFaction === faction) continue; marked.add(key);
          const b = screen(target), x = (p.x + b.x) / 2, y = (p.y + b.y) / 2, length = Math.max(1, Math.hypot(b.x - p.x, b.y - p.y)), ux = (b.x - p.x) / length, uy = (b.y - p.y) / length;
          context.lineWidth = 1.8; context.strokeStyle = colour; context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(x, y); context.stroke(); context.strokeStyle = FACTION_TERRITORY_COLOURS[otherFaction]?.fill || '#c3d0df'; context.beginPath(); context.moveTo(x, y); context.lineTo(b.x, b.y); context.stroke();
          context.strokeStyle = '#dbe5ec'; context.lineWidth = 1.5; context.beginPath(); context.moveTo(x - uy * 5, y + ux * 5); context.lineTo(x + uy * 5, y - ux * 5); context.stroke();
        }
      }
    }
    if (!replay && tactical.rangeOrigins?.length) {
      if (projection === 'physical' && space === 'known') for (const origin of tactical.rangeOrigins) {
        const point = byId.get(origin.systemId); if (!point || !Number.isFinite(origin.rangeLy) || origin.rangeLy <= 0) continue; const p = screen(point), radius = origin.rangeLy * worldUnitsPerLightYear * camera.scale;
        context.strokeStyle = '#d2b2f178'; context.lineWidth = 1; context.setLineDash([8, 7]); context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.stroke();
      }
      if (overlapHull.length >= 3) {
        context.strokeStyle = '#efd493'; context.lineWidth = 1.6; context.setLineDash([4, 5]); context.beginPath();
        overlapHull.forEach((point, i) => {const p = screen(point); if (i) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y);}); context.closePath(); context.stroke();
      }
      context.setLineDash([]);
      for (const point of visible) if (reach.has(point.system.system_id)) {const p = screen(point); context.strokeStyle = overlap.has(point.system.system_id) ? '#f2d48c' : '#c9a9ef'; context.lineWidth = overlap.has(point.system.system_id) ? 1.8 : 1.1; context.strokeRect(p.x - 6, p.y - 6, 12, 12);register({id:`reach:${point.system.system_id}`,kind:'range',title:overlap.has(point.system.system_id)?'In every origin’s jump range':'In verified jump range',description:'This square marks an eligible system from the 3D range calculation. Cyno availability, access and safety remain unverified.',systemId:point.system.system_id,systemName:point.system.name,source:'Your capital range calculation'},p.x,p.y,9,4);}
      for (const origin of tactical.rangeOrigins) {const point = byId.get(origin.systemId); if (!point) continue; const p = screen(point); context.strokeStyle = '#dfc6fc'; context.lineWidth = 2; context.beginPath(); context.moveTo(p.x - 11, p.y - 7); context.lineTo(p.x - 11, p.y + 7); context.moveTo(p.x + 11, p.y - 7); context.lineTo(p.x + 11, p.y + 7); context.stroke();register({id:`range-origin:${origin.systemId}`,kind:'range',title:'Jump-range origin',description:`${origin.rangeLy} light years of configured range. Dashed circles show projected outer limits, not guaranteed 3D reach.`,systemId:origin.systemId,systemName:point.system.name,source:'Your capital range origins'},p.x,p.y,14,6);}
    }
    const clustered = new Set<number>(); markerClusters.current = [];
    if (!replay && projection !== 'radar' && camera.scale / baseScale.current < 4) {
      const bins = new Map<string, MarkerCluster>();
      for (const point of visible) {
        const systemId = point.system.system_id, op = operational.get(systemId), relevant = tactical.operationsVisible !== false && op?.reports.length || tactical.pilotsVisible !== false && op && op.pilots.length + op.fleet.length || mapFeeds.get(systemId)?.length;
        if (!relevant || systemId === selectedSystemId || systemId === hoveredRef.current || systemId === currentLocationId) continue;
        const p = screen(point), key = `${Math.floor(p.x / 56)}:${Math.floor(p.y / 48)}`, bucket = bins.get(key) || {key, x:0, y:0, systemIds:[]}; bucket.x += p.x; bucket.y += p.y; bucket.systemIds.push(systemId); bins.set(key, bucket);
      }
      for (const bucket of bins.values()) if (bucket.systemIds.length >= 3) {bucket.x /= bucket.systemIds.length; bucket.y /= bucket.systemIds.length; bucket.systemIds.forEach(id => clustered.add(id)); markerClusters.current.push(bucket);}
    }
    if (!replay) for (const point of visible) {
      const systemId = point.system.system_id, p = screen(point), op = operational.get(systemId), contextMarkers = mapFeeds.get(systemId) || [];
      if (clustered.has(systemId)) continue;
      if (tactical.operationsVisible !== false && op?.reports.length) {
        const report = op.reports.find((value: any) => ['hostile', 'combat', 'decloak'].includes(value.kind)) || op.reports[0];
        const clear = report.kind === 'clear', danger = ['hostile', 'combat', 'decloak'].includes(report.kind), stale = report.age === 'older' || report.age === 'unknown';
        context.strokeStyle = stale ? '#9cabbb' : clear ? '#86d8b7' : danger ? '#f59691' : '#ebcf94'; context.lineWidth = report.age === 'fresh' ? 2 : 1.25; context.setLineDash(stale ? [3, 3] : []);
        context.beginPath();
        if (clear) {context.moveTo(p.x - 10, p.y + 4); context.lineTo(p.x - 5, p.y + 9); context.lineTo(p.x + 8, p.y - 8);}
        else {context.moveTo(p.x, p.y - 13); context.lineTo(p.x + 12, p.y + 9); context.lineTo(p.x - 12, p.y + 9); context.closePath();}
        context.stroke(); context.setLineDash([]);
        register({id:`intel:${systemId}`,kind:'intel',title:clear ? 'Reported clear' : danger ? 'Reported threat' : 'Intel observation',description:`${report.raw || report.text || report.kind}. Reports are observations, not verified safety.`,systemId,systemName:point.system.name,source:report.source || 'Private intel',updatedAt:report.observed_at || report.created_at,details:[{label:'Freshness',value:report.age || 'unknown'},{label:'Reports',value:String(op.reports.length)}]},p.x,p.y,14,6);
      }
      if (tactical.pilotsVisible !== false && op && op.pilots.length + op.fleet.length > 0) {
        const occupants = [...op.pilots, ...op.fleet], stale = occupants.every((pilot: any) => pilot.stale || pilot.online === false), text = `${occupants.length}${stale ? '?' : ''}`;
        context.font = '600 14px "Cascadia Code", Consolas, monospace'; const size = Math.max(21, context.measureText(text).width + 10);
        context.save(); context.globalAlpha = labelEdgeOpacity({left:p.x+9.5,top:p.y+5.5,right:p.x+size+10.5,bottom:p.y+27.5},{width,height});
        context.fillStyle = '#102b38'; context.strokeStyle = stale ? '#899eaf' : '#88d9eb'; context.lineWidth = 1; context.fillRect(p.x + 10, p.y + 6, size, 21); context.strokeRect(p.x + 10, p.y + 6, size, 21); context.fillStyle = stale ? '#b9c4d0' : '#ccf2fa'; context.fillText(text, p.x + 15, p.y + 22); context.restore();
        register({id:`pilots:${systemId}`,kind:'pilots',title:`${occupants.length} pilot${occupants.length === 1 ? '' : 's'} reported here`,description:`${occupants.map((pilot: any) => pilot.name || `Pilot ${pilot.character_id}`).join(' · ')}. ${stale ? 'Dashed or ? means last known, stale or offline positions.' : 'Observed positions can change between updates.'}`,systemId,systemName:point.system.name,source:op.fleet.length ? 'Authorized fleet / selected pilots' : 'Selected pilots',updatedAt:occupants[0]?.updated_at},p.x+10+size/2,p.y+16.5,Math.max(12,size/2),7);
      }
      if (tactical.operationsVisible !== false && op && (op.signatures.length || op.upgrades.length) && !op.reports.length && !contextMarkers.length) {
        const x=p.x-17,y=p.y-11;context.strokeStyle='#c2bbdd';context.lineWidth=1.4;context.strokeRect(x-5,y-6,10,12);context.beginPath();context.moveTo(x-1,y-4);context.lineTo(x-1,y+4);context.stroke();
        register({id:`notebook:${systemId}`,kind:'notebook',title:'Exploration notebook',description:`${op.signatures.length} recorded signatures · ${op.upgrades.length} configured upgrades. Open the notebook to review or update these records.`,systemId,systemName:point.system.name,source:'Your Universe notebook'},x,y,11,7);
      }
      if (contextMarkers.length && (camera.scale > 1.5 || projection === 'radar' || systemId === selectedSystemId || contextMarkers.some((marker: any) => ['storm', 'campaign', 'combat'].includes(marker.kind)))) {
        const marker = contextMarkers.find((entry: any) => entry.kind === 'campaign') || contextMarkers.find((entry: any) => entry.kind === 'storm') || contextMarkers[0];
        const x = p.x - 17, y = p.y - 11; context.strokeStyle = marker.stale ? '#8694a5' : marker.kind === 'storm' ? '#c6b3ed' : marker.kind === 'campaign' || marker.kind === 'combat' ? '#ebaa87' : '#a9cfeb'; context.fillStyle = context.strokeStyle; context.lineWidth = 1.3;
        context.setLineDash(marker.stale ? [2, 2] : []); context.beginPath();
        if (marker.kind === 'storm') {context.moveTo(x + 3, y - 7); context.lineTo(x - 4, y + 1); context.lineTo(x + 1, y + 1); context.lineTo(x - 3, y + 8);}
        else if (marker.kind === 'campaign' || marker.kind === 'combat') {context.moveTo(x - 5, y - 5); context.lineTo(x + 5, y + 5); context.moveTo(x + 5, y - 5); context.lineTo(x - 5, y + 5);}
        else {context.moveTo(x, y - 6); context.lineTo(x + 5, y); context.lineTo(x, y + 6); context.lineTo(x - 5, y); context.closePath();}
        context.stroke(); context.setLineDash([]);
        register({id:`feed:${systemId}`,kind:marker.kind,title:marker.kind === 'storm' ? 'Metaliminal storm' : marker.kind === 'campaign' ? 'Sovereignty campaign' : marker.kind === 'combat' ? 'Public combat report' : marker.name,description:contextMarkers.map(value => `${value.name}: ${value.detail || ''}`).join(' · '),systemId,systemName:point.system.name,source:marker.source,updatedAt:marker.at,details:marker.stale ? [{label:'Freshness',value:'Stale — retained for context'}] : undefined},x,y,11,8);
      }
    }
    for (const cluster of markerClusters.current) {
      const text = String(cluster.systemIds.length); context.font = '600 14px "Cascadia Code", Consolas, monospace'; const size = Math.max(28, context.measureText(text).width + 15);
      context.save(); context.globalAlpha = labelEdgeOpacity({left:cluster.x-size/2-.625,top:cluster.y-12.625,right:cluster.x+size/2+.625,bottom:cluster.y+12.625},{width,height});
      context.fillStyle = '#162938'; context.strokeStyle = '#88b5ce'; context.lineWidth = 1.25; context.fillRect(cluster.x - size / 2, cluster.y - 12, size, 24); context.strokeRect(cluster.x - size / 2, cluster.y - 12, size, 24); context.fillStyle = '#d1e8f4'; context.fillText(text, cluster.x - context.measureText(text).width / 2, cluster.y + 5); context.restore();
      register({id:`cluster:${cluster.key}`,kind:'cluster',title:`${cluster.systemIds.length} systems with context`,description:'Nearby intel, pilots or public signals are grouped at this scale. Explore the group to separate its systems.',source:'Visible map observations',entrances:cluster.systemIds.map(id=>({id:`system:${id}`,systemId:id,systemName:byId.get(id)?.system.name || String(id)}))},cluster.x,cluster.y,Math.max(16,size/2),5,undefined,cluster.systemIds);
    }
    if (indicator !== 'none') for (const point of visible) {
      if (indicator === 'fw' && overlays.get(point.system.system_id)?.faction_warfare?.operational_state_source === 'derived_gate_adjacency') continue;
      const value = feedIndicatorValues.get(point.system.system_id) ?? indicatorValue(overlays.get(point.system.system_id), indicator); if (!value) continue;
      const p = screen(point), intensity = Math.log1p(Math.abs(value)) / Math.log1p(indicatorMax), radius = 3 + intensity * 12;
      context.fillStyle = indicator === 'jumps' || indicator === 'industry' ? '#85b9f22c' : '#e99e7930';
      context.strokeStyle = indicator === 'jumps' || indicator === 'industry' ? '#85b9f255' : '#e99e7960';
      if (indicator === 'npc_delta') {context.fillStyle = value > 0 ? '#85dcb526' : '#ef9b9b26'; context.strokeStyle = value > 0 ? '#85dcb599' : '#ef9b9b99';}
      if (indicator === 'adm') {context.fillStyle = '#9bbde026'; context.strokeStyle = '#9bbde08a';}
      context.lineWidth = .7; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
      register({id:`indicator:${point.system.system_id}`,kind:'indicator',title:INDICATOR_LABELS[indicator],description:`${value.toLocaleString()}${indicator==='npc_delta'?' change between rolling one-hour snapshots, not new kills.':''}`,systemId:point.system.system_id,systemName:point.system.name,source:'Map data snapshot'},p.x,p.y,radius+3,3);
    }
    const occupied: LabelRect[] = [];
    const claimLabel = (bounds: LabelRect) => {
      const rect = labelCollisionBounds(bounds);
      if (occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)) return false;
      // The viewport fades the chosen anchor; it must not trigger a jump to another side/candidate.
      if (labelEdgeOpacity(bounds, {width, height}) > 0) occupied.push(rect);
      return true;
    };
    const systemLabels: {name: string; x: number; y: number; priority: number; dim: boolean}[] = [];
    context.textAlign = 'left';
    for (const point of visible) {
      const id = point.system.system_id, p = screen(point), overlay = overlays.get(id), active = id === selectedSystemId, hover = id === hoveredRef.current, current = id === (replay ? replay.systemId : currentLocationId);
      const highlighted = active || hover || current || route.has(id), dim = !highlighted && (!passesStanding(overlay, standingFilter) || Boolean(focusedRegionId && point.system.region_id !== focusedRegionId));
      context.globalAlpha = dim ? .16 : 1;
      const colour = point.system.security_known === false ? '#718397' : background === 'none' || background === 'activity' ? securityColour(point.system.security) : layerStyle(point, overlay, background === 'power_blocs' ? 'sovereignty' : background, territoryPalette).colour;
      const radius = highlighted ? 3.8 : Math.max(1.25, Math.min(2.6, camera.scale * .45));
      context.fillStyle = highlighted ? '#d2fae9' : colour;
      if (point.system.station_count && (camera.scale > 2.8 || projection === 'radar')) context.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
      else {context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill();}
      if (point.system.station_count && (camera.scale > 2.8 || projection === 'radar')) register({id:`station:${id}`,kind:'station',title:'NPC station system',description:`The square marks a system with ${point.system.station_count} NPC station${point.system.station_count === 1 ? '' : 's'}. It does not indicate player-structure access.`,systemId:id,systemName:point.system.name,source:'CCP static universe data'},p.x,p.y,7,1);
      if (current) register({id:`location:${id}`,kind:'location',title:replay ? 'Replay location' : locationReady ? 'Your observed location' : 'Last known location',description:replay ? 'The pilot’s recorded location at this replay instant.' : 'The gold reticle marks the current location observation. This is not a safety indicator.',systemId:id,systemName:point.system.name,source:replay ? 'Session replay' : mapLocation?.source === 'chat_log' ? 'Local EVE log' : 'EVE ESI',updatedAt:mapLocation?.updated_at},p.x,p.y,12,5);
      if (!current && (pins.has(id) || replayTrail.has(id) || active)) register({id:`system-context:${id}`,kind:'system',title:pins.has(id) ? 'Pinned system' : active ? 'Selected system' : 'Session trail',description:pins.has(id) ? 'Your saved map pin marks this system.' : active ? 'This is the system selected in the inspector.' : 'This system appears in the recorded session trail up to this replay instant.',systemId:id,systemName:point.system.name,source:'Your Universe workspace'},p.x,p.y,8,2);
      if (cynoPins.has(id)) { register({id:`cyno:${id}`,kind:'cyno',title:'Cyno observation',description:'A user-recorded cynosural observation. The triangle does not establish that a beacon is online, accessible or safe.',systemId:id,systemName:point.system.name,source:'Your map notes'},p.x,p.y-5,11,7); context.strokeStyle='#dfbe7b';context.lineWidth=1.4;context.beginPath();context.moveTo(p.x,p.y-9);context.lineTo(p.x+8,p.y+6);context.lineTo(p.x-8,p.y+6);context.closePath();context.stroke(); }
      if (active || current || hover || replayTrail.has(id) || pins.has(id)) {
        context.strokeStyle = current ? '#f2cb8b' : pins.has(id) ? '#bea3e8' : active || hover ? '#abf1d7' : '#89ceb78c'; context.lineWidth = active || current ? 1.6 : .8; context.beginPath(); context.arc(p.x, p.y, active || current ? 8 : 5.5, 0, Math.PI * 2); context.stroke();
        if (current) {context.beginPath(); context.moveTo(p.x - 12, p.y); context.lineTo(p.x - 9, p.y); context.moveTo(p.x + 9, p.y); context.lineTo(p.x + 12, p.y); context.moveTo(p.x, p.y - 12); context.lineTo(p.x, p.y - 9); context.moveTo(p.x, p.y + 9); context.lineTo(p.x, p.y + 12); context.stroke();}
      }
      if (active || hover || current || (labels && (projection === 'radar' || space === 'wormhole' || camera.scale > 5 || (camera.scale > 2.8 && visible.length < 180)))) {
        systemLabels.push({name: point.system.name, x: p.x, y: p.y, priority: active ? 4 : current ? 3 : hover ? 2 : highlighted ? 1 : 0, dim});
      }
    }
    context.globalAlpha = 1;
    // Public entrances sit over the map at every zoom. Leaders retain their true system anchors.
    const portalBuckets: {source:'thera'|'turnur';x:number;y:number;endpoints:PortalEndpoint[];anchors:{x:number;y:number}[]}[] = [];
    for (const endpoint of portalEndpoints) {
      const point = byId.get(endpoint.systemId); if (!point) continue; const anchor = screen(point);
      if (anchor.x < -15 || anchor.y < -15 || anchor.x > width + 15 || anchor.y > height + 15) continue;
      const x = anchor.x + (endpoint.source === 'thera' ? 15 : -15), y = anchor.y - 17;
      const bucket = portalBuckets.find(value=>value.source === endpoint.source && Math.hypot(value.x-x,value.y-y)<27);
      if (bucket) {const count=bucket.endpoints.length;bucket.x=(bucket.x*count+x)/(count+1);bucket.y=(bucket.y*count+y)/(count+1);bucket.endpoints.push(endpoint);bucket.anchors.push(anchor);} else portalBuckets.push({source:endpoint.source,x,y,endpoints:[endpoint],anchors:[anchor]});
    }
    for (const bucket of portalBuckets) {
      const {x,y,source,endpoints}=bucket, selected = portalNetwork === source, stale = endpoints.every(endpoint=>!endpoint.usable), colour = source === 'thera' ? '#c6a7f7' : '#7bdcda';
      context.save();context.globalAlpha=portalNetwork && !selected ? .45 : 1; context.strokeStyle=stale?'#99a8b8':colour;context.fillStyle='#101b29';context.lineWidth=selected?2.3:1.7;context.setLineDash(stale?[3,3]:[]);
      for(const anchor of bucket.anchors) {context.beginPath();context.moveTo(anchor.x,anchor.y);context.lineTo(x,y);context.stroke();}
      const radius=endpoints.length>1?13:9;context.beginPath();
      if(source==='thera')context.arc(x,y,radius,0,Math.PI*2);else{context.moveTo(x,y-radius-1);context.lineTo(x+radius+1,y);context.lineTo(x,y+radius+1);context.lineTo(x-radius-1,y);context.closePath();}context.fill();context.stroke();context.setLineDash([]);
      if(endpoints.length>1){context.font='600 13px "Cascadia Code", Consolas, monospace';context.fillStyle=stale?'#bbc7d2':colour;context.fillText(String(endpoints.length),x-context.measureText(String(endpoints.length)).width/2,y+4.5);}else{context.beginPath();context.arc(x,y,3,0,Math.PI*2);context.stroke();}
      context.restore();
      const symbol:MapSymbolContext=endpoints.length===1?portalSymbol(endpoints[0]):{id:`portal-cluster:${source}:${endpoints.map(endpoint=>endpoint.id).sort().join(':')}`,kind:'portal-cluster',title:`${endpoints.length} ${source==='thera'?'Thera':'Turnur'} connections`,description:'Nearby reported wormhole entrances share this marker. Choose an entrance for its signatures and travel limits.',source:'EVE-Scout',portalNetwork:source,entrances:endpoints.map(endpoint=>({id:`portal:${endpoint.id}`,systemId:endpoint.systemId,systemName:endpoint.system.name,label:endpoint.usable?'Reported connection':endpoint.state.replaceAll('_',' ')}))};
      register(symbol,x,y,radius+5,10,undefined,endpoints.map(endpoint=>endpoint.systemId));
      if(selected && endpoints.length===1)systemLabels.push({name:`${endpoints[0].system.name} · ${source==='thera'?'Thera':'Turnur'}`,x:x+5,y:y-5,priority:3,dim:false});
    }
    for (const label of systemLabels.sort((a, b) => b.priority - a.priority)) {
      const fontSize = label.priority ? 16 : 14;
      context.font = `${label.priority ? '600 ' : ''}${fontSize}px "Cascadia Code", Consolas, monospace`;
      const metrics = context.measureText(label.name), textWidth = metrics.width;
      const placements = [{x: label.x + 10, y: label.y - 8}, {x: label.x + 10, y: label.y + 20}, {x: label.x - textWidth - 10, y: label.y - 8}, {x: label.x - textWidth - 10, y: label.y + 20}];
      const placement = placements.map(position => ({...position,bounds:mapLabelBounds(position.x,position.y,metrics,fontSize)})).find(position => claimLabel(position.bounds)); if (!placement) continue;
      paintLabel(label.name,placement.x,placement.y,fontSize,label.priority ? '#e7fff5' : '#cad9e8',label.dim ? .4 : 1,placement.bounds);
    }
    context.globalAlpha = 1;
    if (labels && field && (background === 'sovereignty' || background === 'power_blocs')) {
      context.font = '600 16px "Cascadia Code", Consolas, monospace';
      for (const label of field.labels) {
        if (label.count < 3) continue;
        const text = label.name || '', metrics = context.measureText(text), textWidth = metrics.width;
        for (const candidate of label.candidates) {
          const x = candidate.x * camera.scale + camera.x - textWidth / 2, y = candidate.y * camera.scale + camera.y - 8;
          // Check the label footprint, not just a centroid: pockets and enclaves keep their own names.
          const fits = [-1, 0, 1].every(dx => [-1, 1].every(dy => {
            const owner = territoryOwnerAt(field.geometry, candidate.x + dx * (textWidth / 2 + 3) / camera.scale, candidate.y + (-16 + dy * 9) / camera.scale);
            return owner >= 0 && field.styles[owner].key === label.key && !field.styles[owner].dim;
          }));
          const bounds = mapLabelBounds(x,y,metrics,16);
          if (!fits || !claimLabel(bounds)) continue;
          paintLabel(text,x,y,16,'#e1edf5',1,bounds); break;
        }
      }
    }
    if (labels && space === 'known' && projection !== 'radar' && (background !== 'power_blocs' && background !== 'sovereignty' || camera.scale > 1.7)) {
      context.font = '14px "Cascadia Code", Consolas, monospace';
      const limit = width < 500 && camera.scale < 1.2 ? 9 : width < 800 && camera.scale < .9 ? 16 : 45;
      let drawn = 0;
      for (const region of [...regionPoints].sort((a, b) => Number(b.id === focusedRegionId) - Number(a.id === focusedRegionId) || b.count - a.count)) {
        if (drawn >= limit) break;
        const text = region.name.toUpperCase(), metrics = context.measureText(text), textWidth = metrics.width;
        const x = region.x * camera.scale + camera.x - textWidth / 2, y = region.y * camera.scale + camera.y - 12;
        const bounds = mapLabelBounds(x,y,metrics,14);
        if ((camera.scale > 3 && region.id !== focusedRegionId) || !claimLabel(bounds)) continue;
        if (paintLabel(text,x,y,14,region.id === focusedRegionId ? '#e0f0f5' : '#b9ccdd',1,bounds)) drawn++;
      }
    }
    if (replay?.events.length) {
      const grouped = new Set<number>();
      for (const event of replay.events) {
        if (grouped.has(event.systemId)) continue; grouped.add(event.systemId);
        const point = byId.get(event.systemId); if (!point) continue;
        const p = screen(point); if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) continue;
        const text = event.summary.length > 42 ? event.summary.slice(0, 40) + '…' : event.summary;
        const caption = event.locationBasis === 'observed_visit' ? 'PILOT CONTEXT · LOCATION UNCONFIRMED' : event.locationBasis.includes('inferred') ? 'INFERRED PILOT CONTEXT' : 'RECORDED EVENT';
        context.font = '16px "Cascadia Code", Consolas, monospace'; const textWidth = context.measureText(text).width;
        context.font = '14px "Cascadia Code", Consolas, monospace'; const captionWidth = context.measureText(caption).width;
        const boxWidth = Math.min(width - 24, Math.max(180, textWidth + 24, captionWidth + 24)), x = Math.min(width - boxWidth - 10, Math.max(10, p.x + 20)), y = Math.max(44, p.y - 66);
        context.save(); context.globalAlpha = labelEdgeOpacity({left:x-.4,top:y-.4,right:x+boxWidth+.4,bottom:y+59.4},{width,height});
        context.fillStyle = '#241d32f2'; context.strokeStyle = '#af88c58c'; context.lineWidth = .8; context.fillRect(x, y, boxWidth, 59); context.strokeRect(x, y, boxWidth, 59);
        context.font = '16px "Cascadia Code", Consolas, monospace'; context.fillStyle = '#e5c6eb'; context.fillText(text, x + 11, y + 23, boxWidth - 22);
        context.font = '14px "Cascadia Code", Consolas, monospace'; context.fillStyle = '#b09bbd';
        context.fillText(caption, x + 11, y + 46, boxWidth - 22); context.restore();
      }
    }
    symbolHits.current = hits;
    if (canvas.current) canvas.current.dataset.mapSymbols = JSON.stringify(hits.filter(hit=>hit.priority>=5).slice(0,200).map(hit=>({id:hit.symbol.id,kind:hit.symbol.kind,title:hit.symbol.title,systemId:hit.symbol.systemId,x:Math.round(hit.x),y:Math.round(hit.y),radius:hit.radius})));
    const active = pinnedSymbolRef.current || hoveredSymbolRef.current;
    if (active && symbolContextElement.current) {
      const current = hits.find(hit=>hit.symbol.id===active.symbol.id);
      if (current) {active.x=current.x;active.y=current.y;}
      else if (active.symbol.systemId) {const point=byId.get(active.symbol.systemId);if(point){const p=screen(point);active.x=p.x;active.y=p.y;}}
      positionMapContext(symbolContextElement.current,!pinnedSymbolRef.current&&hoveredPointer.current||{x:active.x,y:active.y},{width,height},!!pinnedSymbolRef.current);
    }
  };
  useEffect(() => {redraw();}, [atlas, byId, points, intel, background, indicator, indicatorMax, regionPoints, labels, routeSystemIds, routeEdges, route, showConnections, showSpecialLinks, focusedRegionId, space, replayTrail, pins, cynoPins, replay, standingFilter, territoryPalette, territoryFocus, overviewOpen, overview, worldUnitsPerLightYear, tactical, operational, feeds, intelPulse, projection, surfaceKey, portalEndpoints, portalNetwork, redraw]);

  function nearest(clientX: number, clientY: number) {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return null;
    const x = clientX - rect.left, y = clientY - rect.top, current = view.current;
    let selected: number | null = null, distance = 13 * 13;
    for (const point of points) {const squared = (point.x * current.scale + current.x - x) ** 2 + (point.y * current.scale + current.y - y) ** 2; if (squared < distance) {distance = squared; selected = point.system.system_id;}}
    return selected;
  }
  function politicalHit(clientX: number, clientY: number): TerritoryHit | null {
    if (replay || space !== 'known' || projection === 'radar' || !['power_blocs', 'sovereignty'].includes(background) || lastTerritoryKey.current !== territoryKey) return null;
    const rect = canvas.current?.getBoundingClientRect(), field = territory.current;
    if (!rect || !field) return null;
    const owner = territoryOwnerAt(field.geometry, (clientX - rect.left - view.current.x) / view.current.scale, (clientY - rect.top - view.current.y) / view.current.scale);
    const style = owner >= 0 ? field.styles[owner] : null;
    return style?.strength && !style.dim ? territorySummary.get(style.key) || null : null;
  }
  function clusterHit(clientX:number,clientY:number) {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return null;
    return markerClusters.current.find(cluster => Math.abs(cluster.x - clientX + rect.left) < 22 && Math.abs(cluster.y - clientY + rect.top) < 16) || null;
  }
  function symbolHit(clientX: number, clientY: number) {
    const rect=canvas.current?.getBoundingClientRect();if(!rect)return null;const x=clientX-rect.left,y=clientY-rect.top;
    return symbolHits.current.filter(hit=>{if(hit.segment){const dx=hit.segment.x-hit.x,dy=hit.segment.y-hit.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-hit.x)*dx+(y-hit.y)*dy)/l)):0;return Math.hypot(x-hit.x-t*dx,y-hit.y-t*dy)<=hit.radius;}return Math.hypot(x-hit.x,y-hit.y)<=hit.radius;}).sort((a,b)=>b.priority-a.priority)[0] || null;
  }
  function hoverAt(clientX: number, clientY: number) {
    let symbol = symbolHit(clientX, clientY);
    if(!symbol){const id=nearest(clientX,clientY),point=id?byId.get(id):null;if(point)symbol={symbol:{id:`system:${point.system.system_id}`,kind:'system',title:point.system.name,description:`${systemLocationLabel(point.system)} · ${point.system.security_known===false?'Security unknown':`Security ${point.system.security.toFixed(1)}`}. A dot marks a star system; a square marks NPC stations.`,systemId:point.system.system_id,systemName:point.system.name,source:'CCP universe data'},x:point.x*view.current.scale+view.current.x,y:point.y*view.current.scale+view.current.y,radius:9,priority:0};}
    const rect=symbol?.segment?canvas.current?.getBoundingClientRect():null;
    hoveredPointer.current=rect?{x:clientX-rect.left,y:clientY-rect.top}:null;
    if(symbol?.symbol.id!==hoveredSymbolRef.current?.symbol.id){hoveredSymbolRef.current=symbol;setHoveredSymbol(symbol);}
    if(hoveredPointer.current&&!pinnedSymbolRef.current)positionMapContext(symbolContextElement.current,hoveredPointer.current,dimensions.current);
    const cluster = symbol ? null : clusterHit(clientX, clientY), id = symbol ? symbol.symbol.systemId || null : cluster ? null : nearest(clientX, clientY), hit = symbol || id || cluster ? null : politicalHit(clientX, clientY);
    if (cluster?.key !== hoveredCluster?.key) setHoveredCluster(cluster);
    if (id !== hoveredRef.current) {hoveredRef.current = id; setHovered(id); redraw();}
    if (hit?.key !== hoveredTerritoryRef.current?.key || hit?.name !== hoveredTerritoryRef.current?.name || hit?.count !== hoveredTerritoryRef.current?.count || hit?.source !== hoveredTerritoryRef.current?.source) {hoveredTerritoryRef.current = hit; setHoveredTerritory(hit); redraw();}
  }
  function gesturePair() {
    const values = [...activePointers.current.values()], rect = canvas.current?.getBoundingClientRect(); if (values.length < 2 || !rect) return null;
    return {midpoint: {x: (values[0].x + values[1].x) / 2 - rect.left, y: (values[0].y + values[1].y) / 2 - rect.top}, distance: Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y)};
  }
  function cancelGesture() {pointer.current = null; activePointers.current.clear(); pinch.current = null; setDragging(false);}
  function navigateOverview(x: number, y: number) {
    manualMovement();
    const scale = Math.max(view.current.scale, baseScale.current * 2);
    animateCamera({x: dimensions.current.width / 2 - (x - overview.x) / overview.scale * scale, y: dimensions.current.height / 2 - (y - overview.y) / overview.scale * scale, scale}, 640);
  }
  const activeSymbol = pinnedSymbol || hoveredSymbol;
  const symbolResults = symbolChoices.filter(hit=>!symbolQuery || `${hit.symbol.title} ${hit.symbol.systemName || ''} ${hit.symbol.description}`.toLocaleLowerCase().includes(symbolQuery.toLocaleLowerCase()));
  const chooseEntrance = (id:string) => {const endpoint=portalEndpoints.find(value=>`portal:${value.id}`===id);if(endpoint){const point=byId.get(endpoint.systemId),p=point?{x:point.x*view.current.scale+view.current.x,y:point.y*view.current.scale+view.current.y}:{x:dimensions.current.width/2,y:dimensions.current.height/2};pinSymbol({symbol:portalSymbol(endpoint),...p,radius:14,priority:10});}else if(id.startsWith('system:')){const systemId=Number(id.slice(7));const point=byId.get(systemId);if(point){pinSymbol({symbol:{id,kind:'system',title:'System context',systemId,systemName:point.system.name,description:'Inspect this system or use it as a route destination.'},x:point.x*view.current.scale+view.current.x,y:point.y*view.current.scale+view.current.y,radius:10,priority:1});}}};
  const hoverPoint = hovered ? byId.get(hovered) : null;
  const selectedPoint = selectedSystemId ? byId.get(selectedSystemId) : null;
  const locationId = replay ? replay.systemId : mapLocation?.system_id;
  const hud = hoverPoint || selectedPoint;
  const historicalOwner = replay && hud?.system.system_id === replay.systemId && hud?.system.space !== 'wormhole' ? historicalSovereigntyLabel(replay.sovereigntyAtVisit) : null;
  const hudBloc = hud && !replay ? overlays.get(hud.system.system_id)?.power_bloc : null;
  const hudBlocColour = hudBloc?.group_id && (hudBloc.source === 'configured' || hudBloc.source === 'inferred') ? territoryPalette.get(`bloc:${hudBloc.group_id}`)?.fill : hud ? layerStyle(hud, overlays.get(hud.system.system_id), 'sovereignty', territoryPalette).colour : null;
  const territoryHud = !replay && projection !== 'radar' && space === 'known' && ['power_blocs', 'sovereignty'].includes(background) && !hoverPoint ? hoveredTerritory || (territoryFocus ? territorySummary.get(territoryFocus.key) : null) : null;
  const hudOperations = hud && !replay ? operational.get(hud.system.system_id) : null, hudFeeds = hud && !replay ? feeds.get(hud.system.system_id) || [] : [];
  const hudWatch = hud ? watchDistances.get(hud.system.system_id) : null;
  const routePoints = routeSystemIds.filter(id => byId.has(id) && (!focusedRegionId || byId.get(id)?.system.region_id === focusedRegionId));
  const hudValue = hud ? indicator === 'npc_delta' || indicator === 'adm' ? feedIndicatorValues.get(hud.system.system_id) ?? null : reportedIndicator(overlays.get(hud.system.system_id), indicator, intel) : null;
  const hudFW = hud && !replay && indicator === 'fw' ? overlays.get(hud.system.system_id)?.faction_warfare : null;
  return <div className="universe-canvas-shell universe-map-immersive" data-map-space={space} data-map-projection={projection} data-portal-network={portalNetwork || undefined} style={{border: '1px solid #2a3542', background: '#0b1119', overflow: 'hidden'}}>
    <div className="universe-map-toolbar" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 13px', borderBottom: '1px solid #25303d', flexWrap: 'wrap'}}>
      <div className="universe-map-coordinate-title"><span>{space === 'known' ? projection === 'radar' ? 'Local radar' : projection === 'schematic' ? 'New Eden · schematic' : 'New Eden' : 'J-Space'}</span><span>{points.length.toLocaleString()} systems{localLayout?.limited ? ` of ${localLayout.total}` : ''}</span></div>
      <div style={{display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap'}}>
        <Button ref={symbolLauncher} variant="ghost" size="icon" title="Explore map symbols (S)" aria-label="Explore map symbols" aria-expanded={symbolNavigator} onClick={openSymbols}><Shapes size={17}/></Button>
        <Button variant="ghost" size="icon" title="Toggle map labels" aria-label="Toggle map labels" aria-pressed={labels} onClick={() => setLabels(value => !value)}><Type size={17}/></Button>
        <Button variant="ghost" size="icon" title={replay ? 'Centre on replay location' : locationReady ? mapLocation?.source === 'chat_log' ? 'Centre on reported log location' : 'Centre on current location' : 'Centre on last known location'} aria-label={replay ? 'Centre on replay location' : 'Centre on current location'} disabled={!locationId || !byId.has(locationId)} onClick={() => requestSystemFocus(locationId)}><LocateFixed size={17}/></Button>
        <Button variant="ghost" size="icon" title="Focus selected system" aria-label="Focus selected system" disabled={!selectedPoint} onClick={() => requestSystemFocus(selectedSystemId)}><Crosshair size={17}/></Button>
        {territoryFocus && !replay && space === 'known' && projection !== 'radar' && <Button variant="ghost" size="icon" title="Frame selected territory" aria-label="Frame selected territory" onClick={() => onFrameTerritory ? onFrameTerritory() : frameSystems(territoryFocus.systemIds)}><Focus size={17}/></Button>}
        {routeSystemIds.length > 1 && <Button variant="ghost" size="icon" disabled={routePoints.length < 2} title={focusedRegionId ? 'Fit route in current region' : routePoints.length < routeSystemIds.length ? 'Fit route in this space' : 'Fit route'} aria-label="Fit route" onClick={() => frameSystems(routePoints)}><Route size={17}/></Button>}
        <span style={{height: 17, width: 1, background: '#2b3948', margin: '0 5px'}}/>
        <Button variant="ghost" size="icon" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 1.001} onClick={() => zoomAt(1 / 1.4)}><Minus size={17}/></Button>
        <span style={{fontSize: 14, fontFamily: 'var(--font-mono)', color: '#c0d0dd', width: 48, textAlign: 'center'}}>{zoom.toFixed(1)}×</span>
        <Button variant="ghost" size="icon" title="Zoom in" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus size={17}/></Button>
        <Button variant="ghost" size="icon" title="Fit map (Home)" aria-label="Fit map" onClick={() => {manualMovement(); fit(true);}}><Maximize2 size={17}/></Button>
      </div>
    </div>
    <div ref={wrapper} className="universe-map-viewport" style={{position: 'relative', width: '100%'}}>
      <div className="universe-map-atmosphere" ref={atmosphere} aria-hidden="true"><svg viewBox="0 0 1000 680" preserveAspectRatio="none" focusable="false">{AMBIENT_STARS.map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r}/>)}</svg></div>
      <canvas ref={canvas} role="img" tabIndex={0} aria-label={`${space === 'known' ? 'New Eden' : 'Wormhole space'} interactive map showing ${points.length.toLocaleString()} systems. ${projection === 'physical' ? LAYERS[background] + ' background' : projection === 'radar' ? 'Gate-hop radar; schematic, not to scale' : 'CCP schematic 2D map; not a physical distance projection'}. ${INDICATOR_LABELS[indicator]}.`} aria-describedby={helpId}
        style={{position: 'relative', display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: dragging ? 'grabbing' : hoveredSymbol || hovered || hoveredTerritory ? 'pointer' : 'grab'}}
        onKeyDown={event => {
          if (event.key.toLowerCase() === 's') {event.preventDefault();openSymbols();}
          else if (event.key === '+' || event.key === '=') {event.preventDefault(); zoomAt(1.4);} else if (event.key === '-') {event.preventDefault(); zoomAt(1 / 1.4);} else if (event.key === 'Home') {event.preventDefault(); manualMovement(); fit(true);}
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {event.preventDefault(); manualMovement(); view.current.x += event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0; view.current.y += event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0; constrainView(); redraw();}
          else if (event.key === 'Enter' && selectedSystemId) {requestSystemFocus(selectedSystemId);}
        }}
        onPointerDown={event => {
          if (event.button !== 0 || activePointers.current.size >= 2) return;
          cancelCameraMotion(); updateZoom(); clearHover();
          activePointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
          event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
          if (activePointers.current.size === 1) pointer.current = {id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false, vx: 0, vy: 0, lastAt: performance.now()};
          else {manualMovement(); const pair = gesturePair(); if (pair) pinch.current = {camera: {...view.current}, ...pair}; if (pointer.current) pointer.current.moved = true;}
        }}
        onPointerMove={event => {
          if (!activePointers.current.has(event.pointerId)) {if (!pointer.current) hoverAt(event.clientX, event.clientY); return;}
          activePointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
          if (pinch.current && activePointers.current.size === 2) {
            const pair = gesturePair(); if (!pair) return;
            view.current = pinchCamera(pinch.current.camera, pinch.current.midpoint, pair.midpoint, pinch.current.distance, pair.distance, boundsRef.current, dimensions.current); updateZoom(); redraw(); return;
          }
          const held = pointer.current; if (!held || held.id !== event.pointerId) return;
          const dx = event.clientX - held.x, dy = event.clientY - held.y, now = performance.now();
          if (!held.moved && Math.hypot(event.clientX - held.originX, event.clientY - held.originY) > 4) {held.moved = true; manualMovement();}
          const before = view.current; view.current = {...before, x: before.x + dx, y: before.y + dy}; constrainView();
          const dt = Math.max(8, now - held.lastAt); held.vx = .65 * (view.current.x - before.x) / dt + .35 * held.vx; held.vy = .65 * (view.current.y - before.y) / dt + .35 * held.vy;
          held.x = event.clientX; held.y = event.clientY; held.lastAt = now; redraw();
        }}
        onPointerUp={event => {
          if (!activePointers.current.has(event.pointerId)) return;
          const held = pointer.current, wasPinching = !!pinch.current;
          activePointers.current.delete(event.pointerId); pinch.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (activePointers.current.size) {const [id, position] = [...activePointers.current][0]; pointer.current = {id, ...position, originX: position.x, originY: position.y, moved: true, vx: 0, vy: 0, lastAt: performance.now()}; return;}
          pointer.current = null; setDragging(false);
          if (held && !held.moved && !wasPinching) {const symbol=symbolHit(event.clientX,event.clientY);if(symbol){pinSymbol(symbol);return;}dismissContext();const cluster = clusterHit(event.clientX, event.clientY); if (cluster) {frameSystems(cluster.systemIds); return;} const id = nearest(event.clientX, event.clientY); if (id) onSelectSystem(id); else {const hit = politicalHit(event.clientX, event.clientY); if (hit) onInspectTerritory?.(hit.key);}}
          else if (held && !wasPinching && motionAllowed(surface())) {const coast = dragCoast(view.current, {x: held.vx, y: held.vy}, performance.now() - held.lastAt, boundsRef.current, dimensions.current); if (coast) animateCamera(coast.target, coast.duration);}
        }}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={event => {if (activePointers.current.has(event.pointerId)) cancelGesture();}}
        onPointerLeave={() => {if (!pointer.current) clearHover();}}
        onDoubleClick={event => {const rect = event.currentTarget.getBoundingClientRect(); zoomAt(1.8, event.clientX - rect.left, event.clientY - rect.top);}}
      >Use the system search and system list to select a system without the visual map.</canvas>
      {activeSymbol && <UniverseMapContext symbol={activeSymbol.symbol} anchor={!pinnedSymbol&&hoveredPointer.current||{x:activeSymbol.x,y:activeSymbol.y}} viewport={dimensions.current} pinned={!!pinnedSymbol} now={clock} onOpenNotebook={onOpenNotebook} anchorElementRef={symbolContextElement} onClose={()=>dismissContext(true)} onRoute={activeSymbol.symbol.systemId && onRouteToSystem ? ()=>onRouteToSystem(activeSymbol.symbol.systemId!) : undefined} onInspect={activeSymbol.symbol.systemId ? ()=>onSelectSystem(activeSymbol.symbol.systemId!) : undefined} onNetwork={activeSymbol.symbol.portalNetwork ? ()=>{const source=activeSymbol.symbol.portalNetwork!;setPortalNetwork(source);frameSystems(portalNetworks.find(value=>value.source===source)?.endpoints.map(endpoint=>endpoint.systemId)||[]);dismissContext();} : activeSymbol.systemIds?.length ? ()=>{frameSystems(activeSymbol.systemIds!);dismissContext();} : undefined} onChooseEntrance={chooseEntrance}/>}
      {symbolNavigator && <div className="universe-map-symbols" role="region" aria-label="Map symbols" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setSymbolNavigator(false);symbolLauncher.current?.focus();}}}>
        <div className="universe-map-symbols-heading"><strong>Symbols in view</strong><button aria-label="Close map symbols" title="Close map symbols" onClick={()=>{setSymbolNavigator(false);symbolLauncher.current?.focus();}}><X size={16}/></button></div>
        <input autoFocus aria-label="Find a map symbol" placeholder="Find a symbol or system…" value={symbolQuery} onChange={event=>setSymbolQuery(event.target.value)}/>
        <p>Hover any map symbol for its meaning. Select one to keep its context beside the map.</p>
        <div className="universe-map-symbol-list">{symbolResults.slice(0,120).map(hit=><button key={hit.symbol.id} data-map-symbol-kind={hit.symbol.kind} data-map-symbol-id={hit.symbol.id} data-map-x={hit.x} data-map-y={hit.y} onClick={()=>pinSymbol(hit)}><span className={`universe-map-symbol-key is-${hit.symbol.kind}`}/><span><strong>{hit.symbol.title}</strong><small>{hit.symbol.systemName || hit.symbol.source || 'Map context'}</small></span></button>)}{!symbolResults.length&&<p>No matching symbols in the current view.</p>}{symbolResults.length>120&&<p>Showing 120 of {symbolResults.length}. Search to narrow the list.</p>}</div>
      </div>}
      {!replay && tactical.feedsVisible !== false && <div className="universe-portal-networks" aria-label="Public wormhole networks">{portalNetworks.map(network=><button key={network.source} data-portal-source={network.source} aria-label={`Explore ${network.name} connections`} aria-pressed={portalNetwork===network.source} title={`Show ${network.name} entrance systems. ${network.usableCount} current reports${network.staleCount ? `, ${network.staleCount} stale` : ''}. Source: EVE-Scout.`} onClick={()=>exploreNetwork(network.source)}><i className={`universe-portal-network-glyph is-${network.source}`}/><span><strong>{network.name}</strong><small>{portalEndpoints.filter(endpoint=>endpoint.source===network.source&&endpoint.usable).length} fresh{network.staleCount>0?` · ${portalEndpoints.filter(endpoint=>endpoint.source===network.source&&!endpoint.usable).length} stale`:''}{portalEndpoints.filter(endpoint=>endpoint.source===network.source).length!==network.endpoints.length?` · ${network.endpoints.length} total`:''}{!network.endpoints.length?` · ${network.status === 'ready' ? 'no reports' : network.status || 'unavailable'}`:''}</small></span><ChevronDown size={15}/></button>)}{portalNetwork && <span className="universe-portal-network-caption">{portalNetwork==='thera'?'Entrances share Thera · hub position is schematic':'Reported entrances to Turnur'}{focusedRegionId?' · current region':''}<button aria-label="Clear connection focus" title="Clear connection focus" onClick={()=>setPortalNetwork(null)}><X size={14}/></button></span>}</div>}
      {!replay && intelPulse && intelPulse.systemIds.map(systemId => <div className="universe-map-intel-pulse-anchor" key={intelPulse.id+':'+systemId} ref={element => {if (element) intelPulseNodes.current.set(systemId, element); else intelPulseNodes.current.delete(systemId);}} aria-hidden="true"><i className="universe-map-intel-pulse"/></div>)}
      <div ref={acquisition} className="universe-map-acquisition-anchor" aria-hidden="true"><div key={`${space}:${replay ? replay.systemId : selectedSystemId}`} className="universe-map-acquisition"><i/><i/><i/><i/></div></div>
      {!points.length && <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#8ca2b4', fontSize: 14, padding: 30, textAlign: 'center'}}>{space === 'wormhole' && !allPoints.length ? 'Visit or pin a J-space system, or add a discovered wormhole, to build your connection map.' : 'No systems match this map filter.'}</div>}
      <div className="universe-map-layer-plaque" key={`${space}:${background}:${projection}`}><span className="universe-map-layer-mark"/>{replay ? 'Session replay' : space === 'known' ? projection === 'radar' ? `${tactical.hops || 3}-jump neighbourhood · gate distance` : projection === 'schematic' ? `${LAYERS[background]} · schematic 2D` : LAYERS[background] : 'Discovery graph'}{indicator !== 'none' && <span className="universe-map-indicator-tag">{INDICATOR_LABELS[indicator]}</span>}</div>
      {!replay && <div className="universe-map-operational-status">
        {tactical.operationsVisible !== false && tactical.routeWatch !== false && watchedThreats.length > 0 && <button className="universe-route-watch-status" onClick={() => frameSystems(watchedThreats.map(value => value.systemId))}><span className="universe-operational-dot"/>{watchedThreats.length} reported {watchedThreats.length === 1 ? 'threat' : 'threats'} within 6 gates of {routeSystemIds.length ? 'route' : 'focus'}</button>}
        {tactical.rangeOrigins?.length ? <span className="universe-range-status">{verifiedReachability ? `${reach.size} eligible systems${tactical.rangeOrigins.length > 1 ? ` · ${overlap.size} in every origin’s range` : ''}` : 'Range origins · calculate to verify reachable systems'}</span> : null}
        {localLayout?.limited && <span>Dense neighbourhood · showing {points.length} of {localLayout.total} systems</span>}
      </div>}
      {!activeSymbol && (hoveredCluster ? <div className="universe-map-hud universe-operational-hud"><div className="universe-map-hud-heading"><strong>{hoveredCluster.systemIds.length} systems with context</strong></div><div className="universe-map-hud-region">{hoveredCluster.systemIds.slice(0, 4).map(id => byId.get(id)?.system.name).filter(Boolean).join(' · ')}{hoveredCluster.systemIds.length > 4 ? '…' : ''}</div><div className="universe-territory-hint">Select cluster to expand its systems</div></div> : territoryHud ? <div className="universe-map-hud universe-territory-hud" data-selected={territoryFocus?.key === territoryHud.key ? "true" : "false"} key={territoryHud.key}>
        <div className="universe-map-hud-heading"><i className="universe-territory-swatch" style={{background: territoryHud.colour}}/><strong>{territoryHud.name}</strong></div>
        <div className="universe-territory-facts"><span>{territoryHud.count.toLocaleString()} sovereign systems</span><span>{territoryHud.source === 'configured' ? 'Configured bloc' : territoryHud.source === 'inferred' ? 'Inferred affiliation' : territoryHud.source === 'independent' ? 'Independent alliance' : territoryHud.source === 'unassigned' ? 'Unassigned alliance' : 'Sovereignty'}</span></div>
        {territoryFocus?.key === territoryHud.key ? <div className="universe-territory-actions"><button onClick={() => onFrameTerritory ? onFrameTerritory() : frameSystems(territoryFocus.systemIds)}><Focus size={16}/>Frame territory</button><button onClick={onClearTerritoryFocus}><X size={15}/>Clear</button></div> : <div className="universe-territory-hint">Select territory to explore</div>}
      </div> : hud && <div className="universe-map-hud" key={hud.system.system_id}>
        <div className="universe-map-hud-heading"><strong>{hud.system.name}</strong><span className="universe-map-security-badge" style={{color: hud.system.security_known === false ? '#a2b5c8' : securityColour(hud.system.security)}}>{hud.system.security_known === false ? '?' : hud.system.security.toFixed(1)}</span>{hud.system.system_id === locationId && <span className="universe-map-location-badge">{replay ? 'Replay' : !locationReady ? 'Last known location' : mapLocation?.source === 'chat_log' ? 'Reported location · logs' : 'You are here'}</span>}</div>
        <div className="universe-map-hud-region">{systemLocationLabel(hud.system)}</div>
        {historicalOwner && <div className="universe-map-hud-owner universe-map-historical-owner" title={historicalOwner.title}><Flag size={14} aria-hidden="true"/><span>{historicalOwner.label}</span></div>}
        {!replay && <div className="universe-map-hud-owner">{sovereigntyName(overlays.get(hud.system.system_id)?.sovereignty) || (hud.system.space === 'wormhole' ? 'Wormhole space' : 'Owner unavailable')}{background === 'power_blocs' && hudBloc && <span className="universe-map-hud-bloc"><i style={{background: hudBlocColour || '#77879a'}}/>{hudBloc.name}<span>{hudBloc.source === 'configured' ? 'Configured' : hudBloc.source === 'inferred' ? 'Inferred' : hudBloc.source === 'independent' ? 'Independent' : 'Unassigned'}</span></span>}</div>}
        {indicator !== 'none' && indicator !== 'fw' && <div className="universe-map-hud-metric"><span>{INDICATOR_LABELS[indicator]}</span><strong>{hudValue === null ? 'Unavailable' : indicator === 'industry' ? hudValue.toFixed(2) + '%' : hudValue.toLocaleString()}</strong></div>}
        {hudFW && <div className="universe-map-fw-state"><strong>{FW_STATES[hudFW.operational_state] || 'State unavailable'}</strong><span style={{color:FACTION_TERRITORY_COLOURS[Number(hudFW.occupier_faction_id ?? hudFW.occupier_id)]?.fill}}>{FACTION_TERRITORY_COLOURS[Number(hudFW.occupier_faction_id ?? hudFW.occupier_id)]?.name || 'Occupier unavailable'}</span><small>{hudFW.operational_state_source === 'derived_gate_adjacency' ? 'Derived from current occupancy and gate adjacency' : 'Awaiting a fresh warfare snapshot'}</small></div>}
        {!replay && (hudOperations || hudFeeds.length > 0 || localLayout) && <div className="universe-operational-hud">
          {localLayout && <div className="universe-operational-distance">{localLayout.distances.has(hud.system.system_id) ? `${localLayout.distances.get(hud.system.system_id)?.distance} gate jumps from ${byId.get(tacticalCenter || 0)?.system.name || 'focus'}` : 'Beyond the local gate-distance search'}</div>}
          {tactical.operationsVisible !== false && hudOperations?.reports.slice(0, 2).map((report: any) => <div className={'universe-map-report '+(report.kind === 'clear' ? 'is-clear' : 'is-report')} key={report.id}><div><strong>{report.kind === 'clear' ? 'Reported clear' : report.kind === 'hostile' ? 'Hostile report' : report.kind === 'combat' ? 'Combat report' : report.kind === 'decloak' ? 'Decloak report' : 'Intel report'}</strong><span>{ageLabel(report.observed_at, clock)}</span></div><p>{report.text}</p><small>{report.channel || report.source}{hudWatch ? ` · ${hudWatch.distance} gates from ${routeSystemIds.length ? 'route' : 'focus'}` : ''}{report.kind === 'clear' ? ' · not verified safety' : ''}</small></div>)}
          {tactical.pilotsVisible !== false && hudOperations && [...hudOperations.pilots, ...hudOperations.fleet].slice(0, 3).map((pilot: any) => <div className="universe-map-pilot" key={pilot.character_id}><strong>{pilot.name || `Pilot ${pilot.character_id}`}</strong><span>{pilot.stale ? 'Last known · ' : pilot.online === false ? 'Offline · ' : ''}{pilot.ship_name || (pilot.ship_type_id ? `ship ${pilot.ship_type_id} · ` : '')}{ageLabel(pilot.updated_at, clock)}</span></div>)}
          {hudFeeds.slice(0, 3).map((marker: any, index: number) => <div className="universe-map-feed" key={marker.kind+':'+index}><strong>{marker.name}</strong><span>{marker.detail} · {marker.source}{marker.stale ? ' · stale' : ''}{marker.at ? ' · '+ageLabel(marker.at, clock) : ''}</span></div>)}
          {hudOperations && hudOperations.signatures.length > 0 && <div className="universe-map-feed"><strong>{hudOperations.signatures.length} recorded signatures</strong><span>{hudOperations.signatures.slice(0, 3).map((signature: any) => signature.signature_id).join(' · ')}</span></div>}
          {hudOperations && hudOperations.upgrades.length > 0 && <div className="universe-map-feed"><strong>{hudOperations.upgrades.length} configured upgrades</strong><span>{hudOperations.upgrades.slice(0, 2).map((upgrade: any) => upgrade.name).join(' · ')}</span></div>}
        </div>}
      </div>)}
      <div className={'universe-map-overview'+(overviewOpen?' is-open':'')}>
        <button className="universe-overview-toggle" aria-label="Toggle overview map" aria-expanded={overviewOpen} onClick={() => setOverviewOpen(value => !value)}><MapIcon size={15}/><span>Overview</span><ChevronDown size={15}/></button>
        {overviewOpen && <svg viewBox="0 0 164 108" role="button" tabIndex={0} aria-label="Navigate overview map" onClick={event => {const rect = event.currentTarget.getBoundingClientRect(); navigateOverview((event.clientX - rect.left) / rect.width * 164, (event.clientY - rect.top) / rect.height * 108);}} onKeyDown={event => {
          const centre = {x: (dimensions.current.width / 2 - view.current.x) / view.current.scale * overview.scale + overview.x, y: (dimensions.current.height / 2 - view.current.y) / view.current.scale * overview.scale + overview.y};
          if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {event.preventDefault(); navigateOverview(centre.x + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0), centre.y + (event.key === 'ArrowUp' ? -12 : event.key === 'ArrowDown' ? 12 : 0));}
          else if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); navigateOverview(82,54);}
        }}><path d={overviewPath} className="universe-overview-systems"/><path d={overviewRoute} className="universe-overview-route"/><rect ref={overviewRect} className="universe-overview-viewport" x="0" y="0" width="164" height="108"/></svg>}
        <div className="universe-map-scale" ref={scaleDescription} aria-label={space === 'known' && projection === 'physical' ? 'Projected distance scale' : 'Schematic graph; not to scale'}>{space === 'known' && projection === 'physical' ? <><span ref={scaleBar} className="universe-map-scale-bar"/><span ref={scaleLabel}>Projected distance</span><small>projected</small></> : <span>Schematic · no scale</span>}</div>
      </div>
    </div>
    <details className="universe-map-guide"><summary><HelpCircle size={17}/><span>Map key & controls</span><ChevronDown size={16}/></summary>
    <div className="universe-map-legend" style={{display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '11px 15px', borderTop: '1px solid #25303d', fontSize: 14, color: '#89a0b4'}}>
      {space === 'wormhole' ? <span>Only discovered systems and their known-space exits. Disconnected discoveries stay on the map.</span> : projection === 'radar' ? <span>Gate topology · physical territory borders and distance scales are hidden. Node colours retain the selected layer.</span> : background === 'power_blocs' ? <><Legend colour="#b7c8d8" label="Configured bloc" line/><Legend colour="#b7c8d8" label="Inferred group" dashed/><span>Dots show actual owners · unassigned alliances remain separate.</span></> : background === 'standings' ? <><Legend colour={PALETTE.excellent} label="Excellent"/><Legend colour={PALETTE.good} label="Good"/><Legend colour={PALETTE.neutral} label="Neutral"/><Legend colour={PALETTE.bad} label="Bad"/><Legend colour={PALETTE.terrible} label="Terrible"/><Legend colour={PALETTE.unknown} label="Unknown"/></> : background === 'security' || background === 'none' ? <><Legend colour="#85dcb5" label="High security"/><Legend colour="#dfb975" label="Low security"/><Legend colour="#d68092" label="Null / wormhole"/></> : <span>{background === 'sovereignty' ? 'Colour identifies the owning alliance or faction. Borders separate neighbouring territories.' : 'Brighter shading means more reported ship and pod kills.'}</span>}
      {routeSystemIds.length > 1 && <Legend colour="#a4f1d4" label="Planned route"/>}{showSpecialLinks && !replay && <><Legend colour="#80ddde" label="Ansiblex" dashed/><Legend colour="#c1a0eb" label="Wormhole" dashed/></>}
      {!replay && routeEdges.some(edge => edge.kind === 'jump') && <Legend colour="#f1c282" label="Jump-drive leg" dashed/>}
      {!replay && <><Legend colour="#f59691" label="Reported threat · triangle" line/><Legend colour="#86d8b7" label="Reported clear · check" line/><Legend colour="#9cabbb" label="Older than 150s · dashed" dashed/><Legend colour="#88d9eb" label="Pilot/fleet count · ? last known" line/></>}
      {replay && <><Legend colour="#e1bb87" label="Recorded transitions" dashed/><Legend colour="#e6a6cb" label="Recent recorded event"/></>}
    </div>
    {!replay && space === 'known' && projection !== 'radar' && (background === 'sovereignty' || background === 'power_blocs') && <div className="universe-map-empire-key">{[500001, 500004, 500003, 500002].map(id => {const faction = FACTION_TERRITORY_COLOURS[id]; return <Legend key={id} colour={faction.fill} label={faction.name}/>;})}</div>}
    {!replay && tactical.rangeOrigins?.length ? <p className="universe-map-help">Squares mark destinations verified by the 3D range calculation; gold squares are reachable from every origin. Dashed circles show projected outer limits. The gold outline encloses the projected overlap systems, not a guaranteed reachable area. Cyno availability, permissions and safety are not established by range.</p> : null}
    {!replay && indicator === 'npc_delta' && <p className="universe-map-help">NPC activity change compares two rolling one-hour snapshots, not kills between samples. Green means the total rose; red means it fell. Missing samples stay unavailable.</p>}
    {!replay && indicator === 'fw' && <p className="universe-map-help">Faction warfare: diamonds mark frontlines, squares command operations, and chevrons rearguards. Mark colours identify the current occupier; opposing-front gate lines meet at a white boundary tick. These states are derived from fresh ESI occupancy and the stargate graph.</p>}
    {!replay && <p className="universe-map-help universe-operational-key">Reports are observations, not verified safety. Fresh: under 30 seconds; recent: under 150 seconds; older: dashed until expiry. Adjacent gates highlight on hover: mint within a constellation, blue between constellations, gold between regions. Square systems contain NPC stations. Storm bolts and crossed campaign markers show source-attributed context; optional landmarks can be historical.</p>}
    <p id={helpId} className="universe-map-help">Drag to pan · scroll or pinch to zoom · Home to fit · select a system or territory to inspect. The overview navigates within the active region or space. Arrow keys pan when the map is focused. S opens the symbol navigator; Escape dismisses map context. Hover symbols for their meaning, or tap to keep their card open. Use system search for keyboard selection.{space === 'wormhole' || projection !== 'physical' ? ' This topological layout does not represent physical distances. Only active connections are drawn.' : ' Borders are a map guide around sovereign systems, not a claim of control over empty space.'}</p>
    </details>
  </div>;
}

function Legend({colour, label, dashed = false, line = false}: {colour: string; label: string; dashed?: boolean; line?: boolean}) {
  return <span style={{display: 'inline-flex', gap: 6, alignItems: 'center'}}><i style={dashed || line ? {width: 19, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${colour}`} : {width: 9, height: 9, borderRadius: '50%', background: colour}}/>{label}</span>;
}
