"use client";
import {useEffect,useState,useRef} from 'react';
import { MapPin, ArrowRight, Plus, Target, Trash2, Check, NotebookPen, Search, Play, Square, Clock, ChevronRight, Radio, ShieldCheck, Route as RouteIcon, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useKairo } from './context';
import { api, isk, stamp, remaining } from './model';
import { Panel, DataTable, DataStatus, Choice, NoData, ItemName } from './ui';
import {SessionReport} from './session-report';
import {JourneyMap} from './journey-map';
import {PlaceNotes} from './place-notes';
import {ActivityTimeline} from './activity-timeline';
import {CombatCoverage} from './combat-coverage';
export {Goals} from './goals';
export function Journey() {
    const { character, boot, data, names, sessions, refresh } = useKairo();
    const [connections,setConnections]=useState<any[]>([]),[visits, setVisits] = useState<any[]>([]), [systems, setSystems] = useState<any[]>([]), [busy, setBusy] = useState(false);
    const [sessionList,setSessionList]=useState<any[]>([]),[sessionMore,setSessionMore]=useState(false),[reportId,setReportId]=useState(''),[starting,setStarting]=useState(false),[label,setLabel]=useState(''),[enriching,setEnriching]=useState(false);
    const currentCharacter=useRef(character);currentCharacter.current=character;
    useEffect(()=>{setConnections([]);setVisits([]);setSystems([]);setSessionList([]);setReportId('');},[character]);
    const active = sessions.find(s => !s.ended);
    const query = '?character=' + character;
    async function load() {const requested=character;const [j,s]=await Promise.all([api('/journey'+query),api('/sessions'+query)]);if(currentCharacter.current!==requested)return;setSessionList(old=>[...s.items,...old.filter(x=>!s.items.some((r:any)=>r.id===x.id))]);setSessionMore(s.more);setVisits(j.visits); setSystems(j.systems);setConnections(j.connections||[]); }
    useEffect(() => { load().catch(e => toast.error(e.message)); }, [character, data.location?.updatedAt, sessions]);
    async function session() { setBusy(true); try {
        const result=await api('/session'+query,'POST',{action:active?'end':'start',label},boot.csrf);setStarting(false);setLabel('');if(active)setReportId(result.id);
        await refresh();
        await load();
        toast.success(active ? 'Flight session ended.' : 'Flight session started.');
    }
    catch (e: any) {
        toast.error(e.message);
    }
    finally {
        setBusy(false);
    } }
    const killmails = (data.killmails?.data || []).map((k: any) => ({ ...k, hull: names[k.victim?.ship_type_id] || 'Ship ' + k.victim?.ship_type_id, system: names[k.solar_system_id] || k.solar_system_id }));
    return <><section className="session-bar"><span className="session-icon"><RouteIcon size={23}/></span><div><h2>{active ? active.label : 'Your personal flight log'}</h2><p className="meta">{active ? 'Started ' + stamp(active.started) : 'Travel, combat, wallet activity, training, goals and operational events.'}</p></div>{active&&<Button variant="ghost" onClick={()=>setReportId(active.id)}>Live report</Button>}<Button variant={active ? 'outline' : 'default'} disabled={!character || busy} onClick={()=>active?session():setStarting(true)}>{active ? <Square size={14}/> : <Play size={14}/>} {active ? 'End session' : 'Start session'}</Button></section><Panel title="Recent journey" meta={<span className="tag">OBSERVED SYSTEMS</span>}><div className="route-strip">{visits.length ? visits.slice(0, 7).reverse().map((v, i, a) => <div className="route-stop" key={v.id}><span className={'route-node ' + (i === a.length - 1 ? 'last' : '')}><MapPin size={17}/><strong>{v.name}</strong><small>{new Date(v.at).toISOString().slice(11, 16)} EVE</small></span>{i < a.length - 1 && <ChevronRight size={18}/>}</div>) : <p className="muted">Your journey starts with the first authenticated location sample.</p>}</div><p className="meta">ESI samples can miss fast transits. This is an observed history, not a complete gate-jump record.</p></Panel><Tabs defaultValue="timeline" className="mt-5"><TabsList className="page-tabs"><TabsTrigger value="timeline">Activity timeline</TabsTrigger><TabsTrigger value="systems">Systems visited</TabsTrigger><TabsTrigger value="combat">Combat record</TabsTrigger><TabsTrigger value="sessions">Sessions</TabsTrigger></TabsList><TabsContent value="timeline"><ActivityTimeline key={character}/></TabsContent><TabsContent value="systems"><JourneyMap key={character} systems={systems} connections={connections} onConnectionHidden={async(id,hidden)=>{await api('/journey/connections/'+id+query,'PUT',{hidden},boot.csrf);await load();}} enriching={enriching} onEnrich={async()=>{setEnriching(true);try{const r=await api('/journey/enrich'+query,'POST',{},boot.csrf);await load();toast.success(r.results.filter((x:any)=>x.ok).length+' systems mapped.');}catch(e:any){toast.error(e.message);}finally{setEnriching(false);}}}/></TabsContent><TabsContent value="combat"><Panel title="Recent kills & losses" meta={<DataStatus state={data.killmails}/>}><CombatCoverage coverage={data.killmails?.participation}/><DataTable rows={killmails} state={data.killmails} columns={[{ key: 'killmail_time', label: 'Time', render: r => stamp(r.killmail_time) }, { key: 'result', label: 'Result', render: r => <span className={r.result === 'kill' ? 'positive' : 'negative'}>{r.result === 'kill' ? 'KILL' : 'LOSS'}</span> }, {key:'contribution',label:'Your participation',render:r=>r.result==='loss'?'Victim':r.attackers?.some((a:any)=>a.character_id===character&&a.final_blow)?'Final blow':'Participant'}, { key: 'hull', label: 'Victim hull', render: r => <ItemName id={r.victim.ship_type_id} name={r.hull}/> }, { key: 'system', label: 'System' }, { key: 'attackers', label: 'Involved', render: r => r.attackers?.length || 0 }, { key: 'killmail_id', label: 'Record', render: r => <a href={`https://zkillboard.com/kill/${r.killmail_id}/`} target="_blank" rel="noreferrer" className="text-link">zKillboard <ExternalLink size={13}/></a> }]}/></Panel></TabsContent><TabsContent value="sessions"><Panel title="Session archive" meta={<span className="meta">Open any session to review its report</span>}><div className="session-cards">{sessionList.map(s=><button className="session-card" key={s.id} onClick={()=>setReportId(s.id)}><span className="session-card-icon"><NotebookPen size={22}/></span><span><strong>{s.label}</strong><small>{stamp(s.started)} · {Math.floor(((s.ended?Date.parse(s.ended):Date.now())-Date.parse(s.started))/60000)} min</small></span><span className={'tag '+(!s.ended?'positive':'')}>{s.ended?'REPORT':'ACTIVE'}</span><ChevronRight size={18}/></button>)}</div>{!sessionList.length&&<NoData title="Start your first session" description="Give a flight a name and collect its events, progress and outcomes in a report."/>}{sessionMore&&<Button variant="outline" className="mt-4" onClick={async()=>{try{const r=await api('/sessions'+query+'&offset='+sessionList.length);setSessionList([...sessionList,...r.items]);setSessionMore(r.more);}catch(e:any){toast.error(e.message);}}}>Load earlier sessions</Button>}</Panel></TabsContent></Tabs><Dialog open={starting} onOpenChange={setStarting}><DialogContent><DialogHeader><DialogTitle>Name this session</DialogTitle><DialogDescription>Kairo will report observed activity during this session. You can rename it and add a debrief later.</DialogDescription></DialogHeader><form className="stack" onSubmit={e=>{e.preventDefault();session();}}><label className="field-label">Session name<Input autoFocus required maxLength={100} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Friday fleet · Tenerifis roam"/></label><Button disabled={busy||!label.trim()}><Play size={15}/> Start recording session</Button></form></DialogContent></Dialog>{reportId&&<SessionReport key={character} id={reportId} onClose={()=>setReportId('')} onSaved={()=>{load().catch(e=>toast.error(e.message));refresh();}}/>}</>;
}
export function Universe() {
    const { data, boot, names } = useKairo();
    const [query, setQuery] = useState(''), [system, setSystem] = useState<any>(null), [destination, setDestination] = useState(''), [preference, setPreference] = useState('Shorter'), [route, setRoute] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(()=>{const name=sessionStorage.getItem('kairo-system-lookup');if(name){sessionStorage.removeItem('kairo-system-lookup');setQuery(name);setBusy(true);api('/universe/search','POST',{name},boot.csrf).then(setSystem).catch(e=>setError(e.message)).finally(()=>setBusy(false));}},[]);
    const status = data.status?.data;
    const target = system || data.location?.data?.system;
    const id=target?.system_id||data.location?.data?.solar_system_id;
    const constellation=system?system.constellation:data.location?.data?.constellation,region=system?system.region:data.location?.data?.region;
    const sov = (data.sovereignty?.data || []).find((s: any) => s.system_id === id);
    const kills = (data.kills?.data || []).find((s: any) => s.system_id === id);
    const jumps = (data.jumps?.data || []).find((s: any) => s.system_id === id);
    const fw = (data.fw?.data || []).find((s: any) => s.solar_system_id === id);
    async function search(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try {
        setSystem(await api('/universe/search', 'POST', { name: query }, boot.csrf));
        setRoute(null);
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } }
    async function plan(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try {
        const to = await api('/universe/search', 'POST', { name: destination }, boot.csrf);
        const r = await api('/universe/route', 'POST', { origin: id, destination: to.system_id, preference }, boot.csrf);
        setRoute({ ...r, destination: to.name });
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } }
    return <><section className="universe-status"><Radio size={25}/><div><h2>Tranquility</h2><p className="meta">{status ? status.vip ? 'VIP access' : 'Open for capsuleers' : 'Checking server status'}</p></div><strong>{isk(status?.players)} <small>pilots online</small></strong><DataStatus state={data.status}/></section><div className="two-grid"><Panel title="System intelligence" meta={<span className="tag">PUBLIC ESI</span>}><form className="flex gap-2" onSubmit={search}><Input aria-label="System name" value={query} onChange={e => setQuery(e.target.value)} placeholder="System name, e.g. UALX-3" required/><Button disabled={busy}><Search size={15}/> Look up</Button></form>{target ? <div className="system-detail"><p className="eyebrow">SOLAR SYSTEM</p><h2>{target.name} <span className={'security ' + (target.security_status < .5 ? 'danger' : '')}>{target.security_status?.toFixed(1)}</span></h2><p className="muted">{constellation?.name||'Constellation awaiting lookup'} / {region?.name||'Region awaiting lookup'}</p><div className="system-metrics"><span><strong>{kills?.ship_kills ?? '—'}</strong><small>Ship kills</small></span><span><strong>{kills?.pod_kills ?? '—'}</strong><small>Pod kills</small></span><span><strong>{jumps?.ship_jumps ?? '—'}</strong><small>Gate jumps</small></span></div><div className="setting-row"><span className="muted">Sovereignty</span><span>{sov?.alliance_id ? system?.names?.[sov.alliance_id] || names[sov.alliance_id] || 'Alliance name unavailable' : sov?.faction_id ? system?.names?.[sov.faction_id] || names[sov.faction_id] || 'Faction name unavailable' : 'No alliance sovereignty'}</span></div><div className="setting-row"><span className="muted">Faction warfare</span><span>{fw ? fw.contested || 'Warzone' : 'Outside warzone'}</span></div><p className="meta mt-4">Activity reflects ESI’s cached reporting window. Use in-game intel for immediate decisions.</p></div> : <div className="calm-empty"><OrbitSymbol /><h3>Get the lay of New Eden.</h3><p>Look up a system for security, sovereignty, faction warfare and recent activity.</p></div>}</Panel><Panel title="Route planner" meta={<RouteIcon size={18} className="muted"/>}><p className="muted text-sm mb-5">Plan from {target?.name || 'the system you look up'} using the public gate network.</p><form onSubmit={plan} className="stack"><label className="field-label">Destination<Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Jita" required/></label><label className="field-label">Route preference<Choice label="Route preference" value={preference} onChange={setPreference} options={[{ value: 'Shorter', label: 'Shorter route' }, { value: 'Safer', label: 'Safer route' }, { value: 'LessSecure', label: 'Less secure route' }]}/></label><Button disabled={!id || busy}><RouteIcon size={15}/> Calculate route</Button></form>{route && <div className="planned-route"><h3>{Math.max(0, (route.data.route || []).length - 1)} jumps to {route.destination}</h3><div>{(route.data.route || []).map((systemId: number, i: number) => <span key={i}>{route.names?.[systemId] || names[systemId] || systemId}{i < route.data.route.length - 1 && <ChevronRight size={12}/>}</span>)}</div><p className="meta">Public stargates only. Ansiblex, wormhole and private connections are not included.</p></div>}</Panel></div>{target&&<PlaceNotes system={{...target,system_id:id}} constellation={constellation} region={region}/>} {error && <p className="inline-error" role="alert">{error}</p>}</>;
}
function OrbitSymbol() { return <MapPin size={32}/>; }
