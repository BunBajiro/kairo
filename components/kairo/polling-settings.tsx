"use client";
import { useEffect, useState } from 'react';
import { Activity, ArrowRight, BrainCircuit, Boxes, Check, Clock3, Factory, Globe, Mail, Orbit, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Swords, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useKairo } from './context';
import { api } from './model';

type Batch = { key: string; label: string; description: string; choices: number[]; recommended: number; protection: boolean; paged: boolean };
type Group = { id: string; name: string; enabled: boolean; shared: boolean; batches: Batch[] };
type Polling = { intervals: Record<string, number>; groups: Group[] };
const icons: Record<string, typeof Orbit> = { pilot: Orbit, training: BrainCircuit, wallet: Wallet, hangar: Boxes, industry: Factory, combat: Swords, opsec: ShieldCheck, comms: Mail, universe: Globe };
const interval = (seconds: number) => seconds === 0 ? 'ESI cache' : seconds < 60 ? seconds + ' sec' : seconds < 3600 ? seconds / 60 + ' min' : seconds / 3600 + ' hr';
const tick = (seconds: number) => seconds === 0 ? 'Auto' : seconds < 60 ? seconds + 's' : seconds < 3600 ? seconds / 60 + 'm' : seconds / 3600 + 'h';

export function PollingSettings() {
    const { boot, refresh } = useKairo();
    const [config, setConfig] = useState<Polling | null>(null), [draft, setDraft] = useState<Record<string, number>>({});
    const [group, setGroup] = useState('pilot'), [query, setQuery] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false), [retry, setRetry] = useState(0);
    useEffect(() => {
        let live = true;
        api('/settings/polling').then((r: Polling) => { if (live) { setConfig(r); setDraft(r.intervals); setError(''); } }).catch(e => { if (live) setError(e.message); });
        return () => { live = false; };
    }, [retry]);
    if (!config) return error ? <div className="panel polling-load-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(v => v + 1)}><RefreshCw size={15}/> Retry loading polling settings</Button></div> : <div className="stack" aria-label="Loading polling settings"><Skeleton className="h-36"/><Skeleton className="h-96"/></div>;
    const batches = config.groups.flatMap(g => g.batches), changed = batches.filter(b => draft[b.key] !== config.intervals[b.key]).length;
    const custom = batches.filter(b => draft[b.key] !== b.recommended).length;
    const needle = query.trim().toLowerCase();
    const visible = config.groups.filter(g => needle || g.id === group).map(g => ({ ...g, batches: g.batches.filter(b => !needle || (g.name + ' ' + b.label + ' ' + b.description).toLowerCase().includes(needle)) })).filter(g => g.batches.length);
    function choose(key: string, value: number) { setDraft(d => ({ ...d, [key]: value })); setError(''); }
    async function save() {
        setSaving(true); setError('');
        try {
            const result: Polling = await api('/settings/polling', 'PUT', { intervals: draft }, boot.csrf);
            setConfig(result); setDraft(result.intervals);
            toast.success('ESI polling settings saved.');
            refresh().catch(() => {});
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    }
    return <div className="polling-settings">
        <section className="panel polling-intro">
            <div className="polling-intro-copy"><span className="eyebrow"><Activity size={14}/> ESI REFRESH CONTROL</span><h2>Set the pace of your dashboard.</h2><p>Choose how often each batch of EVE data is checked. Start with the recommended rates, then tune the parts you use most.</p><div className="polling-facts"><span><Check size={13}/> {batches.length} data batches</span><span><Orbit size={13}/> Applies to all characters</span><span><Clock3 size={13}/> {custom ? custom + ' custom intervals' : 'Recommended defaults'}</span></div></div>
            <div className="polling-cache-note"><ShieldCheck size={22}/><div><strong>Shared cache, fewer requests</strong><p>ESI cache expiry and rate limits always take precedence. A batch may contain several pages; cached pages and names are reused.</p><small>Auto follows ESI’s cache timing. Disabled modules stay paused.</small></div></div>
        </section>
        <div className="polling-layout">
            <aside className="polling-navigation" aria-label="Polling modules">
                <label className="polling-search"><Search size={16}/><Input aria-label="Search data batches" placeholder="Find a data batch…" value={query} onChange={e => setQuery(e.target.value)}/></label>
                <div className="polling-group-list">{config.groups.map(g => {
                    const Icon = icons[g.id] || Activity, edits = g.batches.filter(b => draft[b.key] !== b.recommended).length;
                    return <button type="button" key={g.id} className={group === g.id && !needle ? 'active' : ''} aria-current={group === g.id && !needle ? 'true' : undefined} onClick={() => { setGroup(g.id); setQuery(''); }}><Icon size={17}/><span>{g.name}</span>{edits ? <i aria-label={edits + ' custom intervals'}/> : null}<small>{g.batches.length}</small></button>;
                })}</div>
                <p className="polling-navigation-hint">Slower intervals reduce requests. Faster intervals pick up changes sooner, once ESI has new data.</p>
            </aside>
            <div className="polling-batches">
                {visible.length === 0 && <div className="panel polling-empty"><Search size={24}/><h3>No matching data batches</h3><p>Try “wallet”, “training” or “location”.</p><Button variant="ghost" onClick={() => setQuery('')}>Clear search</Button></div>}
                {visible.map(g => <section key={g.id} className="polling-group" aria-labelledby={'polling-group-' + g.id}>
                    <div className="polling-group-heading"><div><h2 id={'polling-group-' + g.id}>{g.name}</h2><span>{g.shared ? 'One shared collection for all pilots' : 'Routine intervals for each connected character'}</span></div>{!g.enabled && <span className="tag">MODULE PAUSED</span>}</div>
                    {g.batches.map(b => {
                        const value = draft[b.key], index = b.choices.indexOf(value), recommended = value === b.recommended, id = 'polling-' + b.key;
                        return <article className={'panel polling-batch ' + (recommended ? '' : 'polling-custom')} key={b.key}>
                            <div className="polling-batch-heading"><div><h3 id={id + '-title'}>{b.label}</h3><span className="polling-recommendation">Recommended: {interval(b.recommended)}</span></div><div className="polling-value"><strong>{interval(value)}</strong><span>{recommended ? <><Check size={11}/> Recommended</> : 'Custom interval'}</span></div></div>
                            <p className="polling-description" id={id + '-description'}>{b.description}</p>
                            {b.protection && <p className="polling-protection"><ShieldCheck size={13}/> OPSEC checks this on ESI’s cache schedule when needed for the protected pilot.</p>}
                            <div className="polling-slider-wrap">
                                <Slider disabled={saving} value={[index]} min={0} max={b.choices.length - 1} step={1} onValueChange={v => choose(b.key, b.choices[v[0]])} thumbProps={{ 'aria-labelledby': id + '-title', 'aria-describedby': id + '-description', 'aria-valuetext': interval(value) + (recommended ? ', recommended' : '') }}/>
                                <div className="polling-ticks">{b.choices.map((seconds, n) => <button type="button" key={seconds} disabled={saving} className={(seconds === value ? 'selected ' : '') + (seconds === b.recommended ? 'recommended' : '')} style={{ left: (n / (b.choices.length - 1)) * 100 + '%' }} aria-label={b.label + ': ' + interval(seconds) + (seconds === b.recommended ? ' (recommended)' : '')} aria-pressed={seconds === value} onClick={() => choose(b.key, seconds)}><i/>{tick(seconds)}</button>)}</div>
                            </div>
                            <div className="polling-scale-caption"><span>More frequent</span><ArrowRight size={12}/><span>Fewer checks</span>{!recommended && <button type="button" disabled={saving} onClick={() => choose(b.key, b.recommended)}>Use recommended</button>}</div>
                        </article>;
                    })}
                </section>)}
                <div className="polling-on-demand"><h3>Some data updates on demand</h3><dl><div><dt>Trade-hub markets</dt><dd>Manual scans reuse order books and daily regional history. Browsing a saved scan makes no ESI calls.</dd></div><div><dt>Public kill participation</dt><dd>zKillboard’s separate public feed keeps its one-hour cache. Verified records remain in your combat history.</dd></div><div><dt>Names & universe details</dt><dd>Fetched when needed and cached across modules. Stream countdowns and display updates run locally.</dd></div></dl></div>
            </div>
        </div>
        <div className="polling-savebar panel">
            <div aria-live="polite"><strong>{saving ? 'Saving polling preferences…' : changed ? changed + ' unsaved ' + (changed === 1 ? 'change' : 'changes') : 'Polling preferences saved'}</strong><p>{error || 'Scheduled checks change after saving. Refresh and relevant events can request earlier checks.'}</p></div>
            <div className="polling-save-actions"><Button variant="ghost" disabled={saving || !custom} onClick={() => { setDraft(Object.fromEntries(batches.map(b => [b.key, b.recommended]))); setError(''); }}><RotateCcw size={14}/> Restore recommended</Button>{changed > 0 && <Button variant="outline" disabled={saving} onClick={() => { setDraft(config.intervals); setError(''); }}>Discard</Button>}<Button disabled={saving || !changed} onClick={save}><Save size={15}/>{saving ? 'Saving…' : 'Save changes'}</Button></div>
        </div>
    </div>;
}
