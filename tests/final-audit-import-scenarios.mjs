import assert from 'node:assert/strict';
import {DEFAULT_IMPORT_SETTINGS} from '../server/import-math.mjs';

const HUB = 60008494;
const PATH = '/api/markets/imports/settings';

async function navigate(page, id) {
    if (!await page.locator(`[data-route="${id}"]:visible`).count()) {
        await page.getByRole('button', {name:'Show sidebar', exact:true}).click();
    }
    await page.locator(`[data-route="${id}"]:visible`).first().click();
}

// Real Apply commands cross a component remount. The first request is held
// before server receipt, so this proves durable ordering rather than merely
// protecting a form from an old acknowledgement. A failed first request must
// release later accepted work. All gates drain before restoring the fixture.
async function crossingImportSettings({page, context, app, check, frame, deferred}, failFirst) {
    const key = 'market:imports:' + HUB, previous = app.store.get(key, null);
    const gate = {seen:deferred(), release:deferred(), done:deferred()};
    const newer = {done:deferred()};
    let hold = true, olderEntered = false, newerEntered = false, abortNext = false;
    const wait = promise => Promise.race([promise, page.waitForTimeout(10000).then(() => {
        throw new Error('Import settings ownership transport gate timed out.');
    })]);
    const stored = () => {
        const value = app.store.get(key);
        return {cargo:value.cargo, budget:value.budget};
    };
    const cargo = () => page.getByLabel('Cargo per round trip / m³', {exact:true});
    const budget = () => page.getByLabel('Available capital / ISK', {exact:true});
    const apply = () => page.locator('.import-controls').getByRole('button');
    const settled = () => page.waitForFunction(() => {
        const button = document.querySelector('.import-controls button');
        return button && !button.disabled;
    });
    const open = async () => {
        await page.locator('.market-hub').filter({has:page.locator('strong', {hasText:/^Amarr$/})}).click();
        await page.locator('.markets-module > [data-slot=tabs] > [role=tablist]')
            .getByRole('tab', {name:'Import Analyser', exact:true}).click();
        await cargo().waitFor();
        await settled();
    };
    const choose = async (capacity, capital) => {
        await cargo().fill(String(capacity));
        await budget().fill(String(capital));
    };
    app.store.set(key, {...DEFAULT_IMPORT_SETTINGS, characterId:42, minProfit:0});
    await context.addInitScript(({path, hub}) => {
        const native = window.fetch;
        window.__auditImportWrites = [];
        window.fetch = function(input, options) {
            if (String(input) === path && options?.method === 'PUT') {
                const body = JSON.parse(options.body);
                if (body.hubId === hub) window.__auditImportWrites.push(body.settings.cargo);
            }
            return native.apply(this, arguments);
        };
    }, {path:PATH, hub:HUB});
    const handler = async route => {
        const request = route.request();
        if (request.method() !== 'PUT' || request.postDataJSON().hubId !== HUB) return route.fallback();
        if (abortNext) { abortNext = false; return route.abort('failed'); }
        const capacity = request.postDataJSON().settings.cargo;
        if (hold && capacity === 20000) {
            hold = false; olderEntered = true; gate.seen.resolve();
            try {
                await gate.release.promise;
                if (failFirst) return await route.fulfill({status:503, contentType:'application/json',
                    body:JSON.stringify({error:'Synthetic older import Apply failure'})});
                const response = await route.fetch();
                assert.equal(response.status(), 200);
                await route.fulfill({response});
            } finally { gate.done.resolve(); }
            return;
        }
        if (capacity === 30000) {
            newerEntered = true;
            try {
                const response = await route.fetch();
                assert.equal(response.status(), 200);
                await route.fulfill({response});
            } finally { newer.done.resolve(); }
            return;
        }
        return route.continue();
    };
    await page.route(app.origin + PATH, handler);
    try {
        await page.goto(app.origin + '/#markets', {waitUntil:'domcontentloaded', timeout:15000});
        await page.locator('.connection-status.online').waitFor({state:'attached'});
        await open();
        check('Cold import desk uses saved destination settings',
            {cargo:await cargo().inputValue(), budget:await budget().inputValue()},
            {cargo:'10000', budget:'1000000000'});
        await choose(20000, 2000000000);
        await apply().click();
        await wait(gate.seen.promise);
        check('The mounted import editor prevents a duplicate Apply', await apply().isDisabled(), true);
        check('Held import Apply has not yet persisted', stored(), {cargo:10000, budget:1000000000});
        await navigate(page, 'overview');
        await page.getByRole('heading', {name:'Command centre', exact:true}).waitFor();
        await navigate(page, 'markets');
        await open();
        await choose(30000, 3000000000);
        await apply().click();
        await frame();
        const admitted = await page.evaluate(() => window.__auditImportWrites.slice());
        assert.equal(admitted[0], 20000);
        // A corrected owner can queue the newer Apply. Do not wait for that
        // request until the preceding gate has been released.
        if (admitted.length > 1) {
            await wait(newer.done.promise);
            assert.deepEqual(stored(), {cargo:30000, budget:3000000000});
        }
        gate.release.resolve();
        await wait(gate.done.promise);
        await wait(newer.done.promise);
        await settled();
        await frame();
        check(failFirst ? 'A rejected older Apply releases the newer accepted destination settings'
            : 'The newer accepted import Apply survives an older delayed write across navigation',
        stored(), {cargo:30000, budget:3000000000});
        check('The remounted import editor shows the latest accepted settings',
            {cargo:await cargo().inputValue(), budget:await budget().inputValue()},
            {cargo:'30000', budget:'3000000000'});
        check('Retired import Apply failures do not enter the current editor',
            await page.locator('.import-analyser > .inline-error').allTextContents(), []);
        check('Two accepted import Applies issue exactly two destination writes',
            await page.evaluate(() => window.__auditImportWrites.slice()), [20000, 30000]);
        const persisted = stored();
        await choose(40000, 4000000000);
        abortNext = true;
        const failed = page.waitForEvent('requestfailed', {predicate:request =>
            new URL(request.url()).pathname === PATH && request.method() === 'PUT'});
        await apply().click(); await failed; await settled(); await frame();
        check('A current failed Apply preserves prior destination persistence', stored(), persisted);
        check('A current failed Apply leaves an editable retry draft',
            {cargo:await cargo().inputValue(), budget:await budget().inputValue(), editable:await cargo().isEditable()},
            {cargo:'40000', budget:'4000000000', editable:true});
        check('A current failed Apply remains visible for recovery',
            (await page.locator('.import-analyser > .inline-error').textContent())?.length > 0, true);
        const retried = page.waitForResponse(response => new URL(response.url()).pathname === PATH
            && response.request().method() === 'PUT');
        await apply().click(); assert.equal((await retried).status(), 200);
        await settled(); await frame();
        check('Explicit import Apply retry saves the retained draft', stored(), {cargo:40000, budget:4000000000});
        check('Explicit import retry clears its own error',
            await page.locator('.import-analyser > .inline-error').allTextContents(), []);
        check('Import settings recovery adds no implicit mutations',
            await page.evaluate(() => window.__auditImportWrites.slice()), [20000, 30000, 40000, 40000]);
    } finally {
        gate.release.resolve();
        await wait(Promise.all([...(olderEntered ? [gate.done.promise] : []),
            ...(newerEntered ? [newer.done.promise] : [])]));
        await page.unroute(app.origin + PATH, handler);
        if (previous === null) app.store.db.prepare('DELETE FROM settings WHERE key=?').run(key);
        else app.store.set(key, previous);
    }
}

export const importSettingsNavigationOwnership = args => crossingImportSettings(args, false);
export const importSettingsFailedFirstOwnership = args => crossingImportSettings(args, true);
