import {chromium, firefox} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const name = process.argv[2];
if (!['chromium', 'firefox'].includes(name)) throw new Error('Expected one browser name');
const started = Date.now();
const log = (stage, extra = {}) => console.log(JSON.stringify({probe:'environment-only', browser:name, stage, elapsedMs:Date.now()-started, ...extra}));
let browser;
try {
  log('launch-start', {node:process.version, undici:process.versions.undici, launchTimeoutMs:12000});
  browser = await ({chromium, firefox}[name]).launch({headless:true, timeout:12000,
    ...(name === 'chromium' ? {executablePath:'/tmp/kairo-jret-env-20261024/chrome/opt/google/chrome/chrome'} : {})});
  log('launched', {version:browser.version()});
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.setContent('<title>JRET environment probe</title><p id="probe">ready</p>');
  if (await page.locator('#probe').textContent() !== 'ready') throw new Error('Benign page content did not match');
  log('benign-page-ready');
} catch (error) {
  log('failed', {error:String(error?.stack || error).slice(0,22000)});
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  log('probe-finished');
}
