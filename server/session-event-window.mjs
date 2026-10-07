import { sessionObservationOwnershipSql } from './session-travel.mjs';

// Shared event membership only: reports own aggregation/pagination and replay
// owns suppression, limits and its fixed snapshot. Killmails use occurrence
// time; other events at an exact boundary use captured cursors. An owned end
// event may arrive after the end cursor, as may accepted Pilot observations.
// A missing session_id is legacy evidence; explicit JSON null means unowned.
export function sessionEventWindow(session, start, finish, end, { prefix = '', eventCursor } = {}) {
    const column = name => prefix + name;
    const at = column('at'), id = column('id'), type = column('type'), payload = column('payload');
    const snapshot = eventCursor !== undefined;
    const where = `${column('character_id')}=? AND ${at}>=? AND ${at}<=?${snapshot ? ` AND ${id}<=?` : ''}
        AND (${type} NOT IN ('session.started','session.ended') OR json_extract(${payload},'$.session_id')=?)
        AND ((${type} IN ('killmail.kill','killmail.loss') AND ${at}<?)
        OR (${type} NOT IN ('killmail.kill','killmail.loss') AND (${at}>? OR ${id}>?)
        AND (${at}<? OR ${id}<=? OR json_extract(${payload},'$.session_id')=?)))
        AND ${sessionObservationOwnershipSql(prefix)}`;
    const params = [session.character_id, session.started, end];
    if (snapshot) params.push(eventCursor);
    params.push(session.id, end, session.started, start.eventCursor ?? 0, end,
        session.ended ? (finish.eventCursor ?? Number.MAX_SAFE_INTEGER) : (eventCursor ?? Number.MAX_SAFE_INTEGER),
        session.id, session.id);
    return { where, params };
}
