// External cleanup census only; all signals remain namespace-local.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const bridge = fileURLToPath(new URL('./ownership-bridge.py', import.meta.url));
const invoke = group => spawnSync('python3', [bridge, String(group)], {
  encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024,
});

export function observeOwnedGroup(group, {probe = value => process.kill(-value, 0), census = invoke} = {}) {
  const state = {at: new Date().toISOString(), exists: false, members: [], live: [], unknown: false};
  const exists = () => {
    try { probe(group); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  try {
    if (!Number.isSafeInteger(group) || group <= 1) throw new Error('Only positive owned child groups may be observed');
    if (!exists()) return state;
    state.exists = true;
    const result = census(group);
    if (result.error || result.status !== 0 || result.signal !== null)
      throw new Error('Namespace census failed: ' + (result.error?.stack || result.stderr || result.signal || result.status));
    const observed = JSON.parse(result.stdout);
    if (typeof observed.exists !== 'boolean' || !Array.isArray(observed.members) ||
        observed.members.some(member => !Number.isSafeInteger(member.pid) || member.pid <= 0 ||
          typeof member.state !== 'string' || !/^[RSDZTXKWIPt]$/.test(member.state)) ||
        new Set(observed.members.map(member => member.pid)).size !== observed.members.length ||
        (observed.exists !== (observed.members.length > 0)))
      throw new Error('Namespace census returned an inconsistent observation');
    // The owned local group can disappear during Python startup/census/return.
    if (!exists()) { state.exists = false; return state; }
    if (!observed.exists) throw new Error('Live local group lacks a trustworthy census');
    state.members = observed.members;
    state.live = state.members.filter(member => member.state !== 'Z' && member.state !== 'X');
  } catch (error) { state.unknown = true; state.error = error?.stack || String(error); }
  return state;
}
