// Focused bridge error/race controls. No Kairo modules or benchmarks.
import assert from 'node:assert/strict';
import {observeOwnedGroup} from './ownership.mjs';

if (process.argv[2] === '--probe') {
  process.stdout.write(JSON.stringify(observeOwnedGroup(Number(process.argv[3]))) + '\n');
} else {
  const checks = [];
  const check = (name, body) => { body(); checks.push({name, passed: true}); };
  const absent = () => { throw Object.assign(new Error('absent'), {code: 'ESRCH'}); };
  const live = () => {};
  const response = members => ({status: 0, signal: null, stdout: JSON.stringify({exists: !!members.length, members})});
  const call = (census, probe = live) => observeOwnedGroup(5, {probe, census});
  const good = () => response([{pid: 9001, state: 'S'}]);
  check('local ESRCH bypasses mounted proc bridge', () => {
    const state = call(() => { throw new Error('must not invoke'); }, absent);
    assert.equal(state.exists, false); assert.equal(state.unknown, false);
  });
  check('inaccessible local group remains unknown', () => assert.equal(call(good, () => {
    throw Object.assign(new Error('denied'), {code: 'EPERM'});
  }).unknown, true));
  check('valid namespace receipt retains live member', () => assert.deepEqual(call(good).live, [{pid: 9001, state: 'S'}]));
  check('zombie receipt remains existing but non-executable', () => {
    const state = call(() => response([{pid: 9001, state: 'Z'}]));
    assert.equal(state.exists, true); assert.equal(state.unknown, false); assert.deepEqual(state.live, []);
  });
  check('bridge timeout remains unknown', () => assert.equal(call(() => ({error: new Error('ETIMEDOUT'), status: null, signal: 'SIGKILL'})).unknown, true));
  check('bridge unsuccessful exit remains unknown', () => assert.equal(call(() => ({status: 1, signal: null, stderr: 'UnknownGroup'})).unknown, true));
  check('malformed bridge JSON remains unknown', () => assert.equal(call(() => ({status: 0, signal: null, stdout: '{'})).unknown, true));
  check('invalid member state cannot classify live group as zombies', () => assert.equal(call(() => response([{pid: 9001, state: ''}])).unknown, true));
  check('duplicate member identity remains unknown', () => assert.equal(call(() => response([{pid: 9001, state: 'S'}, {pid: 9001, state: 'Z'}])).unknown, true));
  check('absent bridge observation with live local group remains unknown', () => assert.equal(call(() => response([])).unknown, true));
  check('local ESRCH after bridge is authoritative', () => {
    let probes = 0;
    const state = call(good, () => { if (++probes === 2) absent(); });
    assert.equal(state.exists, false); assert.equal(state.unknown, false); assert.deepEqual(state.members, []);
  });
  check('unsafe group is rejected before any probe or bridge', () => {
    const forbidden = () => { throw new Error('must not invoke'); };
    const state = observeOwnedGroup(1, {probe: forbidden, census: forbidden});
    assert.equal(state.unknown, true); assert.match(state.error, /Only positive owned/);
  });
  process.stdout.write(JSON.stringify({complete: true, checks}) + '\n');
}
