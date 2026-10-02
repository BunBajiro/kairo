import { captureVisitSovereignty } from './visit-sovereignty.mjs';
const validId = value => Number.isSafeInteger(value) && value > 0;

// Legacy activity has no explicit owner and keeps its time/cursor semantics.
// New Pilot events carry a session ID or JSON null, including events emitted
// after asynchronous metadata completes. The one SQL parameter is session.id.
export const sessionObservationOwnershipSql = (prefix = '') => `(${prefix}type NOT IN ('location.changed','ship.changed')
    OR json_type(${prefix}payload,'$.session_id') IS NULL OR json_extract(${prefix}payload,'$.session_id')=?)`;

// The character/time predicate uses the existing bounded visits index. Owned
// rows from another session never become evidence through a shared timestamp.
export function readSessionVisits(store, session, end, { inclusiveEnd = false } = {}) {
    return store.db.prepare(`SELECT v.*,u.name system_name,u.region_id,u.region_name,u.security
        FROM visits v LEFT JOIN universe_systems u USING(system_id)
        WHERE character_id=? AND at>=? AND at${inclusiveEnd ? '<=' : '<'}?
        AND (session_id=? OR session_id IS NULL) ORDER BY at,id`)
        .all(session.character_id, session.started, end, session.id);
}

export function legacySessionStart(store, session) {
    return store.db.prepare(`SELECT * FROM visits WHERE character_id=? AND session_id IS NULL
        AND at<=? ORDER BY at DESC,id DESC LIMIT 1`).get(session.character_id, session.started);
}

function lastSessionSystem(store, session, at) {
    const last = store.db.prepare(`SELECT system_id FROM visits WHERE character_id=? AND at>=? AND at<=?
        AND (session_id=? OR session_id IS NULL) ORDER BY at DESC,id DESC LIMIT 1`)
        .get(session.character_id, session.started, at, session.id);
    const start = JSON.parse(session.start_context);
    return last?.system_id ?? start.system?.id ?? (!start.capturedAt ? legacySessionStart(store, session)?.system_id : null);
}

// Capture local receipt eligibility before Core awaits display metadata/names.
// ESI timestamps do not choose session ownership. This small immutable snapshot
// travels with the accepted data event, including an explicit no-session owner.
export function captureSessionObservation(store, { characterId, systemId, at = new Date().toISOString() }) {
    const session = store.db.prepare(`SELECT * FROM sessions WHERE character_id=? AND ended IS NULL
        AND started<=? ORDER BY started DESC,id DESC LIMIT 1`).get(characterId, at);
    const movement = !!session && validId(systemId) && lastSessionSystem(store, session, at) !== systemId;
    return { characterId, systemId, at, sessionId: session?.id || null, movement,
        shipTypeId: store.snapshot(characterId, 'ship')?.data?.ship_type_id || null,
        sovereignty: movement ? captureVisitSovereignty(store, systemId, at) : null };
}

// Durable rows/start context reconstruct the baseline after restart. A delayed
// accepted observation can belong to a now-ended session, never its successor.
export function recordSessionObservation(store, { characterId, systemId, name, shipTypeId, at, sovereignty, observation }) {
    if (!validId(characterId) || !validId(systemId)) return null;
    const captured = observation || captureSessionObservation(store, { characterId, systemId, at });
    if (captured.characterId !== characterId || captured.systemId !== systemId || !captured.movement || !captured.sessionId || !Number.isFinite(Date.parse(captured.at))) return null;
    const session = store.db.prepare(`SELECT * FROM sessions WHERE id=? AND character_id=? AND started<=?
        AND (ended IS NULL OR ended>=?)`).get(captured.sessionId, characterId, captured.at, captured.at);
    if (!session || lastSessionSystem(store, session, captured.at) === systemId) return null;
    const owner = sovereignty === undefined ? captured.sovereignty : sovereignty;
    const result = store.db.prepare(`INSERT INTO visits(character_id,system_id,name,ship_type_id,at,sovereignty_at_visit,session_id)
        VALUES(?,?,?,?,?,?,?)`).run(characterId, systemId, name || String(systemId), shipTypeId ?? captured.shipTypeId, captured.at,
        owner ? JSON.stringify(owner) : null, session.id);
    return { id: Number(result.lastInsertRowid), sessionId: session.id };
}
