type Visit = {systemId:number;entered:string;exited?:string|null};
type Event = {type:string;module?:string;at:string};
type Travel = {at:string};
type Gap = {from:string;to:string};
/** Index one immutable historical snapshot; at/start/end use epoch milliseconds. */
export function prepareReplayTimeline<V extends Visit,E extends Event,T extends Travel,G extends Gap>(data:{startedAt:string;endedAt:string;visits:V[];events:E[];travel:T[];coverage:{gaps:G[]}}|null):{
 start:number;end:number;visits:(V&{start:number;end:number})[];events:(E&{time:number})[];ticks:(E&{time:number})[];discoveredSystemIds:number[];
 at(time:number):{currentVisit:(V&{start:number;end:number})|null;nextVisit:(V&{start:number;end:number})|null;previousVisit:(V&{start:number;end:number})|null;recentEvents:(E&{time:number})[];previousEvent:(E&{time:number})|undefined;nextEvent:(E&{time:number})|undefined;trailSystemIds:number[];travel:T[];gap:G|null};
};
