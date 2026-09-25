import {open, readdir, realpath, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, basename} from 'node:path';

const MAX_FILES = 64, HEADER_BYTES = 16384, READ_BYTES = 65536, TICK_BYTES = 262144;
const clean = value => String(value ?? '').trim();

export function decodeLogHeader(bytes) {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    const header = new TextDecoder(encoding).decode(bytes);
    const field = name => header.match(new RegExp('^\\s*' + name + '\\s*:\\s*(.+)$', 'mi'))?.[1]?.trim() || '';
    return {encoding, listener: field('Listener'), channel: field('Channel Name'), game: /^\s*Gamelog\s*$/mi.test(header)};
}

/** Reads only explicitly selected EVE log directories, never deletes their files. */
export function createUniverseLogTail({now = Date.now, onLines = () => {}, onStatus = () => {}} = {}) {
    const pilots = new Map();
    let closed = false, flight = null, pilotCursor = 0;
    const iso = () => new Date(now()).toISOString();
    function state(entry) {
        return {status: entry.enabled ? entry.status : 'disabled', files: entry.files.size,
            updated_at: entry.updatedAt || null, error: entry.error || null, skipped: entry.skipped || 0};
    }
    function update(id, entry, status, error = null) {
        const changed = entry.status !== status || entry.error !== error;
        entry.status = status; entry.error = error;
        if (changed) onStatus(id, state(entry));
    }
    function configure(characterId, input = {}) {
        const id = Number(characterId), directory = clean(input.directory), characterName = clean(input.characterName);
        const channels = [...new Set((Array.isArray(input.channels) ? input.channels : []).map(clean).filter(Boolean))].slice(0, 64);
        const enabled = input.enabled === true && id > 0 && !!directory && !!characterName;
        const signature = JSON.stringify({enabled, directory, characterName, channels});
        const old = pilots.get(id);
        if (old?.signature === signature) return state(old);
        const entry = {signature, enabled, directory, characterName, channels, files: new Map(), ignored: new Map(), nextScan: 0, status: enabled ? 'waiting' : 'disabled', skipped: 0};
        pilots.set(id, entry);
        onStatus(id, state(entry));
        return state(entry);
    }
    function status(characterId) { const entry = pilots.get(Number(characterId)); return entry ? state(entry) : {status: 'disabled', files: 0, updated_at: null, error: null, skipped: 0}; }
    async function defaultDirectories() {
        const roots = new Set([join(homedir(), 'Documents', 'EVE', 'logs')]);
        if (process.env.USERPROFILE) roots.add(join(process.env.USERPROFILE, 'Documents', 'EVE', 'logs'));
        if (process.env.OneDrive) roots.add(join(process.env.OneDrive, 'Documents', 'EVE', 'logs'));
        const candidates = await Promise.all([...roots].map(async path => {try { return {path, exists: (await stat(path)).isDirectory()}; } catch { return {path, exists: false}; }}));
        return candidates;
    }
    async function filesIn(directory) {
        const root = await realpath(directory), info = await stat(root);
        if (!info.isDirectory()) throw new Error('Choose the EVE logs folder, Chatlogs or Gamelogs.');
        const entries = await readdir(root, {withFileTypes: true}), directories = [root];
        for (const entry of entries) if (entry.isDirectory() && /^(chatlogs|gamelogs)$/i.test(entry.name)) directories.push(join(root, entry.name));
        const paths = [];
        for (const path of directories) {
            const children = path === root ? entries : await readdir(path, {withFileTypes: true});
            for (const child of children) {
                if (!child.isFile() || !/\.txt$/i.test(child.name)) continue;
                paths.push({file: join(path, child.name), date: child.name.match(/(\d{8})[_ -]?(\d{6})/)?.slice(1).join('') || '', game: /^gamelogs$/i.test(basename(path))});
            }
        }
        // EVE filenames carry UTC session dates; bound filesystem metadata work
        // even when a user retains years of logs in this directory.
        paths.sort((a, b) => b.date.localeCompare(a.date) || b.file.localeCompare(a.file));
        const candidates = await Promise.all(paths.slice(0, MAX_FILES * 2).map(async item => {const detail = await stat(item.file); return {...item, mtime: detail.mtimeMs, size: detail.size, inode: detail.ino};}));
        candidates.sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file));
        return {candidates: candidates.slice(0, MAX_FILES), skipped: Math.max(0, paths.length - MAX_FILES)};
    }
    async function scan(id, entry, budget) {
        if (!entry.enabled || closed || pilots.get(id) !== entry || entry.nextScan > now()) return budget;
        entry.nextScan = now() + 2500;
        try {
            const {candidates, skipped} = await filesIn(entry.directory);
            if (closed || pilots.get(id) !== entry || !entry.enabled) return budget;
            entry.skipped = skipped;
            const present = new Set(candidates.map(x => x.file));
            for (const file of entry.files.keys()) if (!present.has(file)) entry.files.delete(file);
            for (const file of entry.ignored.keys()) if (!present.has(file)) entry.ignored.delete(file);
            for (const item of candidates) {
                if (closed || pilots.get(id) !== entry || !entry.enabled) break;
                let tracked = entry.files.get(item.file);
                const ignored = entry.ignored.get(item.file);
                if (ignored?.inode === item.inode && (ignored.stable || ignored.size === item.size)) continue;
                if (tracked && (tracked.inode !== item.inode || item.size < tracked.offset)) { entry.files.delete(item.file); tracked = null; }
                if (!tracked) {
                    const handle = await open(item.file, 'r');
                    let header;
                    try {const buffer = Buffer.alloc(Math.min(HEADER_BYTES, item.size)); const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0); header = decodeLogHeader(buffer.subarray(0, bytesRead));} finally {await handle.close();}
                    const game = header.game || item.game;
                    if (header.listener.toLocaleLowerCase() !== entry.characterName.toLocaleLowerCase() || !game && (!header.channel || !entry.channels.some(channel => header.channel.toLocaleLowerCase().includes(channel.toLocaleLowerCase())))) {
                        entry.ignored.set(item.file, {inode: item.inode, size: item.size, stable: !!header.listener && (!!header.channel || game)}); continue;
                    }
                    entry.ignored.delete(item.file);
                    tracked = {offset: item.size, inode: item.inode, channel: game ? 'Game log' : header.channel, kind: game ? 'game' : 'chat', encoding: header.encoding, decoder: new TextDecoder(header.encoding), pending: ''};
                    entry.files.set(item.file, tracked);
                    // Establish a baseline at EOF: opening a file never replays old warnings.
                    continue;
                }
                if (item.size === tracked.offset || budget <= 0) continue;
                if (item.size - tracked.offset > 2_000_000) {
                    tracked.offset = item.size; tracked.pending = ''; tracked.decoder = new TextDecoder(tracked.encoding); entry.skipped++;
                    continue;
                }
                const handle = await open(item.file, 'r');
                let bytes;
                try { const buffer = Buffer.alloc(Math.min(READ_BYTES, budget, item.size - tracked.offset)); const result = await handle.read(buffer, 0, buffer.length, tracked.offset); bytes = buffer.subarray(0, result.bytesRead); } finally {await handle.close();}
                tracked.offset += bytes.length; budget -= bytes.length;
                if (closed || pilots.get(id) !== entry || !entry.enabled) break;
                const text = tracked.pending + tracked.decoder.decode(bytes, {stream: true}), last = text.lastIndexOf('\n');
                if (last < 0) { tracked.pending = text.length > 16384 ? '' : text; continue; }
                tracked.pending = text.slice(last + 1, last + 16385);
                const complete = text.slice(0, last + 1);
                if (complete.trim()) await onLines(id, {text: complete, channel: tracked.channel, source: 'eve_log', kind: tracked.kind, fileName: basename(item.file), receivedAt: iso()});
            }
            entry.updatedAt = iso(); update(id, entry, 'watching');
        } catch (error) {
            if (pilots.get(id) === entry) update(id, entry, error.code === 'ENOENT' ? 'unavailable' : 'error', error.code === 'ENOENT' ? 'The selected EVE log directory is unavailable.' : 'EVE logs could not be read. Check the folder and local file access.');
        }
        return budget;
    }
    function tick() {
        if (closed) return Promise.resolve();
        if (flight) return flight;
        flight = (async () => { const entries = [...pilots]; let budget = TICK_BYTES; for (let i = 0; i < entries.length; i++) { const [id, entry] = entries[(i + pilotCursor) % entries.length]; budget = await scan(id, entry, budget); } pilotCursor = entries.length ? (pilotCursor + 1) % entries.length : 0; })().finally(() => {flight = null;});
        return flight;
    }
    async function close() {closed = true; for (const entry of pilots.values()) {entry.enabled = false; entry.files.clear();} await flight; pilots.clear();}
    return {configure, tick, status, defaultDirectories, close};
}
