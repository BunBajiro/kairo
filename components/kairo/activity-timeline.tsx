"use client";
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKairo } from './context';
import { api, stamp } from './model';
import { NoData, Panel } from './ui';

type Cursor = { at: string; id: number };
export function ActivityTimeline() {
    const { character, data, sessions } = useKairo();
    const [filter, setFilter] = useState('');
    const [cursors, setCursors] = useState<Cursor[]>([]);
    const [page, setPage] = useState<{ items: any[]; nextCursor: Cursor | null }>({ items: [], nextCursor: null });
    const [loading, setLoading] = useState(true), [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setLoading(true);
        const timer = setTimeout(() => {
            const query = new URLSearchParams({ character: String(character), limit: '5', q: filter });
            const cursor = cursors.at(-1);
            if (cursor) { query.set('before', cursor.at); query.set('beforeId', String(cursor.id)); }
            api('/timeline?' + query).then(result => {
                if (active) { setPage(result); setError(''); }
            }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
        }, filter ? 200 : 0);
        return () => { active = false; clearTimeout(timer); };
    }, [character, filter, cursors, data.location?.updatedAt, sessions]);
    return <Panel title="Activity timeline" meta={<a className="text-link" href="/api/export"><Download size={14}/> Export history</a>}>
        <div className="search-field mb-5"><Search size={15}/><Input aria-label="Filter timeline" value={filter} onChange={e => { setFilter(e.target.value); setCursors([]); }} placeholder="Filter by activity or system…" maxLength={200}/></div>
        {error && <p role="alert" className="inline-error mb-4">{error}</p>}
        <div aria-busy={loading}>
            {page.items.length ? <div className="timeline">{page.items.slice(0, 5).map(e => <article key={e.id}><time>{stamp(e.at)}</time><span className="timeline-mark"/><div><h3>{e.summary}</h3><span className="meta">{e.module} / {e.type}</span></div></article>)}</div> : loading ? <p className="meta">Loading activity…</p> : <NoData title={filter ? 'No matching activity' : 'No recorded activity'} description={filter ? 'Try a different activity or system name.' : 'Location, ship, skill and goal events will build your history here.'}/>}
        </div>
        <nav aria-label="Activity pages" className="flex items-center justify-between gap-3 flex-wrap mt-5">
            <span className="meta">{cursors.length ? 'Page ' + (cursors.length + 1) + ' · Up to 5 events' : '5 most recent' + (filter ? ' matches' : ' events')}</span>
            <div className="flex gap-2">
                {cursors.length > 0 && <Button variant="ghost" disabled={loading} onClick={() => setCursors([])}>Newest</Button>}
                <Button variant="outline" disabled={loading || !cursors.length} onClick={() => setCursors(c => c.slice(0, -1))}><ChevronLeft size={15}/> Newer</Button>
                <Button variant="outline" disabled={loading || !page.nextCursor || !!error} onClick={() => { if (page.nextCursor) setCursors(c => [...c, page.nextCursor!]); }}>Older <ChevronRight size={15}/></Button>
            </div>
        </nav>
    </Panel>;
}
