/** Return a plan compatible with the draft and any supplied revision; successful plans also require matching ordered stops. */
export function navigationPlanForDraft(plan: any, itinerary: any, draft: {from: string; to: string}, systems: {system_id: number; name: string}[], tool?: 'gate' | 'jump' | 'range'): any | null;
