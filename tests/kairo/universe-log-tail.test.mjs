import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, appendFile, rm, rename, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUniverseLogTail, decodeLogHeader} from '../../server/universe-log-tail.mjs';

const header = (listener = 'Atlas Alpha', channel = 'Alliance Intel') => `EVE System\r\nChannel Name: ${channel}\r\nListener: ${listener}\r\nSession started: 2026.09.25 15:00:00\r\n`;
async function fixture(t, options = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-logs-'));
    let clock = Date.parse('2026-09-25T15:00:00Z'); const received = [];
    const tail = createUniverseLogTail({now: () => clock, onLines: (id, value) => received.push({id, ...value}), ...options});
    t.after(async () => {await tail.close(); await rm(directory, {recursive: true, force: true});});
    return {directory, received, tail, tick: async () => {clock += 3000; await tail.tick();}, configure: (id = 77, extra = {}) => tail.configure(id, {enabled: true, directory, characterName: 'Atlas Alpha', channels: ['intel'], ...extra})};
}

test('UTF-16 and UTF-8 EVE headers preserve listener and channel identity', () => {
    const text = header('Ålpha', 'Intel français');
    assert.deepEqual(decodeLogHeader(Buffer.from('\ufeff' + text, 'utf16le')), {encoding: 'utf-16le', listener: 'Ålpha', channel: 'Intel français', game: false});
    assert.deepEqual(decodeLogHeader(Buffer.from(text)), {encoding: 'utf-8', listener: 'Ålpha', channel: 'Intel français', game: false});
});

test('logs are opt-in, start at EOF and only ingest the bound pilot and selected channels', async t => {
    const f = await fixture(t), live = join(f.directory, 'Intel_20260925.txt');
    await writeFile(live, header() + 'old warning\n');
    await writeFile(join(f.directory, 'OtherPilot.txt'), header('Atlas Beta') + 'old\n');
    await writeFile(join(f.directory, 'OtherChannel.txt'), header('Atlas Alpha', 'Market') + 'old\n');
    await f.tick(); assert.equal(f.tail.status(77).status, 'disabled');
    f.configure(); await f.tick(); assert.equal(f.received.length, 0);
    await appendFile(live, '[ 2026.09.25 15:00:05 ] Scout > UALX-3 hostile\n');
    await appendFile(join(f.directory, 'OtherPilot.txt'), 'secret beta\n');
    await appendFile(join(f.directory, 'OtherChannel.txt'), 'market order\n');
    await f.tick();
    assert.equal(f.received.length, 1); assert.equal(f.received[0].id, 77);
    assert.match(f.received[0].text, /UALX-3 hostile/); assert.equal(f.received[0].kind, 'chat');
    assert.equal(f.tail.status(77).files, 1);
});

test('UTF-16 partial code units and partial lines are emitted once after completion', async t => {
    const f = await fixture(t), file = join(f.directory, 'unicode.txt');
    await writeFile(file, Buffer.from('\ufeff' + header(), 'utf16le')); f.configure(); await f.tick();
    const bytes = Buffer.from('Scout > Jita café 🛰\r\n', 'utf16le');
    await appendFile(file, bytes.subarray(0, 7)); await f.tick(); assert.equal(f.received.length, 0);
    await appendFile(file, bytes.subarray(7, bytes.length - 2)); await f.tick(); assert.equal(f.received.length, 0);
    await appendFile(file, bytes.subarray(bytes.length - 2)); await f.tick();
    assert.equal(f.received.length, 1); assert.equal(f.received[0].text, 'Scout > Jita café 🛰\r\n');
    await f.tick(); assert.equal(f.received.length, 1);
});

test('rotated files and re-enabled readers establish a fresh baseline without replaying history', async t => {
    const f = await fixture(t), file = join(f.directory, 'intel.txt');
    await writeFile(file, header()); f.configure(); await f.tick();
    await appendFile(file, 'first\n'); await f.tick(); assert.equal(f.received.length, 1);
    await rename(file, file + '.old'); await writeFile(file, header() + 'rotated history\n'); await f.tick();
    assert.equal(f.received.length, 1); await appendFile(file, 'after rotation\n'); await f.tick();
    assert.equal(f.received.length, 2);
    f.configure(77, {enabled: false}); await appendFile(file, 'while disabled\n'); await f.tick();
    f.configure(); await f.tick(); assert.equal(f.received.length, 2);
    await appendFile(file, 'after re-enable\n'); await f.tick(); assert.equal(f.received.length, 3);
});

test('parent EVE log directory supports game logs separately, never arbitrary or linked files', async t => {
    const f = await fixture(t); await mkdir(join(f.directory, 'Chatlogs')); await mkdir(join(f.directory, 'Gamelogs'));
    const game = join(f.directory, 'Gamelogs', 'game.txt');
    await writeFile(game, 'Gamelog\nListener: Atlas Alpha\n');
    await writeFile(join(f.directory, 'unrelated.txt'), 'Listener: Atlas Alpha\nprivate content\n');
    const external = join(f.directory, 'outside.log'); await writeFile(external, header());
    await symlink(external, join(f.directory, 'Chatlogs', 'linked.txt'));
    f.configure(); await f.tick();
    await appendFile(game, '[ 2026.09.25 15:00:10 ] (notify) Your cloak deactivates.\n');
    await appendFile(external, 'do not follow symlink\n'); await f.tick();
    assert.equal(f.received.length, 1); assert.equal(f.received[0].kind, 'game'); assert.equal(f.received[0].channel, 'Game log');
});

test('guest and missing folders do not collect; shutdown blocks later changes', async t => {
    const f = await fixture(t), file = join(f.directory, 'intel.txt'); await writeFile(file, header());
    f.configure(0); await f.tick(); assert.equal(f.tail.status(0).status, 'disabled');
    f.configure(77, {directory: join(f.directory, 'missing')}); await f.tick(); assert.equal(f.tail.status(77).status, 'unavailable');
    f.configure(); await f.tick(); await f.tail.close(); await appendFile(file, 'after close\n'); await f.tick();
    assert.equal(f.received.length, 0);
});

test('large appended logs are consumed in bounded chunks and simultaneous ticks coalesce', async t => {
    const f = await fixture(t), file = join(f.directory, 'intel.txt'); await writeFile(file, header()); f.configure(); await f.tick();
    const text = 'Scout > UALX-3 clear\n'.repeat(7000); await appendFile(file, text);
    await f.tick(); assert.ok(f.received[0].text.length <= 65536); assert.ok(f.received[0].text.length < text.length);
    for (let i = 0; i < 4; i++) await f.tick();
    assert.equal(f.received.map(x => x.text).join(''), text);
});
