/**
 * Own the Maps freshness cadence and nearest absolute expiry, without an animation
 * loop. Times are Unix milliseconds; records carry parseable `expires_at` strings.
 * `refresh` replaces the full deadline set. Pass the time already consumed by the
 * render to avoid a redundant tick; omitting it publishes current time immediately
 * when visible.
 * The owner forwards visibility changes to `visible()` and calls `close()` on
 * disposal. Injected clocks/timers must share one time basis (also used by tests).
 */
export function createJSpaceClock({onTick,readNow=Date.now,isVisible=()=>true,setRepeating=setInterval,clearRepeating=clearInterval,setDeadline=setTimeout,clearDeadline=clearTimeout}) {
  let records=[],deadline=null,closed=false;
  function scheduleExpiry(instant,renderedAt=instant) {
    if(deadline!==null){clearDeadline(deadline);deadline=null;}
    if(closed||!isVisible())return;
    // A deadline crossed between rendering and this effect still needs a tick.
    const future=records.map(row=>Date.parse(row?.expires_at||'')).filter(value=>Number.isFinite(value)&&value>renderedAt);
    if(future.length)deadline=setDeadline(publish,Math.max(1,Math.min(...future)-instant+10));
  }
  function publish(){if(closed||!isVisible())return;const instant=readNow();onTick(instant);scheduleExpiry(instant);}
  // This cadence is created once. Incoming snapshots cannot postpone it.
  const interval=setRepeating(publish,30000);
  return {
    // A caller that already rendered the current time only needs deadline ownership.
    refresh(nextRecords=[],renderedAt){
      records=nextRecords;
      if(!Number.isFinite(renderedAt))return publish();
      const instant=readNow();
      // A wall-clock correction after rendering must also become visible immediately.
      if(instant<renderedAt)publish();else scheduleExpiry(instant,renderedAt);
    },
    visible(){publish();},
    close(){closed=true;clearRepeating(interval);if(deadline!==null)clearDeadline(deadline);deadline=null;},
  };
}
