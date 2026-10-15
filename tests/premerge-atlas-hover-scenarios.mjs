import assert from 'node:assert/strict';
import {join} from 'node:path';

// Observe the real compiled renderer's drawn segments; no implementation hooks,
// replacement hit testing or fixed screen coordinates enter this fixture.
export async function atlasHover({page, context, app, check, frame, api, output, meta}) {
    const atlas = await api('/universe/static');
    const known = atlas.systems.filter(system => system.space === 'known' && Number.isFinite(system.map_x) && Number.isFinite(system.map_y));
    const ordered = [...known].sort((a, b) => a.map_y - b.map_y), from = ordered[0], to = ordered.at(-1);
    assert.ok(from && to && from.system_id !== to.system_id);
    await context.addInitScript(() => {
        sessionStorage.setItem('kairo-universe-workspace:42:known', JSON.stringify({tab: 'atlas', selected: null, inspectorOpen: false, view: {space: 'known', background: 'none', indicator: 'none', region: 'all', showConnections: false, showSpecialLinks: true}}));
        localStorage.setItem('kairo-atlas-projection', 'physical');
        window.__atlasHoverPaint = {draws: 0, segments: []};
        const paths = new WeakMap();
        for (const method of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke']) {
            const original = CanvasRenderingContext2D.prototype[method];
            CanvasRenderingContext2D.prototype[method] = function (...args) {
                if (this.canvas.closest('.universe-module')) {
                    if (method === 'clearRect') { window.__atlasHoverPaint.draws++; window.__atlasHoverPaint.segments = []; }
                    if (method === 'beginPath') paths.set(this, []);
                    if (method === 'moveTo' || method === 'lineTo') paths.get(this)?.push({x: args[0], y: args[1]});
                    if (method === 'stroke' && this.lineWidth === 1.35 && paths.get(this)?.length === 2) window.__atlasHoverPaint.segments.push(paths.get(this).map(point => ({...point})));
                }
                return original.apply(this, args);
            };
        }
    });
    // Private wormholes are map-scoped and intentionally absent from Atlas.
    for (const kind of ['ansiblex']) {
        const link = await api('/universe/links?character=42', 'POST', {kind, from_system_id: from.system_id, to_system_id: to.system_id, label: 'Hover regression ' + kind, enabled: true, accessible: true, confirmed: true, ...(kind === 'wormhole' ? {duration_hours: 16} : {})});
        assert.equal(link.active, true, 'The real service must expose a drawable connection');
        try {
            await page.goto(app.origin + '/#universe-kspace', {waitUntil: 'domcontentloaded', timeout: 15000});
            const canvas = page.locator('.universe-module canvas'), card = page.locator('.universe-map-context');
            await canvas.waitFor(); await page.waitForFunction(() => window.__atlasHoverPaint?.segments.length > 0); await frame();
            await canvas.evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant'})); await frame();
            const geometry = await page.evaluate(() => { const r = document.querySelector('.universe-module canvas').getBoundingClientRect(); return {rect: {left: r.left, top: r.top, width: r.width, height: r.height}, segment: window.__atlasHoverPaint.segments[0]}; });
            const point = fraction => ({x: geometry.rect.left + geometry.segment[0].x + (geometry.segment[1].x - geometry.segment[0].x) * fraction, y: geometry.rect.top + geometry.segment[0].y + (geometry.segment[1].y - geometry.segment[0].y) * fraction});
            const first = point(.43), second = point(.67);
            check('Atlas ' + kind + ' fixture has a meaningful segment away from its origin', Math.hypot(second.x - first.x, second.y - first.y) >= 25, true, {geometry});
            for (const [label, at] of [['first', first], ['same-link movement', second]]) {
                await page.mouse.move(at.x, at.y); await frame();
                await card.filter({has: page.locator('strong')}).waitFor();
                const placement = await card.evaluate((element, at) => {
                    const r = element.getBoundingClientRect(), viewport = element.parentElement.getBoundingClientRect();
                    return {id: element.dataset.mapSymbolId, role: element.getAttribute('role'), x: r.left - viewport.left, y: r.top - viewport.top, width: r.width, height: r.height, viewportWidth: viewport.width, viewportHeight: viewport.height, pointerX: at.x - viewport.left, pointerY: at.y - viewport.top, coversPointer: at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom};
                }, at);
                const expectedTop = Math.max(12, Math.min(placement.viewportHeight - placement.height - 12, placement.pointerY + 18));
                check('Atlas ' + kind + ' ' + label + ' hits the real connection', placement.id, 'link:' + link.id);
                check('Atlas ' + kind + ' ' + label + ' shows a pointer-anchored hover card', Math.abs(placement.y - expectedTop) <= 2, true, {placement, expectedTop});
                check('Atlas ' + kind + ' ' + label + ' retains viewport padding', placement.x >= 11 && placement.y >= 11 && placement.x + placement.width <= placement.viewportWidth - 11 && placement.y + placement.height <= placement.viewportHeight - 11, true, {placement});
                check('Atlas ' + kind + ' ' + label + ' is a noninteractive tooltip', placement.role, 'tooltip');
            }
            const draws = await page.evaluate(() => window.__atlasHoverPaint.draws);
            for (let i = 0; i < 8; i++) { const at = point(.58 + i / 100); await page.mouse.move(at.x, at.y); }
            await frame();
            check('Atlas ' + kind + ' same-link pointer motion does not repaint map geometry', await page.evaluate(() => window.__atlasHoverPaint.draws) - draws, 0);
            await page.mouse.click(second.x, second.y); await frame();
            check('Atlas ' + kind + ' clicking retains the connection dialog', await card.getAttribute('role'), 'dialog');
            check('Atlas ' + kind + ' pinned details receive keyboard focus', await card.evaluate(element => document.activeElement === element), true);
            await page.keyboard.press('Escape'); await frame();
            check('Atlas ' + kind + ' Escape closes pinned context', await card.count(), 0);
            check('Atlas ' + kind + ' Escape returns focus to the canvas', await canvas.evaluate(element => document.activeElement === element), true);
            await canvas.press('s');
            const choice = page.locator('.universe-map-symbol-list button[data-map-symbol-id="link:' + link.id + '"]');
            await choice.waitFor(); await choice.focus(); await choice.press('Enter'); await frame();
            check('Atlas ' + kind + ' keyboard symbol selection retains pinned details', {role: await card.getAttribute('role'), id: await card.getAttribute('data-map-symbol-id')}, {role: 'dialog', id: 'link:' + link.id});
            if (output && meta) await page.screenshot({path: join(output, meta.engine + '-' + meta.width + '-atlas-' + kind + '.png')});
            await page.keyboard.press('Escape');
        } finally { await api('/universe/links/' + link.id + '?character=42', 'DELETE'); }
    }
}
