"use client";

/**
 * Atlas symbol inspection cards over renderer-supplied evidence. Anchors/viewport
 * dimensions are CSS pixels; `now` is Unix ms supplied by the map's freshness
 * clock. This layer presents source/expiry and delegates navigation actions; it
 * does not turn a fresh public report into verified route or access information.
 */

import {useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type Ref} from 'react';
import {Activity, ArrowRight, ArrowUpRight, CircleDot, Clock3, Compass, Flag, Link2, MapPin, Navigation, NotebookPen, Radio, ShieldQuestion, Sparkles, Swords, Users, Waypoints, X} from 'lucide-react';
import type {PortalEndpoint, PortalNetwork} from './universe-map-portals.mjs';
import {wormholeClassLabel} from './universe-presentation.mjs';
import './universe-map-context.css';

export interface MapSymbolContext {
  id: string;
  kind: string;
  title: string;
  description: string;
  systemId?: number;
  systemName?: string;
  source?: string;
  updatedAt?: string | null;
  details?: {label: string; value: string | number}[];
  portalNetwork?: 'thera' | 'turnur';
  portal?: PortalEndpoint;
  network?: PortalNetwork;
  entrances?: {id: string; systemId: number; systemName: string; label?: string}[];
}

type MapAnchor = {x: number; y: number};
type MapViewport = {width: number; height: number};

export interface UniverseMapContextProps {
  symbol: MapSymbolContext;
  anchor: MapAnchor;
  viewport: MapViewport;
  pinned: boolean;
  now: number;
  id?: string;
  anchorElementRef?: Ref<HTMLDivElement>;
  onClose?: () => void;
  onRoute?: () => void;
  onInspect?: () => void;
  onNetwork?: () => void;
  onOpenNotebook?: (systemId: number) => void;
  onChooseEntrance?: (id: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
const contextPositions = new WeakMap<HTMLDivElement, {anchor: MapAnchor; viewport: MapViewport; pinned: boolean}>();

/** The renderer can keep the card attached to a moving symbol without a React update per frame. */
export function positionMapContext(element: HTMLDivElement | null, anchor: MapAnchor, viewport: MapViewport, pinned = false) {
  if (!element) return;
  contextPositions.set(element, {anchor: {...anchor}, viewport: {...viewport}, pinned});
  const padding = 12;
  element.style.maxWidth = Math.max(1, viewport.width - padding * 2) + 'px';
  element.style.maxHeight = Math.max(1, viewport.height - padding * 2) + 'px';
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const preferredX = anchor.x + 18 + width <= viewport.width - padding ? anchor.x + 18 : anchor.x - width - 18;
  element.style.left = clamp(preferredX, padding, viewport.width - width - padding) + 'px';
  element.style.top = clamp(anchor.y + (pinned ? -24 : 18), padding, viewport.height - height - padding) + 'px';
}

function ageText(value: string | null | undefined, now: number) {
  const stamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(stamp)) return 'Observation time unknown';
  const minutes = Math.max(0, Math.floor((now - stamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function expiryText(value: string | null | undefined, now: number) {
  const stamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(stamp)) return 'Unreported';
  const remaining = stamp - now;
  if (remaining <= 0) return 'Reported expiry passed';
  const minutes = Math.ceil(remaining / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining` : `${minutes}m remaining`;
}

function dateText(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, {timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short'}) + ' EVE' : undefined;
}

const portalStatus = (portal: PortalEndpoint) => portal.state === 'usable' ? 'Fresh report' : portal.state === 'stale' ? 'Stale report' : portal.state === 'incomplete' ? 'Incomplete scan' : 'Travel limits unconfirmed';

function SymbolMark({kind, portal}: {kind: string; portal: boolean}) {
  const Icon = portal ? Waypoints : /pilot|fleet|cluster/.test(kind) ? Users : /storm/.test(kind) ? Sparkles : /combat|kill|hostile/.test(kind) ? Swords : /campaign|sovereignty/.test(kind) ? Flag : /intel|report|watch|alert/.test(kind) ? Radio : /pin|annotation|cyno/.test(kind) ? MapPin : /route|connection|ansiblex|wormhole/.test(kind) ? Link2 : /activity|npc/.test(kind) ? Activity : /point|landmark/.test(kind) ? Compass : CircleDot;
  return <Icon size={21} aria-hidden="true"/>;
}

function PortalFacts({portal, now}: {portal: PortalEndpoint; now: number}) {
  const report = portal.report;
  const hubName = portal.source === 'thera' ? 'Thera' : 'Turnur';
  return <>
    <div className="universe-map-context-connection" aria-label="Reported connection endpoints">
      <div><span>Entrance</span><strong>{portal.system.name}</strong>{portal.system.space === 'wormhole' && <span>{wormholeClassLabel(portal.system)}</span>}<code>{portal.signature || 'Signature unknown'}</code></div>
      <Waypoints size={22} aria-hidden="true"/>
      <div><span>{hubName} side</span><strong>{portal.hub.name}</strong>{portal.hub.space === 'wormhole' && <span>{wormholeClassLabel(portal.hub)}</span>}<code>{portal.hubSignature || 'Signature unknown'}</code></div>
    </div>
    <dl className="universe-map-context-facts">
      <div><dt><Clock3 size={15} aria-hidden="true"/>Reported expiry</dt><dd><time dateTime={portal.expiresAt} title={dateText(portal.expiresAt)}>{expiryText(portal.expiresAt, now)}</time></dd></div>
      <div><dt><ShieldQuestion size={15} aria-hidden="true"/>Ship class</dt><dd>{report.max_ship_size ? String(report.max_ship_size).replaceAll('_', ' ') : 'Unreported'}</dd></div>
      <div><dt>Report updated</dt><dd><time dateTime={portal.observedAt || undefined} title={dateText(portal.observedAt)}>{ageText(portal.observedAt, now)}</time></dd></div>
    </dl>
    <p className={'universe-map-context-observation ' + (portal.state === 'usable' ? '' : 'is-caution')}><ShieldQuestion size={16} aria-hidden="true"/><span>{portal.state === 'stale' ? 'Stale public report. ' : portal.state === 'incomplete' ? 'Scan incomplete. ' : ''}Remaining mass unknown. Current passage and access are unverified.</span></p>
    {portal.reasons.length > 0 && <p className="universe-map-context-limitations">{portal.reasons.join(' · ')}</p>}
    {report.comment && <p className="universe-map-context-comment">{String(report.comment)}</p>}
    {(typeof report.max_jump_mass_kg === 'number' || typeof report.max_stable_mass_kg === 'number') && <details className="universe-map-context-type"><summary>Nominal type limits</summary><dl className="universe-map-context-facts"><div><dt>Per jump</dt><dd>{typeof report.max_jump_mass_kg === 'number' ? report.max_jump_mass_kg.toLocaleString() + ' kg' : 'Unavailable'}</dd></div><div><dt>Total mass</dt><dd>{typeof report.max_stable_mass_kg === 'number' ? report.max_stable_mass_kg.toLocaleString() + ' kg' : 'Unavailable'}</dd></div><div><dt>Type data</dt><dd>{report.type_status || 'Unavailable'}</dd></div></dl><p>Type limits do not report the mass remaining in this connection.</p></details>}
  </>;
}

export function UniverseMapContext({symbol, anchor, viewport, pinned, now, id = 'universe-map-symbol-context', anchorElementRef, onClose, onRoute, onInspect, onNetwork, onOpenNotebook, onChooseEntrance}: UniverseMapContextProps) {
  const element = useRef<HTMLDivElement | null>(null);
  const ownerDocument = element.current?.ownerDocument;
  const assignRef = useCallback((node: HTMLDivElement | null) => {
    element.current = node;
    if (typeof anchorElementRef === 'function') anchorElementRef(node);
    else if (anchorElementRef) anchorElementRef.current = node;
  }, [anchorElementRef]);
  useLayoutEffect(() => {positionMapContext(element.current, anchor, viewport, pinned);}, [anchor.x, anchor.y, viewport.width, viewport.height, pinned, symbol, now]);
  useLayoutEffect(() => {
    const node = element.current;
    const Observer = (node?.ownerDocument.defaultView as (Window & {ResizeObserver?: typeof ResizeObserver}) | null)?.ResizeObserver;
    if (!node || !Observer) return;
    const observer = new Observer(() => {
      const position = contextPositions.get(node);
      if (position) positionMapContext(node, position.anchor, position.viewport, position.pinned);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewport.width, viewport.height, pinned, ownerDocument]);
  useEffect(() => {if (pinned && element.current) {element.current.scrollTop = 0; element.current.focus({preventScroll: true});}}, [pinned, symbol.id]);
  const portalSource = symbol.portal?.source || symbol.portalNetwork || symbol.network?.source;
  const updatedAt = symbol.portal?.observedAt || symbol.updatedAt || symbol.network?.updatedAt;
  const source = symbol.source || (portalSource ? 'EVE-Scout' : undefined);
  const systemId = symbol.portal?.systemId || symbol.systemId;
  const hasNotebook = !!onOpenNotebook && !!systemId;
  const showInspect = !!onInspect && !(onRoute && onNetwork && hasNotebook);
  const styles = {left: 12, top: 12, maxWidth: Math.max(1, viewport.width - 24), maxHeight: Math.max(1, viewport.height - 24)} as CSSProperties;
  return <div ref={assignRef} id={id} className={'universe-map-context ' + (pinned ? 'is-pinned' : 'is-hover')} data-map-symbol-id={symbol.id} data-map-symbol-kind={symbol.kind} data-portal-network={portalSource} role={pinned ? 'dialog' : 'tooltip'} aria-modal={pinned ? false : undefined} aria-label={pinned ? `${symbol.title} details` : undefined} tabIndex={pinned ? -1 : undefined} style={styles} onPointerDown={event => {if (pinned) event.stopPropagation();}} onWheel={event => {if (pinned) event.stopPropagation();}} onKeyDown={event => {if (pinned && event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); onClose?.();}}}>
    <header className="universe-map-context-heading">
      <span className="universe-map-context-mark"><SymbolMark kind={symbol.kind} portal={!!portalSource}/></span>
      <div>{portalSource && <span className="universe-map-context-eyebrow">{portalSource === 'thera' ? 'Thera' : 'Turnur'} network</span>}<strong>{symbol.title}</strong></div>
      {pinned && onClose && <button className="universe-map-context-close" aria-label="Close map details" onClick={onClose}><X size={19} aria-hidden="true"/></button>}
    </header>
    <p className="universe-map-context-meaning">{symbol.description}</p>
    {symbol.systemName && (!symbol.portal || !pinned) && <div className="universe-map-context-system"><MapPin size={15} aria-hidden="true"/>{symbol.systemName}</div>}
    {source && <div className="universe-map-context-source"><span><Radio size={14} aria-hidden="true"/>{source}</span>{updatedAt && <time dateTime={updatedAt} title={dateText(updatedAt)}>{ageText(updatedAt, now)}</time>}</div>}
    {symbol.portal && <div className="universe-map-context-badges"><span className={symbol.portal.state === 'usable' ? '' : 'is-caution'}><Radio size={14} aria-hidden="true"/>{portalStatus(symbol.portal)}</span>{symbol.portal.report.wh_type && <span>{symbol.portal.report.wh_type}</span>}</div>}
    {pinned && <>
      {(onRoute || onInspect || onNetwork || hasNotebook) && <div className="universe-map-context-actions">
        {onRoute && <button className="is-primary" onClick={onRoute}><Navigation size={17} aria-hidden="true"/>{symbol.portal ? 'Route to entrance' : 'Route to system'}</button>}
        {showInspect && <button onClick={onInspect}><CircleDot size={17} aria-hidden="true"/>Inspect system</button>}
        {onNetwork && <button onClick={onNetwork}><Waypoints size={17} aria-hidden="true"/>{portalSource ? 'Show network' : 'Expand group'}<ArrowRight size={16} aria-hidden="true"/></button>}
        {hasNotebook && <button onClick={() => onOpenNotebook?.(systemId!)}><NotebookPen size={17} aria-hidden="true"/>Open notebook</button>}
      </div>}
      {onRoute && symbol.portal && <p className="universe-map-context-route-note">Sets the entrance as your destination. Review and calculate in Navigate; no wormhole is added automatically.</p>}
      {symbol.portal && <PortalFacts portal={symbol.portal} now={now}/>}
      {symbol.network && <div className="universe-map-context-network-status"><span><strong>{symbol.network.endpoints.length}</strong> reported entrances</span><span>{symbol.network.usableCount} fresh reports{symbol.network.staleCount > 0 ? ` · ${symbol.network.staleCount} stale` : ''}</span></div>}
      {!!symbol.details?.length && <dl className="universe-map-context-facts">{symbol.details.map((row, index) => <div key={row.label + index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
      {!!symbol.entrances?.length && <div className="universe-map-context-entrances" aria-label="Reported network entrances">{symbol.entrances.map(entrance => <button key={entrance.id} type="button" onClick={() => onChooseEntrance?.(entrance.id)} disabled={!onChooseEntrance}><span><strong>{entrance.systemName}</strong>{entrance.label && <small>{entrance.label}</small>}</span><ArrowUpRight size={17} aria-hidden="true"/></button>)}</div>}
      <div className="universe-map-context-footer">{symbol.network?.attribution || (portalSource ? 'Public observations · EVE-Scout' : 'Map context')}<span>Esc to return to map</span></div>
    </>}
    {!pinned && <span className="universe-map-context-hint">Click or tap for details</span>}
  </div>;
}

export {UniverseMapContext as MapContextCard};
