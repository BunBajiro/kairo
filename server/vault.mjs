import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function dpapi(mode, value) {
    const op = mode === 'protect' ? 'Protect' : 'Unprotect';
    const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd().Trim(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::${op}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: value, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (r.status !== 0 || !r.stdout.trim())
        throw new Error('Windows could not open the credential vault.');
    return r.stdout.trim();
}
export function openVault(dir) {
    const windows = process.platform === 'win32';
    const file = join(dir, windows ? 'vault.dpapi' : 'vault.key');
    let key;
    if (existsSync(file)) {
        const s = readFileSync(file, 'utf8');
        key = Buffer.from(windows ? dpapi('unprotect', s) : s, 'base64');
    }
    else {
        key = randomBytes(32);
        writeFileSync(file, windows ? dpapi('protect', key.toString('base64')) : key.toString('base64'), { mode: 0o600, flag: 'wx' });
    }
    if (key.length !== 32)
        throw new Error('Invalid Kairo vault key.');
    return { kind: windows ? 'Windows DPAPI + AES-256-GCM' : 'AES-256-GCM / local restricted key', encrypt(value) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64'); }, decrypt(value) { const b = Buffer.from(value, 'base64'); const c = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); c.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8')); } };
}
