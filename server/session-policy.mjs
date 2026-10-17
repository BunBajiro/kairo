/**
 * Shared Session collection timing. Millisecond constants govern a two-minute
 * live cadence and settling until exactly 24 hours after end; an open Session
 * never becomes static merely because it is old. See ../docs/SESSIONS.md.
 */
export const SESSION_LIVE_INTERVAL=120000;
export const SESSION_RECHECK_WINDOW=24*3600000;
/** Return phase, nullable ISO settling deadline, and live cadence in seconds. */
export function sessionCollection(session,now=Date.now()){
 const until=session.ended?Date.parse(session.ended)+SESSION_RECHECK_WINDOW:null;
 return {phase:until===null?'live':now<until?'settling':'static',until:until===null?null:new Date(until).toISOString(),intervalSeconds:SESSION_LIVE_INTERVAL/1000};
}
