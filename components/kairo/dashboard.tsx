"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingCart, LayoutDashboard, Link2, ShieldCheck, RefreshCw, Orbit, BrainCircuit, Wallet, Boxes, Factory, Route, Globe, Waypoints, Target, Monitor, Blocks, ChevronRight, Search, Command as CommandIcon, Settings2, ExternalLink, PanelLeftClose, PanelLeftOpen, AlertTriangle, X } from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { routes, api, type Bootstrap, type ModuleState } from './model';
import {resolveWorkspaceRoute, workspaceGroups, type WorkspaceRoute} from './workspace-navigation.mjs';
import { Kairo } from './context';
import { Choice, Panel, DataTable } from './ui';
import { Overview, CharacterPage, WalletPage, AssetsPage, IndustryPage } from './operations';
import { Connections, Modules } from './connections';
import { Goals, SessionsPage } from './intelligence';
import { Universe } from './universe';
import { UniverseSettings } from './universe-settings';
import {Markets} from './markets';
import { Studio, OPSEC } from './studio';
import { createDatasetConnection, type DatasetConnectionState } from './dataset-connection.mjs';
import './dataset-connection.css';
const icons: any = { markets:ShoppingCart, overview: LayoutDashboard, character: BrainCircuit, wallet: Wallet, assets: Boxes, industry: Factory, sessions: Route, 'universe-kspace': Globe, 'universe-jspace': Waypoints, 'universe-settings': Settings2, goals: Target, studio: Monitor, opsec: ShieldCheck, modules: Settings2, connections: Link2 };
const descriptions: any = { markets:'A shared market desk for every character. Scan, compare, and plan your next supply run.', overview: 'Your pilot. Your operations. Your next move.', character: 'Training, clones and the capabilities behind your next undock.', wallet: 'Follow your ISK, orders and recent trades.', assets: 'Your ships, equipment and fittings, all accounted for.', industry: 'Keep production, extraction and research moving.', sessions: 'Record an operation. Review its activity, progress and outcomes.', 'universe-kspace': 'Read the landscape of New Eden. Follow its borders, activity and routes.', 'universe-jspace': 'Build your maps. Follow your pilots. Connect your space.', 'universe-settings': 'Manage navigation networks, power blocs and intelligence sources.', goals: 'Make progress. Leave yourself a trail.', studio: 'A clear canvas for the parts of Kairo you choose to broadcast.', opsec: 'Control what your stream can see.', modules: 'Manage modules, local datasets, appearance and EVE refresh settings.', connections: 'Connect your characters. Choose your ESI access.' };
function workspaceDestination(id: string) {
    const target = resolveWorkspaceRoute(id);
    if (target.universeTab && typeof window !== 'undefined') {
        try { sessionStorage.setItem('kairo-universe-tab', target.universeTab); } catch { }
    }
    return target.id;
}
function EveClock() { const [time, setTime] = useState(''); useEffect(() => { const tick = () => setTime(new Date().toISOString().slice(11, 19)); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, []); return <span className="eve-clock">{time || '--:--:--'} <small>EVE</small></span>; }
function SidebarDestination({route, active, navigate}: {route: WorkspaceRoute; active: boolean; navigate: (id: string) => void}) {
    const {isMobile, setOpenMobile} = useSidebar();
    const Icon = icons[route.id] || Blocks;
    return <SidebarMenuItem><SidebarMenuButton data-route={route.id} aria-current={active ? 'page' : undefined} isActive={active} tooltip={route.name} onClick={() => {navigate(route.id); if (isMobile) setOpenMobile(false);}}><Icon /><span>{route.name}</span>{route.id === 'studio' && <span className="nav-tag">OBS</span>}</SidebarMenuButton></SidebarMenuItem>;
}
function WorkspaceSidebarToggle() {
    const {isMobile, open, openMobile, toggleSidebar} = useSidebar();
    const expanded = isMobile ? openMobile : open;
    const label = expanded ? 'Hide sidebar' : 'Show sidebar';
    const Icon = expanded ? PanelLeftClose : PanelLeftOpen;
    return <Button data-sidebar="trigger" className="workspace-sidebar-toggle" variant="ghost" onClick={toggleSidebar} aria-label={label} aria-expanded={expanded} title={`${label} (Ctrl/Cmd+B)`}><Icon size={18}/><span>{label}</span></Button>;
}
export default function Dashboard() {
    const [page, setPage] = useState('overview'), [boot, setBoot] = useState<Bootstrap | null>(null), [data, setData] = useState<Record<string, ModuleState>>({}), [names, setNames] = useState<any>({}), [character, setCharacterState] = useState(0), [sessions, setSessions] = useState<any[]>([]), [opsec, setOpsec] = useState<any>({ state: 'unknown' }), [err, setErr] = useState(''), [refreshing, setRefreshing] = useState(false), [search, setSearch] = useState(false), [connected, setConnected] = useState(false);
    const [datasetConnection, setDatasetConnection] = useState<DatasetConnectionState>({ phase: 'idle', build: null, message: '' });
    const datasetConnectionRef = useRef<ReturnType<typeof createDatasetConnection> | null>(null);
    const charRef = useRef(0), bootRef = useRef<Bootstrap | null>(null), loading = useRef(0);
    function setCharacter(id: number) { charRef.current = id; setCharacterState(id); try {
        localStorage.setItem('kairo-character', String(id));
    }
    catch { } }
    const navigate = useCallback((id: string) => {
        const target=workspaceDestination(id);
        // Keep the framework's history metadata and the selected page in sync.
        if(typeof window!=='undefined'&&window.location.hash!=='#'+target)window.history.pushState(window.history.state,'',window.location.pathname+window.location.search+'#'+target);
        setPage(target);setSearch(false);window.scrollTo({top:0,behavior:'instant'});
    }, []);
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
    } }; initial(); let traversedHash: string | null = null; const hash = (event?: Event) => { if(event?.type==='hashchange'&&traversedHash===window.location.hash){traversedHash=null;return;}traversedHash=null;const requested=window.location.hash.slice(1), id=workspaceDestination(requested); if(requested==='universe'||requested==='journey')window.history.replaceState(window.history.state,'',location.pathname+location.search+'#'+id); setPage(id); }; hash(); const params = new URLSearchParams(location.search); if (params.has('auth')) {
        const a = params.get('auth');
        if (a === 'connected')
            toast.success('EVE character connected. Syncing your data.');
        else if (a === 'cancelled')
            toast('EVE sign-in was cancelled.');
        else
            toast.error('EVE sign-in could not be verified. Check the callback address and try again.');
        window.history.replaceState(window.history.state, '', location.pathname + location.hash);
    }
    // The head bootstrap owns Kairo hash traversals before the framework's
    // Window popstate listener. Page effects subscribe only to our routed event.
    const traverseWorkspace = () => {
        hash();
        traversedHash = window.location.hash;
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('kairo:workspace-traverse', traverseWorkspace);
    const hotkey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearch(v => !v);
    } }; window.addEventListener('keydown', hotkey); return () => { alive = false; window.removeEventListener('hashchange', hash);window.removeEventListener('kairo:workspace-traverse',traverseWorkspace); window.removeEventListener('keydown', hotkey); }; }, [refresh]);
    const activePilotSync=useRef<Promise<unknown>>(Promise.resolve());
    useEffect(() => {if(boot?.csrf&&character&&boot.characters.some(pilot=>pilot.id===character))activePilotSync.current=activePilotSync.current.catch(()=>{}).then(()=>api('/universe/jspace/tracking/active','PUT',{character_id:character},boot.csrf)).catch(()=>{});},[character,boot?.csrf]);
    useEffect(() => { if (boot)
        refresh().catch(e => toast.error(e.message)); }, [character, refresh, !!boot]);
    useEffect(() => {
        if (!boot) return;
        const recoveryKey = 'kairo-dataset-recovery-notices';
        let remembered: string[] = [];
        try { remembered = JSON.parse(sessionStorage.getItem(recoveryKey) || '[]'); if (!Array.isArray(remembered)) remembered = []; } catch { }
        const connection = createDatasetConnection({
            revision: bootRef.current?.datasetRevision || '',
            onState: setDatasetConnection,
            seenRecovery: key => remembered.includes(key),
            rememberRecovery: key => { remembered = [...remembered.slice(-9), key]; try { sessionStorage.setItem(recoveryKey, JSON.stringify(remembered)); } catch { } },
            refresh: async (revision, isCurrent) => {
                const characterId = charRef.current, requestId = ++loading.current;
                const [nextBoot, nextState] = await Promise.all([api('/bootstrap'), api('/state?character=' + characterId)]);
                if (!isCurrent()) return;
                if (nextBoot.datasetRevision !== revision) throw new Error('Dataset generation changed while reconnecting.');
                bootRef.current = nextBoot; setBoot(nextBoot);
                document.documentElement.dataset.theme = nextBoot.settings.theme || 'mint';
                if (characterId && !nextBoot.characters.some((pilot: any) => pilot.id === characterId)) setCharacter(nextBoot.characters[0]?.id || 0);
                if (requestId === loading.current && characterId === charRef.current) {
                    setData(nextState.data); setNames(nextState.names); setOpsec(nextState.opsec); setSessions(nextState.sessions);
                }
                window.dispatchEvent(new CustomEvent('kairo:universe-changed', { detail: { datasets: true, revision } }));
            },
            onComplete: () => toast.success('Static datasets updated. Your workspace is ready.'),
        });
        datasetConnectionRef.current = connection;
        const events = new EventSource('/api/events');
        let timer: ReturnType<typeof setTimeout> | null = null;
        events.onopen = () => { setConnected(true); connection.connect(); };
        events.onerror = () => { setConnected(false); connection.disconnect(); };
        events.addEventListener('dataset-restarting', e => connection.restarting(JSON.parse(e.data)));
        events.addEventListener('dataset-restart-cancelled', e => connection.cancelled(JSON.parse(e.data)));
        events.addEventListener('dataset-revision', e => { void connection.revision(JSON.parse(e.data)); });
        events.addEventListener('datasets', e => window.dispatchEvent(new CustomEvent('datasets-changed', { detail: JSON.parse(e.data) })));
        events.addEventListener('snapshot', e => {
            const r = JSON.parse(e.data);
            if (r.characterId === 0 || r.characterId === charRef.current) {
                setData(d => ({ ...d, [r.key]: r.snapshot })); setNames((n: any) => ({ ...n, ...r.names }));
            }
        });
        events.addEventListener('universe', e => { const detail = JSON.parse(e.data); if (!detail.characterId || detail.characterId === charRef.current) window.dispatchEvent(new CustomEvent('kairo:universe-changed', { detail })); });
        events.addEventListener('opsec', e => setOpsec(JSON.parse(e.data)));
        events.addEventListener('changed', () => { if (!timer) timer = setTimeout(() => { timer = null; refresh().catch(() => {}); }, 1500); });
        const poll = setInterval(() => refresh().catch(() => {}), 30000);
        return () => { connection.dispose(); datasetConnectionRef.current = null; events.close(); if (timer) clearTimeout(timer); clearInterval(poll); };
    }, [!!boot, refresh]);
    async function retryDatasetConnection() {
        const connection = datasetConnectionRef.current;
        if (!connection) return;
        connection.retry();
        try { const next = await api('/bootstrap'); await connection.revision({ revision: next.datasetRevision, recovery: next.datasetRecovery || null }); } catch { }
    }
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
        case 'sessions':
            content = <SessionsPage />;
            break;
        case 'universe-kspace':
            content = <Universe space="known" />;
            break;
        case 'universe-jspace':
            content = <Universe space="wormhole" />;
            break;
        case 'universe-settings':
            content = <UniverseSettings key={character} />;
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
    const jspacePage = page === 'universe-jspace';
    const datasetUpdating = ['restarting', 'refreshing', 'delayed'].includes(datasetConnection.phase);
    const datasetBanner = datasetConnection.phase !== 'idle' && <div className="dataset-connection-banner" data-phase={datasetConnection.phase} role="status" aria-live="polite">{datasetConnection.phase === 'warning' || datasetConnection.phase === 'delayed' ? <AlertTriangle size={21}/> : <RefreshCw size={21} className="animate-spin"/>}<div><strong>{datasetConnection.phase === 'warning' ? 'Continuing with the previous dataset' : datasetConnection.phase === 'delayed' ? 'Still waiting for the updated core' : 'Applying dataset update — reconnecting'}</strong><p>{datasetConnection.message || 'Your current page stays open. Kairo will reconnect automatically.'}</p></div>{datasetConnection.phase === 'delayed' && <Button size="sm" variant="outline" onClick={() => void retryDatasetConnection()}>Retry connection</Button>}{datasetConnection.phase === 'warning' && <Button size="icon" variant="ghost" aria-label="Dismiss dataset notice" onClick={() => datasetConnectionRef.current?.dismiss()}><X size={16}/></Button>}</div>;
    const pilotControls = <div className="page-actions">{boot?.characters.length ? <Choice label="Active character" value={String(character)} onChange={v => setCharacter(Number(v))} options={boot.characters.map(c => ({ value: String(c.id), label: c.name }))}/> : <Button variant="outline" onClick={() => navigate('connections')}><Link2 size={15}/> Connect EVE</Button>}<Button size="icon" variant="outline" aria-label="Refresh ESI data" disabled={refreshing || !boot} onClick={sync}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/></Button></div>;
    return <SidebarProvider style={{ '--sidebar-width': '238px' } as React.CSSProperties}><Sidebar className="k-sidebar"><SidebarHeader><a className="brand" href="/#overview"><span className="brand-symbol">K</span><span>KAIRO<small>CAPSULEER OPERATIONS</small></span></a><button className="workspace-search" onClick={() => setSearch(true)}><Search size={15}/><span>Jump to module</span><kbd>⌘ K</kbd></button></SidebarHeader><SidebarContent>{[...workspaceGroups, ...(customPages.length ? ['EXTENSIONS'] : [])].map(group => <SidebarGroup key={group} data-workspace-group={group}><SidebarGroupLabel>{group}</SidebarGroupLabel><SidebarMenu>{navRoutes.filter(r => r.group === group).map(r => <SidebarDestination key={r.id} route={r} active={page === r.id} navigate={navigate} />)}</SidebarMenu></SidebarGroup>)}</SidebarContent><SidebarFooter><div className="local-stamp"><ShieldCheck size={16}/><span>LOCAL ENVIRONMENT<small>Private by design · v{boot?.version || '0.8.0-rc.16'}</small></span></div></SidebarFooter></Sidebar><SidebarInset className={jspacePage ? 'jspace-shell' : undefined}><header className="topbar"><div className="flex items-center gap-3"><WorkspaceSidebarToggle /><span className="muted">{current?.group === 'UNIVERSE' ? 'Universe' : 'Workspace'}</span><ChevronRight size={14}/><span>{current?.name || 'Command centre'}</span></div>{jspacePage && pilotControls}<div className="topbar-right"><span className={'connection-status ' + (datasetUpdating ? 'updating' : connected ? 'online' : '')}><i />{datasetUpdating ? 'Updating datasets' : connected ? 'Core connected' : 'Reconnecting to core'}</span><EveClock /></div></header>{datasetBanner}<div className="workspace">{!jspacePage && <div className="page-heading"><div><p className="eyebrow">{current?.group === 'UNIVERSE' ? 'UNIVERSE' : page === 'studio' || page === 'opsec' ? 'BROADCAST SYSTEMS' : page === 'connections' || page === 'modules' ? 'WORKSPACE CONTROL' : 'YOUR FLIGHT DECK'}</p><h1>{current?.name || 'Command centre'}</h1><p className="muted">{descriptions[page]}</p></div>{pilotControls}</div>}{err ? <div className="panel server-error"><Orbit size={38}/><h2>Kairo’s local core is unavailable.</h2><p>{err}</p><p className="muted">Start Kairo on your computer, then reload this page.</p><Button onClick={() => window.location.reload()}>Retry connection</Button></div> : boot ? <Kairo.Provider value={{ boot, data, names, character, setCharacter, page, navigate, reload, refresh, opsec, sessions, time: Date.now() }}>{active?.needsReauth && <div className="inline-error mb-5">EVE access needs to be renewed. <button onClick={() => navigate('connections')}>Reconnect {active.name}</button></div>}<div className="page-transition" key={page}>{content}</div></Kairo.Provider> : <div className="loading-layout"><div className="stats-grid">{[0, 1, 2, 3].map(x => <Skeleton key={x} className="h-40"/>)}</div><Skeleton className="h-80"/></div>}<footer className="workspace-footer"><span>KAIRO / CAPSULEER OPERATIONS</span><span>Local memory. Modular growth.</span></footer></div></SidebarInset><Toaster theme="dark"/><CommandDialog open={search} onOpenChange={setSearch} title="Jump to a module" description="Search your Kairo workspace"><CommandInput placeholder="Search modules…"/><CommandList><CommandEmpty>No module found.</CommandEmpty>{[...workspaceGroups, ...(customPages.length ? ['EXTENSIONS'] : [])].map(group => <CommandGroup key={group} heading={group === 'UNIVERSE' ? 'Universe' : group.charAt(0)+group.slice(1).toLowerCase()}>{navRoutes.filter(r => r.group === group).map(r => { const Icon = icons[r.id] || Blocks; return <CommandItem key={r.id} value={r.name} keywords={r.keywords || []} onSelect={() => navigate(r.id)}><Icon size={17}/><span>{r.name}</span></CommandItem>; })}</CommandGroup>)}</CommandList></CommandDialog></SidebarProvider>;
}
function ExtensionPage({ id, character }: {
    id: string;
    character: number;
}) { const [result, setResult] = useState<any>(null); useEffect(() => { api('/modules/' + id + '?character=' + character).then(setResult).catch(e => toast.error(e.message)); }, [id, character]); return <Panel title={result?.title || 'Module'}>{result ? <DataTable rows={result.rows || []} columns={result.columns || []}/> : <p className="muted">Loading module…</p>}</Panel>; }
