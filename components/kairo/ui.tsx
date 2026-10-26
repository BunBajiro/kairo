"use client";
/**
 * Shared Kairo presentation helpers for status-aware empty states, tables, choices
 * and EVE type images. These components render private dashboard data; they do not
 * collect ESI or infer broadcast permission. Snapshot ownership and identity are
 * defined in ../../docs/INTERNAL-API.md.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Search, ChevronLeft, ChevronRight, Database, LockKeyhole, Clock, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { useKairo } from './context';
import { stamp, type ModuleState } from './model';
import { createTableModel, tablePage } from './derived-models.mjs';
/**
 * Controlled string choice. Values must be nonempty and unique, including any
 * placeholder; callers encode provider names when they could collide with sentinels.
 */
export function Choice({ value, onChange, options, label, className = '' }: {
    value: string;
    onChange: (v: string) => void;
    options: {
        value: string;
        label: string;
    }[];
    label: string;
    className?: string;
}) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className={'choice ' + className}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>; }
export function Panel({ title, meta, action, children, className = '' }: {
    title: string;
    meta?: ReactNode;
    action?: () => void;
    children: ReactNode;
    className?: string;
}) { return <section className={'panel ' + className}><div className="panel-head"><h2>{title}</h2><div className="flex items-center gap-3">{meta}{action && <Button variant="ghost" size="icon" onClick={action} aria-label={'Open ' + title}><ArrowUpRight size={17}/></Button>}</div></div>{children}</section>; }
export function DataStatus({ state }: {
    state?: ModuleState;
}) { if (!state || state.status === 'waiting')
    return <span className="data-status">Awaiting sync</span>; return <span className={'data-status ' + state.status} title={state.error || stamp(state.updatedAt)}>{state.status === 'ready' ? 'Synced' : state.status === 'missing_scope' ? 'Scope needed' : state.status === 'disabled' ? 'Disabled' : state.status === 'stale' ? 'Cached · stale' : 'Sync issue'}</span>; }
export function NoData({ state, title = 'Nothing here yet', description = 'Your data will appear after the next sync.' }: {
    state?: ModuleState;
    title?: string;
    description?: string;
}) { const { navigate, character } = useKairo(); const locked = !character || state?.status === 'missing_scope'; return <Empty className="empty-state"><EmptyHeader><EmptyMedia variant="icon">{locked ? <LockKeyhole /> : state?.status === 'error' ? <TriangleAlert /> : <Database />}</EmptyMedia><EmptyTitle>{locked ? 'Connect this data' : state?.status === 'disabled' ? 'Module disabled' : title}</EmptyTitle><EmptyDescription>{state?.error || (locked ? 'Authorize the required ESI scopes in Connections.' : description)}</EmptyDescription></EmptyHeader>{locked && <Button size="sm" variant="outline" onClick={() => navigate('connections')}>Manage connection <ArrowUpRight size={14}/></Button>}{state?.status === 'disabled' && <Button variant="outline" onClick={() => navigate('modules')}>Manage modules</Button>}</Empty>; }
export type Column = {
    key: string;
    label: string;
    render?: (r: any) => ReactNode;
};
/**
 * Local filtering/sorting of already collected rows, paged 30 at a time. Supply
 * immutable rows; the per-mounted-table model caches normalization and ordering.
 * Renderers affect cells only, not sort/search values. Collection truncation and
 * snapshot status remain visible independently of the local page.
 */
export function DataTable({ rows, columns, state, searchable = true, emptyTitle, emptyDescription }: {
    rows: any[];
    columns: Column[];
    state?: ModuleState;
    searchable?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
}) { const [query, setQuery] = useState(''); const [page, setPage] = useState(0); const [sort, setSort] = useState<{
    key: string;
    asc: boolean;
} | null>(null); const model = useMemo(() => createTableModel(), []); const filtered = model(rows, query, sort); const { pages, page: actual, start, end } = tablePage(filtered.length, page);
    // Persist a clamp when a resource shrinks, so later growth cannot revive an obsolete page.
    useEffect(() => { if (page !== actual) setPage(actual); }, [page, actual]); if (!rows.length)
    return <NoData state={state} title={emptyTitle} description={emptyDescription}/>; return <><div className="table-toolbar">{searchable && <div className="search-field"><Search size={15}/><Input value={query} aria-label="Filter records" onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Filter records…"/></div>}<span className="meta">{filtered.length.toLocaleString()} records {state?.truncated ? '· collection capped' : ''}</span></div><Table><TableHeader><TableRow>{columns.map(c => <TableHead key={c.key}><button className="sort-label" onClick={() => setSort({ key: c.key, asc: sort?.key === c.key ? !sort.asc : true })}>{c.label}{sort?.key === c.key ? (sort.asc ? ' ↑' : ' ↓') : ''}</button></TableHead>)}</TableRow></TableHeader><TableBody>{filtered.slice(start, end).map(({ row: r, key }: { row: any; key: string }) => <TableRow key={key}>{columns.map(c => <TableCell key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table>{!filtered.length && <p className="muted p-6">No matching records.</p>}{pages > 1 && <div className="pagination"><span className="meta">Page {actual + 1} of {pages}</span><Button size="icon" variant="outline" aria-label="Previous page" disabled={actual === 0} onClick={() => setPage(actual - 1)}><ChevronLeft size={15}/></Button><Button size="icon" variant="outline" aria-label="Next page" disabled={actual === pages - 1} onClick={() => setPage(actual + 1)}><ChevronRight size={15}/></Button></div>}<p className="sync-stamp"><Clock size={12}/> {stamp(state?.updatedAt)}</p></>; }
/**
 * Use the type's provider image variant (`bp` for blueprints, otherwise `icon`).
 * Metadata must come from the owning resource, avoiding a taxonomy lookup per row.
 * A failed decorative image is hidden without losing the name; a later load restores
 * visibility, including when React reuses the element for a different type.
 */
export function ItemName({ id, name, iconVariant = 'icon' }: {
    id: number;
    name: string;
    iconVariant?: 'icon' | 'bp';
}) { return <span className="item-name"><img key={id} src={`https://images.evetech.net/types/${id}/${iconVariant}?size=32`} alt="" loading="lazy" width="30" height="30" onLoad={e => { e.currentTarget.style.visibility = ''; }} onError={e => { e.currentTarget.style.visibility = 'hidden'; }}/>{name}</span>; }
