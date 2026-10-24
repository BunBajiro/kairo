"use client";

/**
 * Edit the shared local politics configuration as one revisioned draft. Manual
 * memberships and explicit independence override inferred relationships; the
 * server owns inference. Save replaces the accepted baseline only on success,
 * while reload is an explicit discard action. See docs/UNIVERSE.md.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, Check, ChevronRight, Flag, Globe2, Network, Plus, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useKairo } from './context';
import { api } from './model';
import { configuredTerritoryColourConflict, suggestTerritoryColour } from '../../lib/universe-territory-colours.mjs';
import './power-bloc-settings.css';

type Bloc = { id: string; name: string; color: string; alliance_ids: number[] };
type Config = { version: 1; revision: number; updated_at: string | null; inference_enabled: boolean; blocs: Bloc[]; independent_alliance_ids: number[] };
type Alliance = { alliance_id: number; name: string; ticker?: string };
type Confirmation = { kind: 'move'; alliance: Alliance; target: string; from: string } | { kind: 'delete'; id: string } | { kind: 'reload' };
const independent = '__independent';
const colours = ['#97ebce', '#91b2f6', '#e8c485', '#bda4e7', '#ef8c93', '#68c5d7', '#f2a66d', '#a5c77f'];
const entryStyle = (index: number) => ({ '--bloc-entry-delay': Math.min(index, 5) * 35 + 'ms' } as CSSProperties);
const message = (error: unknown) => error instanceof Error ? error.message : 'Kairo could not complete this request.';

export function PowerBlocSettings() {
    const { boot, names: knownNames } = useKairo();
    const [config, setConfig] = useState<Config | null>(null), [draft, setDraft] = useState<Config | null>(null);
    const [selected, setSelected] = useState(''), [alliances, setAlliances] = useState<Record<number, string>>({});
    const [query, setQuery] = useState(''), [suggestions, setSuggestions] = useState<Alliance[]>([]);
    const [error, setError] = useState(''), [searchError, setSearchError] = useState('');
    const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [resolving, setResolving] = useState(false), [retry, setRetry] = useState(0);
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const dirty = !!config && !!draft && JSON.stringify(config) !== JSON.stringify(draft);
    function remember(items: Alliance[]) { setAlliances(previous => ({ ...previous, ...Object.fromEntries(items.map(item => [item.alliance_id, item.name])) })); }
    useEffect(() => {
        let live = true;
        setLoading(true);
        api('/universe/politics/config').then((value: Config) => {
            if (!live) return;
            setConfig(value); setDraft(value); setSelected(value.blocs[0]?.id || ''); setError('');
        }).catch(error => { if (live) setError(message(error)); }).finally(() => { if (live) setLoading(false); });
        api('/universe/politics/alliances?q=').then((value: { items: Alliance[] }) => { if (live) remember(value.items || []); }).catch(() => {});
        return () => { live = false; };
    }, [retry]);
    useEffect(() => {
        let live = true;
        setSuggestions([]); setSearchError('');
        if (!query.trim()) return;
        const timer = window.setTimeout(() => {
            api('/universe/politics/alliances?q=' + encodeURIComponent(query.trim())).then((value: { items: Alliance[] }) => {
                if (!live) return;
                setSuggestions((value.items || []).slice(0, 8)); remember(value.items || []);
            }).catch(error => { if (live) setSearchError(message(error)); });
        }, 200);
        return () => { live = false; window.clearTimeout(timer); };
    }, [query]);
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    if (!draft || !config) return loading ? <div className="power-bloc-settings" aria-label="Loading Universe settings"><Skeleton className="h-36"/><Skeleton className="h-96"/></div> : <section className="panel power-bloc-settings power-bloc-empty" role="alert"><Globe2 size={30}/><h2>Universe settings could not load</h2><p>{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}><RefreshCw size={17}/> Retry</Button></section>;

    const current = draft.blocs.find(bloc => bloc.id === selected), isIndependent = selected === independent;
    const memberIds = isIndependent ? draft.independent_alliance_ids : current?.alliance_ids || [];
    const nameOf = (id: number) => alliances[id] || knownNames[String(id)] || `Alliance ${id}`;
    const targetName = (id: string) => id === independent ? 'Independent alliances' : draft.blocs.find(bloc => bloc.id === id)?.name || 'Unnamed power bloc';
    const configuredCount = draft.blocs.reduce((sum, bloc) => sum + bloc.alliance_ids.length, 0);
    const colourIssue = draft.blocs.map(bloc => ({ bloc, reason: configuredTerritoryColourConflict(bloc.color, draft.blocs, bloc.id) })).find(item => item.reason);
    const currentColourConflict = current ? configuredTerritoryColourConflict(current.color, draft.blocs, current.id) : null;
    const validation = draft.blocs.some(bloc => !bloc.name.trim()) ? 'Give each power bloc a name before saving.' : new Set(draft.blocs.map(bloc => bloc.name.trim().toLocaleLowerCase())).size !== draft.blocs.length ? 'Use a different name for each power bloc.' : colourIssue ? `${colourIssue.bloc.name || 'New power bloc'}: ${colourIssue.reason}` : '';
    function edit(patch: Partial<Bloc>) { setDraft(value => value && ({ ...value, blocs: value.blocs.map(bloc => bloc.id === selected ? { ...bloc, ...patch } : bloc) })); setError(''); }
    function select(id: string) { setSelected(id); setQuery(''); setSearchError(''); }
    function create() {
        const id = 'bloc-' + crypto.randomUUID();
        setDraft(value => value && ({ ...value, blocs: [...value.blocs, { id, name: '', color: suggestTerritoryColour(id, value.blocs), alliance_ids: [] }] }));
        select(id); setError('');
    }
    // An alliance has one configured owner: assigning it removes membership
    // from every other bloc and the explicit-independent list in the same draft.
    function assign(alliance: Alliance, target: string) {
        setDraft(value => value && ({ ...value,
            blocs: value.blocs.map(bloc => ({ ...bloc, alliance_ids: [...bloc.alliance_ids.filter(id => id !== alliance.alliance_id), ...(bloc.id === target ? [alliance.alliance_id] : [])] })),
            independent_alliance_ids: [...value.independent_alliance_ids.filter(id => id !== alliance.alliance_id), ...(target === independent ? [alliance.alliance_id] : [])],
        }));
        remember([alliance]); setQuery(''); setSearchError(''); setError('');
    }
    function add(alliance: Alliance, target: string) {
        const source = draft!.blocs.find(bloc => bloc.alliance_ids.includes(alliance.alliance_id))?.id || (draft!.independent_alliance_ids.includes(alliance.alliance_id) ? independent : '');
        if (source === target) { setSearchError(`${alliance.name} is already in ${targetName(target)}.`); return; }
        if (source) setConfirmation({ kind: 'move', alliance, target, from: source });
        else assign(alliance, target);
    }
    async function resolve() {
        const target = selected;
        setResolving(true); setSearchError('');
        try { const result: Alliance = await api('/universe/politics/alliances/resolve', 'POST', { query: query.trim() }, boot.csrf); add(result, target); }
        catch (error) { setSearchError(message(error)); }
        finally { setResolving(false); }
    }
    function remove(id: number) {
        if (isIndependent) setDraft(value => value && ({ ...value, independent_alliance_ids: value.independent_alliance_ids.filter(member => member !== id) }));
        else edit({ alliance_ids: memberIds.filter(member => member !== id) });
    }
    async function save() {
        setSaving(true); setError('');
        try {
            const result: Config = await api('/universe/politics/config', 'PUT', draft, boot.csrf);
            setConfig(result); setDraft(result); toast.success('Universe power blocs saved.');
        } catch (error) { setError(message(error)); }
        finally { setSaving(false); }
    }
    function confirm() {
        if (confirmation?.kind === 'move') assign(confirmation.alliance, confirmation.target);
        if (confirmation?.kind === 'delete') {
            setDraft(value => value && ({ ...value, blocs: value.blocs.filter(bloc => bloc.id !== confirmation.id) }));
            select(draft!.blocs.find(bloc => bloc.id !== confirmation.id)?.id || '');
        }
        if (confirmation?.kind === 'reload') { setError(''); setLoading(true); setConfig(null); setDraft(null); setRetry(value => value + 1); }
        setConfirmation(null);
    }
    return <div className="power-bloc-settings">
        <section className="panel power-bloc-intro">
            <div className="power-bloc-intro-copy"><span className="power-bloc-kicker"><Globe2 size={17}/> Universe / geopolitics</span><h2>Define your view of New Eden.</h2><p>Name your blocs, choose their colours and add alliances. Your settings take priority.</p><div className="power-bloc-shared"><Users size={17}/> Shared across characters <span>·</span> <ShieldCheck size={17}/> Separate from OPSEC and standings</div></div>
            <div className="power-bloc-stats"><div><Flag size={20}/><strong>{draft.blocs.length}</strong><span>Power blocs</span></div><div><Users size={20}/><strong>{configuredCount}</strong><span>Assigned alliances</span></div><div><ShieldCheck size={20}/><strong>{draft.independent_alliance_ids.length}</strong><span>Kept independent</span></div></div>
        </section>
        <section className="panel power-bloc-fallback"><span className="power-bloc-feature-icon"><Sparkles size={24}/></span><div><h3 id="power-bloc-inference-label">Inferred Coalitions fallback</h3><p id="power-bloc-inference-description">Estimate groups for unassigned alliances when evidence supports it. Estimates may be inaccurate. Your configured and independent alliances take priority.</p></div><Switch aria-labelledby="power-bloc-inference-label" aria-describedby="power-bloc-inference-description" checked={draft.inference_enabled} disabled={saving} onCheckedChange={value => setDraft({ ...draft, inference_enabled: value })}/></section>
        <div className="power-bloc-layout">
            <aside className="panel power-bloc-sidebar" aria-label="Power bloc selection"><div className="power-bloc-sidebar-heading"><h3>Your power blocs</h3><Button variant="ghost" size="icon" aria-label="Create power bloc" disabled={saving || resolving} onClick={create}><Plus size={20}/></Button></div>
                <div className="power-bloc-list">{draft.blocs.map((bloc, index) => <button type="button" key={bloc.id} style={entryStyle(index)} aria-current={selected === bloc.id ? 'true' : undefined} className={selected === bloc.id ? 'active' : ''} disabled={saving || resolving} onClick={() => select(bloc.id)}><span className="power-bloc-swatch" style={{ background: bloc.color }}/><span><strong>{bloc.name || 'New power bloc'}</strong><small>{bloc.alliance_ids.length} {bloc.alliance_ids.length === 1 ? 'alliance' : 'alliances'}</small></span><ChevronRight size={17}/></button>)}</div>
                {!draft.blocs.length && <p className="power-bloc-sidebar-hint">Your named blocs will appear here.</p>}
                <Button className="power-bloc-add" variant="outline" disabled={saving || resolving} onClick={create}><Plus size={17}/> Create power bloc</Button>
                <button type="button" className={'power-bloc-independent ' + (isIndependent ? 'active' : '')} aria-current={isIndependent ? 'true' : undefined} disabled={saving || resolving} onClick={() => select(independent)}><ShieldCheck size={20}/><span><strong>Independent alliances</strong><small>{draft.independent_alliance_ids.length} excluded from inference</small></span><ChevronRight size={17}/></button>
            </aside>
            <section key={selected || 'empty'} className="panel power-bloc-editor" aria-label={isIndependent ? 'Independent alliance settings' : 'Power bloc editor'}>
                {!current && !isIndependent ? <div className="power-bloc-empty"><span className="power-bloc-empty-icon"><Network size={38}/></span><h2>Put your alliances on the map.</h2><p>Create a named power bloc such as Imperium or WinterCo, then add its member alliances. Unconfigured alliances can use the inference fallback.</p><Button disabled={saving} onClick={create}><Plus size={18}/> Create your first power bloc</Button><div className="power-bloc-example" aria-hidden="true"><span><i style={{ background: colours[0] }}/>Your bloc</span><ArrowRight size={17}/><span><Users size={17}/>Member alliances</span></div></div> : <>
                    <div className="power-bloc-editor-heading"><div><span className="power-bloc-source"><Check size={15}/> {isIndependent ? 'Explicit exclusion' : 'Configured by you'}</span><h2>{isIndependent ? 'Independent alliances' : current?.name || 'New power bloc'}</h2></div>{current && <Button variant="ghost" size="icon" aria-label={'Delete ' + (current.name || 'new power bloc')} disabled={saving || resolving} onClick={() => setConfirmation({ kind: 'delete', id: current.id })}><Trash2 size={19}/></Button>}</div>
                    {current && <div className="power-bloc-fields"><label>Power bloc name<Input aria-label="Power bloc name" value={current.name} maxLength={80} placeholder="e.g. Imperium" disabled={saving} onChange={event => edit({ name: event.target.value })}/></label><div className="power-bloc-colour"><label htmlFor="power-bloc-colour">Map colour</label><div><input id="power-bloc-colour" type="color" aria-invalid={!!currentColourConflict} aria-describedby={currentColourConflict ? 'power-bloc-colour-conflict' : undefined} value={current.color} disabled={saving} onChange={event => edit({ color: event.target.value })}/><code>{current.color.toUpperCase()}</code></div></div><div className="power-bloc-palette" aria-label="Suggested map colours">{colours.map(colour => { const conflict = configuredTerritoryColourConflict(colour, draft.blocs, current.id); return <button type="button" key={colour} aria-label={'Use colour ' + colour + (conflict ? '. ' + conflict : '')} title={conflict || 'Use colour ' + colour} aria-pressed={current.color.toLowerCase() === colour} disabled={saving || !!conflict} style={{ background: colour }} onClick={() => edit({ color: colour })}>{current.color.toLowerCase() === colour && <Check size={16}/>}</button>; })}</div>{currentColourConflict ? <div className="power-bloc-colour-conflict" id="power-bloc-colour-conflict" role="status"><p>{currentColourConflict}</p><Button variant="outline" disabled={saving} onClick={() => edit({ color: suggestTerritoryColour(current.id, draft.blocs) })}><Sparkles size={17}/> Use an available colour</Button><small>The map keeps conflicting saved colours distinct until you update them.</small></div> : <p className="power-bloc-colour-hint">One colour per bloc. Empire faction colours are reserved.</p>}</div>}
                    {isIndependent && <p className="power-bloc-explanation">Keep these alliances separate on the map, even when evidence suggests a wider coalition.</p>}
                    <div className="power-bloc-member-heading"><h3>{isIndependent ? 'Independent alliances' : 'Member alliances'}</h3><span>{memberIds.length}</span></div>
                    <form className="power-bloc-search" onSubmit={event => { event.preventDefault(); if (query.trim() && !resolving && !saving) void resolve(); }}><label><Search size={19}/><Input aria-label="Find alliance by name or ID" value={query} disabled={saving || resolving} maxLength={100} placeholder="Alliance name or ID…" onChange={event => setQuery(event.target.value)}/></label><Button type="submit" variant="outline" disabled={!query.trim() || resolving || saving}>{resolving ? <RefreshCw size={17} className="power-bloc-spin"/> : <Plus size={17}/>} {resolving ? 'Checking…' : 'Find & add'}</Button></form>
                    <p className="power-bloc-search-hint">Choose a known alliance below, or use its exact name or ID to check EVE.</p>
                    {suggestions.length > 0 && <div className="power-bloc-suggestions" aria-label="Matching alliances">{suggestions.map(alliance => <button type="button" key={alliance.alliance_id} disabled={saving || resolving} onClick={() => add(alliance, selected)}><span><strong>{alliance.name}</strong><small>{alliance.alliance_id}</small></span><Plus size={18}/></button>)}</div>}
                    {searchError && <p className="power-bloc-error" role="alert">{searchError}</p>}
                    {memberIds.length ? <div className="power-bloc-members">{memberIds.map((id, index) => <div className="power-bloc-member" key={id} style={entryStyle(index)}><img src={`https://images.evetech.net/alliances/${id}/logo?size=64`} alt="" loading="lazy" width="38" height="38" onError={event => { event.currentTarget.style.visibility = 'hidden'; }}/><span><strong>{nameOf(id)}</strong><small>{id}</small></span><Button variant="ghost" size="icon" aria-label={'Remove ' + nameOf(id)} disabled={saving || resolving} onClick={() => remove(id)}><X size={17}/></Button></div>)}</div> : <div className="power-bloc-no-members"><Users size={27}/><span>{isIndependent ? 'No alliances kept independent yet.' : 'Add the first alliance to this bloc.'}</span></div>}
                    <p className="power-bloc-footnote">Removing an alliance makes it eligible for inference after saving. Choose Independent alliances to keep it separate.</p>
                </>}
            </section>
        </div>
        <div className="panel power-bloc-savebar"><div aria-live="polite"><strong>{saving ? 'Saving Universe settings…' : dirty ? 'You have unsaved changes' : 'Universe settings are saved'}</strong><p>{validation || 'Map memberships change only when you save.'}</p>{error && <p className="power-bloc-error" role="alert">{error} Your draft has been kept.</p>}</div><div className="power-bloc-save-actions">{colourIssue && colourIssue.bloc.id !== selected && <Button variant="outline" disabled={saving || resolving} onClick={() => select(colourIssue.bloc.id)}>Review colour</Button>}{error && <Button variant="outline" disabled={saving || loading} onClick={() => setConfirmation({ kind: 'reload' })}><RefreshCw size={17}/> Load latest saved</Button>}<Button variant="ghost" disabled={!dirty || saving || resolving} onClick={() => { setDraft(config); select(config.blocs.find(bloc => bloc.id === selected)?.id || (isIndependent ? independent : config.blocs[0]?.id || '')); setError(''); }}><RotateCcw size={17}/> Revert</Button><Button disabled={!dirty || !!validation || saving || resolving} onClick={save}><Save size={17}/> {saving ? 'Saving…' : 'Save changes'}</Button></div></div>
        <AlertDialog open={!!confirmation} onOpenChange={value => { if (!value) setConfirmation(null); }}><AlertDialogContent className="power-bloc-confirmation"><AlertDialogHeader><AlertDialogTitle>{confirmation?.kind === 'move' ? `Move ${confirmation.alliance.name}?` : confirmation?.kind === 'delete' ? 'Delete this power bloc?' : 'Load the latest saved settings?'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.kind === 'move' ? `${confirmation.alliance.name} is already assigned to ${targetName(confirmation.from)}. Move it to ${targetName(confirmation.target)} in your draft?` : confirmation?.kind === 'delete' ? 'Its member alliances will become eligible for inferred groups after you save. You can revert this draft change before saving.' : 'This replaces your current draft with the latest saved configuration. Unsaved changes will be discarded.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirm}>{confirmation?.kind === 'move' ? 'Move alliance' : confirmation?.kind === 'delete' ? 'Delete from draft' : 'Load saved settings'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>;
}
