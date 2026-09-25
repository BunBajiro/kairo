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
    vault: string;
    localOnly: boolean;
};
export {workspaceRoutes as routes} from './workspace-navigation.mjs';
export const isk = (n: any, compact = false) => typeof n === 'number' ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: compact ? 2 : 0, notation: compact ? 'compact' : 'standard' }).format(n) : '—';
export const stamp = (v?: string) => v ? new Date(v).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' EVE' : 'Awaiting data';
export const remaining = (v?: string | number) => { if (!v)
    return 'Not scheduled'; const t = Math.max(0, Math.floor((new Date(v).getTime() - Date.now()) / 1000)); return t > 86400 ? `${Math.floor(t / 86400)}d ${Math.floor(t % 86400 / 3600)}h` : t > 3600 ? `${Math.floor(t / 3600)}h ${Math.floor(t % 3600 / 60)}m` : `${Math.floor(t / 60)}m ${t % 60}s`; };
export async function api(path: string, method = 'GET', body?: any, csrf?: string) { const r = await fetch('/api' + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Kairo-CSRF': csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const d = await r.json().catch(() => ({ error: 'Kairo could not read the response.' })); if (!r.ok)
    throw new Error(d.error || 'Request failed.'); return d; }
