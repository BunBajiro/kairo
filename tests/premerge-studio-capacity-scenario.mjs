// Imported by the shared browser runner; seed actual Stream configuration near
// its element limit, then use visible controls to test capacity and recovery.
// The caller owns the disposable runtime/browser and collects check() results.
import assert from 'node:assert/strict';
import {defaultStream} from '../server/stream.mjs';

export async function studioCapacity({page, app, check, frame}) {
    const config = defaultStream();
    config.elements = Array.from({length: 49}, (_, index) => ({
        id: 'capacity-' + index, kind: 'text', name: 'Capacity element ' + index, text: 'Capacity fixture ' + index,
        label: '', x: 40 + index * 10, y: 40 + index * 10, width: 400, height: 100,
        fontSize: 24, opacity: .7, color: '#97ebce', visible: true, binding: 'none',
    }));
    app.core.stream.save(config);
    await page.goto(app.origin + '/#studio', {waitUntil: 'domcontentloaded', timeout: 15000});
    await page.locator('.connection-status.online').waitFor({state: 'attached'});
    await page.locator('.layer-name').filter({hasText: /^Capacity element 48$/}).click();
    const duplicate = page.getByRole('button', {name: 'Duplicate element', exact: true});
    const save = page.locator('.studio-toolbar').getByRole('button', {name: 'Save changes', exact: true});
    const draftCount = () => page.locator('.layers .layer').count();
    const saveResponse = () => page.waitForResponse(response => new URL(response.url()).pathname === '/api/stream' && response.request().method() === 'PUT');
    const saveDraft = async () => { const response = saveResponse(); await save.click(); const result = await response; await frame(); return result.status(); };

    check('Cold Studio loads all 49 saved elements', await draftCount(), 49);
    check('Duplicate remains available below the 50-element limit', await duplicate.isEnabled(), true);
    await duplicate.click(); await frame();
    check('Duplicating element 49 creates the permitted final element', await draftCount(), 50);
    assert.equal(await saveDraft(), 200);
    check('The 50-element layout saves through the actual Stream owner', app.core.stream.config().elements.length, 50);
    check('All template additions are disabled at capacity', await page.locator('.template-grid button:disabled').count(), 9);
    check('Duplicate is disabled at the same 50-element capacity', await duplicate.isDisabled(), true);
    // Exercise the baseline's reachable action without forcing a disabled control.
    if (await duplicate.isEnabled()) await duplicate.click();
    await frame();
    check('The duplicate control cannot create an unsaveable 51st element', await draftCount(), 50);
    await page.locator('.inspector textarea').fill('A full layout remains editable');
    check('An edited full layout still saves successfully', await saveDraft(), 200);

    // Recover the deliberately exercised baseline overflow before checking retry.
    if (await draftCount() > 50) await page.getByRole('button', {name: 'Remove element', exact: true}).click();
    await page.locator('.layer-name').filter({hasText: /^Capacity element 48 copy$/}).click();
    await page.locator('.inspector textarea').fill('Capacity retry saved');
    assert.equal(await saveDraft(), 200);
    check('Saving after the capacity attempt persists the current 50-element draft', {
        count: app.core.stream.config().elements.length,
        text: app.core.stream.config().elements.find(element => element.name === 'Capacity element 48 copy')?.text,
    }, {count: 50, text: 'Capacity retry saved'});

    await page.getByRole('button', {name: 'Remove element', exact: true}).click();
    await page.locator('.layer-name').filter({hasText: /^Capacity element 48$/}).click();
    check('Removing an element restores duplication immediately', {count: await draftCount(), enabled: await duplicate.isEnabled()}, {count: 49, enabled: true});
    await duplicate.click(); assert.equal(await saveDraft(), 200);
    check('Duplicating after removal returns to a saveable 50-element layout', {
        draft: await draftCount(), saved: app.core.stream.config().elements.length, clean: await save.isDisabled(),
    }, {draft: 50, saved: 50, clean: true});
}
