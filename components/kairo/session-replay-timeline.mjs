// A replay owns one fixed snapshot. Parse and index it once, then inspect only
// the changing boundaries on ticks and seeks. No live or cross-pilot state.
const lowerBound=(rows,key,time)=>{let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid][key]<time)low=mid+1;else high=mid;}return low;};
const upperBound=(rows,key,time)=>{let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid][key]<=time)low=mid+1;else high=mid;}return low;};
const visible=event=>!['system.entered','location.changed'].includes(event.type)&&!event.type.startsWith('opsec.')&&event.module!=='opsec';

/**
 * Index an immutable replay snapshot once. Input dates are UTC ISO strings;
 * start/end and at(time) use epoch milliseconds. Null input yields empty indexes.
 *
 * Visits use [start,end) except the overall final instant is inclusive. At equal
 * starts, the last matching visit wins, including overlapping legacy rows. Trails
 * and travel preserve bounded prefix identity until their boundary changes; the
 * five most recent visible events and at most 120 timeline ticks are presentation
 * limits. This historical view must not consume current tracking state.
 * See ../../docs/SESSIONS.md for suppression and coverage semantics.
 */
export function prepareReplayTimeline(data){
 const start=data?Date.parse(data.startedAt):0,end=data?Date.parse(data.endedAt):0;
 const visits=(data?.visits||[]).map(visit=>({...visit,start:Date.parse(visit.entered),end:visit.exited?Date.parse(visit.exited):end})).sort((a,b)=>a.start-b.start);
 const events=(data?.events||[]).filter(visible).map(event=>({...event,time:Date.parse(event.at)})).sort((a,b)=>a.time-b.time);
 // A max-end tree preserves the original last-matching-visit rule even for
 // overlapping/zero-duration legacy rows, without a reverse linear scan.
 let width=1;while(width<visits.length)width*=2;
 const ends=new Float64Array(width*2);ends.fill(-Infinity);
 for(let i=0;i<visits.length;i++)ends[width+i]=Number.isFinite(visits[i].end)?visits[i].end:-Infinity;
 for(let i=width-1;i;i--)ends[i]=Math.max(ends[i*2],ends[i*2+1]);
 function currentIndex(time,limit,inclusive){
  function find(node,left,right){
   if(left>=limit||(inclusive?ends[node]<time:ends[node]<=time))return -1;
   if(right-left===1)return left;
   const middle=(left+right)>>>1,result=find(node*2+1,middle,right);
   return result>=0?result:find(node*2,left,middle);
  }
  return limit?find(1,0,width):-1;
 }
 const systems=[],seen=new Set();for(const visit of visits)if(!seen.has(visit.systemId)){seen.add(visit.systemId);systems.push({systemId:visit.systemId,start:visit.start});}
 const discoveredSystemIds=systems.map(item=>item.systemId);
 const travel=(data?.travel||[]).map((edge,index)=>({edge,index,time:Date.parse(edge.at)})).filter(item=>Number.isFinite(item.time)).sort((a,b)=>a.time-b.time);
 const orderedTravel=travel.every((item,i)=>!i||item.index>travel[i-1].index);
 const gaps=(data?.coverage?.gaps||[]).map(gap=>({gap,start:Date.parse(gap.from),end:Date.parse(gap.to)}));
 const orderedGaps=gaps.every((gap,i)=>!i||gap.start>=gaps[i-1].end);
 const stride=Math.max(1,Math.ceil(events.length/120)),ticks=events.filter((_,i)=>i%stride===0);
 let trailCount=-1,trailSystemIds=[],travelCount=-1,travelEdges=[];
 function at(time){
  const visitLimit=upperBound(visits,'start',time),eventLimit=upperBound(events,'time',time),priorEvent=lowerBound(events,'time',time)-1;
  const trailLimit=upperBound(systems,'start',time),edgeLimit=upperBound(travel,'time',time);
  if(trailLimit!==trailCount){trailCount=trailLimit;trailSystemIds=discoveredSystemIds.slice(0,trailLimit);}
  if(edgeLimit!==travelCount){travelCount=edgeLimit;const prefix=travel.slice(0,edgeLimit);travelEdges=(orderedTravel?prefix:prefix.sort((a,b)=>a.index-b.index)).map(item=>item.edge);}
  const gapIndex=orderedGaps?upperBound(gaps,'start',time)-1:-1;
  const gap=orderedGaps?(gapIndex>=0&&time<gaps[gapIndex].end?gaps[gapIndex].gap:null):(gaps.find(item=>item.start<=time&&item.end>time)?.gap||null);
  return {currentVisit:visits[currentIndex(time,visitLimit,time===end)]||null,nextVisit:visits[visitLimit]||null,previousVisit:visits[lowerBound(visits,'start',time-1000)-1]||null,
   recentEvents:events.slice(Math.max(0,eventLimit-5),eventLimit).reverse(),previousEvent:events[priorEvent],nextEvent:events[eventLimit],trailSystemIds,travel:travelEdges,gap};
 }
 return {start,end,visits,events,ticks,discoveredSystemIds,at};
}
