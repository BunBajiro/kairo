type Visit = {systemId:number;name?:string;seconds:number};
type Killmail = {killmailId:number;systemId:number};
type SummaryRecord = {
 route:Visit[];
 personalCombat:{items:Killmail[]};
 allianceCombat:{items:Killmail[]};
 names:Record<string,string>;
};

// Consume the report's already-qualified records; never extend visit windows
// here. A killmail appearing in both personal and alliance lists counts once.
export function mostActiveSystem(report:SummaryRecord){
 const systems=new Map<number,{systemId:number;name:string;seconds:number;killmails:number}>();
 function system(id:number,name?:string){
  let entry=systems.get(id);
  if(!entry){entry={systemId:id,name:name||report.names[id]||'System '+id,seconds:0,killmails:0};systems.set(id,entry);}
  return entry;
 }
 for(const visit of report.route)system(visit.systemId,visit.name).seconds+=visit.seconds;
 const seen=new Set<number>();
 for(const mail of [...report.personalCombat.items,...report.allianceCombat.items]){
  if(seen.has(mail.killmailId))continue;
  seen.add(mail.killmailId);system(mail.systemId).killmails++;
 }
 // Total observed time breaks combat ties and includes return visits. The ID
 // tie-break keeps the result stable when newly collected arrays reorder.
 const best=[...systems.values()].sort((a,b)=>b.killmails-a.killmails||b.seconds-a.seconds||a.systemId-b.systemId)[0];
 if(!best||(!best.killmails&&!best.seconds))return null;
 return {...best,measure:best.killmails?'combat' as const:'time' as const};
}
