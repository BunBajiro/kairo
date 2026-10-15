/** A pending destination is an additional, unsaved stop, even if it names the
 * saved final waypoint. Never present that itinerary as the new draft's route. */
export function navigationPlanForDraft(plan, itinerary, draft, systems, tool = 'gate') {
  if (!plan || !itinerary || String(draft?.to || '').trim()) return null;
  if (tool !== 'range' && itinerary.kind !== tool) return null;
  if (plan.status === 'ok' && !Number.isSafeInteger(plan.revision)) return null;
  if (plan.revision != null && plan.revision !== itinerary.revision) return null;
  const origin = String(draft?.from || '').trim().toLowerCase();
  if (origin) {
    const system = systems.find(row => String(row.system_id) === origin || row.name.toLowerCase() === origin);
    if (!system || system.system_id !== itinerary.originId) return null;
  }
  if (plan.status === 'ok') {
    const completed = new Set(itinerary.progress?.completedStopIds || []);
    const pending = (itinerary.stops || []).filter(stop => !completed.has(stop.id));
    if (!pending.length || !Array.isArray(plan.segments) || plan.segments.length !== pending.length) return null;
    if (plan.segments.some((segment, index) => segment.stopId !== pending[index].id || segment.toSystemId !== pending[index].systemId)) return null;
    if (!Array.isArray(plan.systemIds) || plan.systemIds.at(-1) !== pending.at(-1).systemId) return null;
    if (!itinerary.followLocation) {
      const from = (itinerary.stops || []).filter(stop => completed.has(stop.id)).at(-1)?.systemId ?? itinerary.originId;
      if (plan.systemIds[0] !== from) return null;
    }
  }
  return plan;
}
