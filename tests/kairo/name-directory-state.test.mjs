import test from 'node:test';
import assert from 'node:assert/strict';
import {createNameDirectoryState} from '../../components/kairo/name-directory-state.mjs';
const packet = (epoch, version, names) => ({names, namesRevision: epoch + ':' + version});

test('HTTP can bootstrap names; unchanged revisions retain identity without inspecting names', () => {
    const state = createNameDirectoryState(), names = {42: 'Pilot'};
    assert.strictEqual(state.fromState(packet('first', 0, names), state.capture()), names);
    const unobserved = new Proxy({}, {ownKeys() { assert.fail('Unchanged directory must not be scanned'); }});
    assert.equal(state.fromState(packet('first', 0, unobserved), state.capture()), null);
    state.connect(); assert.equal(state.fromEvent(packet('first', 0, unobserved)), null);
});

test('global events accept rename/add and do not depend on a selected pilot', () => {
    const state = createNameDirectoryState(); state.connect();
    const initial = {42: 'Main', 43: 'Alt'}, changed = {42: 'Renamed main', 43: 'Alt', 44: 'New pilot'};
    assert.strictEqual(state.fromEvent(packet('process', 0, initial)), initial);
    assert.strictEqual(state.fromEvent(packet('process', 1, changed)), changed);
    assert.equal(state.fromEvent(packet('process', 0, initial)), null);
    assert.equal(state.revision(), 'process:1');
});

test('a newer names event fences out a late full state response', () => {
    const state = createNameDirectoryState(); state.connect(); state.fromEvent(packet('process', 0, {42: 'Old'}));
    const observed = state.capture(), current = {42: 'New'};
    state.fromEvent(packet('process', 1, current));
    assert.equal(state.fromState(packet('process', 0, {42: 'Old'}), observed), null);
    assert.equal(state.fromState(packet('process', 0, {42: 'Old'}), state.capture()), null);
    assert.equal(state.revision(), 'process:1');
});

test('newer HTTP state cannot be overwritten by an older same-process bootstrap packet', () => {
    const state = createNameDirectoryState(); state.connect();
    state.fromState(packet('process', 3, {42: 'New'}), state.capture());
    assert.equal(state.fromEvent(packet('process', 2, {42: 'Old'})), null);
    assert.equal(state.revision(), 'process:3');
});

test('reconnect and process reset replace the full map and reject late old-process state', () => {
    const state = createNameDirectoryState(); state.connect(); state.fromEvent(packet('old', 999, {42: 'Old'}));
    const oldRead = state.capture(); state.connect(); const reconnectRead = state.capture();
    const empty = {}; assert.strictEqual(state.fromEvent(packet('new', 0, empty)), empty);
    assert.equal(state.fromState(packet('old', 1000, {42: 'Wrong'}), oldRead), null);
    assert.equal(state.fromState(packet('old', 1000, {42: 'Wrong'}), reconnectRead), null);
    assert.equal(state.fromState(packet('old', 1000, {42: 'Wrong'}), state.capture()), null);
    assert.equal(state.fromEvent(packet('old', 1000, {42: 'Wrong'})), null);
    assert.equal(state.revision(), 'new:0');
    const reset = {43: 'Only new pilot'}; assert.strictEqual(state.fromEvent(packet('new', 1, reset)), reset);
    assert.equal(Object.hasOwn(reset, 42), false);
});

test('same-process reconnect can recover a missed changed directory without replaying deltas', () => {
    const state = createNameDirectoryState(); state.connect(); state.fromEvent(packet('process', 1, {42: 'Old'}));
    const oldRead = state.capture(); state.connect();
    const current = {42: 'Current', 43: 'Added while disconnected'};
    assert.strictEqual(state.fromEvent(packet('process', 8, current)), current);
    assert.equal(state.fromState(packet('process', 2, {42: 'Stale'}), oldRead), null);
});

test('invalid envelopes cannot replace a valid directory', () => {
    const state = createNameDirectoryState(); state.connect(); state.fromEvent(packet('process', 0, {}));
    for (const value of [{}, {names: {}, namesRevision: 'plain'}, {names: {}, namesRevision: 'x:01'}, {names: {}, namesRevision: 'x:-1'}, {names: {}, namesRevision: 'x:Infinity'}, {names: [], namesRevision: 'x:1'}, {names: null, namesRevision: 'x:1'}]) {
        assert.equal(state.fromEvent(value), null); assert.equal(state.fromState(value, state.capture()), null);
    }
    assert.equal(state.revision(), 'process:0');
});

test('unversioned snapshot fallback merges partial maps, retains unchanged identity and fences late HTTP', () => {
    const state = createNameDirectoryState(), first = {42: 'Main', 43: 'Alt'};
    assert.deepEqual(state.fromState({names: first}, state.capture()), first);
    const beforeEvent = state.capture();
    assert.deepEqual(state.fromLegacySnapshot({42: 'Updated'}), {42: 'Updated', 43: 'Alt'});
    assert.equal(state.fromLegacySnapshot({42: 'Updated', 43: 'Alt'}), null);
    assert.equal(state.fromState({names: first}, beforeEvent), null);
    assert.equal(state.revision(), undefined);
});

test('unversioned full state retains reset/removal semantics and versioned authority recovers after fallback', () => {
    const state = createNameDirectoryState(); state.connect(); state.fromEvent(packet('process', 4, {42: 'Original', 43: 'Retained'}));
    assert.deepEqual(state.fromLegacySnapshot({42: 'Legacy update'}), {42: 'Legacy update', 43: 'Retained'});
    assert.equal(state.revision(), undefined);
    assert.equal(state.fromEvent(packet('process', 3, {42: 'Stale versioned packet'})), null);
    const authoritative = {42: 'Authoritative', 43: 'Retained'};
    assert.strictEqual(state.fromEvent(packet('process', 4, authoritative)), authoritative);
    assert.equal(state.revision(), 'process:4');
    assert.deepEqual(state.fromState({names: {}}, state.capture()), {});
    assert.equal(state.revision(), undefined);
    assert.strictEqual(state.fromState(packet('process', 4, authoritative), state.capture()), authoritative);
});


test('first EventSource open does not strand a delayed initial legacy HTTP directory', () => {
    const state = createNameDirectoryState(), observed = state.capture();
    assert.equal(state.connect(), false);
    assert.deepEqual(state.fromState({names: {42: 'Initial legacy pilot'}}, observed), {42: 'Initial legacy pilot'});
    assert.equal(state.revision(), undefined);
});

test('disconnect fences old HTTP but permits fresh authoritative reset while SSE is unavailable', () => {
    const state = createNameDirectoryState(); state.connect(); state.fromEvent(packet('old', 50, {42: 'Before restart'}));
    const oldRead = state.capture(); assert.equal(state.disconnect(), true); assert.equal(state.disconnect(), false);
    assert.equal(state.fromState(packet('old', 51, {42: 'Late old read'}), oldRead), null);
    assert.equal(state.fromEvent(packet('old', 52, {42: 'Event from disconnected stream'})), null);
    assert.deepEqual(state.fromState(packet('new', 0, {}), state.capture()), {});
    const outageRead = state.capture(); assert.equal(state.connect(), true);
    assert.equal(state.fromEvent(packet('new', 0, {})), null);
    assert.equal(state.fromState(packet('old', 999, {42: 'Late outage read'}), outageRead), null);
    assert.equal(state.revision(), 'new:0');
});

test('first successful open after an initial connection error signals legacy HTTP recovery', () => {
    const state = createNameDirectoryState(), oldRead = state.capture();
    assert.equal(state.disconnect(), true); assert.equal(state.connect(), true);
    assert.equal(state.fromState({names: {42: 'Discarded initial read'}}, oldRead), null);
    assert.deepEqual(state.fromState({names: {42: 'Fresh recovery read'}}, state.capture()), {42: 'Fresh recovery read'});
});

test('legacy owner merges own keys safely and authoritative JSON keys cannot alter prototypes', () => {
    const state = createNameDirectoryState(), first = {42: 'Own pilot'};
    state.fromState({names: first}, state.capture());
    assert.equal(state.fromLegacySnapshot(Object.create({42: 'Inherited replacement', 43: 'Inherited addition'})), null);
    const special = JSON.parse('{"__proto__":"A name","constructor":"Another name","43":"Own addition"}');
    const merged = state.fromLegacySnapshot(special);
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal(Object.hasOwn(merged, '__proto__'), true);
    assert.equal(merged.__proto__, 'A name'); assert.equal(merged.constructor, 'Another name');
    assert.equal(merged[42], 'Own pilot'); assert.equal(merged[43], 'Own addition');
    state.connect();
    assert.strictEqual(state.fromEvent(packet('authoritative', 0, special)), special);
    assert.equal(Object.getPrototypeOf(special), Object.prototype);
    assert.equal(Object.hasOwn({}, '43'), false);
});
