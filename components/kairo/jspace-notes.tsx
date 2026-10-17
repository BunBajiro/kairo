"use client";

/**
 * Paginated private map notebook. The parent keys this editor by map/location;
 * command acceptance owns persistence and the supplied clock drives UTC grouping.
 * Retained notes may be read after their system card leaves the map, but composing
 * a location note requires that context to remain present.
 */

import {useMemo, useState} from 'react';
import {ArrowUpRight, ChevronLeft, ChevronRight, MessageSquare, Search, Trash2, UserRound} from 'lucide-react';
import type {UniverseSystem} from './universe-types';
import type {JSpaceCommand, JSpaceWorkspaceMap} from './jspace-workspace';
import {noteAuthor, noteDateHeading, noteTimestamp, searchMapNotes, type MapNote} from './jspace-notes-model.mjs';
import './jspace-notes.css';

const PAGE_SIZE = 12;

function PilotPortrait({note}: {note: MapNote}) {
  const author = noteAuthor(note), [failed, setFailed] = useState(false);
  return <span className="jspace-note-portrait" data-author-id={author.id || undefined} aria-hidden="true">{author.id && !failed ? <img src={`https://images.evetech.net/characters/${author.id}/portrait?size=64`} alt="" loading="lazy" onError={() => setFailed(true)}/> : <UserRound size={20}/>}</span>;
}

export function JSpaceComments({map, systemId, connectionId, busy, command, now, byId, onOpenNote}: {map: JSpaceWorkspaceMap; systemId?: number | null; connectionId?: string | null; busy: boolean; command: JSpaceCommand; now: number; byId?: Map<number, UniverseSystem>; onOpenNote?: (note: MapNote) => void}) {
  const [body, setBody] = useState(''), [query, setQuery] = useState(''), [wholeMap, setWholeMap] = useState(false), [page, setPage] = useState(0);
  const hasContext = !!(systemId || connectionId);
  const contextPresent = systemId ? map.nodes.some(node=>node.system_id===systemId) : connectionId ? map.connections.some(edge=>edge.id===connectionId) : true;
  const rows = useMemo(() => searchMapNotes([map], query, {systemName: id => byId?.get(id)?.name || String(id), now}).filter(note => !hasContext || wholeMap || (systemId ? note.system_id === systemId : note.connection_id === connectionId)), [map, query, byId, hasContext, wholeMap, systemId, connectionId, now]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1), shown = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  return <div className="jspace-notebook">
    <form className="jspace-form jspace-note-compose" onSubmit={async event => {event.preventDefault();if (!contextPresent)return;if (await command('comment.add', {comment: {body: body.trim(), system_id: systemId || null, connection_id: connectionId || null}})) {setBody('');setQuery('');setPage(0);}}}>
      <label>Add a field note<textarea aria-label="J-Space field note" rows={3} value={body} onChange={event => setBody(event.target.value)} maxLength={4000} placeholder="Leave a note for your next visit…" required/></label>
      <button className="jspace-primary" disabled={busy || !body.trim() || !contextPresent}><MessageSquare size={16}/>Save note</button>
    </form>
    {!contextPresent&&<p className="jspace-muted">Saved notes remain here. Add this system to the map to write another.</p>}
    <div className="jspace-note-tools">
      <label className="jspace-note-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search notes" placeholder="Search notes…" value={query} onChange={event => {setQuery(event.target.value);setPage(0);}}/></label>
      {hasContext && <div className="jspace-note-scope" role="group" aria-label="Notes search scope"><button type="button" aria-pressed={!wholeMap} onClick={() => {setWholeMap(false);setPage(0);}}>{systemId ? 'This system' : 'This connection'}</button><button type="button" aria-pressed={wholeMap} onClick={() => {setWholeMap(true);setPage(0);}}>Entire map</button></div>}
      <small className="jspace-note-count" aria-live="polite">{rows.length} {rows.length === 1 ? 'note' : 'notes'}{query.trim() ? ' found' : ''}</small>
    </div>
    <div className="jspace-note-list">
      {shown.map((row, index) => {
        const time = noteTimestamp(row.created_at, now), previous = index > 0 ? noteTimestamp(shown[index - 1].created_at, now).date : null, showLocation = !hasContext || wholeMap;
        return <div key={row.id}>{time.date !== previous && <h4 className="jspace-note-date">{noteDateHeading(time.date, now)}</h4>}<article className="jspace-note" data-note-id={row.id}>
          <header><PilotPortrait note={row}/><div className="jspace-note-attribution"><strong>{row.author_name}</strong><time dateTime={time.exact ? row.created_at : undefined} title={time.exact || undefined}>{time.label}</time></div><button type="button" aria-label="Remove field note" title="Delete note" className="jspace-note-delete" disabled={busy} onClick={() => void command('comment.remove', {comment_id: row.id})}><Trash2 size={14}/></button></header>
          {showLocation && <div className="jspace-note-location">{onOpenNote && !row.archived && (row.system_id || row.connection_id) ? <button type="button" onClick={() => onOpenNote(row)} aria-label={`Open notes at ${row.location_label}`}>{row.location_label}<ArrowUpRight size={13}/></button> : <span>{row.location_label}{row.archived ? ' · off map' : ''}</span>}</div>}
          <p className="jspace-note-body">{row.body}</p>
        </article></div>;
      })}
      {!rows.length && <div className="jspace-empty-small"><MessageSquare size={25}/><p>{query.trim() ? 'No matching notes.' : 'Your notes will appear here.'}</p></div>}
    </div>
    {pages > 1 && <nav className="jspace-note-pages" aria-label="Note pages"><button type="button" aria-label="Newer notes" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16}/>Newer</button><span>{currentPage + 1} / {pages}</span><button type="button" aria-label="Older notes" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Older<ChevronRight size={16}/></button></nav>}
  </div>;
}
