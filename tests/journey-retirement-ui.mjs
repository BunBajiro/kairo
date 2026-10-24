// Focused JRET-01 requirement gate over the freshly compiled local application.
// Isolated Playwright, disposable SQLite, real HTTP responses and reachable UI
// clicks. This does not replace the full session-ui or J-Space workflow gates.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {allScopes} from '../server/modules/catalog.mjs';
import {savePlaceNote} from '../server/places.mjs';
import {getUniverseStatic} from '../server/universe-static.mjs';

const modulePath = process.env.KAIRO_PLAYWRIGHT_MODULE;
assert.ok(modulePath && isAbsolute(modulePath), 'Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const playwright = await import(pathToFileURL(modulePath).href);
const engines = (process.env.KAIRO_JRET_BROWSERS || 'chromium,firefox').split(',');
assert.ok(engines.length && new Set(engines).size === engines.length && engines.every(name => ['chromium', 'firefox'].includes(name)), 'Use chromium and/or firefox without duplicates.');
// Reserved pair: do not run another harness on these ports concurrently.
const port = Number(process.env.KAIRO_JRET_TEST_PORT || 18660);
assert.ok(Number.isInteger(port) && port > 0 && port < 65535, 'A valid dashboard/Stream port pair is required.');
const dir = await mkdtemp(join(tmpdir(), 'kairo-journey-retirement-ui-'));
const output = process.env.KAIRO_BROWSER_OUTPUT || dir + '-results';
await mkdir(output, {recursive: true});
const checks = [], errors = [], unexpectedNetwork = [], serverRequests = [], requests = [], httpErrors = [], cleanupErrors = [], completedCases = [];
const pilot = 42, sessionId = 'jret-owned-flight', sessionLabel = 'Owned retirement flight';
const originalNote = 'Private JRET approach: 旧航路 — kept independently.';
const graph = getUniverseStatic();
const system = name => {
    const found = graph.systems.find(row => row.name === name);
    assert.ok(found, 'Bundled Atlas includes ' + name);
    return found;
};
const jita = system('Jita'), perimeter = system('Perimeter'), foreign = system('Amarr');
const now = Date.now(), start = now - 2 * 3600000, at = seconds => new Date(start + seconds * 1000).toISOString();
const sample = data => ({status: 'ready', data, updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString()});
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
const denyExternal = async url => {serverRequests.push(String(url)); throw new Error('Unexpected external server request: ' + url);};
let app, browser, context, page, meta = {stage: 'setup'}, failure, complete = false;

function check(label, actual, expected) {
    const entry = {...meta, label, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected)};
    checks.push(entry); console.log(JSON.stringify(entry));
    assert.deepEqual(actual, expected, label);
}
async function bounded(promise, label, ms = 15000) {
    let timer;
    try {return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(label + ' timed out')), ms);})]);}
    finally {clearTimeout(timer);}
}
async function persist(name = 'checks-partial.json') {
    await writeFile(join(output, name), JSON.stringify({
        ok: complete && !failure && checks.length > 0 && checks.every(row => row.pass) && cleanupErrors.length === 0,
        scope: 'Focused compiled Overview→Atlas, owned Session report→map replay, independent private Places note persistence; not full Session/J-Space harness acceptance.',
        requestedEngines: engines, requiredWidths: [1600, 390], completedCases, complete, meta, failure,
        checks, errors, unexpectedNetwork, serverRequests, requests, httpErrors, cleanupErrors,
    }, null, 2));
}
async function frame() {await bounded(page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))), 'Browser frame', 5000);}
function responseFor(response, path, method = 'GET') {
    const url = new URL(response.url());
    return url.origin === app.origin && url.pathname === path && response.request().method() === method;
}
function responseWait(path, method = 'GET') {
    const promise = page.waitForResponse(response => responseFor(response, path, method));
    // A click failure can precede the response deadline; retain the original
    // rejection for its awaited assertion without an unhandled rejection.
    promise.catch(() => {}); return promise;
}
async function jsonResponse(promise) {
    const response = await promise;
    assert.equal(response.status(), 200, response.request().method() + ' ' + response.url());
    return response.json();
}
async function go(workspace) {
    await page.goto(app.origin + '/#' + workspace, {waitUntil: 'domcontentloaded', timeout: 15000});
    await page.locator('.connection-status.online').waitFor({state: 'attached'});
}
async function waitPosition(name) {
    await page.waitForFunction(expected => document.querySelector('.session-replay-status strong')?.textContent === expected, name);
}
async function screenshot(suffix) {await page.screenshot({path: join(output, meta.engine + '-' + meta.width + '-' + suffix + '.png'), timeout: 10000});}

function seed() {
    const store = openStore(join(dir, 'data'));
    try {
        store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(pilot, 'JRET synthetic pilot', JSON.stringify(allScopes), 'synthetic-unusable-token');
        store.set('names', {[jita.system_id]: jita.name, [perimeter.system_id]: perimeter.name, [foreign.system_id]: foreign.name});
        store.saveSnapshot(pilot, 'profile', sample({character_id: pilot, name: 'JRET synthetic pilot'}));
        store.saveSnapshot(pilot, 'location', sample({solar_system_id: jita.system_id, system: {system_id: jita.system_id, name: jita.name, security_status: jita.security}, region: {name: jita.region_name}}));
        const putSession = store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)');
        // No inferred start: the initial replay gap and first actual owned visit
        // must survive a same-pilot unowned observation at the Session boundary.
        putSession.run(sessionId, pilot, sessionLabel, at(0), at(30), '{}', '{}');
        putSession.run('jret-neighbour', pilot, 'Neighbouring flight', at(-5), at(35), '{}', '{}');
        const visit = store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
        visit.run(pilot, foreign.system_id, 'Unowned before start', at(-1), null);
        visit.run(pilot, foreign.system_id, 'Unowned inside window', at(1), null);
        visit.run(pilot, jita.system_id, jita.name, at(5), sessionId);
        visit.run(pilot, foreign.system_id, 'Neighbour session only', at(12), 'jret-neighbour');
        visit.run(pilot, perimeter.system_id, perimeter.name, at(20), sessionId);
        store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)')
            .run(pilot, 'ship.changed', 'pilot', 'Owned recorded ship change', JSON.stringify({session_id: sessionId, solar_system_id: perimeter.system_id, ship_type_id: 587}), at(22));
        savePlaceNote(store, 'system', jita.system_id, {name: jita.name, body: originalNote, tags: ['jret'], status: 'home'});
    } finally {store.close();}
}

async function overviewLinks() {
    for (const title of ['In space', 'Recent activity']) {
        await go('overview');
        await page.getByRole('button', {name: 'Open ' + title, exact: true}).click();
        await page.waitForURL(url => url.hash === '#universe-kspace');
        await page.getByRole('region', {name: 'Atlas', exact: true}).locator('canvas').waitFor();
        // The source diff establishes the direct destination instead of the
        // retained bookmark alias; the browser proves the resulting workflow.
        check('Overview ' + title + ' opens Atlas', new URL(page.url()).hash, '#universe-kspace');
        check('Atlas heading after ' + title, await page.locator('.universe-heading h2').allTextContents(), ['Atlas']);
    }
    await screenshot('overview-atlas');
}

async function ownedReplay() {
    const before = app.store.db.prepare('SELECT character_id,system_id,name,at,session_id FROM visits ORDER BY id').all();
    const mapBefore = app.store.db.prepare("SELECT character_id,kind,id,body FROM universe_records WHERE kind IN ('jspace_map','link') ORDER BY character_id,kind,id").all();
    await go('sessions');
    const reportReply = responseWait('/api/sessions/' + sessionId);
    await page.locator('.session-card').filter({hasText: sessionLabel}).click();
    const report = await jsonResponse(reportReply);
    check('Report is explicitly owned by the selected pilot', [report.session.id, report.session.character_id], [sessionId, pilot]);
    check('Report excludes unowned and neighbouring Session visits', report.route.map(row => row.systemId), [jita.system_id, perimeter.system_id]);
    check('Report begins at the first owned observation', [report.route[0].entered, report.route[0].inferred], [at(5), false]);
    const dialog = page.locator('.session-report-dialog');
    await dialog.locator('.session-summary').waitFor();
    await dialog.locator('.session-detail-card[data-card="route"]').click();
    await dialog.locator('.session-route-list > li').first().waitFor();
    check('Compiled report renders only its two visits', await dialog.locator('.session-route-list > li').count(), 2);
    const routeText = await dialog.locator('.session-route-list').innerText();
    check('Compiled route names match owned records', [routeText.includes(jita.name), routeText.includes(perimeter.name), /Unowned|Neighbour session only|Amarr/.test(routeText)], [true, true, false]);
    const replayReply = responseWait('/api/sessions/' + sessionId + '/replay');
    await dialog.getByRole('button', {name: 'Show on Map', exact: true}).click();
    const replayResponse = await replayReply;
    check('Show on Map sends the captured pilot', new URL(replayResponse.url()).searchParams.get('character'), String(pilot));
    assert.equal(replayResponse.status(), 200);
    const replay = await replayResponse.json();
    check('Replay keeps the exact report owner', [replay.session.id, replay.session.character_id], [sessionId, pilot]);
    check('Replay agrees with the report visit projection', replay.visits.map(row => [row.systemId, row.entered]), report.route.map(row => [row.systemId, row.entered]));
    await page.locator('.session-replay h3').filter({hasText: sessionLabel}).waitFor();
    await page.getByRole('region', {name: 'Session replay map', exact: true}).locator('canvas').waitFor();
    await waitPosition('Location not recorded');
    check('Replay preserves the gap before the first owned observation', await page.locator('.session-replay-status strong').innerText(), 'Location not recorded');
    await page.getByRole('button', {name: 'Next recorded system', exact: true}).click(); await waitPosition(jita.name);
    await page.getByRole('button', {name: 'Next recorded system', exact: true}).click(); await waitPosition(perimeter.name);
    check('Next visits reach the recorded destination', await page.locator('.session-replay-status strong').innerText(), perimeter.name);
    await page.getByRole('button', {name: 'Previous recorded system', exact: true}).click(); await waitPosition(jita.name);
    check('Previous visit returns to the owned origin', await page.locator('.session-replay-status strong').innerText(), jita.name);
    await page.getByRole('button', {name: 'Restart session replay', exact: true}).click(); await waitPosition('Location not recorded');
    await page.getByRole('button', {name: 'Next recorded event', exact: true}).click(); await waitPosition(perimeter.name);
    await page.locator('.session-replay-events').getByText('Owned recorded ship change', {exact: true}).waitFor();
    check('Replay event keeps its Session location', replay.events.map(row => [row.summary, row.system_id]), [['Owned recorded ship change', perimeter.system_id]]);
    await screenshot('owned-replay');
    await page.getByRole('button', {name: 'Close session replay', exact: true}).click();
    await page.locator('.session-replay').waitFor({state: 'detached'});
    check('Replay leaves recorded visits untouched', app.store.db.prepare('SELECT character_id,system_id,name,at,session_id FROM visits ORDER BY id').all(), before);
    check('Replay leaves live map topology untouched', app.store.db.prepare("SELECT character_id,kind,id,body FROM universe_records WHERE kind IN ('jspace_map','link') ORDER BY character_id,kind,id").all(), mapBefore);
    check('One explicit Show on Map causes one replay read', requests.filter(row => row.engine === meta.engine && row.width === meta.width && row.path === '/api/sessions/' + sessionId + '/replay').length, 1);
}

async function openNotes() {
    // PlaceNotes mounts inside a native details element and reads even while
    // collapsed. Observe before navigation/selection, not after opening it.
    const reply = responseWait('/api/places/system/' + jita.system_id);
    await go('universe-kspace');
    const search = page.getByRole('combobox', {name: 'Find a solar system', exact: true});
    await search.fill(jita.name);
    await page.getByRole('listbox', {name: 'Universe search results', exact: true}).getByRole('option').first().waitFor();
    await search.press('Enter');
    const open = page.getByRole('button', {name: 'Open details', exact: true});
    if (await open.isVisible()) await open.click();
    await page.locator('.universe-system-title h3').filter({hasText: jita.name}).waitFor();
    await page.getByText('Private field notes', {exact: true}).click();
    const note = await jsonResponse(reply);
    await page.locator('.place-notes textarea').waitFor();
    await page.waitForFunction(body => document.querySelector('.place-notes textarea')?.value === body, note.body);
    return {panel: page.locator('.place-notes'), note};
}
async function privateNotes() {
    savePlaceNote(app.store, 'system', jita.system_id, {name: jita.name, body: originalNote, tags: ['jret'], status: 'home'});
    let {panel, note} = await openNotes();
    check('Atlas loads the independent retained private note', note.body, originalNote);
    const savedText = originalNote + ' Saved in ' + meta.engine + ' at ' + meta.width + '.';
    await panel.locator('textarea').fill(savedText);
    const reply = responseWait('/api/places/system/' + jita.system_id, 'PUT');
    await panel.getByRole('button', {name: 'Save details', exact: true}).click();
    const saved = await jsonResponse(reply);
    check('Private note save acknowledges the exact text', saved.body, savedText);
    check('Private note is actually persisted', app.store.db.prepare("SELECT body FROM place_notes WHERE kind='system' AND entity_id=?").get(jita.system_id)?.body, savedText);
    // Full document reload/reopen verifies the note is independent of a mounted
    // editor and no retired Journey aggregate is required to recover it.
    ({panel, note} = await openNotes());
    check('Cold reopen reads the saved note', [note.body, await panel.locator('textarea').inputValue()], [savedText, savedText]);
    const publicResponse = await fetch(app.streamOrigin + '/state', {signal: AbortSignal.timeout(10000)});
    check('Public Stream state remains available', publicResponse.status, 200);
    const publicValue = await publicResponse.json();
    assert.ok(publicValue && typeof publicValue === 'object' && !Array.isArray(publicValue), 'Public Stream returns its state object.');
    const publicState = JSON.stringify(publicValue);
    check('Private note text stays out of public Stream state', publicState.includes(savedText) || publicState.includes(originalNote), false);
    await screenshot('private-notes');
}

try {
    seed();
    app = await startKairo({port, streamPort: port + 1, dataDir: join(dir, 'data'), noSync: true, fetcher: denyExternal,
        datasets: {fetcher: denyExternal}, universe: {operations: {noSync: true, fetcher: denyExternal}, feeds: {noSync: true, fetcher: denyExternal}}});
    for (const engine of engines) {
        meta = {engine, stage: 'browser launch'};
        browser = await playwright[engine].launch({headless: true, timeout: 20000,
            ...(engine === 'chromium' && process.env.KAIRO_CHROME_PATH ? {executablePath: process.env.KAIRO_CHROME_PATH} : {})});
        for (const width of [1600, 390]) {
            meta = {engine, version: browser.version(), width};
            context = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 1100}, serviceWorkers: 'block'});
            context.setDefaultTimeout(10000); context.setDefaultNavigationTimeout(15000);
            page = await context.newPage();
            const caseMeta = {...meta};
            page.on('pageerror', error => errors.push({...caseMeta, error: error.message}));
            page.on('request', request => {
                const url = new URL(request.url());
                if (url.origin === app.origin && url.pathname.startsWith('/api/')) requests.push({...caseMeta, method: request.method(), path: url.pathname, search: url.search});
            });
            page.on('response', response => {
                const url = new URL(response.url());
                if ((url.origin === app.origin || url.origin === app.streamOrigin) && response.status() >= 400) httpErrors.push({...caseMeta, status: response.status(), path: url.pathname});
            });
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.origin === app.origin || url.origin === app.streamOrigin) return route.continue();
                if (url.origin === 'https://images.evetech.net') return route.fulfill({status: 200, contentType: 'image/svg+xml', body: image});
                unexpectedNetwork.push({...caseMeta, url: url.href}); return route.abort('blockedbyclient');
            });
            await overviewLinks(); await ownedReplay(); await privateNotes(); await frame();
            check('No Journey API request in any exercised flow', requests.filter(row => row.engine === engine && row.width === width && /^\/api\/journey(?:\/|$)/.test(row.path)), []);
            check('No uncaught browser error', errors.filter(row => row.engine === engine && row.width === width), []);
            check('No failing local HTTP response', httpErrors.filter(row => row.engine === engine && row.width === width), []);
            check('No unexpected external browser request', unexpectedNetwork.filter(row => row.engine === engine && row.width === width), []);
            check('No provider work during navigation, replay or private notes', serverRequests, []);
            await bounded(context.close(), 'Browser context close'); context = null; page = null;
            completedCases.push([engine, width]); await persist();
        }
        await bounded(browser.close(), 'Browser close'); browser = null;
    }
    check('Both required viewports completed for each selected engine', completedCases, engines.flatMap(engine => [[engine, 1600], [engine, 390]]));
    complete = true;
} catch (error) {
    failure = {meta, error: error.stack || String(error)};
    console.error('Journey retirement browser gate failed:', failure.error);
    const state = page ? await bounded(page.evaluate(() => ({url: location.href, body: document.body.innerText.slice(-12000)})), 'Failure inspection', 5000).catch(() => null) : null;
    await writeFile(join(output, 'failure.json'), JSON.stringify({...failure, state}, null, 2));
    if (page) await screenshot('failure').catch(() => {});
    process.exitCode = 1;
} finally {
    // Teardown has explicit limits. If runtime close cannot be proved, keep its
    // disposable data instead of deleting files under an unsettled owner.
    const evidenceFailed = error => {cleanupErrors.push({label: 'evidence', error: String(error)}); console.error('Could not save browser evidence:', error); process.exitCode = 1;};
    // Evidence failure must not skip application/browser teardown.
    await persist().catch(evidenceFailed);
    for (const [label, close] of [['context', () => context?.close()], ['browser', () => browser?.close()], ['runtime', () => app?.close()]]) {
        try {await bounded(Promise.resolve().then(close), label + ' teardown');}
        catch (error) {cleanupErrors.push({label, error: String(error)}); process.exitCode = 1;}
    }
    if (!cleanupErrors.some(row => row.label === 'runtime')) {
        await rm(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}).catch(error => {cleanupErrors.push({label: 'temporary data', error: String(error)}); process.exitCode = 1;});
    }
    await persist('checks.json').catch(evidenceFailed);
    console.log(JSON.stringify({ok: complete && !failure && cleanupErrors.length === 0, complete, completedCases, checks: checks.length, output, cleanupErrors, temporaryDataRetained: cleanupErrors.some(row => row.label === 'runtime')}));
    if (cleanupErrors.length) process.exit(1); // An unclosed owner must not hang CI or be reported as a completed drain.
}
