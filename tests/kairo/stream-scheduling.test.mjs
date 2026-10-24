import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createBus} from '../../server/bus.mjs';
import {createStream, defaultStream} from '../../server/stream.mjs';

function fixture(t) {
    let now = Date.parse('2026-10-15T10:00:00Z'), nextId = 0, callbacks = 0;
    const scheduled = new Map(), settings = new Map(), messages = [];
    t.mock.method(Date, 'now', () => now);
    t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
        const id = ++nextId; scheduled.set(id, {callback, at: now + delay}); return id;
    });
    t.mock.method(globalThis, 'clearTimeout', id => scheduled.delete(id));
    const store = {get: (key, fallback) => settings.get(key) ?? fallback, set: (key, value) => settings.set(key, value)};
    const bus = createBus(), stream = createStream(store, bus), response = new EventEmitter();
    response.write = chunk => { messages.push(chunk.toString()); return true; };
    response.end = () => response.emit('finish');
    const config = defaultStream();
    Object.assign(config.rules.find(rule => rule.event === 'skill.completed'), {enabled: true, delay: 600, cooldown: 0});
    stream.save(config); stream.connect(response);
    t.after(() => stream.close());
    return {
        stream, store, scheduled, messages,
        get callbacks() { return callbacks; },
        emit(index, characterId = 42) { bus.emit({type: 'skill.completed', characterId, payload: {skill_name: 'Skill ' + index, level: 5}}); },
        advance(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of [...scheduled]) if (timer.at <= now && scheduled.delete(id)) { callbacks++; timer.callback(); }
        },
        saveRule(change) { const next = stream.config(); Object.assign(next.rules.find(rule => rule.event === 'skill.completed'), change); stream.save(next); },
        delivered() { return messages.filter(frame => frame.startsWith('event: toast\n')).map(frame => JSON.parse(frame.split('data: ')[1])); },
    };
}

test('a delayed semantic-event burst retains scheduling only for the ten deliverable notifications', t => {
    const f = fixture(t);
    for (let index = 0; index < 100; index++) f.emit(index);
    assert.equal(f.stream.state().toasts.length, 0);
    assert.equal(f.scheduled.size, 10, 'Evicted notifications cannot retain their payloads in delayed callbacks.');
    f.advance(599999); assert.equal(f.delivered().length, 0);
    f.advance(1);
    assert.equal(f.callbacks, 10, 'The notification bound also bounds deadline callback work.');
    assert.deepEqual(f.delivered().map(toast => toast.message), Array.from({length: 10}, (_, index) => `Skill ${index + 90} trained to level 5.`));
    assert.equal(f.scheduled.size, 0);
    assert.equal(f.stream.state().toasts.length, 10);
    f.advance(6000); assert.equal(f.stream.state().toasts.length, 0);
    f.emit('recovered'); assert.equal(f.scheduled.size, 1);
    f.advance(600000); assert.equal(f.delivered().at(-1).message, 'Skill recovered trained to level 5.');
});

test('saved notification filters cancel removed deadlines while preserving the matching delivery time', t => {
    const f = fixture(t);
    f.emit('excluded', 42); f.emit('retained', 43);
    f.advance(1000); f.saveRule({characterId: 43});
    assert.equal(f.scheduled.size, 1, 'The discarded pilot cannot retain delayed callback ownership.');
    f.advance(598999); assert.equal(f.delivered().length, 0);
    f.advance(1);
    assert.deepEqual(f.delivered().map(toast => toast.message), ['Skill retained trained to level 5.']);
    assert.equal(f.callbacks, 1);
    f.emit('disabled', 43); f.saveRule({enabled: false});
    assert.equal(f.scheduled.size, 0);
    f.advance(600000); assert.equal(f.callbacks, 1);
    f.saveRule({enabled: true}); f.emit('retry', 43);
    f.advance(600000); assert.equal(f.delivered().at(-1).message, 'Skill retry trained to level 5.');
});

test('pause and close cancel accepted toast deadlines and reject later semantic events', async t => {
    const f = fixture(t); f.emit('pause');
    f.stream.save({...f.stream.config(), paused: true}); assert.equal(f.scheduled.size, 0);
    f.stream.save({...f.stream.config(), paused: false}); f.emit('close');
    assert.equal(f.scheduled.size, 1); await f.stream.close(); assert.equal(f.scheduled.size, 0);
    f.emit('after-close'); f.advance(600000);
    assert.equal(f.scheduled.size, 0); assert.equal(f.callbacks, 0); assert.equal(f.delivered().length, 0);
});

test('immediate notifications deliver once and unchanged saves do not recreate deadlines', t => {
    const f = fixture(t); f.saveRule({delay: 0});
    f.emit('first'); f.emit('second');
    assert.equal(f.scheduled.size, 2); f.advance(0);
    assert.deepEqual(f.delivered().map(toast => toast.message), ['Skill first trained to level 5.', 'Skill second trained to level 5.']);
    assert.equal(f.scheduled.size, 0); f.saveRule({delay: 0}); f.advance(0);
    assert.equal(f.callbacks, 2); assert.equal(f.delivered().length, 2);
    assert.equal(new Set(f.delivered().map(toast => toast.id)).size, 2);
});

test('failed configuration persistence retains accepted delivery until a successful retry removes it', t => {
    const f = fixture(t); f.emit('accepted');
    const save = f.store.set;
    f.store.set = () => { throw new Error('Configuration write failed'); };
    assert.throws(() => f.saveRule({enabled: false}), /Configuration write failed/);
    assert.equal(f.scheduled.size, 1); f.advance(600000);
    assert.equal(f.delivered().length, 1); assert.equal(f.callbacks, 1);
    f.store.set = save; f.emit('retry'); f.saveRule({enabled: false});
    assert.equal(f.scheduled.size, 0); f.advance(600000);
    assert.equal(f.delivered().length, 1); assert.equal(f.callbacks, 1);
});
