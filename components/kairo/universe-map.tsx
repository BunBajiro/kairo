"use client";

import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {ChevronDown, Crosshair, HelpCircle, LocateFixed, Maximize2, Minus, Plus, Type} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {UniverseAtlas, UniverseBackground, UniverseIndicator, UniverseIntel, UniverseOverlay, UniverseStandingFilter, UniverseSystem} from './universe-types';
import type {ReplayMapFrame} from './session-replay';
import {projectKnownSystems, pointBounds, fitCamera, clampCamera, zoomCamera, resizeCamera, geometryRevision, paintRevision, createTerritoryGeometry, territoryComponents, territoryOwnerAt} from './universe-map-math.mjs';
import type {Geometry, TerritoryStyle} from './universe-map-math.mjs';
import './universe-map-motion.css';
import {allocateTerritoryColours, territoryColourEntities, FACTION_TERRITORY_COLOURS} from '@/lib/universe-territory-colours.mjs';
import type {TerritoryColour, TerritoryColourGroup} from '@/lib/universe-territory-colours.mjs';

type Point = {system: UniverseSystem; x: number; y: number};
type View = {x: number; y: number; scale: number};
type MapProps = {
  atlas: UniverseAtlas; intel: UniverseIntel | null;
  selectedSystemId: number | null; onSelectSystem: (id: number) => void;
  background: UniverseBackground; indicator: UniverseIndicator;
  routeSystemIds?: number[]; showConnections?: boolean; showSpecialLinks?: boolean;
  visitedSystemIds?: number[]; focusedRegionId?: number | null;
  space?: 'known' | 'wormhole'; standingFilter?: UniverseStandingFilter;
  replay?: ReplayMapFrame | null; onReplayManualPan?: () => void;
};
const PALETTE = {
  excellent: '#78acf8', good: '#76d4e9', neutral: '#9ba4b0', bad: '#edb071', terrible: '#eb7984', unknown: '#606d7d',
};
const INDICATOR_LABELS: Record<UniverseIndicator, string> = {
  none: 'No indicators', ship_kills: 'Ship kills', pod_kills: 'Pod kills', npc_kills: 'NPC kills', jumps: 'Gate jumps',
  mining: 'Your mining ledger', industry: 'Manufacturing cost index', fw: 'Faction warfare', incursions: 'Incursions', visits: 'Your visits',
};
const LAYERS: Record<UniverseBackground, string> = {power_blocs: 'Power blocs', sovereignty: 'Sovereignty', standings: 'Pilot standings', security: 'Security status', activity: 'Ship & pod kills', none: 'Unshaded'};
const EMPTY: number[] = [];
// Decorative, deterministic backdrop only. These tiny low-contrast marks are not map systems.
const AMBIENT_STARS = Array.from({length: 92}, (_, i) => ({x: ((i * 137.508 + 19) % 1000), y: ((i * i * 19.31 + i * 7.7 + 13) % 680), r: i % 9 === 0 ? .75 : .4}));
function motionAllowed() {return !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;}

function securityColour(security: number): string {return security >= .45 ? '#85dcb5' : security > 0 ? '#dfb975' : '#d68092';}
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
    case 'visits': return Number(overlay.visits || 0);
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
  if (indicator === 'visits') return overlay?.visits || 0;
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
  return {colour: paint?.fill || '#77879a', outlineColour: paint?.outline, key, strength: id ? 1 : 0, name: sov?.alliance_name || sov?.faction_name || sov?.corporation_name, source: layer === 'power_blocs' ? bloc?.source || 'unassigned' : 'sovereignty'};
}

function activeLink(link: NonNullable<UniverseIntel['links']>[number]) {
  return link.enabled !== false && link.active !== false && !link.expired && (!link.expires_at || Date.parse(link.expires_at) > Date.now());
}

/** A stable discovery graph: only observed/pinned systems and explicit links enter J-space. */
function discoveryPoints(atlas: UniverseAtlas, intel: UniverseIntel | null, selectedSystemId: number | null = null, replay?: ReplayMapFrame | null): Point[] {
  const systems = new Map(atlas.systems.map(system => [system.system_id, system])), discovered = new Set<number>();
  if (replay) {
    for (const id of replay.discoveredSystemIds) if (systems.get(id)?.space === 'wormhole') discovered.add(id);
  }
  if (systems.get(selectedSystemId || 0)?.space === 'wormhole') discovered.add(selectedSystemId!);
  if (!replay) {
  for (const pin of intel?.pins || []) if (systems.get(Number(pin.system_id))?.space === 'wormhole') discovered.add(Number(pin.system_id));
  for (const visited of intel?.journey?.systems || []) if (systems.get(Number(visited.system_id))?.space === 'wormhole') discovered.add(Number(visited.system_id));
  if (intel?.location?.system_id && systems.get(intel.location.system_id)?.space === 'wormhole') discovered.add(intel.location.system_id);
  }
  const edges = replay ? replay.allTravel.filter(link => systems.get(link.from_system_id)?.space === 'wormhole' || systems.get(link.to_system_id)?.space === 'wormhole') : (intel?.links || []).filter(link => link.kind === 'wormhole' && activeLink(link));
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

export function UniverseMap({atlas, intel, selectedSystemId, onSelectSystem, background, indicator, routeSystemIds = EMPTY, showConnections = true, showSpecialLinks = true, visitedSystemIds = EMPTY, focusedRegionId, space = 'known', standingFilter = 'all', replay = null, onReplayManualPan}: MapProps) {
  const helpId = useId(), wrapper = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({x: 0, y: 0, scale: 1}), dimensions = useRef({width: 900, height: 570, dpr: 1});
  const pendingFrame = useRef<number | null>(null), paintRef = useRef<() => void>(() => {});
  const cameraFrame = useRef<number | null>(null), cameraTarget = useRef<View | null>(null);
  const cameraOwner = useRef<'user' | 'replay' | null>(null);
  const atmosphere = useRef<HTMLDivElement>(null), acquisition = useRef<HTMLDivElement>(null);
  const sceneAnimation = useRef<Animation | null>(null);

  const territory = useRef<ReturnType<typeof createTerritories> | null>(null);
  const geometryCache = useRef<{key: string; geometry: Geometry} | null>(null);
  const lastTerritoryKey = useRef('');
  const pointer = useRef<{id: number; x: number; y: number; originX: number; originY: number; moved: boolean} | null>(null);
  const hoveredRef = useRef<number | null>(null), [hovered, setHovered] = useState<number | null>(null);
  const [labels, setLabels] = useState(true), [zoom, setZoom] = useState(1), [dragging, setDragging] = useState(false);
  const baseScale = useRef(1), overlays = useMemo(() => new Map((intel?.systems || []).map(value => [value.system_id, value])), [intel?.systems]);
  const territoryPalette = useMemo<ReadonlyMap<string, TerritoryColour>>(() => {
    if (intel?.politics?.territory_colours) return new Map(Object.entries(intel.politics.territory_colours as Record<string, TerritoryColour>));
    // One complete roster serves the whole view; changing filters or space never reallocates colour.
    const groups = new Map<string, TerritoryColourGroup>((intel?.politics?.groups || []).map((group: TerritoryColourGroup) => [group.id, group]));
    for (const overlay of intel?.systems || []) {const bloc = overlay.power_bloc; if (bloc?.group_id && !groups.has(bloc.group_id)) groups.set(bloc.group_id, {id: bloc.group_id, color: bloc.color, source: bloc.source, name: bloc.name});}
    return allocateTerritoryColours(territoryColourEntities((intel?.systems || []).flatMap(overlay => overlay.sovereignty ? [overlay.sovereignty] : []), [...groups.values()]));
  }, [intel?.politics?.territory_colours, intel?.politics?.groups, intel?.systems]);
  const knownPoints = useMemo(() => projectKnownSystems(atlas.systems), [atlas.systems]);
  const allPoints = useMemo(() => space === 'known' ? knownPoints : discoveryPoints(atlas, intel, selectedSystemId, replay), [knownPoints, space, space === 'wormhole' ? intel : null, space === 'wormhole' ? selectedSystemId : null, space === 'wormhole' ? replay?.discoveredSystemIds : null, space === 'wormhole' ? replay?.allTravel : null]);
  const geometryPoints = useMemo(() => allPoints.map(point => ({id: point.system.system_id, x: point.x, y: point.y})), [allPoints]);
  const geometryKey = useMemo(() => geometryRevision(geometryPoints), [geometryPoints]);
  const points = allPoints;
  const bounds = useMemo(() => {const matching = focusedRegionId ? allPoints.filter(point => point.system.region_id === focusedRegionId) : allPoints; return pointBounds(matching.length ? matching : allPoints);}, [allPoints, focusedRegionId]);
  const boundsRef = useRef(bounds); boundsRef.current = bounds;
  const fittedScope = useRef({geometryKey, focusedRegionId});
  const territoryStyles = useMemo(() => allPoints.map(point => ({...layerStyle(point, overlays.get(point.system.system_id), background, territoryPalette), dim: !passesStanding(overlays.get(point.system.system_id), standingFilter) || Boolean(focusedRegionId && focusedRegionId !== point.system.region_id)})), [allPoints, overlays, background, standingFilter, focusedRegionId, territoryPalette]);
  const territoryKey = useMemo(() => `${geometryKey}#${background}#${paintRevision(territoryStyles)}`, [geometryKey, background, territoryStyles]);
  const byId = useMemo(() => new Map(points.map(point => [point.system.system_id, point])), [points]);
  const regionPoints = useMemo(() => {
    const groups = new Map<number, {name: string; x: number; y: number; count: number}>();
    for (const point of points) {const id = point.system.region_id, group = groups.get(id) || {name: point.system.region_name, x: 0, y: 0, count: 0}; group.x += point.x; group.y += point.y; group.count++; groups.set(id, group);}
    return [...groups].map(([id, group]) => ({id, ...group, x: group.x / group.count, y: group.y / group.count}));
  }, [points]);
  const visits = useMemo(() => new Set(replay?.trailSystemIds || visitedSystemIds), [visitedSystemIds, replay?.trailSystemIds]);
  const pins = useMemo(() => new Set<number>((replay ? [] : intel?.pins || []).map(pin => Number(pin.system_id)).filter(Number.isFinite)), [intel?.pins, Boolean(replay)]);
  const route = useMemo(() => new Set(routeSystemIds), [routeSystemIds]);
  const indicatorMax = useMemo(() => Math.max(1, ...points.map(point => indicatorValue(overlays.get(point.system.system_id), indicator))), [points, overlays, indicator]);

  const redraw = useCallback(() => {
    if (document.hidden || pendingFrame.current !== null || cameraFrame.current !== null) return;
    pendingFrame.current = requestAnimationFrame(() => {pendingFrame.current = null; paintRef.current();});
  }, []);
  const updateZoom = useCallback(() => setZoom(view.current.scale / baseScale.current), []);
  const cancelCameraMotion = useCallback(() => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null; cameraTarget.current = null; cameraOwner.current = null;
  }, []);
  const animateCamera = useCallback((destination: View, duration = 480, owner: 'user' | 'replay' = 'user') => {
    cancelCameraMotion();
    const current = {...view.current}, target = clampCamera(destination, boundsRef.current, dimensions.current);
    // Controls reflect the requested scale immediately, so a quick opposite action stays available.
    setZoom(target.scale / baseScale.current);
    if (!duration || !motionAllowed() || Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.scale - current.scale) < .001) {
      view.current = target; redraw(); return;
    }
    if (pendingFrame.current !== null) {cancelAnimationFrame(pendingFrame.current); pendingFrame.current = null;}
    cameraTarget.current = target; cameraOwner.current = owner;
    const started = performance.now();
    const advance = (now: number) => {
      if (document.hidden) {view.current = target; cameraTarget.current = null; cameraFrame.current = null; cameraOwner.current = null; return;}
      const progress = Math.min(1, (now - started) / duration), eased = 1 - (1 - progress) ** 3;
      // Interpolating all three coordinates with one easing curve preserves the wheel anchor.
      view.current = {x: current.x + (target.x - current.x) * eased, y: current.y + (target.y - current.y) * eased, scale: current.scale + (target.scale - current.scale) * eased};
      paintRef.current();
      if (progress < 1) cameraFrame.current = requestAnimationFrame(advance);
      else {cameraFrame.current = null; cameraTarget.current = null; cameraOwner.current = null; updateZoom();}
    };
    cameraFrame.current = requestAnimationFrame(advance);
  }, [cancelCameraMotion, redraw, updateZoom]);
  const manualMovement = useCallback(() => {cancelCameraMotion(); updateZoom(); if (replay) onReplayManualPan?.();}, [cancelCameraMotion, updateZoom, Boolean(replay), onReplayManualPan]);
  const fit = useCallback((smooth = false) => {
    const target = fitCamera(boundsRef.current, dimensions.current);
    baseScale.current = target.scale; animateCamera(target, smooth ? 650 : 0);
  }, [animateCamera]);
  const fitRef = useRef(fit); fitRef.current = fit;
  const constrainView = useCallback(() => {view.current = clampCamera(view.current, boundsRef.current, dimensions.current);}, []);
  const zoomAt = useCallback((factor: number, x = dimensions.current.width / 2, y = dimensions.current.height / 2, duration = 480) => {
    const previousTarget = cameraTarget.current || view.current;
    manualMovement();
    animateCamera(zoomCamera(previousTarget, factor, {x, y}, boundsRef.current, dimensions.current), duration);
  }, [animateCamera, manualMovement]);
  const focusSystem = useCallback((id: number | null | undefined, magnify = true) => {
    const point = id ? byId.get(id) : undefined; if (!point) return;
    const {width, height} = dimensions.current, scale = magnify ? Math.max(view.current.scale, Math.min(7, baseScale.current * 8)) : view.current.scale;
    animateCamera({x: width / 2 - point.x * scale, y: height / 2 - point.y * scale, scale}, 760);
  }, [byId, animateCamera]);

  useEffect(() => {
    const element = wrapper.current; if (!element) return;
    let initial = true;
    const resize = () => {
      const rect = element.getBoundingClientRect(), prior = dimensions.current;
      dimensions.current = {width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: Math.min(2, window.devicePixelRatio || 1)};
      if (canvas.current) {canvas.current.width = Math.round(dimensions.current.width * dimensions.current.dpr); canvas.current.height = Math.round(dimensions.current.height * dimensions.current.dpr);}
      if (initial) {initial = false; fitRef.current();}
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
  useEffect(() => {
    if (space !== 'known' || background === 'none' || replay) {territory.current = null; lastTerritoryKey.current = ''; redraw(); return;}
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
  }, [territoryKey, geometryKey, space, background, Boolean(replay), redraw]);
  useEffect(() => {
    if (!selectedSystemId || replay) return;
    const point = byId.get(selectedSystemId); if (!point) return;
    const x = point.x * view.current.scale + view.current.x, y = point.y * view.current.scale + view.current.y;
    if (x < 35 || y < 35 || x > dimensions.current.width - 35 || y > dimensions.current.height - 35) focusSystem(selectedSystemId, false);
    redraw();
  }, [selectedSystemId, byId, focusSystem, redraw, Boolean(replay)]);
  useEffect(() => {
    if (!replay) return;
    if (!replay.follow || !replay.systemId) {if (cameraOwner.current === 'replay') cancelCameraMotion(); return;}
    const point = byId.get(replay.systemId); if (!point) return;
    const {width, height} = dimensions.current, scale = Math.max(view.current.scale, Math.min(3.5, baseScale.current * 7));
    animateCamera({x: width / 2 - point.x * scale, y: height / 2 - point.y * scale, scale}, replay.smooth ? 700 : 0, 'replay');
    return () => {if (cameraOwner.current === 'replay') cancelCameraMotion();};
  }, [replay?.focusKey, replay?.follow, geometryKey, cancelCameraMotion, animateCamera]);
  useEffect(() => {
    const element = canvas.current;
    sceneAnimation.current?.cancel();
    if (element && motionAllowed()) sceneAnimation.current = element.animate([{opacity: .3}, {opacity: 1}], {duration: 440, easing: 'cubic-bezier(.2,.7,.2,1)'});
    return () => {sceneAnimation.current?.cancel(); sceneAnimation.current = null;};
  }, [background, space]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stopMotion = () => {
      const target = cameraTarget.current;
      cancelCameraMotion(); if (target) view.current = target;
      if (pendingFrame.current !== null) {cancelAnimationFrame(pendingFrame.current); pendingFrame.current = null;}
      sceneAnimation.current?.cancel();
      wrapper.current?.getAnimations({subtree: true}).forEach(animation => animation.cancel());
      updateZoom();
    };
    const visibility = () => {if (document.hidden) stopMotion(); else redraw();};
    const reduced = () => {if (preference.matches) {stopMotion(); redraw();}};
    document.addEventListener('visibilitychange', visibility); preference.addEventListener('change', reduced);
    return () => {document.removeEventListener('visibilitychange', visibility); preference.removeEventListener('change', reduced); cancelCameraMotion(); if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current); sceneAnimation.current?.cancel();};
  }, [cancelCameraMotion, redraw, updateZoom]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const wheel = (event: WheelEvent) => {event.preventDefault(); const rect = element.getBoundingClientRect(); zoomAt(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .004), event.clientX - rect.left, event.clientY - rect.top, 360);};
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  useEffect(() => () => {if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current); cancelCameraMotion();}, [cancelCameraMotion]);

  paintRef.current = () => {
    if (document.hidden) return;
    const context = canvas.current?.getContext('2d'); if (!context) return;
    const {width, height, dpr} = dimensions.current, camera = view.current;
    const screen = (point: Point) => ({x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y});
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    // Atmospheric depth is static at rest and composited separately from the crisp data canvas.
    if (atmosphere.current) atmosphere.current.style.transform = `translate3d(${Math.max(-24, Math.min(24, camera.x * .012))}px, ${Math.max(-18, Math.min(18, camera.y * .012))}px, 0)`;
    const acquiredPoint = byId.get((replay ? replay.systemId : selectedSystemId) || 0);
    if (acquisition.current) {
      const p = acquiredPoint ? screen(acquiredPoint) : null;
      acquisition.current.style.visibility = p && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height ? 'visible' : 'hidden';
      if (p) acquisition.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    }
    const field = !replay && space === 'known' && background !== 'none' ? territory.current : null;
    if (field) {
      context.save(); context.translate(camera.x, camera.y); context.scale(camera.scale, camera.scale);
      for (const {style, fill, border} of field.groups) {
        context.fillStyle = style.colour; context.globalAlpha = (style.dim ? .025 : .14) * style.strength; context.fill(fill);
        context.strokeStyle = style.outlineColour || style.colour; context.globalAlpha = style.dim ? .07 : .57;
        context.lineWidth = .85 / camera.scale; context.lineJoin = 'round';
        context.setLineDash(style.source === 'inferred' ? [5 / camera.scale, 4 / camera.scale] : []); context.stroke(border);
      }
      context.restore();
    }
    const visible = points.filter(point => {const p = screen(point); return p.x > -35 && p.x < width + 35 && p.y > -35 && p.y < height + 35;});
    if (showConnections && space === 'known') {
      context.strokeStyle = camera.scale > 2 ? '#8391a539' : '#8391a521'; context.lineWidth = .65; context.beginPath();
      for (const gate of atlas.gates) {const from = byId.get(gate.from_system_id), to = byId.get(gate.to_system_id); if (!from || !to) continue; const a = screen(from), b = screen(to); if ((a.x < 0 && b.x < 0) || (a.y < 0 && b.y < 0) || (a.x > width && b.x > width) || (a.y > height && b.y > height)) continue; context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();
    }
    if (showSpecialLinks && !replay) for (const link of intel?.links || []) {
      if (!activeLink(link) || (space === 'wormhole' && link.kind !== 'wormhole')) continue;
      const from = byId.get(link.from_system_id), to = byId.get(link.to_system_id); if (!from || !to) continue;
      const a = screen(from), b = screen(to); context.strokeStyle = link.kind === 'wormhole' ? '#c1a0ebad' : '#80dddead'; context.setLineDash(link.kind === 'wormhole' ? [3, 5] : [7, 4]); context.lineWidth = 1.35; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    context.setLineDash([]);
    if (replay) {
      context.strokeStyle = '#e1bb87a3'; context.lineWidth = 1.6; context.setLineDash([3, 5]); context.beginPath();
      for (const edge of replay.travel) {const from = byId.get(edge.from_system_id), to = byId.get(edge.to_system_id); if (!from || !to) continue; const a = screen(from), b = screen(to); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke(); context.setLineDash([]);
      for (const id of replay.eventSystemIds) {const point = byId.get(id); if (!point) continue; const p = screen(point); context.strokeStyle = '#e6a6cb'; context.lineWidth = 1.2; context.strokeRect(p.x - 12, p.y - 12, 24, 24);}
    }
    if (routeSystemIds.length > 1) {
      context.strokeStyle = '#a4f1d4'; context.lineWidth = 2; context.beginPath();
      for (let i = 1; i < routeSystemIds.length; i++) {const from = byId.get(routeSystemIds[i - 1]), to = byId.get(routeSystemIds[i]); if (!from || !to) continue; const a = screen(from), b = screen(to); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();
    }
    if (indicator !== 'none') for (const point of visible) {
      const value = indicatorValue(overlays.get(point.system.system_id), indicator); if (!value) continue;
      const p = screen(point), intensity = Math.log1p(value) / Math.log1p(indicatorMax), radius = 3 + intensity * 12;
      context.fillStyle = indicator === 'visits' ? '#93e4c726' : indicator === 'jumps' || indicator === 'industry' ? '#85b9f22c' : '#e99e7930';
      context.strokeStyle = indicator === 'visits' ? '#93e4c755' : indicator === 'jumps' || indicator === 'industry' ? '#85b9f255' : '#e99e7960';
      context.lineWidth = .7; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
    }
    const occupied: {left: number; top: number; right: number; bottom: number}[] = [];
    const claimLabel = (x: number, y: number, textWidth: number, fontHeight: number) => {
      const rect = {left: x - 8, top: y - fontHeight - 5, right: x + textWidth + 8, bottom: y + 5};
      if (rect.left < 4 || rect.right > width - 4 || rect.top < 62 || rect.bottom > height - 4 || occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)) return false;
      occupied.push(rect); return true;
    };
    const systemLabels: {name: string; x: number; y: number; priority: number; dim: boolean}[] = [];
    context.textAlign = 'left';
    for (const point of visible) {
      const id = point.system.system_id, p = screen(point), overlay = overlays.get(id), active = id === selectedSystemId, hover = id === hoveredRef.current, current = id === (replay ? replay.systemId : intel?.location?.system_id);
      const highlighted = active || hover || current || route.has(id), dim = !highlighted && (!passesStanding(overlay, standingFilter) || Boolean(focusedRegionId && point.system.region_id !== focusedRegionId));
      context.globalAlpha = dim ? .16 : 1;
      const colour = point.system.security_known === false ? '#718397' : background === 'none' || background === 'activity' ? securityColour(point.system.security) : layerStyle(point, overlay, background === 'power_blocs' ? 'sovereignty' : background, territoryPalette).colour;
      const radius = highlighted ? 3.8 : Math.max(1.25, Math.min(2.6, camera.scale * .45));
      context.fillStyle = highlighted ? '#d2fae9' : colour; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill();
      if (active || current || hover || visits.has(id) || pins.has(id)) {
        context.strokeStyle = current ? '#f2cb8b' : pins.has(id) ? '#bea3e8' : active || hover ? '#abf1d7' : '#89ceb78c'; context.lineWidth = active || current ? 1.6 : .8; context.beginPath(); context.arc(p.x, p.y, active || current ? 8 : 5.5, 0, Math.PI * 2); context.stroke();
        if (current) {context.beginPath(); context.moveTo(p.x - 12, p.y); context.lineTo(p.x - 9, p.y); context.moveTo(p.x + 9, p.y); context.lineTo(p.x + 12, p.y); context.moveTo(p.x, p.y - 12); context.lineTo(p.x, p.y - 9); context.moveTo(p.x, p.y + 9); context.lineTo(p.x, p.y + 12); context.stroke();}
      }
      if (active || hover || current || (labels && (space === 'wormhole' || camera.scale > 5 || (camera.scale > 2.8 && visible.length < 180)))) {
        systemLabels.push({name: point.system.name, x: p.x, y: p.y, priority: active ? 4 : current ? 3 : hover ? 2 : highlighted ? 1 : 0, dim});
      }
    }
    context.globalAlpha = 1;
    for (const label of systemLabels.sort((a, b) => b.priority - a.priority)) {
      const fontSize = label.priority ? 16 : 14;
      context.font = `${label.priority ? '600 ' : ''}${fontSize}px "Cascadia Code", Consolas, monospace`;
      const textWidth = context.measureText(label.name).width;
      const placements = [{x: label.x + 10, y: label.y - 8}, {x: label.x + 10, y: label.y + 20}, {x: label.x - textWidth - 10, y: label.y - 8}, {x: label.x - textWidth - 10, y: label.y + 20}];
      const placement = placements.find(position => claimLabel(position.x, position.y, textWidth, fontSize)); if (!placement) continue;
      context.globalAlpha = label.dim ? .4 : 1; context.strokeStyle = '#0b1119'; context.lineWidth = 4; context.strokeText(label.name, placement.x, placement.y); context.fillStyle = label.priority ? '#e7fff5' : '#cad9e8'; context.fillText(label.name, placement.x, placement.y);
    }
    context.globalAlpha = 1;
    if (labels && field && (background === 'sovereignty' || background === 'power_blocs')) {
      context.font = '600 16px "Cascadia Code", Consolas, monospace';
      for (const label of field.labels) {
        if (label.count < 3) continue;
        const text = label.name || '', textWidth = context.measureText(text).width;
        for (const candidate of label.candidates) {
          const x = candidate.x * camera.scale + camera.x - textWidth / 2, y = candidate.y * camera.scale + camera.y - 8;
          // Check the label footprint, not just a centroid: pockets and enclaves keep their own names.
          const fits = [-1, 0, 1].every(dx => [-1, 1].every(dy => {
            const owner = territoryOwnerAt(field.geometry, candidate.x + dx * (textWidth / 2 + 3) / camera.scale, candidate.y + (-16 + dy * 9) / camera.scale);
            return owner >= 0 && field.styles[owner].key === label.key && !field.styles[owner].dim;
          }));
          if (!fits || !claimLabel(x, y, textWidth, 16)) continue;
          context.strokeStyle = '#0b1119'; context.lineWidth = 4; context.strokeText(text, x, y);
          context.fillStyle = '#e1edf5'; context.fillText(text, x, y); break;
        }
      }
    }
    if (labels && space === 'known' && (background !== 'power_blocs' && background !== 'sovereignty' || camera.scale > 1.7)) {
      context.font = '14px "Cascadia Code", Consolas, monospace';
      const limit = width < 500 && camera.scale < 1.2 ? 9 : width < 800 && camera.scale < .9 ? 16 : 45;
      let drawn = 0;
      for (const region of [...regionPoints].sort((a, b) => Number(b.id === focusedRegionId) - Number(a.id === focusedRegionId) || b.count - a.count)) {
        if (drawn >= limit) break;
        const text = region.name.toUpperCase(), textWidth = context.measureText(text).width;
        const x = region.x * camera.scale + camera.x - textWidth / 2, y = region.y * camera.scale + camera.y - 12;
        if ((camera.scale > 3 && region.id !== focusedRegionId) || !claimLabel(x, y, textWidth, 14)) continue;
        drawn++; context.fillStyle = region.id === focusedRegionId ? '#e0f0f5' : '#b9ccdd'; context.strokeStyle = '#0b1119'; context.lineWidth = 3;
        context.strokeText(text, x, y); context.fillText(text, x, y);
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
        context.fillStyle = '#241d32f2'; context.strokeStyle = '#af88c58c'; context.lineWidth = .8; context.fillRect(x, y, boxWidth, 59); context.strokeRect(x, y, boxWidth, 59);
        context.font = '16px "Cascadia Code", Consolas, monospace'; context.fillStyle = '#e5c6eb'; context.fillText(text, x + 11, y + 23, boxWidth - 22);
        context.font = '14px "Cascadia Code", Consolas, monospace'; context.fillStyle = '#b09bbd';
        context.fillText(caption, x + 11, y + 46, boxWidth - 22);
      }
    }
  };
  useEffect(() => {redraw();}, [atlas, byId, points, intel, background, indicator, indicatorMax, regionPoints, labels, routeSystemIds, route, showConnections, showSpecialLinks, focusedRegionId, space, visits, pins, replay, standingFilter, territoryPalette, redraw]);

  function nearest(clientX: number, clientY: number) {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return null;
    const x = clientX - rect.left, y = clientY - rect.top, current = view.current;
    let selected: number | null = null, distance = 13 * 13;
    for (const point of points) {const squared = (point.x * current.scale + current.x - x) ** 2 + (point.y * current.scale + current.y - y) ** 2; if (squared < distance) {distance = squared; selected = point.system.system_id;}}
    return selected;
  }
  const hoverPoint = hovered ? byId.get(hovered) : null;
  const selectedPoint = selectedSystemId ? byId.get(selectedSystemId) : null;
  const locationId = replay ? replay.systemId : intel?.location?.system_id;
  const hud = hoverPoint || selectedPoint;
  const hudBloc = hud && !replay ? overlays.get(hud.system.system_id)?.power_bloc : null;
  const hudBlocColour = hudBloc?.group_id && (hudBloc.source === 'configured' || hudBloc.source === 'inferred') ? territoryPalette.get(`bloc:${hudBloc.group_id}`)?.fill : hud ? layerStyle(hud, overlays.get(hud.system.system_id), 'sovereignty', territoryPalette).colour : null;
  const hudValue = hud ? reportedIndicator(overlays.get(hud.system.system_id), indicator, intel) : null;
  return <div className="universe-canvas-shell universe-map-immersive" data-map-space={space} style={{border: '1px solid #2a3542', background: '#0b1119', overflow: 'hidden'}}>
    <div className="universe-map-toolbar" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 13px', borderBottom: '1px solid #25303d', flexWrap: 'wrap'}}>
      <div className="universe-map-coordinate-title"><span>{space === 'known' ? 'New Eden' : 'J-Space'}</span><span>{points.length.toLocaleString()} systems</span></div>
      <div style={{display: 'flex', alignItems: 'center', gap: 2}}>
        <Button variant="ghost" size="icon" title="Toggle map labels" aria-label="Toggle map labels" aria-pressed={labels} onClick={() => setLabels(value => !value)}><Type size={17}/></Button>
        <Button variant="ghost" size="icon" title={replay ? 'Centre on replay location' : 'Centre on current location'} aria-label={replay ? 'Centre on replay location' : 'Centre on current location'} disabled={!locationId || !byId.has(locationId)} onClick={() => {manualMovement(); focusSystem(locationId);}}><LocateFixed size={17}/></Button>
        <Button variant="ghost" size="icon" title="Focus selected system" aria-label="Focus selected system" disabled={!selectedPoint} onClick={() => {manualMovement(); focusSystem(selectedSystemId);}}><Crosshair size={17}/></Button>
        <span style={{height: 17, width: 1, background: '#2b3948', margin: '0 5px'}}/>
        <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom <= 1.001} onClick={() => zoomAt(1 / 1.4)}><Minus size={17}/></Button>
        <span style={{fontSize: 14, fontFamily: 'var(--font-mono)', color: '#c0d0dd', width: 48, textAlign: 'center'}}>{zoom.toFixed(1)}×</span>
        <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus size={17}/></Button>
        <Button variant="ghost" size="icon" title="Fit map (Home)" aria-label="Fit map" onClick={() => {manualMovement(); fit(true);}}><Maximize2 size={17}/></Button>
      </div>
    </div>
    <div ref={wrapper} className="universe-map-viewport" style={{position: 'relative', width: '100%'}}>
      <div className="universe-map-atmosphere" ref={atmosphere} aria-hidden="true"><svg viewBox="0 0 1000 680" preserveAspectRatio="none" focusable="false">{AMBIENT_STARS.map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r}/>)}</svg></div>
      <canvas ref={canvas} role="img" tabIndex={0} aria-label={`${space === 'known' ? 'New Eden' : 'Wormhole space'} interactive map showing ${points.length.toLocaleString()} systems. ${LAYERS[background]} background. ${INDICATOR_LABELS[indicator]}.`} aria-describedby={helpId}
        style={{position: 'relative', display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: dragging ? 'grabbing' : hovered ? 'pointer' : 'grab'}}
        onKeyDown={event => {
          if (event.key === '+' || event.key === '=') {event.preventDefault(); zoomAt(1.4);} else if (event.key === '-') {event.preventDefault(); zoomAt(1 / 1.4);} else if (event.key === 'Home') {event.preventDefault(); manualMovement(); fit(true);}
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {event.preventDefault(); manualMovement(); view.current.x += event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0; view.current.y += event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0; constrainView(); redraw();}
          else if (event.key === 'Enter' && selectedSystemId) {manualMovement(); focusSystem(selectedSystemId);}
        }}
        onPointerDown={event => {if (event.button !== 0) return; pointer.current = {id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false}; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);}}
        onPointerMove={event => {
          const held = pointer.current;
          if (held && held.id === event.pointerId) {const dx = event.clientX - held.x, dy = event.clientY - held.y; if (!held.moved && Math.hypot(event.clientX - held.originX, event.clientY - held.originY) > 4) {held.moved = true; manualMovement();} held.x = event.clientX; held.y = event.clientY; view.current.x += dx; view.current.y += dy; constrainView(); redraw(); return;}
          const id = nearest(event.clientX, event.clientY); if (id !== hoveredRef.current) {hoveredRef.current = id; setHovered(id); redraw();}
        }}
        onPointerUp={event => {const held = pointer.current; if (!held || held.id !== event.pointerId) return; if (!held.moved) {const id = nearest(event.clientX, event.clientY); if (id) onSelectSystem(id);} pointer.current = null; setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);}}
        onPointerCancel={() => {pointer.current = null; setDragging(false);}}
        onLostPointerCapture={() => {pointer.current = null; setDragging(false);}}
        onPointerLeave={() => {if (!pointer.current) {hoveredRef.current = null; setHovered(null); redraw();}}}
        onDoubleClick={event => {const rect = event.currentTarget.getBoundingClientRect(); zoomAt(1.8, event.clientX - rect.left, event.clientY - rect.top);}}
      >Use the system search and system list to select a system without the visual map.</canvas>
      <div ref={acquisition} className="universe-map-acquisition-anchor" aria-hidden="true"><div key={`${space}:${replay ? replay.systemId : selectedSystemId}`} className="universe-map-acquisition"><i/><i/><i/><i/></div></div>
      {!points.length && <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#8ca2b4', fontSize: 14, padding: 30, textAlign: 'center'}}>{space === 'wormhole' && !allPoints.length ? 'Visit or pin a J-space system, or add a discovered wormhole, to build your connection map.' : 'No systems match this map filter.'}</div>}
      <div className="universe-map-layer-plaque" key={`${space}:${background}`}><span className="universe-map-layer-mark"/>{replay ? 'Session replay' : space === 'known' ? LAYERS[background] : 'Discovery graph'}{indicator !== 'none' && <span className="universe-map-indicator-tag">{INDICATOR_LABELS[indicator]}</span>}</div>
      {hud && <div className="universe-map-hud" key={hud.system.system_id}>
        <div className="universe-map-hud-heading"><strong>{hud.system.name}</strong><span className="universe-map-security-badge" style={{color: hud.system.security_known === false ? '#a2b5c8' : securityColour(hud.system.security)}}>{hud.system.security_known === false ? '?' : hud.system.security.toFixed(1)}</span>{hud.system.system_id === locationId && <span className="universe-map-location-badge">{replay ? 'Replay' : 'You are here'}</span>}</div>
        <div className="universe-map-hud-region">{hud.system.region_name}{hud.system.space === 'wormhole' && hud.system.wormhole_class ? ` · C${hud.system.wormhole_class}` : ''}</div>
        {!replay && <div className="universe-map-hud-owner">{overlays.get(hud.system.system_id)?.sovereignty?.alliance_name || overlays.get(hud.system.system_id)?.sovereignty?.faction_name || (hud.system.space === 'wormhole' ? 'Wormhole space' : 'Owner unavailable')}{background === 'power_blocs' && hudBloc && <span className="universe-map-hud-bloc"><i style={{background: hudBlocColour || '#77879a'}}/>{hudBloc.name}<span>{hudBloc.source === 'configured' ? 'Configured' : hudBloc.source === 'inferred' ? 'Inferred' : hudBloc.source === 'independent' ? 'Independent' : 'Unassigned'}</span></span>}</div>}
        {indicator !== 'none' && <div className="universe-map-hud-metric"><span>{INDICATOR_LABELS[indicator]}</span><strong>{hudValue === null ? 'Unavailable' : indicator === 'industry' ? hudValue.toFixed(2) + '%' : hudValue.toLocaleString()}</strong></div>}
      </div>}
    </div>
    <details className="universe-map-guide"><summary><HelpCircle size={17}/><span>Map key & controls</span><ChevronDown size={16}/></summary>
    <div className="universe-map-legend" style={{display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '11px 15px', borderTop: '1px solid #25303d', fontSize: 14, color: '#89a0b4'}}>
      {space === 'wormhole' ? <span>Only discovered systems and their known-space exits. Disconnected discoveries stay on the map.</span> : background === 'power_blocs' ? <><Legend colour="#b7c8d8" label="Configured bloc" line/><Legend colour="#b7c8d8" label="Inferred group" dashed/><span>Dots show actual owners · unassigned alliances remain separate.</span></> : background === 'standings' ? <><Legend colour={PALETTE.excellent} label="Excellent"/><Legend colour={PALETTE.good} label="Good"/><Legend colour={PALETTE.neutral} label="Neutral"/><Legend colour={PALETTE.bad} label="Bad"/><Legend colour={PALETTE.terrible} label="Terrible"/><Legend colour={PALETTE.unknown} label="Unknown"/></> : background === 'security' || background === 'none' ? <><Legend colour="#85dcb5" label="High security"/><Legend colour="#dfb975" label="Low security"/><Legend colour="#d68092" label="Null / wormhole"/></> : <span>{background === 'sovereignty' ? 'Colour identifies the owning alliance or faction. Borders separate neighbouring territories.' : 'Brighter shading means more reported ship and pod kills.'}</span>}
      {routeSystemIds.length > 1 && <Legend colour="#a4f1d4" label="Planned route"/>}{showSpecialLinks && !replay && <><Legend colour="#80ddde" label="Ansiblex" dashed/><Legend colour="#c1a0eb" label="Wormhole" dashed/></>}
      {replay && <><Legend colour="#e1bb87" label="Recorded transitions" dashed/><Legend colour="#e6a6cb" label="Recent recorded event"/></>}
    </div>
    {!replay && space === 'known' && (background === 'sovereignty' || background === 'power_blocs') && <div className="universe-map-empire-key">{[500001, 500004, 500003, 500002].map(id => {const faction = FACTION_TERRITORY_COLOURS[id]; return <Legend key={id} colour={faction.fill} label={faction.name}/>;})}</div>}
    <p id={helpId} className="universe-map-help">Drag to pan · scroll or +/− to zoom · Home to fit · select a system to inspect. Arrow keys pan when the map is focused. Use system search for keyboard selection.{space === 'wormhole' ? ' This topological layout does not represent physical distances. Only active connections are drawn.' : ' Borders are a map guide around sovereign systems, not a claim of control over empty space.'}</p>
    </details>
  </div>;
}

function Legend({colour, label, dashed = false, line = false}: {colour: string; label: string; dashed?: boolean; line?: boolean}) {
  return <span style={{display: 'inline-flex', gap: 6, alignItems: 'center'}}><i style={dashed || line ? {width: 19, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${colour}`} : {width: 9, height: 9, borderRadius: '50%', background: colour}}/>{label}</span>;
}
