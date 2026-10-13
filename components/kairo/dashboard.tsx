"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {createScopedRefresh} from './scoped-refresh.mjs';
import {createNameDirectoryState} from './name-directory-state.mjs';
import {retainValue, retainSnapshot, retainSnapshots, changeAffectsPilot, changeNeedsState, goalInputRevision, mergeResourceRevisions, goalSourceKeys} from './resource-state.mjs';
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
    const [namesOwner] = useState(createNameDirectoryState);
    const charRef = useRef(0), bootRef = useRef<Bootstrap | null>(null);
    const bootstrapRead = useRef(0), bootstrapPublished = useRef(0);
    const installBootstrap = useCallback((result: Bootstrap, generation: number) => {
        // Separate edits and reconnects may read concurrently. An older reply
        // cannot replace a newer roster, module setting or appearance choice.
        if (generation < bootstrapPublished.current) return false;
        bootstrapPublished.current = generation;
        bootRef.current = result; setBoot(result);
        document.documentElement.dataset.theme = result.settings.theme || 'mint';
        return true;
    }, []);
    const snapshotEvents = useRef<Record<string,number>>({}), resourceEvents = useRef<Record<string,number>>({}), ancillaryEvents = useRef({names:0,opsec:0}), stateError = useRef<unknown>(null);
    const stateOwner = useRef<ReturnType<typeof createScopedRefresh> | null>(null);
    const [resourceRevisions, setResourceRevisions] = useState<Record<string,string>>({}), resourceRef = useRef<Record<string,string>>({});
    const [stateReady, setStateReady] = useState(false), stateHasPublished = useRef(false);
    const [recoveryRevision, setRecoveryRevision] = useState(0), [goalClock, setGoalClock] = useState(0);
    const setCharacter = useCallback((id: number) => { if (charRef.current !== id) {stateOwner.current?.close(); stateOwner.current = null; stateHasPublished.current = false; setErr(''); setStateReady(false); setData({}); setSessions([]); snapshotEvents.current = {}; resourceEvents.current = {}; stateError.current = null; resourceRef.current = {}; setResourceRevisions({});} charRef.current = id; setCharacterState(id); try {
        localStorage.setItem('kairo-character', String(id));
    }
    catch { } }, []);
    const navigate = useCallback((id: string) => {
        const target=workspaceDestination(id);
        // Keep the framework's history metadata and the selected page in sync.
        if(typeof window!=='undefined'&&window.location.hash!=='#'+target)window.history.pushState(window.history.state,'',window.location.pathname+window.location.search+'#'+target);
        setPage(target);setSearch(false);window.scrollTo({top:0,behavior:'instant'});
    }, []);
    const applyResourceRevisions = useCallback((next: Record<string,string> = {}, resources = Object.keys(next), notify = true) => {
        const merged = mergeResourceRevisions(resourceRef.current, next, resources);
        if (merged === resourceRef.current) return;
        const changed = Object.keys(merged).filter(resource => merged[resource] !== resourceRef.current[resource]);
        resourceRef.current = merged; setResourceRevisions(merged);
        if (notify) window.dispatchEvent(new CustomEvent('kairo:resource-changed', {detail:{characterId:charRef.current,resources:changed}}));
    }, []);
    const publishState = useCallback(({state, observed, resources, ancillary, namesObserved}: any) => {
        setData(previous => {const next = {...state.data}; for (const key of Object.keys(snapshotEvents.current)) if (snapshotEvents.current[key] !== observed[key]) next[key] = previous[key]; return retainSnapshots(previous, next);});
        if (ancillary.names === ancillaryEvents.current.names) { const next = namesOwner.fromState(state, namesObserved); if (next) setNames(next); }
        if (ancillary.opsec === ancillaryEvents.current.opsec) setOpsec((previous: any) => retainValue(previous, state.opsec));
        setSessions(previous => retainValue(previous, state.sessions));
        applyResourceRevisions(state.resourceRevisions, Object.keys(state.resourceRevisions || {}).filter(key => resources[key] === resourceEvents.current[key])); setGoalClock(Date.now()); setStateReady(true); stateHasPublished.current = true; setErr('');
    }, [applyResourceRevisions, namesOwner]);
    const refresh = useCallback(async () => {await stateOwner.current?.request(); if (stateError.current) throw stateError.current;}, []);
    const reload = useCallback(async () => {
        const generation = ++bootstrapRead.current;
        const result = await api('/bootstrap'), prior = bootRef.current?.characters;
        if (!installBootstrap(result, generation)) return;
        const rosterChanged = retainValue(prior, result.characters) !== prior;
        if (charRef.current && !result.characters.some((c: any) => c.id === charRef.current)) setCharacter(result.characters[0]?.id || 0);
        if (rosterChanged) {
            setRecoveryRevision(value => value + 1);
            window.dispatchEvent(new CustomEvent('kairo:resource-changed', {detail:{resources:['goalSources']}}));
            window.dispatchEvent(new CustomEvent('kairo:source-changed', {detail:{resources:['recovery','roster']}}));
        }
    }, [setCharacter, installBootstrap]);
    useEffect(() => { let alive = true; const initial = async () => { try {
        const generation = ++bootstrapRead.current;
        const result = await api('/bootstrap');
        if (!alive || !installBootstrap(result, generation))
            return;
        let chosen = 0;
        try { chosen = Number(localStorage.getItem('kairo-character') || 0); } catch { }
        const id = result.characters.some((c: any) => c.id === chosen) ? chosen : result.characters[0]?.id || 0;
        setCharacter(id);
        // The selected-pilot effect owns the initial state read as well as switches.
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
    } }; window.addEventListener('keydown', hotkey); return () => { alive = false; window.removeEventListener('hashchange', hash);window.removeEventListener('kairo:workspace-traverse',traverseWorkspace); window.removeEventListener('keydown', hotkey); }; }, [refresh, installBootstrap]);
    const activePilotSync=useRef<Promise<unknown>>(Promise.resolve());
    useEffect(() => {if(boot?.csrf&&character&&boot.characters.some(pilot=>pilot.id===character))activePilotSync.current=activePilotSync.current.catch(()=>{}).then(()=>api('/universe/jspace/tracking/active','PUT',{character_id:character},boot.csrf)).catch(()=>{});},[character,boot?.csrf]);
    useEffect(() => {
        if (!boot) return;
        const requested = character;
        const owner = createScopedRefresh({read: async () => {const observed = {...snapshotEvents.current}, resources = {...resourceEvents.current}, ancillary = {...ancillaryEvents.current}, namesObserved = namesOwner.capture(); const state = await api('/state?character=' + requested); return {state,observed,resources,ancillary,namesObserved};},
            publish: value => {if (requested === charRef.current) {stateError.current = null; publishState(value);}},
            onError: (error: any) => {if (requested === charRef.current) {stateError.current = error; if (!stateHasPublished.current) setErr(error.message); else toast.error(error.message);}}});
        stateOwner.current = owner; void owner.request();
        return () => {owner.close(); if (stateOwner.current === owner) stateOwner.current = null;};
    }, [character, !!boot, publishState, namesOwner]);
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
                const generation = ++bootstrapRead.current;
                const nextBoot = await api('/bootstrap');
                if (!isCurrent()) return;
                if (nextBoot.datasetRevision !== revision) throw new Error('Dataset generation changed while reconnecting.');
                installBootstrap(nextBoot, generation);
                const currentBoot = bootRef.current!;
                const characterId = charRef.current;
                if (characterId && !currentBoot.characters.some((pilot: any) => pilot.id === characterId)) setCharacter(currentBoot.characters[0]?.id || 0);
                else await refresh();
                if (!isCurrent()) return;
                setRecoveryRevision(value => value + 1);
                window.dispatchEvent(new CustomEvent('kairo:source-changed', {detail:{resources:['recovery']}}));
                window.dispatchEvent(new CustomEvent('kairo:universe-changed', { detail: { datasets: true, revision } }));
            },
            onComplete: () => toast.success('Static datasets updated. Your workspace is ready.'),
        });
        datasetConnectionRef.current = connection;
        const events = new EventSource('/api/events');
        let timer: ReturnType<typeof setTimeout> | null = null, reloadRoster = false;
        let hasConnected = false;
        events.onopen = () => {
            const namesInvalidated = namesOwner.connect(); if (namesInvalidated) ancillaryEvents.current.names++;
            setConnected(true); connection.connect();
            window.dispatchEvent(new CustomEvent('kairo:events-connected'));
            if (hasConnected) {
                setRecoveryRevision(value => value + 1); void reload().then(refresh).catch(() => {});
                window.dispatchEvent(new CustomEvent('kairo:source-changed', {detail:{resources:['recovery']}}));
            }
            else if (namesInvalidated) void refresh().catch(() => {});
            hasConnected = true;
        };
        events.onerror = () => { if (namesOwner.disconnect()) ancillaryEvents.current.names++; setConnected(false); connection.disconnect(); };
        events.addEventListener('dataset-restarting', e => connection.restarting(JSON.parse(e.data)));
        events.addEventListener('dataset-restart-cancelled', e => connection.cancelled(JSON.parse(e.data)));
        events.addEventListener('dataset-revision', e => { void connection.revision(JSON.parse(e.data)); });
        events.addEventListener('datasets', e => window.dispatchEvent(new CustomEvent('datasets-changed', { detail: JSON.parse(e.data) })));
        events.addEventListener('names', e => {
            const next = namesOwner.fromEvent(JSON.parse(e.data)); ancillaryEvents.current.names++;
            if (next) setNames(next);
        });
        events.addEventListener('snapshot', e => {
            const r = JSON.parse(e.data);
            window.dispatchEvent(new CustomEvent('kairo:source-changed', {detail:{characterId:r.characterId,key:r.key,resource:'snapshot'}}));
            if (changeAffectsPilot(r, charRef.current)) {
                snapshotEvents.current[r.key] = (snapshotEvents.current[r.key] || 0) + 1;
                setData(previous => {const value = retainSnapshot(previous[r.key], r.snapshot); return value === previous[r.key] ? previous : {...previous,[r.key]:value};});
                if (r.names !== undefined) { ancillaryEvents.current.names++; const next = namesOwner.fromLegacySnapshot(r.names); if (next) setNames(next); }
                if (goalSourceKeys.includes(r.key)) window.dispatchEvent(new CustomEvent('kairo:resource-changed', {detail:{characterId:r.characterId,resources:['goalSources'],key:r.key}}));
            }
        });
        events.addEventListener('universe', e => { const detail = JSON.parse(e.data); if (!detail.characterId || detail.characterId === charRef.current) window.dispatchEvent(new CustomEvent('kairo:universe-changed', { detail })); });
        events.addEventListener('obs', e => window.dispatchEvent(new CustomEvent('kairo:obs-status', {detail:JSON.parse(e.data)})));
        events.addEventListener('opsec', e => {ancillaryEvents.current.opsec++; setOpsec((previous: any) => retainValue(previous, JSON.parse(e.data)));});
        events.addEventListener('changed', e => {
            const detail = JSON.parse(e.data);
            window.dispatchEvent(new CustomEvent('kairo:source-changed', {detail}));
            if (!changeAffectsPilot(detail, charRef.current)) return;
            for (const resource of detail.resources || Object.keys(detail.resourceRevisions || {})) resourceEvents.current[resource] = (resourceEvents.current[resource] || 0) + 1;
            applyResourceRevisions(detail.resourceRevisions, detail.resources, false);
            window.dispatchEvent(new CustomEvent('kairo:resource-changed', {detail}));
            reloadRoster ||= !!detail.resources?.includes('roster');
            if ((changeNeedsState(detail) || reloadRoster) && !timer) timer = setTimeout(() => {timer = null; const task = reloadRoster ? reload().then(refresh) : refresh(); reloadRoster = false; void task.catch(() => {});}, 1500);
        });
        const poll = setInterval(() => refresh().catch(() => {}), 30000);
        return () => { connection.dispose(); datasetConnectionRef.current = null; events.close(); if (timer) clearTimeout(timer); clearInterval(poll); };
    }, [!!boot, refresh, reload, applyResourceRevisions, namesOwner, installBootstrap]);
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
    const activityRevision = `${recoveryRevision}:${resourceRevisions.activity || ''}`;
    const goalsRevision = `${recoveryRevision}:${resourceRevisions.goals || ''}:${goalInputRevision(data, goalClock || Date.now())}`;
    const sessionsRevision = `${recoveryRevision}:${resourceRevisions.sessions || ''}`;
    const contextValue = useMemo(() => boot ? {boot,data,names,character,setCharacter,page,navigate,reload,refresh,opsec,sessions,activityRevision,goalsRevision,sessionsRevision} : null,
        [boot,data,names,character,setCharacter,page,navigate,reload,refresh,opsec,sessions,activityRevision,goalsRevision,sessionsRevision]);
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
    return <SidebarProvider style={{ '--sidebar-width': '238px' } as React.CSSProperties}><Sidebar className="k-sidebar"><SidebarHeader><a className="brand" href="/#overview"><span className="brand-symbol">K</span><span>KAIRO<small>CAPSULEER OPERATIONS</small></span></a><button className="workspace-search" onClick={() => setSearch(true)}><Search size={15}/><span>Jump to module</span><kbd>⌘ K</kbd></button></SidebarHeader><SidebarContent>{[...workspaceGroups, ...(customPages.length ? ['EXTENSIONS'] : [])].map(group => <SidebarGroup key={group} data-workspace-group={group}><SidebarGroupLabel>{group}</SidebarGroupLabel><SidebarMenu>{navRoutes.filter(r => r.group === group).map(r => <SidebarDestination key={r.id} route={r} active={page === r.id} navigate={navigate} />)}</SidebarMenu></SidebarGroup>)}</SidebarContent><SidebarFooter><div className="local-stamp"><ShieldCheck size={16}/><span>LOCAL ENVIRONMENT<small>Private by design · v{boot?.version || '0.8.0-rc.17'}</small></span></div></SidebarFooter></Sidebar><SidebarInset className={jspacePage ? 'jspace-shell' : undefined}><header className="topbar"><div className="flex items-center gap-3"><WorkspaceSidebarToggle /><span className="muted">{current?.group === 'UNIVERSE' ? 'Universe' : 'Workspace'}</span><ChevronRight size={14}/><span>{current?.name || 'Command centre'}</span></div>{jspacePage && pilotControls}<div className="topbar-right"><span className={'connection-status ' + (datasetUpdating ? 'updating' : connected ? 'online' : '')}><i />{datasetUpdating ? 'Updating datasets' : connected ? 'Core connected' : 'Reconnecting to core'}</span><EveClock /></div></header>{datasetBanner}<div className="workspace">{!jspacePage && <div className="page-heading"><div><p className="eyebrow">{current?.group === 'UNIVERSE' ? 'UNIVERSE' : page === 'studio' || page === 'opsec' ? 'BROADCAST SYSTEMS' : page === 'connections' || page === 'modules' ? 'WORKSPACE CONTROL' : 'YOUR FLIGHT DECK'}</p><h1>{current?.name || 'Command centre'}</h1><p className="muted">{descriptions[page]}</p></div>{pilotControls}</div>}{err ? <div className="panel server-error"><Orbit size={38}/><h2>Kairo’s local core is unavailable.</h2><p>{err}</p><p className="muted">Start Kairo on your computer, then reload this page.</p><Button onClick={() => window.location.reload()}>Retry connection</Button></div> : boot && stateReady ? <Kairo.Provider value={contextValue}>{active?.needsReauth && <div className="inline-error mb-5">EVE access needs to be renewed. <button onClick={() => navigate('connections')}>Reconnect {active.name}</button></div>}<div className="page-transition" key={page}>{content}</div></Kairo.Provider> : <div className="loading-layout"><div className="stats-grid">{[0, 1, 2, 3].map(x => <Skeleton key={x} className="h-40"/>)}</div><Skeleton className="h-80"/></div>}<footer className="workspace-footer"><span>KAIRO / CAPSULEER OPERATIONS</span><span>Local memory. Modular growth.</span></footer></div></SidebarInset><Toaster theme="dark"/><CommandDialog open={search} onOpenChange={setSearch} title="Jump to a module" description="Search your Kairo workspace"><CommandInput placeholder="Search modules…"/><CommandList><CommandEmpty>No module found.</CommandEmpty>{[...workspaceGroups, ...(customPages.length ? ['EXTENSIONS'] : [])].map(group => <CommandGroup key={group} heading={group === 'UNIVERSE' ? 'Universe' : group.charAt(0)+group.slice(1).toLowerCase()}>{navRoutes.filter(r => r.group === group).map(r => { const Icon = icons[r.id] || Blocks; return <CommandItem key={r.id} value={r.name} keywords={r.keywords || []} onSelect={() => navigate(r.id)}><Icon size={17}/><span>{r.name}</span></CommandItem>; })}</CommandGroup>)}</CommandList></CommandDialog></SidebarProvider>;
}
function ExtensionPage({ id, character }: {
    id: string;
    character: number;
}) {
    const [loaded, setLoaded] = useState<{id:string;character:number;result:any}|null>(null);
    useEffect(() => {
        let active=true;
        api('/modules/' + id + '?character=' + character).then(result => {
            if(active)setLoaded({id,character,result});
        }).catch(e => {if(active)toast.error(e.message);});
        return () => {active=false;};
    }, [id, character]);
    const result=loaded?.id===id&&loaded.character===character?loaded.result:null;
    return <Panel title={result?.title || 'Module'}>{result ? <DataTable rows={result.rows || []} columns={result.columns || []}/> : <p className="muted">Loading module…</p>}</Panel>;
}
