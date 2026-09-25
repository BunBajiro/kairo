/** Wall-clock freshness survives frequent data refreshes and never requires an animation loop. */
export function createJSpaceClock({onTick,readNow=Date.now,isVisible=()=>true,setRepeating=setInterval,clearRepeating=clearInterval,setDeadline=setTimeout,clearDeadline=clearTimeout}) {
  let records=[],deadline=null,closed=false;
  function scheduleExpiry(instant) {
    if(deadline!==null){clearDeadline(deadline);deadline=null;}
    if(closed||!isVisible())return;
    const future=records.map(row=>Date.parse(row?.expires_at||'')).filter(value=>Number.isFinite(value)&&value>instant);
    if(future.length)deadline=setDeadline(publish,Math.max(1,Math.min(...future)-instant+10));
  }
  function publish(){if(closed||!isVisible())return;const instant=readNow();onTick(instant);scheduleExpiry(instant);}
  // This cadence is created once. Incoming snapshots cannot postpone it.
  const interval=setRepeating(publish,30000);
  return {
    refresh(nextRecords=[]){records=nextRecords;publish();},
    visible(){publish();},
    close(){closed=true;clearRepeating(interval);if(deadline!==null)clearDeadline(deadline);deadline=null;},
  };
}
