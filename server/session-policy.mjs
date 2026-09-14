export const SESSION_LIVE_INTERVAL=120000;
export const SESSION_RECHECK_WINDOW=24*3600000;
export function sessionCollection(session,now=Date.now()){
 const until=session.ended?Date.parse(session.ended)+SESSION_RECHECK_WINDOW:null;
 return {phase:until===null?'live':now<until?'settling':'static',until:until===null?null:new Date(until).toISOString(),intervalSeconds:SESSION_LIVE_INTERVAL/1000};
}
