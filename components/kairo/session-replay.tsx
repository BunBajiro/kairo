"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Crosshair, Film, MapPin, Pause, Play, RotateCcw, SkipBack, SkipForward, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {api} from './model';
import './session-replay.css';

type ReplayVisit = {id: number | string; systemId: number; name: string; entered: string; exited?: string | null; seconds?: number; inferred?: boolean; clipped?: boolean; active?: boolean; coordinates_available?: boolean; location_basis?: string};
type ReplayEvent = {id: number | string; type: string; module?: string; summary: string; at: string; system_id?: number | null; system_name?: string | null; visit_id?: number | string | null; location_basis?: string; payload?: unknown};
type ReplayTravel = {from_visit_id: number | string; to_visit_id: number | string; from_system_id: number; to_system_id: number; at: string; connection_basis: string};
export type SessionReplayData = {
  session: {id: number | string; label?: string; character_id: number; started: string; ended?: string | null; live?: boolean};
  startedAt: string; endedAt: string; snapshotAt: string; durationMs: number;
  visits: ReplayVisit[]; events: ReplayEvent[]; systems: any[]; travel: ReplayTravel[];
  coverage: {totalEvents: number; returnedEvents: number; truncated: boolean; omittedEvents: number; missingCoordinateSystemIds: number[]; unlocatedEvents: number; inferredVisitCount: number; gaps: {from: string; to: string; reason: string}[]; notes: string[]};
};
export type ReplayMapFrame = {
  systemId: number | null; follow: boolean; smooth: boolean; focusKey: string;
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
  const timeline = useMemo(() => {
    if (!data) return {visits: [] as (ReplayVisit & {start: number; end: number})[], events: [] as (ReplayEvent & {time: number})[], start: 0};
    const start = Date.parse(data.startedAt);
    return {start, visits: data.visits.map(visit => ({...visit, start: Date.parse(visit.entered), end: visit.exited ? Date.parse(visit.exited) : Date.parse(data.endedAt)})).sort((a, b) => a.start - b.start), events: data.events.map(event => ({...event, time: Date.parse(event.at)})).sort((a, b) => a.time - b.time)};
  }, [data]);
  const at = timeline.start + elapsedMs;
  const currentVisit = useMemo(() => [...timeline.visits].reverse().find(visit => visit.start <= at && (at < visit.end || (at === visit.end && at === Date.parse(data?.endedAt || '')))) || null, [timeline.visits, at, data?.endedAt]);
  const recentEvents = useMemo(() => timeline.events.filter(event => event.time <= at).slice(-6).reverse(), [timeline.events, at]);
  const nextVisit = useMemo(() => timeline.visits.find(visit => visit.start > at) || null, [timeline.visits, at]);
  const discoveredSystemIds = useMemo(() => [...new Set(timeline.visits.map(visit => visit.systemId))], [timeline.visits]);
  const frame = useMemo<ReplayMapFrame | null>(() => data ? {
    systemId: currentVisit?.coordinates_available === false ? null : currentVisit?.systemId || null,
    follow, smooth, focusKey: `${request?.sessionId}:${currentVisit?.id || 'gap'}:${scrubKey}`,
    trailSystemIds: [...new Set(timeline.visits.filter(visit => visit.start <= at).map(visit => visit.systemId))],
    discoveredSystemIds, allTravel: data.travel,
    travel: data.travel.filter(edge => Date.parse(edge.at) <= at),
    eventSystemIds: [...new Set(recentEvents.filter(event => event.system_id && at - event.time < Math.max(30000, speed * 1800)).map(event => event.system_id!))],
    events: recentEvents.filter(event => event.system_id && at - event.time < Math.max(30000, speed * 1800)).slice(0, 3).map(event => ({id: event.id, systemId: event.system_id!, summary: event.summary || event.type, type: event.type, locationBasis: event.location_basis || 'unknown'})),
    at: new Date(at).toISOString(),
  } : null, [data, currentVisit, follow, smooth, request?.sessionId, scrubKey, timeline.visits, at, recentEvents, discoveredSystemIds, speed]);
  const previous = useCallback(() => {const visit = [...timeline.visits].reverse().find(item => item.start < at - 1000); seek(visit ? visit.start - timeline.start : 0);}, [timeline, at, seek]);
  const next = useCallback(() => seek(nextVisit ? nextVisit.start - timeline.start : Number(data?.durationMs) || 0), [nextVisit, timeline.start, data?.durationMs, seek]);
  const previousEvent = [...timeline.events].reverse().find(event => event.time < at);
  const nextEvent = timeline.events.find(event => event.time > at);
  return {active: Boolean(request), request, data, loading, error, elapsedMs, playing, speed, follow, frame, currentVisit, nextVisit, recentEvents, previousEvent, nextEvent, timeline, seek, close, stopFollowing, toggleFollow, togglePlaying, previous, next, setSpeed, retry: () => setReload(value => value + 1)};
}

export function SessionReplayControls({replay}: {replay: ReturnType<typeof useSessionReplay>}) {
  if (!replay.active) return null;
  const {data, currentVisit, playing, timeline} = replay;
  const duration = Math.max(0, Number(data?.durationMs) || 0), percent = duration ? replay.elapsedMs / duration * 100 : 0;
  const ticks = timeline.events.filter((_, index) => index % Math.max(1, Math.ceil(timeline.events.length / 120)) === 0);
  const gap = data?.coverage?.gaps?.find(item => Date.parse(item.from) <= timeline.start + replay.elapsedMs && Date.parse(item.to) > timeline.start + replay.elapsedMs);
  return <section className="session-replay" aria-label="Session replay">
    <div className="session-replay-heading"><div className="session-replay-title"><Film size={19}/><div><span className="eyebrow">SESSION REPLAY</span><h3>{data?.session.label || (replay.loading ? 'Loading recorded session…' : 'Recorded session')}</h3></div>{data?.session.live && <span className="tag">LIVE SESSION SNAPSHOT</span>}</div><Button variant="ghost" size="icon" aria-label="Close session replay" onClick={replay.close}><X size={16}/></Button></div>
    {replay.error && <div className="session-replay-error" role="alert"><span>{replay.error}</span><Button size="sm" variant="outline" onClick={replay.retry}>Retry</Button></div>}
    {replay.loading && <p className="session-replay-note">Loading your recorded visits and events.</p>}
    {data && <>
      <div className="session-replay-status"><div><MapPin size={14}/><strong>{currentVisit?.name || 'Location not recorded'}</strong>{currentVisit?.inferred && <span className="tag">INFERRED</span>}{currentVisit?.coordinates_available === false && <span className="tag">NO COORDINATES</span>}</div><time dateTime={new Date(timeline.start + replay.elapsedMs).toISOString()}>{timeLabel(timeline.start + replay.elapsedMs)}<span> EVE / UTC · {UTC_DATE.format(new Date(timeline.start + replay.elapsedMs))}</span></time></div>
      <div className="session-replay-timeline"><div className="session-replay-ticks" aria-hidden="true">{ticks.map((event, index) => <i key={String(event.id) + ':' + index} style={{left: `${Math.max(0, Math.min(100, duration ? (event.time - timeline.start) / duration * 100 : 0))}%`}}/>)}</div><input aria-label="Session replay time" aria-valuetext={`${elapsedLabel(replay.elapsedMs)} of ${elapsedLabel(duration)}${currentVisit ? ', ' + currentVisit.name : ', location unavailable'}`} type="range" min={0} max={Math.max(1, duration)} step={1000} value={replay.elapsedMs} onChange={event => replay.seek(Number(event.target.value))} style={{background: `linear-gradient(to right, #97ebce 0%, #97ebce ${percent}%, #2a3a49 ${percent}%, #2a3a49 100%)`}}/><div className="session-replay-time-labels"><span>{elapsedLabel(replay.elapsedMs)}</span><span>{elapsedLabel(duration)}</span></div></div>
      <div className="session-replay-controls"><div className="session-replay-transport"><Button variant="ghost" size="icon" aria-label="Restart session replay" onClick={() => replay.seek(0)}><RotateCcw size={15}/></Button><Button variant="ghost" size="icon" aria-label="Previous recorded system" onClick={replay.previous}><SkipBack size={16}/></Button><Button className="session-replay-play" aria-label={playing ? 'Pause session replay' : 'Play session replay'} disabled={!duration} onClick={replay.togglePlaying}>{playing ? <Pause size={16}/> : <Play size={16}/>} {playing ? 'Pause' : replay.elapsedMs >= duration ? 'Replay' : 'Play'}</Button><Button variant="ghost" size="icon" aria-label="Next recorded system" onClick={replay.next}><SkipForward size={16}/></Button><label>Speed<select aria-label="Replay speed" value={replay.speed} onChange={event => replay.setSpeed(Number(event.target.value))}>{SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label></div><Button variant={replay.follow ? 'outline' : 'ghost'} size="sm" aria-pressed={replay.follow} onClick={replay.toggleFollow}><Crosshair size={14}/>{replay.follow ? 'Following pilot' : 'Resume follow'}</Button></div>
      {gap && <p className="session-replay-gap">Recording gap · {gap.reason || 'No location was recorded for this interval.'}</p>}
      <div className="session-replay-events"><div className="session-replay-event-heading"><span className="eyebrow">RECORDED ACTIVITY · EVE / UTC</span><div><Button variant="ghost" size="sm" aria-label="Previous recorded event" disabled={!replay.previousEvent} onClick={() => replay.previousEvent && replay.seek(replay.previousEvent.time - timeline.start)}><ChevronLeft size={13}/>Previous event</Button><Button variant="ghost" size="sm" aria-label="Next recorded event" disabled={!replay.nextEvent} onClick={() => replay.nextEvent && replay.seek(replay.nextEvent.time - timeline.start)}>Next event<ChevronRight size={13}/></Button></div></div>{replay.recentEvents.length ? replay.recentEvents.map((event, index) => <button key={String(event.id) + ':' + index} onClick={() => replay.seek(event.time - timeline.start)}><time>{timeLabel(event.at)}</time><span>{event.summary || event.type}</span><small>{event.system_name || 'Location unavailable'}{event.location_basis === 'observed_visit' ? ' · pilot context' : event.location_basis?.includes('inferred') ? ' · inferred pilot context' : ''}</small></button>) : <p>No recorded events at this point in the session.</p>}</div>
      <div className="session-replay-footer"><span>Recorded visits and events · dotted lines show observed transitions.</span><span>Manual map movement pauses camera follow.</span></div>
      {(data.coverage?.truncated || data.coverage?.missingCoordinateSystemIds?.length || data.coverage?.unlocatedEvents || data.coverage?.notes?.length) ? <details className="session-replay-coverage"><summary>Recording coverage</summary>{data.coverage.truncated && <p>{data.coverage.returnedEvents.toLocaleString()} of {data.coverage.totalEvents.toLocaleString()} events shown; {data.coverage.omittedEvents.toLocaleString()} events omitted by the replay limit.</p>}{!!data.coverage.missingCoordinateSystemIds?.length && <p>{data.coverage.missingCoordinateSystemIds.length} systems have no coordinates and cannot be placed on the map.</p>}{!!data.coverage.unlocatedEvents && <p>{data.coverage.unlocatedEvents} events have no recorded location.</p>}{data.coverage.notes?.map((note, index) => <p key={index}>{note}</p>)}</details> : null}
    </>}
  </section>;
}
