"use client";

import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {Crosshair, LocateFixed, Maximize2, Minus, Plus, Type} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {UniverseAtlas, UniverseBackground, UniverseIndicator, UniverseIntel, UniverseOverlay, UniverseStandingFilter, UniverseSystem} from './universe-types';
import type {ReplayMapFrame} from './session-replay';

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
type RGB = [number, number, number];
const PALETTE = {
  excellent: '#78acf8', good: '#76d4e9', neutral: '#9ba4b0', bad: '#edb071', terrible: '#eb7984', unknown: '#606d7d',
};
const INDICATOR_LABELS: Record<UniverseIndicator, string> = {
  none: 'No indicators', ship_kills: 'Ship kills', pod_kills: 'Pod kills', npc_kills: 'NPC kills', jumps: 'Gate jumps',
  mining: 'Your mining ledger', industry: 'Manufacturing cost index', fw: 'Faction warfare', incursions: 'Incursions', visits: 'Your visits',
};
const LAYERS: Record<UniverseBackground, string> = {sovereignty: 'Sovereignty', standings: 'Pilot standings', security: 'Security status', activity: 'Ship & pod kills', none: 'Unshaded'};
const EMPTY: number[] = [];
const RGB_CACHE = new Map<string, RGB>();
function rgb(hex: string): RGB {
  let result = RGB_CACHE.get(hex);
  if (!result) {result = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; RGB_CACHE.set(hex, result);}
  return result;
}
function ownerColour(id: number): string {
  // Stable colours across sessions and filters. Coordinates always come from the SDE.
  const hue = ((id * 137.508) % 360) / 60, chroma = 0.43, minimum = 0.32;
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const values = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return '#' + values.map(v => Math.round((v + minimum) * 255).toString(16).padStart(2, '0')).join('');
}
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
function layerStyle(point: Point, overlay: UniverseOverlay | undefined, layer: UniverseBackground): {colour: string; key: string; strength: number} {
  if (layer === 'standings') {const label = standingLabel(overlay); return {colour: PALETTE[label], key: label, strength: label === 'unknown' ? .25 : 1};}
  if (layer === 'security' && point.system.security_known === false) return {colour: '#718397', key: 'unknown', strength: .25};
  if (layer === 'security') return {colour: securityColour(point.system.security), key: point.system.security >= .45 ? 'high' : point.system.security > 0 ? 'low' : 'null', strength: .8};
  if (layer === 'activity') {
    const value = Number(overlay?.kills?.ship_kills || 0) + Number(overlay?.kills?.pod_kills || 0);
    return {colour: value > 20 ? '#ed7e87' : '#eaba79', key: 'activity', strength: value ? Math.min(1.5, .25 + Math.log1p(value) / 4) : 0};
  }
  const sov = overlay?.sovereignty;
  const id = sov?.alliance_id || sov?.faction_id || sov?.corporation_id;
  return {colour: id ? ownerColour(id) : '#77879a', key: id ? `${sov?.alliance_id ? 'a' : sov?.faction_id ? 'f' : 'c'}${id}` : 'unknown', strength: id ? 1 : .16};
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

/** Cached low-resolution influence field. Rebuilt for data/layer changes, never for camera movement. */
function createTerritories(points: Point[], overlays: Map<number, UniverseOverlay>, layer: UniverseBackground) {
  if (!points.length || layer === 'none') return null;
  const padding = 40, minX = Math.min(...points.map(p => p.x)) - padding, minY = Math.min(...points.map(p => p.y)) - padding;
  const width = Math.max(...points.map(p => p.x)) - minX + padding, height = Math.max(...points.map(p => p.y)) - minY + padding;
  const ratio = 780 / Math.max(width, height), canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * ratio)); canvas.height = Math.max(1, Math.ceil(height * ratio));
  const context = canvas.getContext('2d'); if (!context) return null;
  const pixels = context.createImageData(canvas.width, canvas.height), owners = new Int32Array(canvas.width * canvas.height).fill(-1);
  const styles = points.map(point => {const style = layerStyle(point, overlays.get(point.system.system_id), layer); return {...style, rgb: rgb(style.colour)};});
  const radius = 32 * ratio, radiusSquared = radius * radius, distances = new Float32Array(owners.length).fill(radiusSquared);
  // Splat each system into its small pixel neighbourhood. This avoids millions
  // of hash lookups or a systems × whole-image nearest-neighbour scan.
  points.forEach((point, index) => {
    const cx = (point.x - minX) * ratio, cy = (point.y - minY) * ratio;
    const left = Math.max(0, Math.floor(cx - radius)), right = Math.min(canvas.width - 1, Math.ceil(cx + radius));
    const top = Math.max(0, Math.floor(cy - radius)), bottom = Math.min(canvas.height - 1, Math.ceil(cy + radius));
    for (let y = top; y <= bottom; y++) {
      const vertical = (y - cy) ** 2, row = y * canvas.width;
      for (let x = left; x <= right; x++) {const squared = (x - cx) ** 2 + vertical, pixel = row + x; if (squared < distances[pixel]) {distances[pixel] = squared; owners[pixel] = index;}}
    }
  });
  for (let index = 0; index < owners.length; index++) {
    const nearest = owners[index]; if (nearest < 0) continue;
    const offset = index * 4, style = styles[nearest];
    pixels.data[offset] = style.rgb[0]; pixels.data[offset + 1] = style.rgb[1]; pixels.data[offset + 2] = style.rgb[2];
    pixels.data[offset + 3] = Math.round(66 * style.strength * (1 - distances[index] / radiusSquared) ** 2);
  }
  if (layer !== 'activity') for (let y = 1; y < canvas.height; y++) for (let x = 1; x < canvas.width; x++) {
    const index = y * canvas.width + x, point = owners[index]; if (point < 0 || styles[point].key === 'unknown') continue;
    const above = owners[index - canvas.width], left = owners[index - 1];
    if ((above >= 0 && styles[above].key !== styles[point].key) || (left >= 0 && styles[left].key !== styles[point].key)) pixels.data[index * 4 + 3] = Math.min(130, pixels.data[index * 4 + 3] * 2);
  }
  context.putImageData(pixels, 0, 0);
  return {canvas, x: minX, y: minY, width, height};
}

export function UniverseMap({atlas, intel, selectedSystemId, onSelectSystem, background, indicator, routeSystemIds = EMPTY, showConnections = true, showSpecialLinks = true, visitedSystemIds = EMPTY, focusedRegionId, space = 'known', standingFilter = 'all', replay = null, onReplayManualPan}: MapProps) {
  const helpId = useId(), wrapper = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({x: 0, y: 0, scale: 1}), dimensions = useRef({width: 900, height: 570, dpr: 1});
  const pendingFrame = useRef<number | null>(null), paintRef = useRef<() => void>(() => {});
  const cameraFrame = useRef<number | null>(null);
  const territory = useRef<ReturnType<typeof createTerritories>>(null);
  const pointer = useRef<{id: number; x: number; y: number; originX: number; originY: number; moved: boolean} | null>(null);
  const hoveredRef = useRef<number | null>(null), [hovered, setHovered] = useState<number | null>(null);
  const [labels, setLabels] = useState(true), [zoom, setZoom] = useState(1), [dragging, setDragging] = useState(false);
  const baseScale = useRef(1), overlays = useMemo(() => new Map((intel?.systems || []).map(value => [value.system_id, value])), [intel?.systems]);
  const allPoints = useMemo(() => {
    if (space === 'wormhole') return discoveryPoints(atlas, intel, selectedSystemId, replay);
    const systems = atlas.systems.filter(system => system.space === space && Number.isFinite(system.map_x) && Number.isFinite(system.map_y));
    if (!systems.length) return [];
    const minX = Math.min(...systems.map(s => s.map_x)), maxX = Math.max(...systems.map(s => s.map_x)), minY = Math.min(...systems.map(s => s.map_y)), maxY = Math.max(...systems.map(s => s.map_y));
    const scale = 1000 / Math.max(1, maxX - minX, maxY - minY);
    return systems.map(system => ({system, x: (system.map_x - minX) * scale, y: (system.map_y - minY) * scale}));
  }, [atlas.systems, space, intel?.pins, intel?.links, intel?.journey?.systems, intel?.location?.system_id, space === 'wormhole' ? selectedSystemId : null, replay?.discoveredSystemIds, replay?.allTravel]);
  const geometryKey = useMemo(() => allPoints.map(point => `${point.system.system_id}:${point.x}:${point.y}`).join('|'), [allPoints]);
  const points = useMemo(() => allPoints.filter(point => passesStanding(overlays.get(point.system.system_id), standingFilter)), [allPoints, overlays, standingFilter]);
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
    if (pendingFrame.current !== null) return;
    pendingFrame.current = requestAnimationFrame(() => {pendingFrame.current = null; paintRef.current();});
  }, []);
  const cancelCameraMotion = useCallback(() => {if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current); cameraFrame.current = null;}, []);
  const manualMovement = useCallback(() => {cancelCameraMotion(); if (replay) onReplayManualPan?.();}, [cancelCameraMotion, Boolean(replay), onReplayManualPan]);
  const updateZoom = useCallback(() => setZoom(view.current.scale / baseScale.current), []);
  const fit = useCallback(() => {
    const matching = focusedRegionId ? points.filter(point => point.system.region_id === focusedRegionId) : points;
    const fitted = matching.length ? matching : allPoints; if (!fitted.length) {redraw(); return;}
    const minX = Math.min(...fitted.map(p => p.x)), maxX = Math.max(...fitted.map(p => p.x)), minY = Math.min(...fitted.map(p => p.y)), maxY = Math.max(...fitted.map(p => p.y));
    const {width, height} = dimensions.current, scale = Math.min(Math.max(80, width - 110) / Math.max(20, maxX - minX), Math.max(80, height - 120) / Math.max(20, maxY - minY));
    view.current = {x: width / 2 - (minX + maxX) / 2 * scale, y: height / 2 - (minY + maxY) / 2 * scale, scale};
    baseScale.current = scale; updateZoom(); redraw();
  }, [allPoints, points, focusedRegionId, redraw, updateZoom]);
  const fitRef = useRef(fit); fitRef.current = fit;
  const zoomAt = useCallback((factor: number, x = dimensions.current.width / 2, y = dimensions.current.height / 2) => {
    manualMovement();
    const current = view.current, next = Math.max(baseScale.current * .35, Math.min(baseScale.current * 75, current.scale * factor));
    const ratio = next / current.scale;
    view.current = {x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio, scale: next}; updateZoom(); redraw();
  }, [redraw, updateZoom, manualMovement]);
  const focusSystem = useCallback((id: number | null | undefined, magnify = true) => {
    const point = id ? byId.get(id) : undefined; if (!point) return;
    const {width, height} = dimensions.current, scale = magnify ? Math.max(view.current.scale, Math.min(7, baseScale.current * 8)) : view.current.scale;
    view.current = {x: width / 2 - point.x * scale, y: height / 2 - point.y * scale, scale}; updateZoom(); redraw();
  }, [byId, redraw, updateZoom]);

  useEffect(() => {
    const element = wrapper.current; if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect(), prior = dimensions.current;
      dimensions.current = {width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: Math.min(2, window.devicePixelRatio || 1)};
      if (canvas.current) {canvas.current.width = Math.round(dimensions.current.width * dimensions.current.dpr); canvas.current.height = Math.round(dimensions.current.height * dimensions.current.dpr);}
      if (prior.width === 900 && prior.height === 570) fitRef.current();
      else {view.current.x += (dimensions.current.width - prior.width) / 2; view.current.y += (dimensions.current.height - prior.height) / 2; redraw();}
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, [redraw]);
  useEffect(() => {fitRef.current();}, [geometryKey, focusedRegionId, standingFilter]);
  useEffect(() => {
    territory.current = null; redraw();
    const timer = window.setTimeout(() => {territory.current = space === 'known' ? createTerritories(points, overlays, background) : null; redraw();}, 0);
    return () => window.clearTimeout(timer);
  }, [points, overlays, background, space, redraw]);
  useEffect(() => {
    if (!selectedSystemId || replay) return;
    const point = byId.get(selectedSystemId); if (!point) return;
    const x = point.x * view.current.scale + view.current.x, y = point.y * view.current.scale + view.current.y;
    if (x < 35 || y < 35 || x > dimensions.current.width - 35 || y > dimensions.current.height - 35) focusSystem(selectedSystemId, false);
    redraw();
  }, [selectedSystemId, byId, focusSystem, redraw, Boolean(replay)]);
  useEffect(() => {
    cancelCameraMotion();
    if (!replay?.follow || !replay.systemId) return;
    const point = byId.get(replay.systemId); if (!point) return;
    const {width, height} = dimensions.current, current = {...view.current};
    const scale = Math.max(current.scale, Math.min(3.5, baseScale.current * 7));
    const target = {x: width / 2 - point.x * scale, y: height / 2 - point.y * scale, scale};
    if (!replay.smooth || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {view.current = target; updateZoom(); redraw(); return;}
    const started = performance.now(), duration = 700;
    const advance = (now: number) => {
      const progress = Math.min(1, (now - started) / duration), eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      view.current = {x: current.x + (target.x - current.x) * eased, y: current.y + (target.y - current.y) * eased, scale: current.scale + (target.scale - current.scale) * eased};
      paintRef.current();
      if (progress < 1) cameraFrame.current = requestAnimationFrame(advance);
      else {cameraFrame.current = null; updateZoom();}
    };
    cameraFrame.current = requestAnimationFrame(advance);
    return cancelCameraMotion;
  }, [replay?.focusKey, replay?.follow, geometryKey, cancelCameraMotion, redraw, updateZoom]);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const wheel = (event: WheelEvent) => {event.preventDefault(); const rect = element.getBoundingClientRect(); zoomAt(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .004), event.clientX - rect.left, event.clientY - rect.top);};
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  useEffect(() => () => {if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current); cancelCameraMotion();}, [cancelCameraMotion]);

  paintRef.current = () => {
    const context = canvas.current?.getContext('2d'); if (!context) return;
    const {width, height, dpr} = dimensions.current, camera = view.current;
    const screen = (point: Point) => ({x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y});
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    context.fillStyle = '#0b1119'; context.fillRect(0, 0, width, height);
    const grid = 54; context.strokeStyle = '#18222e'; context.lineWidth = .5; context.beginPath();
    for (let x = ((camera.x % grid) + grid) % grid; x < width; x += grid) {context.moveTo(x, 0); context.lineTo(x, height);}
    for (let y = ((camera.y % grid) + grid) % grid; y < height; y += grid) {context.moveTo(0, y); context.lineTo(width, y);} context.stroke();
    const field = territory.current;
    if (field) {context.imageSmoothingEnabled = true; context.drawImage(field.canvas, field.x * camera.scale + camera.x, field.y * camera.scale + camera.y, field.width * camera.scale, field.height * camera.scale);}
    const visible = points.filter(point => {const p = screen(point); return p.x > -35 && p.x < width + 35 && p.y > -35 && p.y < height + 35;});
    if (showConnections && space === 'known') {
      context.strokeStyle = camera.scale > 2 ? '#8391a539' : '#8391a521'; context.lineWidth = .65; context.beginPath();
      for (const gate of atlas.gates) {const from = byId.get(gate.from_system_id), to = byId.get(gate.to_system_id); if (!from || !to) continue; const a = screen(from), b = screen(to); if ((a.x < 0 && b.x < 0) || (a.y < 0 && b.y < 0) || (a.x > width && b.x > width) || (a.y > height && b.y > height)) continue; context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();
    }
    if (showSpecialLinks) for (const link of intel?.links || []) {
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
      context.strokeStyle = '#a4f1d4'; context.lineWidth = 2; context.shadowColor = '#86e6bf'; context.shadowBlur = 6; context.beginPath();
      for (let i = 1; i < routeSystemIds.length; i++) {const from = byId.get(routeSystemIds[i - 1]), to = byId.get(routeSystemIds[i]); if (!from || !to) continue; const a = screen(from), b = screen(to); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke(); context.shadowBlur = 0;
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
      if (rect.left < 4 || rect.right > width - 4 || rect.top < 35 || rect.bottom > height - 4 || occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)) return false;
      occupied.push(rect); return true;
    };
    const systemLabels: {name: string; x: number; y: number; priority: number; dim: boolean}[] = [];
    context.textAlign = 'left';
    for (const point of visible) {
      const id = point.system.system_id, p = screen(point), overlay = overlays.get(id), active = id === selectedSystemId, hover = id === hoveredRef.current, current = id === (replay ? replay.systemId : intel?.location?.system_id);
      const highlighted = active || hover || current || route.has(id), dim = Boolean(focusedRegionId && point.system.region_id !== focusedRegionId && !highlighted);
      context.globalAlpha = dim ? .28 : 1;
      const colour = point.system.security_known === false ? '#718397' : background === 'none' || background === 'activity' ? securityColour(point.system.security) : layerStyle(point, overlay, background).colour;
      const radius = highlighted ? 3.4 : Math.max(1.05, Math.min(2.4, camera.scale * .45));
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
      context.font = `${label.priority ? '600 ' : ''}11px "Cascadia Code", Consolas, monospace`;
      const textWidth = context.measureText(label.name).width;
      const placements = [{x: label.x + 10, y: label.y - 8}, {x: label.x + 10, y: label.y + 20}, {x: label.x - textWidth - 10, y: label.y - 8}, {x: label.x - textWidth - 10, y: label.y + 20}];
      const placement = placements.find(position => claimLabel(position.x, position.y, textWidth, 11)); if (!placement) continue;
      context.globalAlpha = label.dim ? .4 : 1; context.strokeStyle = '#0b1119'; context.lineWidth = 4; context.strokeText(label.name, placement.x, placement.y); context.fillStyle = label.priority ? '#def8ed' : '#bac9d8'; context.fillText(label.name, placement.x, placement.y);
    }
    context.globalAlpha = 1;
    if (labels && space === 'known') {
      context.font = '10px "Cascadia Code", Consolas, monospace';
      const limit = width < 500 && camera.scale < 1.2 ? 9 : width < 800 && camera.scale < .9 ? 16 : 45;
      let drawn = 0;
      for (const region of [...regionPoints].sort((a, b) => Number(b.id === focusedRegionId) - Number(a.id === focusedRegionId) || b.count - a.count)) {
        if (drawn >= limit) break;
        const text = region.name.toUpperCase(), textWidth = context.measureText(text).width;
        const x = region.x * camera.scale + camera.x - textWidth / 2, y = region.y * camera.scale + camera.y - 12;
        if ((camera.scale > 3 && region.id !== focusedRegionId) || !claimLabel(x, y, textWidth, 10)) continue;
        drawn++; context.fillStyle = region.id === focusedRegionId ? '#d6e5e9' : '#a2b1c497'; context.strokeStyle = '#0b1119'; context.lineWidth = 3;
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
        context.font = '11px "Cascadia Code", Consolas, monospace'; const textWidth = context.measureText(text).width;
        context.font = '9px "Cascadia Code", Consolas, monospace'; const captionWidth = context.measureText(caption).width;
        const boxWidth = Math.min(width - 24, Math.max(180, textWidth + 24, captionWidth + 24)), x = Math.min(width - boxWidth - 10, Math.max(10, p.x + 20)), y = Math.max(44, p.y - 66);
        context.fillStyle = '#241d32f2'; context.strokeStyle = '#af88c58c'; context.lineWidth = .8; context.fillRect(x, y, boxWidth, 43); context.strokeRect(x, y, boxWidth, 43);
        context.font = '11px "Cascadia Code", Consolas, monospace'; context.fillStyle = '#e5c6eb'; context.fillText(text, x + 11, y + 17, boxWidth - 22);
        context.font = '9px "Cascadia Code", Consolas, monospace'; context.fillStyle = '#b09bbd';
        context.fillText(caption, x + 11, y + 32, boxWidth - 22);
      }
    }
  };
  useEffect(() => {redraw();}, [atlas, byId, points, intel, background, indicator, indicatorMax, regionPoints, labels, routeSystemIds, route, showConnections, showSpecialLinks, focusedRegionId, space, visits, pins, replay, redraw]);

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
  const hudValue = hud ? reportedIndicator(overlays.get(hud.system.system_id), indicator, intel) : null;
  return <div className="universe-canvas-shell" style={{border: '1px solid #2a3542', background: '#0b1119', overflow: 'hidden'}}>
    <div className="universe-map-toolbar" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 13px', borderBottom: '1px solid #25303d', flexWrap: 'wrap'}}>
      <div><span className="eyebrow" style={{fontSize: 9, color: '#8aa2b7', margin: 0}}>{space === 'known' ? 'NEW EDEN / X–Z PROJECTION' : 'J-SPACE / DISCOVERY GRAPH'}</span><span style={{fontSize: 10, color: '#687f94', marginLeft: 12}}>{points.length.toLocaleString()} systems</span></div>
      <div style={{display: 'flex', alignItems: 'center', gap: 2}}>
        <Button variant="ghost" size="icon" title="Toggle map labels" aria-label="Toggle map labels" aria-pressed={labels} onClick={() => setLabels(value => !value)}><Type size={15}/></Button>
        <Button variant="ghost" size="icon" title={replay ? 'Centre on replay location' : 'Centre on current location'} aria-label={replay ? 'Centre on replay location' : 'Centre on current location'} disabled={!locationId || !byId.has(locationId)} onClick={() => {manualMovement(); focusSystem(locationId);}}><LocateFixed size={15}/></Button>
        <Button variant="ghost" size="icon" title="Focus selected system" aria-label="Focus selected system" disabled={!selectedPoint} onClick={() => {manualMovement(); focusSystem(selectedSystemId);}}><Crosshair size={15}/></Button>
        <span style={{height: 17, width: 1, background: '#2b3948', margin: '0 5px'}}/>
        <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><Minus size={15}/></Button>
        <span style={{fontSize: 10, fontFamily: 'var(--font-mono)', color: '#899eaf', width: 42, textAlign: 'center'}}>{zoom.toFixed(1)}×</span>
        <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus size={15}/></Button>
        <Button variant="ghost" size="icon" title="Fit map (Home)" aria-label="Fit map" onClick={() => {manualMovement(); fit();}}><Maximize2 size={15}/></Button>
      </div>
    </div>
    <div ref={wrapper} className="universe-map-viewport" style={{position: 'relative', width: '100%', height: 'clamp(420px, 64vh, 780px)', minHeight: 360}}>
      <canvas ref={canvas} role="img" tabIndex={0} aria-label={`${space === 'known' ? 'New Eden' : 'Wormhole space'} interactive map showing ${points.length.toLocaleString()} systems. ${LAYERS[background]} background. ${INDICATOR_LABELS[indicator]}.`} aria-describedby={helpId}
        style={{display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: dragging ? 'grabbing' : hovered ? 'pointer' : 'grab'}}
        onKeyDown={event => {
          if (event.key === '+' || event.key === '=') {event.preventDefault(); zoomAt(1.4);} else if (event.key === '-') {event.preventDefault(); zoomAt(1 / 1.4);} else if (event.key === 'Home') {event.preventDefault(); manualMovement(); fit();}
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {event.preventDefault(); manualMovement(); view.current.x += event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0; view.current.y += event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0; redraw();}
          else if (event.key === 'Enter' && selectedSystemId) {manualMovement(); focusSystem(selectedSystemId);}
        }}
        onPointerDown={event => {if (event.button !== 0) return; pointer.current = {id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false}; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);}}
        onPointerMove={event => {
          const held = pointer.current;
          if (held && held.id === event.pointerId) {const dx = event.clientX - held.x, dy = event.clientY - held.y; if (!held.moved && Math.hypot(event.clientX - held.originX, event.clientY - held.originY) > 4) {held.moved = true; manualMovement();} held.x = event.clientX; held.y = event.clientY; view.current.x += dx; view.current.y += dy; redraw(); return;}
          const id = nearest(event.clientX, event.clientY); if (id !== hoveredRef.current) {hoveredRef.current = id; setHovered(id); redraw();}
        }}
        onPointerUp={event => {const held = pointer.current; if (!held || held.id !== event.pointerId) return; if (!held.moved) {const id = nearest(event.clientX, event.clientY); if (id) onSelectSystem(id);} pointer.current = null; setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);}}
        onPointerCancel={() => {pointer.current = null; setDragging(false);}}
        onLostPointerCapture={() => {pointer.current = null; setDragging(false);}}
        onPointerLeave={() => {if (!pointer.current) {hoveredRef.current = null; setHovered(null); redraw();}}}
        onDoubleClick={event => {const rect = event.currentTarget.getBoundingClientRect(); zoomAt(1.8, event.clientX - rect.left, event.clientY - rect.top);}}
      >Use the system search and system list to select a system without the visual map.</canvas>
      {!points.length && <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#8ca2b4', fontSize: 13, padding: 30, textAlign: 'center'}}>{space === 'wormhole' && !allPoints.length ? 'Visit or pin a J-space system, or add a discovered wormhole, to build your connection map.' : 'No systems match this map filter.'}</div>}
      <div style={{position: 'absolute', top: 14, left: 16, pointerEvents: 'none', fontSize: 9, fontFamily: 'var(--font-mono)', color: '#89a0b8', letterSpacing: '1px'}}>{replay ? 'RECORDED SESSION · ' + (space === 'known' ? 'OBSERVED TRAVEL' : 'DISCOVERY GRAPH · NOT TO SCALE') : space === 'known' ? LAYERS[background].toUpperCase() : 'DISCOVERED CONNECTIONS · NOT TO SCALE'}{indicator !== 'none' && <span style={{color: '#c9bda4'}}> + {INDICATOR_LABELS[indicator].toUpperCase()}</span>}</div>
      {hud && <div style={{position: 'absolute', bottom: 17, left: 17, maxWidth: 'calc(100% - 34px)', pointerEvents: 'none', padding: '11px 15px', background: '#101b27ed', border: '1px solid #3b5265', borderLeft: '2px solid #97ebce'}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 12}}><strong style={{fontSize: 14, color: '#dcefe9'}}>{hud.system.name}</strong><span style={{fontSize: 11, color: hud.system.security_known === false ? '#718397' : securityColour(hud.system.security), fontFamily: 'var(--font-mono)'}}>{hud.system.security_known === false ? '?' : hud.system.security.toFixed(1)}</span>{hud.system.system_id === locationId && <span style={{color: '#e8c485', fontSize: 9}}>{replay ? 'REPLAY LOCATION' : 'YOU ARE HERE'}</span>}</div>
        <div style={{color: '#89a0b4', fontSize: 10, marginTop: 4}}>{hud.system.region_name}{replay ? ' · Static system profile' : ' · ' + (overlays.get(hud.system.system_id)?.sovereignty?.alliance_name || overlays.get(hud.system.system_id)?.sovereignty?.faction_name || (hud.system.space === 'wormhole' ? `Wormhole space${hud.system.wormhole_class ? ' · C' + hud.system.wormhole_class : ''}` : 'No sovereignty owner reported'))}</div>
        {indicator !== 'none' && <div style={{color: '#b3c4d1', fontSize: 10, marginTop: 5}}>{INDICATOR_LABELS[indicator]}: {hudValue === null ? 'Unavailable' : indicator === 'industry' ? hudValue.toFixed(2) + '%' : hudValue.toLocaleString()}</div>}
      </div>}
    </div>
    <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', padding: '11px 15px', borderTop: '1px solid #25303d', fontSize: 10, color: '#89a0b4'}}>
      {space === 'wormhole' ? <span>Only discovered systems and their known-space exits. Disconnected discoveries stay on the map.</span> : background === 'standings' ? <><Legend colour={PALETTE.excellent} label="Excellent"/><Legend colour={PALETTE.good} label="Good"/><Legend colour={PALETTE.neutral} label="Neutral"/><Legend colour={PALETTE.bad} label="Bad"/><Legend colour={PALETTE.terrible} label="Terrible"/><Legend colour={PALETTE.unknown} label="Unknown"/></> : background === 'security' || background === 'none' ? <><Legend colour="#85dcb5" label="High security"/><Legend colour="#dfb975" label="Low security"/><Legend colour="#d68092" label="Null / wormhole"/></> : <span>{background === 'sovereignty' ? 'Colour identifies an alliance or faction; shading follows nearby systems.' : 'Brighter shading means more reported ship and pod kills.'}</span>}
      {routeSystemIds.length > 1 && <Legend colour="#a4f1d4" label="Planned route"/>}{showSpecialLinks && <><Legend colour="#80ddde" label="Ansiblex" dashed/><Legend colour="#c1a0eb" label="Wormhole" dashed/></>}
      {replay && <><Legend colour="#e1bb87" label="Recorded transitions" dashed/><Legend colour="#e6a6cb" label="Recent recorded event"/></>}
    </div>
    <p id={helpId} style={{margin: 0, padding: '0 15px 12px', color: '#677e92', fontSize: 10, lineHeight: 1.6}}>Drag to pan · scroll or +/− to zoom · Home to fit · select a system to inspect. Arrow keys pan when the map is focused. Use system search for keyboard selection.{space === 'wormhole' ? ' This topological layout does not represent physical distances. Only active connections are drawn.' : ' Territory shading is a visual guide, not a claim of borders in empty space.'}</p>
  </div>;
}

function Legend({colour, label, dashed = false}: {colour: string; label: string; dashed?: boolean}) {
  return <span style={{display: 'inline-flex', gap: 6, alignItems: 'center'}}><i style={dashed ? {width: 13, borderTop: `1px dashed ${colour}`} : {width: 5, height: 5, borderRadius: '50%', background: colour}}/>{label}</span>;
}
