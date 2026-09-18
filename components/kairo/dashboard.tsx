"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingCart, LayoutDashboard, Link2, ShieldCheck, RefreshCw, Orbit, BrainCircuit, Wallet, Boxes, Factory, Route, Globe, Target, Monitor, Blocks, ChevronRight, Search, Command as CommandIcon, Settings2, ExternalLink } from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { routes, api, type Bootstrap, type ModuleState } from './model';
import { Kairo } from './context';
import { Choice, Panel, DataTable } from './ui';
import { Overview, CharacterPage, WalletPage, AssetsPage, IndustryPage } from './operations';
import { Connections, Modules } from './connections';
import { Goals, Journey, Universe } from './intelligence';
import {Markets} from './markets';
import { Studio, OPSEC } from './studio';
const icons: any = { markets:ShoppingCart, overview: LayoutDashboard, character: BrainCircuit, wallet: Wallet, assets: Boxes, industry: Factory, journey: Route, universe: Globe, goals: Target, studio: Monitor, opsec: ShieldCheck, modules: Settings2, connections: Link2 };
const descriptions: any = { markets:'A shared market desk for every character. Scan, compare, and plan your next supply run.', overview: 'Your pilot. Your operations. Your next move.', character: 'Training, clones and the capabilities behind your next undock.', wallet: 'Follow your ISK, orders and recent trades.', assets: 'Your ships, equipment and fittings, all accounted for.', industry: 'Keep production, extraction and research moving.', journey: 'A growing record of your life in New Eden.', universe: 'Public system intelligence and routes across New Eden.', goals: 'Make progress. Leave yourself a trail.', studio: 'A clear canvas for the parts of Kairo you choose to broadcast.', opsec: 'Control what your stream can see.', modules: 'Manage modules, appearance and how often Kairo refreshes EVE data.', connections: 'Connect your characters. Choose your ESI access.' };
function EveClock() { const [time, setTime] = useState(''); useEffect(() => { const tick = () => setTime(new Date().toISOString().slice(11, 19)); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, []); return <span className="eve-clock">{time || '--:--:--'} <small>EVE</small></span>; }
export default function Dashboard() {
    const [page, setPage] = useState('overview'), [boot, setBoot] = useState<Bootstrap | null>(null), [data, setData] = useState<Record<string, ModuleState>>({}), [names, setNames] = useState<any>({}), [character, setCharacterState] = useState(0), [sessions, setSessions] = useState<any[]>([]), [opsec, setOpsec] = useState<any>({ state: 'unknown' }), [err, setErr] = useState(''), [refreshing, setRefreshing] = useState(false), [search, setSearch] = useState(false), [connected, setConnected] = useState(false);
    const charRef = useRef(0), bootRef = useRef<Bootstrap | null>(null), loading = useRef(0);
    function setCharacter(id: number) { charRef.current = id; setCharacterState(id); try {
        localStorage.setItem('kairo-character', String(id));
    }
    catch { } }
    const navigate = useCallback((id: string) => { setPage(id); if (typeof window !== 'undefined')
        window.location.hash = id; setSearch(false); window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
    const refresh = useCallback(async () => { const requestId = ++loading.current, id = charRef.current; const state = await api('/state?character=' + id); if (requestId !== loading.current || id !== charRef.current)
        return; setData(state.data); setNames(state.names); setOpsec(state.opsec); setSessions(state.sessions); }, []);
    const reload = useCallback(async () => { const result = await api('/bootstrap'); bootRef.current = result; setBoot(result); if (charRef.current && !result.characters.some((c: any) => c.id === charRef.current))
        setCharacter(result.characters[0]?.id || 0); document.documentElement.dataset.theme = result.settings.theme || 'mint'; }, []);
    useEffect(() => { let alive = true; const initial = async () => { try {
        const result = await api('/bootstrap');
        if (!alive)
            return;
        bootRef.current = result;
        setBoot(result);
        document.documentElement.dataset.theme = result.settings.theme || 'mint';
        const chosen = Number(localStorage.getItem('kairo-character') || 0);
        const id = result.characters.some((c: any) => c.id === chosen) ? chosen : result.characters[0]?.id || 0;
        setCharacter(id);
        await refresh();
        setErr('');
    }
    catch (e: any) {
        if (alive)
            setErr(e.message);
    } }; initial(); const hash = () => { const id = window.location.hash.slice(1); setPage(routes.some(r => r.id === id) || id.startsWith('module:') ? id : 'overview'); }; hash(); window.addEventListener('hashchange', hash); const params = new URLSearchParams(location.search); if (params.has('auth')) {
        const a = params.get('auth');
        if (a === 'connected')
            toast.success('EVE character connected. Syncing your data.');
        else if (a === 'cancelled')
            toast('EVE sign-in was cancelled.');
        else
            toast.error('EVE sign-in could not be verified. Check the callback address and try again.');
        window.history.replaceState({}, '', location.pathname + location.hash);
    } const hotkey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearch(v => !v);
    } }; window.addEventListener('keydown', hotkey); return () => { alive = false; window.removeEventListener('hashchange', hash); window.removeEventListener('keydown', hotkey); }; }, [refresh]);
    useEffect(() => { if (boot)
        refresh().catch(e => toast.error(e.message)); }, [character, refresh, !!boot]);
    useEffect(() => { if (!boot)
        return; const events = new EventSource('/api/events'); let timer: ReturnType<typeof setTimeout> | null = null; events.onopen = () => setConnected(true); events.onerror = () => setConnected(false); events.addEventListener('snapshot', e => { const r = JSON.parse(e.data); if (r.characterId === 0 || r.characterId === charRef.current) {
        setData(d => ({ ...d, [r.key]: r.snapshot }));
        setNames((n: any) => ({ ...n, ...r.names }));
    } }); events.addEventListener('opsec', e => setOpsec(JSON.parse(e.data))); events.addEventListener('changed', () => { if (!timer)
        timer = setTimeout(() => { timer = null; refresh().catch(() => { }); }, 1500); }); const poll = setInterval(() => refresh().catch(() => { }), 30000); return () => { events.close(); if (timer)
        clearTimeout(timer); clearInterval(poll); }; }, [!!boot, refresh]);
    async function sync() { if (!boot)
        return; setRefreshing(true); try {
        await api('/sync', 'POST', { character }, boot.csrf);
        await refresh();
        toast.success('Sync requested. ESI cache times are respected.');
    }
    catch (e: any) {
        toast.error(e.message);
    }
    finally {
        setRefreshing(false);
    } }
    const customPages = (boot as any)?.pages || [];
    const navRoutes = [...routes, ...customPages.map((p: any) => ({ id: 'module:' + p.id, name: p.title, group: 'EXTENSIONS' }))];
    const current = navRoutes.find(r => r.id === page);
    const active = boot?.characters.find(c => c.id === character);
    let content;
    switch (page) {
        case 'character':
            content = <CharacterPage />;
            break;
        case 'wallet':
            content = <WalletPage />;
            break;
        case 'markets':
            content = <Markets />;
            break;
        case 'assets':
            content = <AssetsPage />;
            break;
        case 'industry':
            content = <IndustryPage />;
            break;
        case 'journey':
            content = <Journey />;
            break;
        case 'universe':
            content = <Universe />;
            break;
        case 'goals':
            content = <Goals />;
            break;
        case 'studio':
            content = <Studio />;
            break;
        case 'opsec':
            content = <OPSEC />;
            break;
        case 'modules':
            content = <Modules />;
            break;
        case 'connections':
            content = <Connections />;
            break;
        default: content = page.startsWith('module:') ? <ExtensionPage id={page.slice(7)} character={character}/> : <Overview />;
    }
    return <SidebarProvider style={{ '--sidebar-width': '238px' } as React.CSSProperties}><Sidebar className="k-sidebar"><SidebarHeader><a className="brand" href="/#overview"><span className="brand-symbol">K</span><span>KAIRO<small>CAPSULEER OPERATIONS</small></span></a><button className="workspace-search" onClick={() => setSearch(true)}><Search size={15}/><span>Jump to module</span><kbd>⌘ K</kbd></button></SidebarHeader><SidebarContent>{['OPERATIONS', 'INTELLIGENCE', 'BROADCAST', 'SYSTEM', ...(customPages.length ? ['EXTENSIONS'] : [])].map(group => <SidebarGroup key={group}><SidebarGroupLabel>{group}</SidebarGroupLabel><SidebarMenu>{navRoutes.filter(r => r.group === group).map(r => { const Icon = icons[r.id] || Blocks; return <SidebarMenuItem key={r.id}><SidebarMenuButton isActive={page === r.id} onClick={() => navigate(r.id)}><Icon /><span>{r.name}</span>{r.id === 'studio' && <span className="nav-tag">OBS</span>}</SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu></SidebarGroup>)}</SidebarContent><SidebarFooter><div className="local-stamp"><ShieldCheck size={16}/><span>LOCAL ENVIRONMENT<small>Private by design · v{boot?.version || '0.7.3-rc.1'}</small></span></div></SidebarFooter></Sidebar><SidebarInset><header className="topbar"><div className="flex items-center gap-3"><SidebarTrigger /><span className="muted">Workspace</span><ChevronRight size={14}/><span>{current?.name || 'Command centre'}</span></div><div className="topbar-right"><span className={'connection-status ' + (connected ? 'online' : '')}><i />{connected ? 'Core connected' : 'Connecting'}</span><EveClock /></div></header><div className="workspace"><div className="page-heading"><div><p className="eyebrow">{page === 'studio' || page === 'opsec' ? 'BROADCAST SYSTEMS' : page === 'connections' || page === 'modules' ? 'WORKSPACE CONTROL' : 'YOUR FLIGHT DECK'}</p><h1>{current?.name || 'Command centre'}</h1><p className="muted">{descriptions[page]}</p></div><div className="page-actions">{boot?.characters.length ? <Choice label="Active character" value={String(character)} onChange={v => setCharacter(Number(v))} options={boot.characters.map(c => ({ value: String(c.id), label: c.name }))}/> : <Button variant="outline" onClick={() => navigate('connections')}><Link2 size={15}/> Connect EVE</Button>}<Button size="icon" variant="outline" aria-label="Refresh ESI data" disabled={refreshing || !boot} onClick={sync}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/></Button></div></div>{err ? <div className="panel server-error"><Orbit size={38}/><h2>Kairo’s local core is unavailable.</h2><p>{err}</p><p className="muted">Start Kairo on your computer, then reload this page.</p><Button onClick={() => window.location.reload()}>Retry connection</Button></div> : boot ? <Kairo.Provider value={{ boot, data, names, character, setCharacter, page, navigate, reload, refresh, opsec, sessions, time: Date.now() }}>{active?.needsReauth && <div className="inline-error mb-5">EVE access needs to be renewed. <button onClick={() => navigate('connections')}>Reconnect {active.name}</button></div>}<div className="page-transition" key={page}>{content}</div></Kairo.Provider> : <div className="loading-layout"><div className="stats-grid">{[0, 1, 2, 3].map(x => <Skeleton key={x} className="h-40"/>)}</div><Skeleton className="h-80"/></div>}<footer className="workspace-footer"><span>KAIRO / CAPSULEER OPERATIONS</span><span>Local memory. Modular growth.</span></footer></div></SidebarInset><Toaster theme="dark"/><CommandDialog open={search} onOpenChange={setSearch} title="Jump to a module" description="Search your Kairo workspace"><CommandInput placeholder="Search modules…"/><CommandList><CommandEmpty>No module found.</CommandEmpty><CommandGroup heading="Your workspace">{navRoutes.map(r => { const Icon = icons[r.id] || Blocks; return <CommandItem key={r.id} value={r.name} onSelect={() => navigate(r.id)}><Icon size={17}/><span>{r.name}</span></CommandItem>; })}</CommandGroup></CommandList></CommandDialog></SidebarProvider>;
}
function ExtensionPage({ id, character }: {
    id: string;
    character: number;
}) { const [result, setResult] = useState<any>(null); useEffect(() => { api('/modules/' + id + '?character=' + character).then(setResult).catch(e => toast.error(e.message)); }, [id, character]); return <Panel title={result?.title || 'Module'}>{result ? <DataTable rows={result.rows || []} columns={result.columns || []}/> : <p className="muted">Loading module…</p>}</Panel>; }
