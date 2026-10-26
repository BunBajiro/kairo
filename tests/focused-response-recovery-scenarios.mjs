import assert from 'node:assert/strict';

// Real compiled OBS editor and HTTP/SQLite. Corrupt response bytes only after
// the runtime replies; an unreadable PUT acknowledgement is an uncertain save.
export async function obsMalformedResponseRecovery({page, app, check, frame}) {
    const initial = app.core.obs.config();assert.equal(initial.enabled, false);
    let failRead = false, failSave = false;const writes = [], responses = [];
    const handler = async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (request.method() === 'GET' && path === '/api/obs' && failRead) {
            failRead = false;responses.push('malformed configuration read');
            return route.fulfill({status: 200, contentType: 'application/json', body: '<html>temporary failure</html>'});
        }
        if (request.method() !== 'PUT' || path !== '/api/obs') return route.fallback();
        writes.push(request.postDataJSON().port);
        if (!failSave) return route.continue();
        failSave = false;const response = await route.fetch();assert.equal(response.status(), 200);
        responses.push('accepted save with malformed acknowledgement');
        return route.fulfill({status: 200, contentType: 'application/json', body: '{"config":'});
    };
    await page.route(app.origin + '/api/obs**', handler);
    const port = page.getByRole('spinbutton', {name: 'Local WebSocket port', exact: true});
    const password = page.getByLabel('OBS password', {exact: true});
    const save = page.getByRole('button', {name: 'Save connection', exact: true});
    const error = page.getByRole('alert').filter({hasText: 'Kairo could not read the response.'});
    const responseFor = (path, method) => response => new URL(response.url()).pathname === '/api' + path && response.request().method() === method;
    const settleSave = async () => {
        await page.waitForFunction(() => {const button = [...document.querySelectorAll('.obs-controls button')].find(button => button.textContent === 'Save connection');return button && !button.disabled;});
        await frame();
    };
    const refreshConfig = async event => {
        const response = page.waitForResponse(responseFor('/obs', 'GET'));
        await page.evaluate(event => window.dispatchEvent(new Event(event)), event);await (await response).finished();await frame();
    };
    const send = async () => {const response = page.waitForResponse(responseFor('/obs', 'PUT'));await save.click();assert.equal((await response).status(), 200);await (await response).finished();await settleSave();};
    try {
        await page.goto(app.origin + '/#opsec', {waitUntil: 'domcontentloaded', timeout: 15000});
        await page.locator('.connection-status.online').waitFor({state: 'attached'});await port.waitFor();await frame();
        check('OBS starts from the saved disconnected configuration', {port: await port.inputValue(), enabled: initial.enabled}, {port: String(initial.port), enabled: false});
        await port.fill('4466');await password.fill('synthetic-review-password');
        failRead = true;await refreshConfig('kairo:events-connected');await error.waitFor();
        check('Malformed current configuration read retains the editable settings and draft', {port: await port.inputValue(), password: await password.inputValue(), savedPort: app.core.obs.config().port}, {port: '4466', password: 'synthetic-review-password', savedPort: initial.port});
        check('Malformed read cannot acknowledge or submit a pending OBS draft', {dirty: await page.getByText('Unsaved changes', {exact: true}).count(), writes: writes.length}, {dirty: 1, writes: 0});
        await refreshConfig('focus');await error.waitFor({state: 'detached'});
        check('Existing focus recovery clears the read error without replacing the draft', {port: await port.inputValue(), password: await password.inputValue()}, {port: '4466', password: 'synthetic-review-password'});
        failSave = true;await send();await error.waitFor();
        check('Unreadable acknowledgement can follow an actually persisted OBS command', {port: app.core.obs.config().port, passwordSaved: app.core.obs.config().passwordSaved, writes: writes.length}, {port: 4466, passwordSaved: true, writes: 1});
        check('Unreadable save acknowledgement retains its retry draft and dirty state', {port: await port.inputValue(), password: await password.inputValue(), dirty: await page.getByText('Unsaved changes', {exact: true}).count(), retryable: await save.isEnabled()}, {port: '4466', password: 'synthetic-review-password', dirty: 1, retryable: true});
        await send();await error.waitFor({state: 'detached'});
        check('Explicit healthy retry acknowledges and clears only the submitted draft', {port: await port.inputValue(), password: await password.inputValue(), dirty: await page.getByText('Unsaved changes', {exact: true}).count()}, {port: '4466', password: '', dirty: 0});
        check('Malformed responses never cause an automatic mutation retry', writes, [4466, 4466]);
        check('Both malformed response boundaries were exercised', responses, ['malformed configuration read', 'accepted save with malformed acknowledgement']);
        check('Recovery never enables the disabled OBS connection or automation', {enabled: app.core.obs.config().enabled, automation: app.core.obs.config().automation, connected: app.core.obs.status().connected}, {enabled: false, automation: false, connected: false});
    } finally {await page.unroute(app.origin + '/api/obs**', handler);}
}
