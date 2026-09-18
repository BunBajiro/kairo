import { sessionRoute } from './session-details.mjs';
import { getUniverseStatic, LIGHT_YEAR_METRES } from './universe-static.mjs';

export const SESSION_REPLAY_EVENT_LIMIT = 10000;
const validId = value => Number.isSafeInteger(value) && value > 0;
const iso = value => new Date(value).toISOString();
const parse = value => {
    try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch { return {}; }
};

/**
 * A read-only snapshot of an owned session. This deliberately does not call
 * sessionReport (which calculates report aggregates) or any live collector.
 * sessionRoute supplies the exact report visit sequence, including loops and
 * legacy inferred starts. An observed transition is never a confirmed gate hop.
 */
export function sessionReplay(store, id, characterId, { now = Date.now, eventLimit = SESSION_REPLAY_EVENT_LIMIT } = {}) {
    if (!validId(characterId)) throw new Error('Session not found for this character.');
    const session = store.db.prepare('SELECT * FROM sessions WHERE id=? AND character_id=?').get(id, characterId);
    if (!session) throw new Error('Session not found for this character.');
    const captured = typeof now === 'function' ? now() : now;
    const snapshotAt = iso(captured), startedAt = session.started, endedAt = session.ended || snapshotAt;
    const from = Date.parse(startedAt), to = Date.parse(endedAt);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('This session has invalid replay time boundaries.');
    const start = parse(session.start_context), finish = parse(session.end_context);
    const eventCursor = store.db.prepare('SELECT COALESCE(MAX(id),0) id FROM events').get().id;
    const limit = Math.max(1, Math.min(SESSION_REPLAY_EVENT_LIMIT, Math.floor(Number(eventLimit)) || SESSION_REPLAY_EVENT_LIMIT));

    // Keep these boundary semantics aligned with history.mjs: late-arriving
    // killmail events are selected by occurrence time, while other events at the
    // exact start/end use captured event cursors. The session's own end event is
    // emitted after its end cursor and must still be included.
    const where = `e.character_id=? AND e.at>=? AND e.at<=? AND e.id<=?
        AND (e.type NOT IN ('session.started','session.ended') OR json_extract(e.payload,'$.session_id')=?)
        AND ((e.type IN ('killmail.kill','killmail.loss') AND e.at<?)
        OR (e.type NOT IN ('killmail.kill','killmail.loss') AND (e.at>? OR e.id>?)
        AND (e.at<? OR e.id<=? OR json_extract(e.payload,'$.session_id')=?)))`;
    const params = [characterId, startedAt, endedAt, eventCursor, session.id, endedAt, startedAt,
        start.eventCursor ?? 0, endedAt, session.ended ? (finish.eventCursor ?? Number.MAX_SAFE_INTEGER) : eventCursor, session.id];
    // Visits already describe movement. Routine location/protection changes
    // should neither clutter replay nor consume its meaningful-event budget.
    // This affects only this snapshot; the source history and reports are intact.
    const visibleEvent = `e.type NOT IN ('system.entered','location.changed') AND e.type NOT GLOB 'opsec.*' AND e.module!='opsec'`;
    const counts = store.db.prepare(`SELECT COUNT(*) sourceEvents,
        COALESCE(SUM(CASE WHEN ${visibleEvent} THEN 1 ELSE 0 END),0) totalEvents
        FROM events e WHERE ${where}`).get(...params);
    const totalEvents = counts.totalEvents, suppressedRoutineEvents = counts.sourceEvents - totalEvents;
    const rows = store.db.prepare(`SELECT e.*,c.body combat_body FROM events e
        LEFT JOIN combat_records c ON e.type IN ('killmail.kill','killmail.loss')
        AND c.character_id=e.character_id AND c.killmail_id=json_extract(e.payload,'$.killmail_id')
        WHERE ${where} AND (${visibleEvent}) ORDER BY e.at,e.id LIMIT ?`).all(...params, limit);
    const graph = getUniverseStatic(), names = store.get('names', {}), systems = new Map();
    const storedSystem = store.db.prepare('SELECT * FROM universe_systems WHERE system_id=?');
    const missingCoordinates = new Set();
    function rememberSystem(systemId, name) {
        if (!validId(systemId)) return null;
        if (systems.has(systemId)) return systems.get(systemId);
        const existing = graph.bySystemId.get(systemId), recorded = existing || storedSystem.get(systemId);
        const available = recorded && [recorded.x, recorded.y, recorded.z].every(value => typeof value === 'number' && Number.isFinite(value));
        const system = existing || {
            ...(recorded || {}), system_id: systemId, name: recorded?.name || name || names[systemId] || 'System ' + systemId,
            x: available ? recorded.x : null, y: available ? recorded.y : null, z: available ? recorded.z : null,
            map_x: available ? recorded.x / LIGHT_YEAR_METRES : null,
            map_y: available ? -recorded.z / LIGHT_YEAR_METRES : null,
            space: systemId >= 31000000 && systemId < 32000000 ? 'wormhole' : 'known',
        };
        const result = { ...system, coordinates_available: !!available, coordinate_source: existing ? 'static' : available ? 'recorded' : 'unavailable' };
        if (!available) missingCoordinates.add(systemId);
        systems.set(systemId, result);
        return result;
    }
    const visits = sessionRoute(store, session, start, endedAt, names).map(visit => ({
        ...visit, location_basis: visit.inferred ? 'inferred_visit' : visit.clipped ? 'session_start' : 'recorded_visit',
        coordinates_available: rememberSystem(visit.systemId, visit.name)?.coordinates_available || false,
    }));
    const visitTimes = visits.map(visit => Date.parse(visit.entered));
    function visitAt(at) {
        const time = Date.parse(at);
        let lo = 0, hi = visitTimes.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (visitTimes[mid] <= time) lo = mid + 1; else hi = mid; }
        const index = lo - 1, visit = visits[index];
        return visit && (time < Date.parse(visit.exited) || (index === visits.length - 1 && time === to)) ? visit : null;
    }
    let unlocatedEvents = 0, contextualEvents = 0;
    const events = rows.map(row => {
        const { combat_body, ...event } = row, payload = parse(row.payload), record = combat_body ? parse(combat_body) : null;
        const explicit = [payload.system_id, payload.solar_system_id, payload.systemId,
            payload.system?.system_id, payload.system?.id].find(validId);
        const combatSystem = validId(record?.solar_system_id) ? record.solar_system_id : null;
        const visit = visitAt(row.at);
        const systemId = explicit || combatSystem || visit?.systemId || null;
        const basis = explicit ? 'explicit_payload' : combatSystem ? 'combat_record'
            : visit ? (visit.inferred ? 'inferred_visit' : 'observed_visit') : 'unknown';
        if (!systemId) unlocatedEvents++;
        if (basis === 'observed_visit' || basis === 'inferred_visit') contextualEvents++;
        const system = rememberSystem(systemId, payload.system_name || (visit?.systemId === systemId ? visit.name : undefined));
        return { ...event, payload, system_id: systemId, system_name: system?.name || null,
            visit_id: visit?.systemId === systemId ? visit.id : null, location_basis: basis,
            coordinates_available: !!system?.coordinates_available };
    });
    const travel = visits.slice(1).flatMap((visit, index) => {
        const previous = visits[index];
        return previous.systemId === visit.systemId ? [] : [{
            from_visit_id: previous.id, to_visit_id: visit.id,
            from_system_id: previous.systemId, to_system_id: visit.systemId,
            from_at: previous.entered, at: visit.entered, connection_basis: 'observed_transition',
            inferred_origin: previous.inferred,
        }];
    });
    const gaps = [];
    if (!visits.length) gaps.push({ from: startedAt, to: endedAt, reason: 'No recorded session location is available.' });
    else if (Date.parse(visits[0].entered) > from) gaps.push({ from: startedAt, to: visits[0].entered, reason: 'Location before the first recorded visit is unavailable.' });
    const truncated = totalEvents > events.length;
    return {
        session: { id: session.id, label: session.label, character_id: session.character_id, started: session.started, ended: session.ended, live: !session.ended },
        startedAt, endedAt, snapshotAt, durationMs: Math.max(0, to - from), eventCursor,
        visits, events, systems: [...systems.values()], travel,
        coverage: { totalEvents, returnedEvents: events.length, truncated, omittedEvents: totalEvents - events.length, eventLimit: limit, suppressedRoutineEvents,
            missingCoordinateSystemIds: [...missingCoordinates].sort((a, b) => a - b), unlocatedEvents, contextualEvents,
            inferredVisitCount: visits.filter(v => v.inferred).length, gaps,
            notes: [
                'Movement connects recorded visits only; dotted links do not confirm a gate, wormhole, filament or intervening route.',
                'The player remains at the last recorded system between observations; a long stay does not establish a recording gap.',
                'Events located by an observed visit show the pilot context, not a confirmed location for the activity itself.',
                ...(!session.ended ? ['This live session is replayed as a fixed snapshot; reopen it to include later observations.'] : []),
                ...(truncated ? [`Only the first ${events.length.toLocaleString('en-GB')} of ${totalEvents.toLocaleString('en-GB')} events are included. All recorded visits remain available.`] : []),
            ] },
    };
}
