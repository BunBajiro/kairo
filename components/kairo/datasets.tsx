"use client";
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock3, Database, Download, Globe, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useKairo } from './context';
import { api } from './model';
import './datasets.css';

type Dataset = { id: string; name: string; provider: string; version: string; build: number | null; releasedAt: string | null; updatedAt: string | null; automatic: boolean };
export type DatasetStatus = {
    phase: 'idle' | 'checking' | 'downloading' | 'building' | 'ready' | 'error'; busy: boolean;
    datasets: Dataset[]; available: { build: number; releasedAt: string | null } | null;
    lastCheckedAt: string | null; nextCheckAt: string | null; error: string | null;
    progress: { stage: string; message: string; completed?: number; total?: number; percent?: number } | null;
    schedule: { intervalMinutes: number; startup: boolean }; restartRequired: boolean; managedRestart: boolean;
};
function date(value: string | null) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
    return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' EVE';
}

export function SettingsDatasets() {
    const { boot } = useKairo();
    const [status, setStatus] = useState<DatasetStatus | null>(null), [error, setError] = useState(''), [action, setAction] = useState('');
    const epoch = useRef(0), live = useRef(false), readInFlight = useRef<number | null>(null);
    async function load() {
        if (readInFlight.current !== null) return;
        const request = ++epoch.current;
        readInFlight.current = request;
        try { const result = await api('/datasets'); if (live.current && request === epoch.current) { setStatus(result); setError(''); } }
        catch (e: any) { if (live.current && request === epoch.current) setError(e.message); }
        finally { if (readInFlight.current === request) readInFlight.current = null; }
    }
    useEffect(() => {
        live.current = true; void load();
        const changed = (event: Event) => { const result = (event as CustomEvent<DatasetStatus>).detail; if (!result?.datasets) return; epoch.current++; setStatus(result); setError(''); };
        const focus = () => { void load(); };
        window.addEventListener('datasets-changed', changed); window.addEventListener('focus', focus);
        return () => { live.current = false; epoch.current++; readInFlight.current = null; window.removeEventListener('datasets-changed', changed); window.removeEventListener('focus', focus); };
    }, []);
    async function request(kind: 'check' | 'install') {
        if (action) return;
        setAction(kind); setError(''); const request = ++epoch.current;
        try { const result = await api('/datasets/' + kind, 'POST', {}, boot.csrf); if (live.current && request === epoch.current) setStatus(result); }
        catch (e: any) { if (live.current && request === epoch.current) setError(e.message); }
        finally { if (live.current) setAction(''); }
    }
    if (!status) return error ? <section className="panel dataset-load-error" role="alert"><AlertTriangle size={24}/><h2>Datasets are unavailable</h2><p>{error}</p><Button variant="outline" onClick={() => void load()}><RefreshCw size={15}/> Retry</Button></section> : <div className="stack" aria-label="Loading installed datasets"><Skeleton className="h-44"/><Skeleton className="h-72"/></div>;
    const busy = status.busy || !!action, ready = status.phase === 'ready';
    const official = status.datasets.filter(row => row.automatic), supplemental = status.datasets.filter(row => !row.automatic);
    const phase = status.phase === 'checking' ? 'Checking CCP’s latest release' : status.phase === 'downloading' ? 'Downloading the new dataset' : status.phase === 'building' ? 'Preparing and validating the update' : ready ? status.managedRestart ? 'Applying the dataset update' : 'Update ready to activate' : status.error ? 'Update check needs attention' : status.available ? `Build ${status.available.build} is available` : 'Your local universe data';
    const percent = status.progress?.percent;
    function cards(rows: Dataset[]) { return <div className="dataset-grid">{rows.map(row => <article className="panel dataset-card" key={row.id}><div className="dataset-card-heading"><span className="dataset-symbol">{row.automatic ? <Database size={20}/> : <Globe size={20}/>}</span><div><h3>{row.name}</h3><p>{row.provider}</p></div><span className={'tag ' + (row.automatic ? 'positive' : '')}>{row.automatic ? 'AUTO' : 'BUNDLED'}</span></div><div className="dataset-version"><span>{row.build ? 'BUILD' : 'VERSION'}</span><strong title={row.version}>{row.version || 'Not recorded'}</strong></div><dl><div><dt>Released</dt><dd>{date(row.releasedAt)}</dd></div><div><dt>Last installed</dt><dd>{date(row.updatedAt)}</dd></div></dl></article>)}</div>; }
    return <div className="datasets-settings" data-dataset-phase={status.phase}>
        <section className="panel dataset-intro"><div className="dataset-intro-copy"><span className="eyebrow"><Database size={14}/> LOCAL DATASETS</span><h2>New Eden, kept current.</h2><p>Kairo checks for new static data at startup and hourly. Downloads and preparation run in the background.</p><div className="dataset-facts"><span><ShieldCheck size={14}/> Validated before activation</span><span><Check size={14}/> Old downloads cleaned up</span></div></div><div className="dataset-actions"><Button variant="outline" disabled={busy || ready} onClick={() => void request('check')}><RefreshCw size={16} className={status.phase === 'checking' || action === 'check' ? 'animate-spin' : ''}/>{status.phase === 'checking' || action === 'check' ? 'Checking…' : 'Check for updates'}</Button>{status.available && !ready && <Button disabled={busy} onClick={() => void request('install')}><Download size={16}/>{action === 'install' ? 'Starting update…' : 'Install update'}</Button>}</div></section>
        <section className={'dataset-status ' + (error || status.error ? 'has-warning' : '')} aria-live="polite"><div className="dataset-status-line">{error || status.error ? <AlertTriangle size={20}/> : busy || ready ? <RefreshCw size={20} className="animate-spin"/> : <Check size={20}/>}<div><strong>{phase}</strong><p>{error || status.error || status.progress?.message || (ready ? status.managedRestart ? 'Kairo will reconnect automatically. Your current page stays open.' : 'Restart Kairo to activate this dataset. The current version remains in use until then.' : status.available ? 'The installed dataset stays available while its replacement is prepared.' : 'Static data powers Atlas, Maps and the market catalogue.')}</p>{(error || status.error) && <small>The installed datasets remain available.</small>}</div>{typeof percent === 'number' && busy && <span className="dataset-percent">{Math.round(percent)}%</span>}</div>{busy && <div className="dataset-progress" role="progressbar" aria-label="Dataset update" aria-valuemin={0} aria-valuemax={100} aria-valuenow={typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : undefined}><i className={typeof percent !== 'number' ? 'indeterminate' : ''} style={typeof percent === 'number' ? { width: Math.min(100, Math.max(0, percent)) + '%' } : undefined}/></div>}<div className="dataset-check-times"><span><Clock3 size={13}/> Last checked: {status.lastCheckedAt ? date(status.lastCheckedAt) : 'Not checked yet'}</span><span>Next check: {status.nextCheckAt ? date(status.nextCheckAt) : busy ? 'After this update' : 'Not scheduled'}</span></div></section>
        <section className="dataset-section"><div className="dataset-section-heading"><h2>CCP static data</h2><span>Updated together from one release</span></div>{cards(official)}</section>
        {supplemental.length > 0 && <section className="dataset-section"><div className="dataset-section-heading"><h2>Supplemental datasets</h2><span>Included with this Kairo build</span></div>{cards(supplemental)}<p className="dataset-supplemental-note">These sources are versioned separately. Updating the SDE does not replace wormhole statics or community reference data.</p></section>}
    </div>;
}
