import test from 'node:test';
import assert from 'node:assert/strict';
import {createUniverseRequests} from '../../components/kairo/universe-requests.mjs';

const REPLAY = 'kairo-universe-replay', LOOKUP = 'kairo-system-lookup', SETTINGS = 'kairo-universe-settings-tab';
function fixture() {
  const data = new Map(); let blocked = null;
  const storage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method => [method, (key, value) => {
    if (blocked === method || blocked === 'all') throw new Error('Storage access denied');
    return method === 'getItem' ? data.get(key) ?? null : method === 'setItem' ? data.set(key, value) : data.delete(key);
  }]));
  return {data, storage, block: method => { blocked = method; }, requests: createUniverseRequests(() => storage)};
}

test('persisted replay handoff survives a reload and is consumed exactly once', () => {
  const f = fixture(), request = JSON.stringify({sessionId: 12, characterId: 42});
  f.requests.set(REPLAY, request);
  const reloaded = createUniverseRequests(() => f.storage);
  assert.equal(reloaded.take(REPLAY), request); assert.equal(reloaded.take(REPLAY), null); assert.equal(f.data.has(REPLAY), false);
});

for (const denied of ['all', 'getItem', 'setItem', 'removeItem']) test('navigation handoffs survive denied ' + denied + ' access without stale replay after recovery', () => {
  const f = fixture(); f.data.set(REPLAY, 'obsolete'); f.block(denied);
  f.requests.set(REPLAY, 'current'); assert.equal(f.requests.take(REPLAY), 'current');
  f.block(null); assert.equal(f.requests.take(REPLAY), null); assert.equal(f.data.has(REPLAY), false);
  f.requests.set(REPLAY, 'next'); assert.equal(f.requests.take(REPLAY), 'next'); assert.equal(f.requests.take(REPLAY), null);
});

test('a throwing sessionStorage getter still permits an in-memory handoff and consumption', () => {
  const requests = createUniverseRequests(() => { throw new Error('SecurityError'); });
  assert.equal(requests.take(REPLAY), null);
  requests.set(REPLAY, 'chosen session'); assert.equal(requests.take(REPLAY), 'chosen session'); assert.equal(requests.take(REPLAY), null);
});

test('failed removal of a persisted request does not replay it once storage recovers', () => {
  const f = fixture(); f.data.set(REPLAY, 'prior session'); f.block('removeItem');
  assert.equal(f.requests.take(REPLAY), 'prior session'); assert.equal(f.data.get(REPLAY), 'prior session');
  f.block(null); assert.equal(f.requests.take(REPLAY), null); assert.equal(f.data.has(REPLAY), false);
});

test('latest request wins within each fixed slot while independent navigation requests remain isolated', () => {
  const f = fixture(); f.block('all');
  f.requests.set(LOOKUP, 'Alpha'); f.requests.set(SETTINGS, 'sources'); f.requests.set(REPLAY, 'Session 12'); f.requests.set(LOOKUP, 'Beta');
  assert.equal(f.requests.take(LOOKUP), 'Beta'); assert.equal(f.requests.take(REPLAY), 'Session 12'); assert.equal(f.requests.take(SETTINGS), 'sources');
  assert.equal(f.requests.take(LOOKUP), null); assert.throws(() => f.requests.set('unbounded-key', 'ignored'), /Unsupported/);
});

test('a denied initial storage read falls back cleanly and does not revive an older handoff on recovery', () => {
  const f = fixture(); f.data.set(REPLAY, 'old persisted session'); f.block('getItem');
  assert.equal(f.requests.take(REPLAY), null);
  f.block(null); assert.equal(f.requests.take(REPLAY), null);
  f.requests.set(REPLAY, 'explicit current session'); assert.equal(f.requests.take(REPLAY), 'explicit current session');
});
