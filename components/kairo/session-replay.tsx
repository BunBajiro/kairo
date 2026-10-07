"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Activity, ChevronLeft, ChevronRight, Crosshair, Factory, Film, GraduationCap, MapPin, Pause, Play, Rocket, RotateCcw, SkipBack, SkipForward, Skull, Square, Swords, Trophy, Wallet, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {api} from './model';
import type {ReplaySovereigntyOwner} from './session-replay-sovereignty.mjs';
import {prepareReplayTimeline} from './session-replay-timeline.mjs';
import './session-replay.css';

type ReplayVisit = {id: number | string; systemId: number; name: string; entered: string; exited?: string | null; seconds?: number; inferred?: boolean; clipped?: boolean; active?: boolean; coordinates_available?: boolean; location_basis?: string; sovereignty_at_visit?: ReplaySovereigntyOwner | null};
type ReplayEvent = {id: number | string; type: string; module?: string; summary: string; at: string; system_id?: number | null; system_name?: string | null; visit_id?: number | string | null; location_basis?: string; payload?: unknown};
type ReplayTravel = {from_visit_id: number | string; to_visit_id: number | string; from_system_id: number; to_system_id: number; at: string; connection_basis: string};
export type SessionReplayData = {
  session: {id: number | string; label?: string; character_id: number; started: string; ended?: string | null; live?: boolean};
  startedAt: string; endedAt: string; snapshotAt: string; durationMs: number;
  visits: ReplayVisit[]; events: ReplayEvent[]; systems: any[]; travel: ReplayTravel[];
  coverage: {totalEvents: number; returnedEvents: number; truncated: boolean; omittedEvents: number; suppressedRoutineEvents?: number; missingCoordinateSystemIds: number[]; unlocatedEvents: number; inferredVisitCount: number; gaps: {from: string; to: string; reason: string}[]; notes: string[]};
};
export type ReplayMapFrame = {
  systemId: number | null; follow: boolean; smooth: boolean; focusKey: string;
  sovereigntyAtVisit?: ReplaySovereigntyOwner | null;
  trailSystemIds: number[]; discoveredSystemIds: number[];
  travel: ReplayTravel[]; allTravel: ReplayTravel[]; eventSystemIds: number[]; at: string;
  events: {id: string | number; systemId: number; summary: string; type: string; locationBasis: string}[];
};
type ReplayRequest = {sessionId: string | number; characterId: number};
const SPEEDS = [1, 10, 30, 60, 120, 300];
const UTC_TIME = new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC'});
const UTC_DATE = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});

function requestFromStorage(): ReplayRequest | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem('kairo-universe-replay');
  if (!value) return null;
  sessionStorage.removeItem('kairo-universe-replay');
  try {const parsed = JSON.parse(value); return parsed.sessionId && Number.isFinite(Number(parsed.characterId)) ? {sessionId: parsed.sessionId, characterId: Number(parsed.characterId)} : null;} catch {return null;}
}
function elapsedLabel(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000)), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return `${hours ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function timeLabel(at: string | number) {return UTC_TIME.format(new Date(at));}
function eventPresentation(type: string) {
  if (type === 'killmail.kill') return {Icon: Swords, tone: 'combat', label: 'Kill'};
  if (type === 'killmail.loss') return {Icon: Skull, tone: 'loss', label: 'Loss'};
  if (type.startsWith('goal.')) return {Icon: Trophy, tone: 'success', label: 'Objective'};
  if (type.startsWith('skill.')) return {Icon: GraduationCap, tone: 'training', label: 'Training'};
  if (type.startsWith('wallet.')) return {Icon: Wallet, tone: 'wallet', label: 'Wallet'};
  if (type.startsWith('industry.')) return {Icon: Factory, tone: 'industry', label: 'Industry'};
  if (type.startsWith('ship.')) return {Icon: Rocket, tone: 'ship', label: 'Ship'};
  if (type === 'session.started') return {Icon: Play, tone: 'session', label: 'Session started'};
  if (type === 'session.ended') return {Icon: Square, tone: 'session', label: 'Session ended'};
  return {Icon: Activity, tone: 'activity', label: 'Activity'};
}

export function useSessionReplay(characterId: number) {
  const [request, setRequest] = useState<ReplayRequest | null>(null), [data, setData] = useState<SessionReplayData | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(60), [follow, setFollow] = useState(true);
  const [scrubKey, setScrubKey] = useState(0), [smooth, setSmooth] = useState(false);
  const elapsedRef = useRef(0), currentCharacter = useRef(characterId); currentCharacter.current = characterId;
  useEffect(() => {const pending = requestFromStorage(); if (pending) setRequest(pending);}, []);
  useEffect(() => {
    if (!request) return;
    let alive = true; setData(null); setError(''); setLoading(true); setPlaying(false); setElapsedMs(0); elapsedRef.current = 0;
    if (request.characterId !== characterId) {setError('This session belongs to a different pilot. Select that pilot to load its replay.'); setLoading(false); return;}
    api(`/sessions/${encodeURIComponent(String(request.sessionId))}/replay?character=${characterId}`).then((result: SessionReplayData) => {
      if (!alive || currentCharacter.current !== characterId) return;
      if (Number(result.session?.character_id) !== characterId) throw new Error('The session does not belong to the selected pilot.');
      setData(result); setFollow(true); setSmooth(false); setScrubKey(key => key + 1);
    }).catch(reason => {if (alive) setError(reason instanceof Error ? reason.message : 'The session replay could not be loaded.');}).finally(() => {if (alive) setLoading(false);});
    return () => {alive = false;};
  }, [request, characterId, reload]);
  useEffect(() => {
    if (!playing || !data) return;
    const duration = Math.max(0, Number(data.durationMs) || 0); let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), delta = now - previous; previous = now;
      // Hidden tabs do not silently skip the journey.
      if (document.hidden) return;
      const next = Math.min(duration, elapsedRef.current + delta * speed); elapsedRef.current = next; setElapsedMs(next);
      if (next >= duration) setPlaying(false);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, speed, data]);
  const seek = useCallback((milliseconds: number) => {
    const next = Math.max(0, Math.min(Number(data?.durationMs) || 0, milliseconds));
    setPlaying(false); setSmooth(false); elapsedRef.current = next; setElapsedMs(next); setScrubKey(key => key + 1);
  }, [data?.durationMs]);
  const close = useCallback(() => {setPlaying(false); setRequest(null); setData(null); setError('');}, []);
  const stopFollowing = useCallback(() => setFollow(false), []);
  const toggleFollow = useCallback(() => {setFollow(current => !current); setSmooth(true); setScrubKey(key => key + 1);}, []);
  const togglePlaying = useCallback(() => {
    if (!data || !data.durationMs) return;
    if (elapsedRef.current >= data.durationMs) {elapsedRef.current = 0; setElapsedMs(0); setScrubKey(key => key + 1);}
    setSmooth(true); setPlaying(current => !current);
  }, [data]);
  const timeline = useMemo(() => prepareReplayTimeline(data), [data]);
  const at = timeline.start + elapsedMs;
  const position = useMemo(() => timeline.at(at), [timeline, at]);
  const {currentVisit, nextVisit, recentEvents, previousEvent, nextEvent} = position;
  const discoveredSystemIds = timeline.discoveredSystemIds;
  const frame = useMemo<ReplayMapFrame | null>(() => data ? {
    systemId: currentVisit?.coordinates_available === false ? null : currentVisit?.systemId || null,
    sovereigntyAtVisit: currentVisit?.sovereignty_at_visit || null,
    follow, smooth, focusKey: `${request?.sessionId}:${currentVisit?.id || 'gap'}:${scrubKey}`,
    trailSystemIds: position.trailSystemIds,
    discoveredSystemIds, allTravel: data.travel,
    travel: position.travel,
    eventSystemIds: [...new Set(recentEvents.filter(event => event.system_id && at - event.time < Math.max(30000, speed * 1800)).map(event => event.system_id!))],
    events: recentEvents.filter(event => event.system_id && at - event.time < Math.max(30000, speed * 1800)).slice(0, 3).map(event => ({id: event.id, systemId: event.system_id!, summary: event.summary || event.type, type: event.type, locationBasis: event.location_basis || 'unknown'})),
    at: new Date(at).toISOString(),
  } : null, [data, currentVisit, follow, smooth, request?.sessionId, scrubKey, position, at, recentEvents, discoveredSystemIds, speed]);
  const previous = useCallback(() => seek(position.previousVisit ? position.previousVisit.start - timeline.start : 0), [position.previousVisit, timeline.start, seek]);
  const next = useCallback(() => seek(nextVisit ? nextVisit.start - timeline.start : Number(data?.durationMs) || 0), [nextVisit, timeline.start, data?.durationMs, seek]);
  return {active: Boolean(request), request, data, loading, error, elapsedMs, playing, speed, follow, frame, currentVisit, nextVisit, recentEvents, previousEvent, nextEvent, timeline, gap: position.gap, seek, close, stopFollowing, toggleFollow, togglePlaying, previous, next, setSpeed, retry: () => setReload(value => value + 1)};
}

export function SessionReplayControls({replay}: {replay: ReturnType<typeof useSessionReplay>}) {
  if (!replay.active) return null;
  const {data, currentVisit, playing, timeline} = replay;
  const duration = Math.max(0, Number(data?.durationMs) || 0), percent = duration ? replay.elapsedMs / duration * 100 : 0;
  const ticks = timeline.ticks;
  const currentAt = timeline.start + replay.elapsedMs;
  const gap = replay.gap;
  return <section className={'session-replay'+(playing?' is-playing':'')} aria-label="Session replay">
    <div className="session-replay-heading">
      <div className="session-replay-title"><Film size={22} aria-hidden="true"/><div><span className="eyebrow">SESSION REPLAY</span><h3>{data?.session.label || (replay.loading ? 'Loading recorded session…' : 'Recorded session')}</h3></div></div>
      <Button variant="ghost" size="icon" aria-label="Close session replay" onClick={replay.close}><X size={20}/></Button>
    </div>
    {replay.error && <div className="session-replay-error" role="alert"><span>{replay.error}</span><Button variant="outline" onClick={replay.retry}>Retry</Button></div>}
    {replay.loading && <p className="session-replay-note">Loading your recorded visits and events.</p>}
    {data && <>
      <div className="session-replay-status">
        <div className="session-replay-location" key={currentVisit?.id || 'gap'}><MapPin size={22} aria-hidden="true"/><strong>{currentVisit?.name || 'Location not recorded'}</strong></div>
        {(data.session.live || currentVisit?.inferred || currentVisit?.coordinates_available === false) && <div className="session-replay-badges">
          {data.session.live && <span className="tag">Live snapshot</span>}
          {currentVisit?.inferred && <span className="tag">Inferred location</span>}
          {currentVisit?.coordinates_available === false && <span className="tag">No coordinates</span>}
        </div>}
        <time dateTime={new Date(currentAt).toISOString()}>{timeLabel(currentAt)}<span> EVE / UTC · {UTC_DATE.format(new Date(currentAt))}</span></time>
      </div>
      <div className="session-replay-stats">
        <span className="session-replay-state">{playing?<Play size={15} aria-hidden="true"/>:<Pause size={15} aria-hidden="true"/>}{playing?'Playing':'Paused'}</span>
        <span><MapPin size={16} aria-hidden="true"/><strong>{replay.frame?.discoveredSystemIds.length || 0}</strong> {replay.frame?.discoveredSystemIds.length === 1 ? 'system' : 'systems'}</span>
        <span><Activity size={16} aria-hidden="true"/><strong>{timeline.events.length.toLocaleString()}</strong> {timeline.events.length === 1 ? 'event' : 'events'}</span>
      </div>
      <div className="session-replay-timeline">
        <div className="session-replay-progress" aria-hidden="true"><span style={{transform:`scaleX(${percent / 100})`}}/></div>
        <div className="session-replay-ticks" aria-hidden="true">{ticks.map((event, index) => <i key={String(event.id) + ':' + index} style={{left: `${Math.max(0, Math.min(100, duration ? (event.time - timeline.start) / duration * 100 : 0))}%`}}/>)}</div>
        <input aria-label="Session replay time" aria-valuetext={`${elapsedLabel(replay.elapsedMs)} of ${elapsedLabel(duration)}${currentVisit ? ', ' + currentVisit.name : ', location unavailable'}`} type="range" min={0} max={Math.max(1, duration)} step={1000} value={replay.elapsedMs} onChange={event => replay.seek(Number(event.target.value))}/>
        <div className="session-replay-time-labels"><span>{elapsedLabel(replay.elapsedMs)}</span><span>{elapsedLabel(duration)}</span></div>
      </div>
      <div className="session-replay-controls">
        <div className="session-replay-transport">
          <Button variant="ghost" size="icon" aria-label="Restart session replay" title="Restart" onClick={() => replay.seek(0)}><RotateCcw size={18}/></Button>
          <Button variant="ghost" size="icon" aria-label="Previous recorded system" title="Previous system" onClick={replay.previous}><SkipBack size={20}/></Button>
          <Button className="session-replay-play" aria-label={playing ? 'Pause session replay' : 'Play session replay'} disabled={!duration} onClick={replay.togglePlaying}>{playing ? <Pause size={20}/> : <Play size={20}/>} {playing ? 'Pause' : replay.elapsedMs >= duration ? 'Replay' : 'Play'}</Button>
          <Button variant="ghost" size="icon" aria-label="Next recorded system" title="Next system" onClick={replay.next}><SkipForward size={20}/></Button>
        </div>
        <div className="session-replay-options">
          <label>Speed<select aria-label="Replay speed" value={replay.speed} onChange={event => replay.setSpeed(Number(event.target.value))}>{SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
          <Button variant={replay.follow ? 'outline' : 'ghost'} aria-pressed={replay.follow} onClick={replay.toggleFollow}><Crosshair size={18}/>{replay.follow ? 'Following pilot' : 'Resume follow'}</Button>
        </div>
      </div>
      {gap && <p className="session-replay-gap">Recording gap · {gap.reason || 'No location was recorded for this interval.'}</p>}
      <div className="session-replay-events">
        <div className="session-replay-event-heading"><span className="eyebrow">RECORDED ACTIVITY</span><div>
          <Button variant="ghost" size="icon" aria-label="Previous recorded event" title="Previous event" disabled={!replay.previousEvent} onClick={() => replay.previousEvent && replay.seek(replay.previousEvent.time - timeline.start)}><ChevronLeft size={20}/></Button>
          <Button variant="ghost" size="icon" aria-label="Next recorded event" title="Next event" disabled={!replay.nextEvent} onClick={() => replay.nextEvent && replay.seek(replay.nextEvent.time - timeline.start)}><ChevronRight size={20}/></Button>
        </div></div>
        <div className="session-replay-event-list">
          {replay.recentEvents.length ? replay.recentEvents.map(event => {
            const {Icon, tone, label} = eventPresentation(event.type);
            return <button className={`session-replay-event tone-${tone}`} key={String(event.id)} onClick={() => replay.seek(event.time - timeline.start)} aria-label={`Replay ${label.toLowerCase()} at ${timeLabel(event.at)}: ${event.summary || event.type}`}>
              <span className="session-replay-event-icon"><Icon size={20} aria-hidden="true"/></span>
              <span className="session-replay-event-content">
                <span className="session-replay-event-meta"><span>{label}</span><time dateTime={event.at}>{timeLabel(event.at)}</time></span>
                <strong>{event.summary || event.type}</strong>
                <span className="session-replay-event-location"><MapPin size={14} aria-hidden="true"/>{event.system_name || 'Location unavailable'}{event.location_basis === 'observed_visit' ? ' · pilot context' : event.location_basis?.includes('inferred') ? ' · inferred context' : ''}</span>
              </span>
            </button>;
          }) : <p className="session-replay-empty"><Activity size={24} aria-hidden="true"/>{timeline.events.length ? 'No activity yet. Play or skip to the next event.' : 'No activity events recorded. Follow the journey on the map.'}</p>}
        </div>
      </div>
      <div className="session-replay-footer"><Crosshair size={16} aria-hidden="true"/><span>Drag the map to pause camera follow.</span></div>
      <details className="session-replay-coverage"><summary>Recording details</summary>
        <p>Dotted links show recorded transitions, with no confirmed travel method.</p>
        {data.coverage?.truncated && <p>{data.coverage.returnedEvents.toLocaleString()} of {data.coverage.totalEvents.toLocaleString()} events shown; {data.coverage.omittedEvents.toLocaleString()} omitted by the replay limit. All recorded visits remain available.</p>}
        {!!data.coverage?.missingCoordinateSystemIds?.length && <p>{data.coverage.missingCoordinateSystemIds.length} systems have no coordinates and cannot be placed on the map.</p>}
        {!!data.coverage?.unlocatedEvents && <p>{data.coverage.unlocatedEvents} events have no recorded location.</p>}
        {!!data.coverage?.inferredVisitCount && <p>{data.coverage.inferredVisitCount} visits use an inferred starting location.</p>}
        <p>Events marked “pilot context” use the pilot’s recorded location; the activity itself may have happened elsewhere.</p>
        {data.session.live && <p>This is a fixed snapshot. Reopen the session to include later activity.</p>}
      </details>
    </>}
  </section>;
}
