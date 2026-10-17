/**
 * Dashboard wire/view shapes and the same-origin JSON transport. These types are
 * not runtime validators or the sanitized Stream output schema. The server owns
 * authorization, validation and retained data; ../../docs/API-REFERENCE.md owns
 * route details, while ../../docs/INTERNAL-API.md explains freshness and identity.
 */
/**
 * A retained sample plus its current availability. Dates are ISO timestamps and
 * may be absent when no observation/deadline exists. Non-ready states can retain
 * last-good `data`; consumers must keep status/coverage visible.
 */
export type ModuleState = {
    status: 'ready' | 'stale' | 'missing_scope' | 'waiting' | 'error' | 'disabled' | 'not_applicable';
    data: any;
    updatedAt?: string;
    expiresAt?: string;
    refreshAt?: string;
    retryAt?: string;
    error?: string;
    truncated?: boolean;
    scope?: string;
    participation?: {status:string;updatedAt?:string;expiresAt?:string;retryAt?:string;detail?:string;error?:string;pages?:number;windowDays?:number};
};
export type Character = {
    id: number;
    name: string;
    scopes: string[];
    needsReauth?: boolean;
};
export type ModuleInfo = {
    id: string;
    name: string;
    description: string;
    scopes: string[];
    datasets: string[];
    enabled: boolean;
};
/**
 * Editor geometry is in the fixed 1920 × 1080 canvas's pixels. `opacity` is 0–1,
 * progress `value` is percent, and startedAt/endsAt are epoch milliseconds.
 * Optional binding fields select a runtime projection; they are not raw ESI data.
 */
export type StreamElement = {
    id: string;
    kind: string;
    name: string;
    text: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    opacity: number;
    appearance?: string;
    color: string;
    visible: boolean;
    endsAt?: number;
    value?: number;
    binding?: string;
    sourceId?: string;
    characterId?: number;
    bindingDisplay?: string;
    detail?: string;
    bindingStatus?: string;
    startedAt?: number;
};
/**
 * Saved rule timing (duration/cooldown/delay) is in seconds. `characterId` scopes
 * automatic events; `allowLocation` is an explicit exception to protected-location
 * redaction. The runtime validates values and schedules delivery.
 */
export type ToastRule = {
    event: string;
    enabled: boolean;
    title: string;
    message: string;
    duration: number;
    cooldown: number;
    delay: number;
    sound: boolean;
    characterId?: number;
    allowLocation?: boolean;
};
export type StreamConfig = {
    elements: StreamElement[];
    rules: ToastRule[];
    position: string;
    muted: boolean;
    paused: boolean;
};
export type Bootstrap = {
    csrf: string;
    configured: boolean;
    clientId: string;
    characters: Character[];
    modules: ModuleInfo[];
    settings: any;
    stream: StreamConfig;
    streamOrigin: string;
    version: string;
    datasetRevision?: string;
    datasetRecovery?: {message: string; failedBuild: number | null} | null;
    vault: string;
    localOnly: boolean;
};
export {workspaceRoutes as routes} from './workspace-navigation.mjs';
export { isk, stamp } from './formatters.mjs';
/**
 * Format a future date/epoch-millisecond value relative to now; elapsed values
 * clamp to zero and absent/falsy values report "Not scheduled". Callers own ticking.
 */
export const remaining = (v?: string | number) => { if (!v)
    return 'Not scheduled'; const t = Math.max(0, Math.floor((new Date(v).getTime() - Date.now()) / 1000)); return t > 86400 ? `${Math.floor(t / 86400)}d ${Math.floor(t % 86400 / 3600)}h` : t > 3600 ? `${Math.floor(t / 3600)}h ${Math.floor(t % 3600 / 60)}m` : `${Math.floor(t / 60)}m ${t % 60}s`; };
/**
 * Read/write a private path relative to `/api`, with JSON when a body is supplied.
 * Mutations pass bootstrap's CSRF token. Fetch uses the same-origin session; no
 * credential is placed in the URL. Non-2xx responses reject with the server's error
 * message; transport errors propagate. A malformed success body returns the local
 * error envelope. No retry or cancellation is implied: scope owners decide whether
 * a result may publish, and callers must reconcile an uncertain accepted write.
 */
export async function api(path: string, method = 'GET', body?: any, csrf?: string) { const r = await fetch('/api' + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Kairo-CSRF': csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const d = await r.json().catch(() => ({ error: 'Kairo could not read the response.' })); if (!r.ok)
    throw new Error(d.error || 'Request failed.'); return d; }
