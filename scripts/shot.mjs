// Dev helper: render a URL in headless Chromium and save a screenshot + console log.
import { chromium } from 'playwright-core';
const [url, out = 'test-output/shot.png', wait = '8000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 }); } catch (e) { logs.push('TIMEOUT waiting for __ready'); }
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, timeout: 600000 });
console.log(logs.join('\n'));
await browser.close();
