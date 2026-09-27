import {connectionHasEnded} from './jspace-workspace-model.mjs';

/** Map-local notes only. This deliberately has no dependency on Journey history. */
export function noteAuthor(note) {
  const id = Number(note?.author_id);
  return {id: Number.isSafeInteger(id) && id > 0 ? id : null, name: typeof note?.author_name === 'string' && note.author_name.trim() ? note.author_name.trim() : 'Pilot unavailable'};
}

export function noteTimestamp(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return {label: 'Time unavailable', exact: '', date: 'undated'};
  const stamp = new Date(time).toISOString();
  const age = Math.max(0, now - time);
  return {label: age < 3600000 ? `${Math.floor(age / 60000)} min ago` : `${stamp.slice(0, 10)} · ${stamp.slice(11, 16)} EVE`, exact: `${stamp.slice(0, 10)} ${stamp.slice(11, 19)} EVE / UTC`, date: stamp.slice(0, 10)};
}

export function noteDateHeading(date, now = Date.now()) {
  if (date === 'undated') return 'Undated';
  const today = new Date(now).toISOString().slice(0, 10), yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
  return date === today ? 'Today · EVE' : date === yesterday ? 'Yesterday · EVE' : date;
}

export function searchMapNotes(maps, query = '', {systemName = id => String(id), limit = Infinity, now = Date.now()} = {}) {
  const terms = query.trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean), results = [];
  for (const map of maps || []) {
    if (map.kind === 'tracking_source' || map.read_only) continue;
    const nodes = new Map((map.nodes || []).map(node => [node.system_id, node])), edges = new Map((map.connections || []).filter(edge => !connectionHasEnded(edge, now)).map(edge => [edge.id, edge]));
    for (const note of map.comments || []) {
      const edge = note.connection_id ? edges.get(note.connection_id) : null;
      if (note.connection_id && !edge) continue;
      const systemLabel = id => nodes.get(id)?.alias || systemName(id);
      const location = note.system_id ? systemLabel(note.system_id) : edge ? `${systemLabel(edge.from_system_id)} ↔ ${systemLabel(edge.to_system_id)}` : 'Map notes';
      const canonicalLocation = note.system_id ? systemName(note.system_id) : edge ? `${systemName(edge.from_system_id)} ${systemName(edge.to_system_id)}` : '';
      const author = noteAuthor(note), text = [note.body, author.name, location, canonicalLocation, map.name].join(' ').toLocaleLowerCase('en-GB');
      if (!terms.every(term => text.includes(term))) continue;
      results.push({...note, map_id: map.id, map_name: map.name, note_id: note.id, author_name: author.name, author_id: author.id, location_label: location, archived: !!note.system_id && !nodes.has(note.system_id)});
    }
  }
  return results.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || String(a.note_id).localeCompare(String(b.note_id))).slice(0, Math.max(0, limit));
}
