import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {defaultOBS} from '../server/obs.mjs';

// Native WebSocket transport and OBS v5 envelopes. Names come from the provider
// inventory and travel through Kairo's real HTTP/save owner without interception.
async function provider() {
    const sockets = new Set(), requests = [];
    let variant = 'scene';
    const server = createServer();
    server.on('upgrade', (request, socket) => {
        sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
        const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        function frame(value, opcode = 1) {
            const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
            const header = body.length < 126 ? Buffer.from([128 | opcode, body.length]) : Buffer.from([128 | opcode, 126, body.length >> 8, body.length & 255]);
            socket.write(Buffer.concat([header, body]));
        }
        frame({op: 0, d: {rpcVersion: 1, obsWebSocketVersion: '5.5.2'}});
        let buffer = Buffer.alloc(0);
        socket.on('data', bytes => {
            buffer = Buffer.concat([buffer, bytes]);
            while (buffer.length >= 2) {
                const opcode = buffer[0] & 15, masked = !!(buffer[1] & 128);
                let size = buffer[1] & 127, header = 2;
                if (size === 126) { if (buffer.length < 4) return; size = buffer.readUInt16BE(2); header = 4; }
                if (size === 127) { socket.destroy(); return; }
                const maskOffset = header;
                if (masked) header += 4;
                if (buffer.length < header + size) return;
                const payload = Buffer.from(buffer.subarray(header, header + size));
                if (masked) for (let index = 0; index < payload.length; index++) payload[index] ^= buffer[maskOffset + index % 4];
                buffer = buffer.subarray(header + size);
                if (opcode === 8) { frame(payload, 8); socket.end(); return; }
                if (opcode === 9) { frame(payload, 10); continue; }
                if (opcode !== 1) continue;
                const message = JSON.parse(payload.toString());
                if (message.op === 1) frame({op: 2, d: {negotiatedRpcVersion: 1}});
                if (message.op !== 6) continue;
                const call = message.d; requests.push({...call, variant});
                let data = {}, valid = true;
                if (call.requestType === 'GetSceneCollectionList') data = {currentSceneCollectionName: 'Provider names'};
                else if (call.requestType === 'GetSceneList') data = {currentProgramSceneName: 'Game', scenes: (variant === 'scene' ? ['Game', 'choose'] : ['Game']).map(sceneName => ({sceneName}))};
                else if (call.requestType === 'GetInputList') data = {inputs: (variant === 'audio' ? ['Microphone', 'choose'] : ['Microphone', 'Camera']).map(inputName => ({inputName, inputKind: 'wasapi_input_capture'}))};
                else if (call.requestType === 'GetSceneItemList') data = {sceneItems: [{sceneItemId: 7, sourceName: 'Microphone', sceneItemEnabled: true}]};
                else if (call.requestType === 'GetSourceFilterList') data = {filters: ['Blur', 'choose'].map(filterName => ({filterName, filterEnabled: false}))};
                else valid = false;
                frame({op: 7, d: {requestType: call.requestType, requestId: call.requestId, requestStatus: {result: valid, code: valid ? 100 : 204}, responseData: data}});
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        port: server.address().port, requests,
        select(value) { variant = value; },
        async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
    };
}

export async function obsChoiceName({page, app, check, frame}) {
    const fixture = await provider(), writes = [];
    const observe = request => { if (new URL(request.url()).pathname === '/api/obs' && request.method() === 'PUT') writes.push(request.postDataJSON()); };
    page.on('request', observe);
    try {
        for (const [kind, label, field, ordinary] of [
            ['scene', 'Switch to program scene', 'sceneName', 'Game'],
            ['audio', 'Audio input', 'sourceName', 'Microphone'],
            ['filter', 'Source filter', 'filterName', 'Blur'],
        ]) {
            fixture.select(kind);
            const config = {...defaultOBS(), enabled: true, automation: false, port: fixture.port, collection: 'Provider names'};
            config.rules.unknown = [{id: 'provider-name', kind, sceneName: 'Game', sourceName: kind === 'filter' ? 'Camera' : 'Microphone', filterName: kind === 'filter' ? 'Blur' : '', enabled: false}];
            await app.core.obs.save(config);
            await page.goto(app.origin + '/#opsec', {waitUntil: 'domcontentloaded', timeout: 15000});
            await page.locator('.connection-status.online').waitFor({state: 'attached'});
            const panel = page.locator('.obs-controls'), row = panel.locator('.obs-action');
            await row.waitFor();
            const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/obs/targets');
            await panel.getByRole('button', {name: 'Read OBS targets', exact: true}).click();
            assert.equal((await loaded).status(), 200); await frame();
            const select = row.getByRole('combobox', {name: label, exact: true});
            const save = panel.getByRole('button', {name: 'Save OBS rules', exact: true});
            async function choose(name) {
                await select.click();
                await page.getByRole('option', {name, exact: true}).click();
                await frame();
            }
            async function persist() {
                const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/obs' && value.request().method() === 'PUT');
                await save.click(); const result = await response; await frame(); return result.status();
            }
            const savedName = () => app.store.get('obs').rules.unknown[0][field];
            check(`OBS ${kind} cold editor retains the provider's ordinary target`, (await select.textContent()).trim(), ordinary);
            await choose('choose');
            check(`OBS ${kind} literal choose name stays selected`, (await select.textContent()).trim(), 'choose');
            check(`OBS ${kind} literal choose name saves successfully`, await persist(), 200);
            check(`OBS ${kind} literal choose name reaches real persisted configuration`, savedName(), 'choose');
            // The ordinary target also recovers the editor on the failing baseline.
            await choose(ordinary);
            check(`OBS ${kind} ordinary target remains saveable after the unusual name`, await persist(), 200);
            check(`OBS ${kind} ordinary target retains its exact provider name`, savedName(), ordinary);
            await choose('Choose a target');
            check(`OBS ${kind} empty placeholder remains invalid`, await persist(), 400);
            check(`OBS ${kind} rejected placeholder cannot overwrite accepted configuration`, savedName(), ordinary);
            await choose(ordinary);
            check(`OBS ${kind} selection recovers after empty target rejection`, await persist(), 200);
            check(`OBS ${kind} recovered configuration stays bound to the provider name`, savedName(), ordinary);
        }
        check('OBS provider-name checks issue exactly one save per explicit intent', writes.length, 12);
        check('OBS provider-name editing never dispatches unapproved scene/audio/filter actions', fixture.requests.filter(request => request.requestType.startsWith('Set')).length, 0);
        check('OBS provider-name checks read inventory once per explicit request', fixture.requests.filter(request => request.requestType === 'GetSceneList').length, 3);
        check('OBS provider-name checks resolve filters only for the selected source', fixture.requests.filter(request => request.requestType === 'GetSourceFilterList').map(request => request.requestData.sourceName), ['Camera']);
    } finally {
        page.off('request', observe);
        await app.core.obs.save(defaultOBS());
        await fixture.close();
    }
}
