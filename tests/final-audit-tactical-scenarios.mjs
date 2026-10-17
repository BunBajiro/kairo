// Compiled-UI lifecycle checks. Browser PiP availability is controlled at its
// asynchronous API boundary; the returned windows and moved DOM are real browser
// objects. This verifies owner cleanup, not native OS picture-in-picture support.
import assert from 'node:assert/strict';
import {join} from 'node:path';

async function navigate(page, route) {
  const target = page.locator('[data-route="' + route + '"]:visible');
  if (!await target.count()) await page.locator('[data-sidebar="trigger"]:visible').first().click();
  await target.first().click();
  if (route === 'universe-kspace') await page.locator('.universe-module canvas').waitFor();
  else await page.locator('.universe-settings-page').waitFor();
}

async function installWindowGate(page, mode) {
  await page.evaluate(mode => {
    const originalOpen = window.open, originalPip = Object.getOwnPropertyDescriptor(window, 'documentPictureInPicture');
    const state = {mode, calls: 0, fallbackCalls: 0, children: [], pending: null, pendingRequests: [],
      canvas: document.querySelector('.universe-module canvas')};
    window.__finalAuditTactical = state;
    const createChild = () => {
      const child = originalOpen.call(window, 'about:blank', 'kairo-audit-' + crypto.randomUUID(), 'popup=yes,width=660,height=620');
      if (child) state.children.push(child);
      return child;
    };
    window.open = function () {
      state.fallbackCalls++;
      return state.mode === 'blocked' ? null : createChild();
    };
    Object.defineProperty(window, 'documentPictureInPicture', {configurable: true, value:
      mode === 'popup' || mode === 'blocked' ? undefined : {
        requestWindow() {
          state.calls++;
          // Open synchronously during the real user click, retaining popup
          // permission, then hold only the PiP promise acknowledgement.
          const child = state.mode === 'reject' ? null : createChild();
          return new Promise((resolve, reject) => {
            state.pending = {resolve, reject, child};
            state.pendingRequests.push(state.pending);
          });
        },
      }});
    state.dispose = () => {
      // Settled/rejected work has already been inspected before disposal. This
      // final guard prevents a failed fixture leaving a pending browser task.
      for (const pending of state.pendingRequests) pending.reject(new Error('Tactical test fixture disposed'));
      for (const child of state.children) if (!child.closed) child.close();
      window.open = originalOpen;
      if (originalPip) Object.defineProperty(window, 'documentPictureInPicture', originalPip);
      else delete window.documentPictureInPicture;
      delete window.__finalAuditTactical;
    };
  }, mode);
}

async function disposeWindowGate(page) {
  await page.evaluate(() => window.__finalAuditTactical?.dispose()).catch(() => {});
}

export async function tacticalScenarios({page, app, check, frame, output, meta}) {
  const enter = async mode => {
    await page.goto(app.origin + '/#universe-kspace', {waitUntil: 'domcontentloaded'});
    await page.locator('.universe-module canvas').waitFor();
    await installWindowGate(page, mode);
    await page.getByRole('button', {name: 'Open tactical window', exact: true}).click();
    await page.bringToFront();
  };
  const settle = async success => {
    await page.evaluate(success => {
      const state = window.__finalAuditTactical, pending = state.pending;
      if (!pending) throw new Error('Expected an admitted pending PiP request');
      if (success) pending.resolve(pending.child);
      else pending.reject(new Error('Synthetic PiP request rejected'));
    }, success);
    await frame();
  };
  try {
    await enter('resolve');
    assert.equal(await page.evaluate(() => !!window.__finalAuditTactical.pending?.child), true, 'Real popup created for delayed PiP response');
    check('One explicit PiP open admits one browser request', await page.evaluate(() => window.__finalAuditTactical.calls), 1);
    check('Pending PiP leaves current renderer in the dashboard', await page.evaluate(() => document.querySelector('.universe-module canvas') === window.__finalAuditTactical.canvas), true);
    await settle(true);
    await page.waitForFunction(() => !!window.__finalAuditTactical.pending.child.document.querySelector('canvas'));
    check('Current PiP success moves the same renderer', await page.evaluate(() => window.__finalAuditTactical.pending.child.document.querySelector('canvas') === window.__finalAuditTactical.canvas), true);
    check('Current PiP success creates exactly one private child', await page.evaluate(() => window.__finalAuditTactical.children.length), 1);
    check('Successful PiP does not invoke popup fallback', await page.evaluate(() => window.__finalAuditTactical.fallbackCalls), 0);
    await page.getByRole('button', {name: 'Return tactical map', exact: true}).click();
    await frame();
    check('Return restores the original renderer', await page.evaluate(() => document.querySelector('.universe-module canvas') === window.__finalAuditTactical.canvas), true);
    check('Return closes the owned child', await page.evaluate(() => window.__finalAuditTactical.pending.child.closed), true);
    await disposeWindowGate(page);

    await enter('resolve');
    assert.equal(await page.evaluate(() => !!window.__finalAuditTactical.pending?.child), true);
    await navigate(page, 'universe-settings');
    check('Navigation unmounts Universe before delayed PiP resolves', await page.locator('.universe-module canvas').count(), 0);
    await settle(true);
    check('PiP response after unmount closes its returned child', await page.evaluate(() => window.__finalAuditTactical.pending.child.closed), true);
    check('PiP response after unmount cannot append a stale portal host', await page.evaluate(() => {
      const child = window.__finalAuditTactical.pending.child;
      return !child.closed && !!child.document.querySelector('.universe-tactical-host');
    }), false);
    check('Late PiP success keeps the newly selected page', await page.evaluate(() => location.hash), '#universe-settings');
    if (output) await page.screenshot({path: join(output, `${meta.engine}-${meta.width}-tactical-late-success.png`)});
    await disposeWindowGate(page);

    await enter('reject');
    assert.equal(await page.evaluate(() => window.__finalAuditTactical.calls), 1);
    await navigate(page, 'universe-settings');
    await settle(false);
    check('PiP rejection after unmount cannot open a fallback window', await page.evaluate(() => window.__finalAuditTactical.fallbackCalls), 0);
    check('Late PiP rejection keeps the newly selected page', await page.evaluate(() => location.hash), '#universe-settings');
    await disposeWindowGate(page);

    await enter('blocked');
    await page.getByRole('status').filter({hasText: 'The tactical window was blocked.'}).waitFor();
    check('Current blocked popup reports the actionable browser failure', await page.getByRole('status').filter({hasText: 'The tactical window was blocked.'}).count(), 1);
    check('Blocked popup keeps the original renderer', await page.evaluate(() => document.querySelector('.universe-module canvas') === window.__finalAuditTactical.canvas), true);
    await page.evaluate(() => {window.__finalAuditTactical.mode = 'popup';});
    await page.getByRole('button', {name: 'Open tactical window', exact: true}).click();
    await page.bringToFront();
    await page.waitForFunction(() => !!window.__finalAuditTactical.children.at(-1)?.document.querySelector('canvas'));
    check('Explicit retry after blocked popup moves the same renderer', await page.evaluate(() => window.__finalAuditTactical.children.at(-1).document.querySelector('canvas') === window.__finalAuditTactical.canvas), true);
    check('Blocked attempt and explicit retry make exactly two popup attempts', await page.evaluate(() => window.__finalAuditTactical.fallbackCalls), 2);
    await navigate(page, 'universe-settings');
    check('Normal unmount closes an already adopted child', await page.evaluate(() => window.__finalAuditTactical.children.at(-1).closed), true);
    await disposeWindowGate(page);

    // Newer request ownership is separate from view lifetime: both opens can
    // belong to the same mounted hook while their acknowledgements reorder.
    for (const obsoleteResult of ['resolve', 'reject']) {
      await enter(obsoleteResult);
      await page.evaluate(() => {window.__finalAuditTactical.mode = 'resolve';});
      await page.getByRole('button', {name: 'Open tactical window', exact: true}).click();
      await page.bringToFront();
      check('Two explicit pending opens admit two requests (' + obsoleteResult + ')', await page.evaluate(() => window.__finalAuditTactical.calls), 2);
      await settle(true);
      await page.waitForFunction(() => !!window.__finalAuditTactical.pending.child.document.querySelector('canvas'));
      check('Newer PiP request adopts the existing renderer (' + obsoleteResult + ')', await page.evaluate(() => window.__finalAuditTactical.pending.child.document.querySelector('canvas') === window.__finalAuditTactical.canvas), true);
      await page.evaluate(obsoleteResult => {
        const previous = window.__finalAuditTactical.pendingRequests[0];
        if (obsoleteResult === 'resolve') previous.resolve(previous.child);
        else previous.reject(new Error('Synthetic superseded PiP request rejected'));
      }, obsoleteResult);
      await frame();
      check('Obsolete PiP ' + obsoleteResult + ' preserves the newer adopted renderer', await page.evaluate(() => {
        const state = window.__finalAuditTactical;
        return !state.pending.child.closed && state.pending.child.document.querySelector('canvas') === state.canvas;
      }), true);
      if (obsoleteResult === 'resolve') check('Obsolete PiP success closes only its own child', await page.evaluate(() => window.__finalAuditTactical.pendingRequests[0].child.closed), true);
      check('Obsolete PiP ' + obsoleteResult + ' cannot dispatch fallback work', await page.evaluate(() => window.__finalAuditTactical.fallbackCalls), 0);
      await page.getByRole('button', {name: 'Return tactical map', exact: true}).click();
      await frame();
      check('Return after reordered opens restores the original renderer (' + obsoleteResult + ')', await page.evaluate(() => document.querySelector('.universe-module canvas') === window.__finalAuditTactical.canvas), true);
      check('Return after reordered opens closes the current child (' + obsoleteResult + ')', await page.evaluate(() => window.__finalAuditTactical.pending.child.closed), true);
      await disposeWindowGate(page);
    }
  } finally {
    await disposeWindowGate(page);
  }
}

export async function landmarkCategoryScenario({page, app, check, frame, output, meta}) {
  await page.goto(app.origin + '/#universe-kspace', {waitUntil: 'domcontentloaded'});
  await page.locator('.universe-module canvas').waitFor();
  const openDetails = page.getByRole('button', {name: 'Open details', exact: true});
  if (await openDetails.isVisible()) await openDetails.click();
  await page.getByLabel('Operations tool', {exact: true}).click();
  await page.getByRole('option', {name: 'Live intel', exact: true}).click();
  await page.getByRole('button', {name: 'Signals', exact: true}).click();
  await page.getByLabel('Public signal type', {exact: true}).click();
  await page.getByRole('option', {name: 'Points of interest', exact: true}).click();
  await page.getByLabel('Landmark category', {exact: true}).click();
  const labels = await page.getByRole('option').allTextContents();
  check('Landmark categories appear exactly once in the visible picker', labels.length, new Set(labels).size);
  check('A0 star is available once in the visible landmark picker', labels.filter(label => label.trim() === 'a0 star').length, 1);
  // first() deliberately lets the baseline continue beyond the duplicate-choice
  // failure to exercise real filtering and recovery; it is not a passing check.
  await page.getByRole('option', {name: 'a0 star', exact: true}).first().click();
  await frame();
  check('A0-star selection exposes actual bundled star records', await page.locator('.universe-public-signals article').count() > 0, true);
  const kinds = await page.locator('.universe-public-signals article > p:first-of-type').allTextContents();
  check('Selected A0-star category excludes other landmark kinds', kinds.length > 0 && kinds.every(text => text.startsWith('a0 star')), true);
  if (output) await page.screenshot({path: join(output, `${meta.engine}-${meta.width}-landmark-category.png`)});
  await page.getByLabel('Landmark category', {exact: true}).click();
  await page.getByRole('option', {name: 'All landmarks', exact: true}).click();
  await frame();
  check('All-landmarks selection restores other reference kinds', (await page.locator('.universe-public-signals article > p:first-of-type').allTextContents()).some(text => !text.startsWith('a0 star')), true);
}
