"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookPen, Play, Square, ChevronRight, Route, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useKairo } from './context';
import { api, stamp } from './model';
import { Panel, DataTable, DataStatus, NoData, ItemName } from './ui';
import { SessionReport } from './session-report';
import {createSessionArchive} from './session-archive.mjs';
import { CombatCoverage } from './combat-coverage';
export { Goals } from './goals';

export function SessionsPage() {
    const { character, boot, data, names, sessions, sessionsRevision, refresh } = useKairo();
    const [sessionList, setSessionList] = useState<any[]>([]), [more, setMore] = useState(false);
    const [reportId, setReportId] = useState(''), [starting, setStarting] = useState(false), [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
    const archive = useRef<ReturnType<typeof createSessionArchive> | null>(null);
    const mounted = useRef(false);
    const reportOpener = useRef<{character:number;button:HTMLButtonElement} | null>(null);
    const reportFocusOwner = reportOpener.current;
    const namingOpener = useRef<{character:number;button:HTMLButtonElement} | null>(null);
    const namingFocusOwner = namingOpener.current;
    const current = useRef(character); current.current = character;
    const active = sessions.find(s => !s.ended), query = '?character=' + character;
    const load = useCallback(async () => {await archive.current?.refresh();}, []);
    useEffect(() => {mounted.current = true; return () => {mounted.current = false; reportOpener.current = null; namingOpener.current = null;};}, []);
    function openReport(id:string, button:HTMLButtonElement) {
        reportOpener.current = {character, button}; setReportId(id);
    }
    function restoreReportFocus() {
        const owner = reportFocusOwner;
        if (!owner || reportOpener.current !== owner) return;
        reportOpener.current = null;
        if (mounted.current && current.current === owner.character && owner.button.isConnected && !owner.button.disabled) owner.button.focus();
    }
    function openNamingDialog(button:HTMLButtonElement) {
        namingOpener.current = {character, button}; setStarting(true);
    }
    function restoreNamingFocus() {
        const owner = namingFocusOwner;
        if (!owner || namingOpener.current !== owner) return;
        namingOpener.current = null;
        if (mounted.current && current.current === owner.character && owner.button.isConnected && !owner.button.disabled) owner.button.focus();
    }
    useEffect(() => {
        reportOpener.current = null; namingOpener.current = null;
        setSessionList([]); setMore(false); setReportId(''); setStarting(false); setLabel(''); setError(''); setBusy(false);
        const requested = character;
        const owner = createSessionArchive({read: offset => api('/sessions?character=' + requested + '&offset=' + offset),
            publish: result => {if (current.current === requested) {setSessionList(result.items); setMore(result.more); setError('');}},
            onError: error => {if (current.current === requested) setError(error.message);},
            onBusy: value => {if (current.current === requested) setLoading(value);}});
        archive.current = owner;
        return () => {owner.close(); if (archive.current === owner) archive.current = null;};
    }, [character]);
    useEffect(() => {void load();}, [load, sessionsRevision, character]);
    async function changeSession(opener?:HTMLButtonElement) {
        const requested = character;
        setBusy(true);
        try {
            const result = await api('/session' + query, 'POST', { action: active ? 'end' : 'start', label }, boot.csrf);
            if (current.current !== requested || !mounted.current) return;
            setStarting(false); setLabel(''); if (active && opener) openReport(result.id, opener);
            await refresh();
            toast.success(active ? 'Flight session ended.' : 'Flight session started.');
        } catch (e: any) { if (current.current === requested) toast.error(e.message); } finally { if (current.current === requested) setBusy(false); }
    }
    const killmails = (data.killmails?.data || []).map((kill: any) => ({ ...kill,
        hull: names[kill.victim?.ship_type_id] || 'Ship ' + kill.victim?.ship_type_id,
        system: names[kill.solar_system_id] || kill.solar_system_id }));
    return <>
        <section className="session-bar"><span className="session-icon"><Route size={23}/></span><div>
            <h2>{active ? active.label : 'Record your next operation'}</h2>
            <p className="meta">{active ? 'Started ' + stamp(active.started) : 'Named reports for travel, combat, wallet activity, skills and goals.'}</p>
        </div>{active && <Button variant="ghost" onClick={event => openReport(active.id, event.currentTarget)}>Live report</Button>}
            <Button variant={active ? 'outline' : 'default'} disabled={!character || busy} onClick={event => active ? changeSession(event.currentTarget) : openNamingDialog(event.currentTarget)}>
                {active ? <Square size={14}/> : <Play size={14}/>} {active ? 'End session' : 'Start session'}
            </Button>
        </section>
        {error && <div className="inline-error" role="alert">{error} <Button variant="ghost" disabled={loading} onClick={() => void load()}>Retry archive</Button></div>}
        <Tabs defaultValue="sessions" className="mt-5"><TabsList className="page-tabs">
            <TabsTrigger value="sessions">Sessions</TabsTrigger><TabsTrigger value="combat">Combat record</TabsTrigger>
        </TabsList><TabsContent value="sessions"><Panel title="Session archive" meta={<span className="meta">Open any session to review its report</span>}>
            <div className="session-cards">{sessionList.map(session => <button className="session-card" key={session.id} onClick={event => openReport(session.id, event.currentTarget)}>
                <span className="session-card-icon"><NotebookPen size={22}/></span><span><strong>{session.label}</strong>
                    <small>{stamp(session.started)} · {Math.floor(((session.ended ? Date.parse(session.ended) : Date.now()) - Date.parse(session.started)) / 60000)} min</small>
                </span><span className={'tag ' + (!session.ended ? 'positive' : '')}>{session.ended ? 'REPORT' : 'ACTIVE'}</span><ChevronRight size={18}/>
            </button>)}</div>
            {!sessionList.length && <NoData title="Start your first session" description="Give an operation a name and collect its activity and outcomes in a report."/>}
            {more && <Button variant="outline" className="mt-4" disabled={busy || loading} onClick={() => void archive.current?.loadMore()}>Load earlier sessions</Button>}
        </Panel></TabsContent><TabsContent value="combat"><Panel title="Recent kills & losses" meta={<DataStatus state={data.killmails}/>}>
            <CombatCoverage coverage={data.killmails?.participation}/><DataTable rows={killmails} state={data.killmails} columns={[
                { key: 'killmail_time', label: 'Time', render: row => stamp(row.killmail_time) },
                { key: 'result', label: 'Result', render: row => <span className={row.result === 'kill' ? 'positive' : 'negative'}>{row.result === 'kill' ? 'KILL' : 'LOSS'}</span> },
                { key: 'contribution', label: 'Your participation', render: row => row.result === 'loss' ? 'Victim' : row.attackers?.some((attacker: any) => attacker.character_id === character && attacker.final_blow) ? 'Final blow' : 'Participant' },
                { key: 'hull', label: 'Victim hull', render: row => <ItemName id={row.victim.ship_type_id} name={row.hull}/> },
                { key: 'system', label: 'System' }, { key: 'attackers', label: 'Involved', render: row => row.attackers?.length || 0 },
                { key: 'killmail_id', label: 'Record', render: row => <a href={'https://zkillboard.com/kill/' + row.killmail_id + '/'} target="_blank" rel="noreferrer" className="text-link">zKillboard <ExternalLink size={13}/></a> },
            ]}/>
        </Panel></TabsContent></Tabs>
        <Dialog open={starting} onOpenChange={setStarting}><DialogContent onCloseAutoFocus={event => {event.preventDefault(); restoreNamingFocus();}}><DialogHeader><DialogTitle>Name this session</DialogTitle>
            <DialogDescription>Kairo reports observed activity during the session. You can rename it and add a debrief later.</DialogDescription>
        </DialogHeader><form className="stack" onSubmit={e => { e.preventDefault(); changeSession(); }}>
            <label className="field-label">Session name<Input autoFocus required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} placeholder="Friday fleet · Tenerifis roam"/></label>
            <Button disabled={busy || !label.trim()}><Play size={15}/> Start recording session</Button>
        </form></DialogContent></Dialog>
        {reportId && <SessionReport key={character} id={reportId} onRestoreFocus={restoreReportFocus} onClose={() => setReportId('')} onSaved={() => {void refresh().catch(e => toast.error(e.message)); }}/>}
    </>;
}
