import test from 'node:test';
import assert from 'node:assert/strict';
import {noteAuthor, noteDateHeading, noteTimestamp, searchMapNotes} from '../../components/kairo/jspace-notes-model.mjs';

test('note time switches from elapsed minutes to explicit EVE time at one hour, independent of browser timezone', () => {
  const now = Date.parse('2026-09-27T00:30:00Z');
  assert.equal(noteTimestamp('2026-09-27T00:29:45Z', now).label, '0 min ago');
  assert.equal(noteTimestamp('2026-09-26T23:30:01Z', now).label, '59 min ago');
  const hour = noteTimestamp('2026-09-26T23:30:00Z', now);
  assert.equal(hour.label, '2026-09-26 · 23:30 EVE');
  assert.equal(hour.exact, '2026-09-26 23:30:00 EVE / UTC');
  assert.equal(noteTimestamp('2026-09-27T01:30:00+02:00', now).label, hour.label);
  assert.equal(noteDateHeading('2026-09-27', now), 'Today · EVE');
  assert.equal(noteDateHeading('2026-09-26', now), 'Yesterday · EVE');
  assert.equal(noteDateHeading('2026-09-25', now), '2026-09-25');
  assert.equal(noteTimestamp('missing', now).label, 'Time unavailable');
  assert.equal(noteTimestamp('2026-09-27T00:31:00Z', now).label, '0 min ago');
});

test('missing or invalid note authors never become the active pilot or a portrait of an invalid entity', () => {
  assert.deepEqual(noteAuthor({}), {id: null, name: 'Pilot unavailable'});
  assert.deepEqual(noteAuthor({author_id: -42, author_name: ''}), {id: null, name: 'Pilot unavailable'});
  assert.deepEqual(noteAuthor({author_id: 42, author_name: '  Scout Alpha  '}), {id: 42, name: 'Scout Alpha'});
  assert.deepEqual(noteAuthor({author_id: 0, author_name: 'Imported author'}), {id: null, name: 'Imported author'});
});

test('map note search combines text, author and system names without exposing source maps or departed connection notes', () => {
  const common = {created_at: '2026-09-27T10:00:00Z', author_id: 42, author_name: 'Scout Alpha'};
  const first = {id: 'map-one', name: 'Brave routes', nodes: [{system_id: 1, alias: 'Forward camp'}, {system_id: 2}], connections: [{id: 'gate-one', from_system_id: 1, to_system_id: 2}], comments: [
    {...common, id: 'system', system_id: 1, body: 'Friendly citadel'},
    {...common, id: 'edge', connection_id: 'gate-one', body: 'Access checked', created_at: '2026-09-27T11:00:00Z'},
    {...common, id: 'departed', connection_id: 'expired-edge', body: 'Never retain this edge'},
    {...common, id: 'archive', system_id: 3, body: 'Off-map residence'},
    {...common, id: 'general', body: 'Shared map memo'},
  ]};
  const source = {...first, id: 'source', kind: 'tracking_source'}, second = {...first, id: 'map-two', name: 'Independent chain', comments: [{...common, id: 'separate', system_id: 1, body: 'Unrelated note'}]};
  const systemName = id => ({1: 'J225111', 2: 'UALX-3', 3: 'J104321'})[id];
  const options = {systemName};
  const matches = searchMapNotes([first, source, second], 'j225111 scout friendly', options);
  assert.deepEqual(matches.map(note => [note.map_id, note.note_id]), [['map-one', 'system']]);
  assert.equal(matches[0].location_label, 'Forward camp');
  assert.equal(matches[0].archived, false);
  assert.deepEqual(searchMapNotes([first], 'forward alpha checked', options).map(note => note.note_id), ['edge']);
  assert.equal(searchMapNotes([first], 'residence', options)[0].archived, true);
  assert.equal(searchMapNotes([first], 'residence', options)[0].location_label, 'J104321');
  assert.equal(searchMapNotes([first], 'expired', options).length, 0);
  assert.equal(searchMapNotes([first], 'memo', options)[0].location_label, 'Map notes');
  const all = searchMapNotes([first, source, second], '', {...options, limit: 2});
  assert.equal(all.length, 2); assert.equal(all[0].note_id, 'edge');
  assert.ok(all.every(note => note.map_id !== 'source'));
  assert.equal(first.comments.length, 5, 'Search is read-only');
  assert.equal(searchMapNotes([first], '', {...options, limit: 0}).length, 0);
  const deadline = Date.parse('2026-09-27T12:00:00Z'), expiring = {...first, connections: [{...first.connections[0], kind: 'wormhole', expires_at: new Date(deadline).toISOString()}]};
  assert.equal(searchMapNotes([expiring], 'checked', {...options, now: deadline - 1}).length, 1);
  assert.equal(searchMapNotes([expiring], 'checked', {...options, now: deadline}).length, 0, 'Expired connection notes vanish before an in-flight server refresh completes');
  assert.equal(searchMapNotes([{...first, connections: [{...first.connections[0], life_status: 'collapsed'}]}], 'checked', options).length, 0);
});
