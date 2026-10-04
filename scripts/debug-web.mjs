#!/usr/bin/env node
// Interactive debug probe for the web target.
//
// Boots the same stack as smoke:web, opens the app WITHOUT seeding, then:
//   - prints all console output, failed requests and 4xx/5xx responses
//   - checks `crossOriginIsolated`
//   - probes `__privatecycle.DataService.getAllDailyData()` with a timeout
//   - saves a screenshot to artifacts/screenshots/debug.png
//
// Useful when the smoke run fails and you need to know why.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { isPortInUse, startHeadersProxy, waitForHttp } from './lib/web-proxy.mjs';

const EXPO_PORT = Number(process.env.SMOKE_EXPO_PORT || 8091);
const PROXY_PORT = Number(process.env.SMOKE_PROXY_PORT || 8092);
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 30_000);

if (await isPortInUse(EXPO_PORT)) {
  console.error(`[debug] Port ${EXPO_PORT} in use; stop the other server or set SMOKE_EXPO_PORT.`);
  process.exit(1);
}

const expo = spawn('npx', ['expo', 'start', '--web', '--port', String(EXPO_PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', BROWSER: 'none' },
});
let expoLog = '';
expo.stdout.on('data', (d) => (expoLog += d.toString()));
expo.stderr.on('data', (d) => (expoLog += d.toString()));

let browser = null;
let proxy = null;

function killExpo() {
  if (!expo.pid) return;
  try {
    process.kill(-expo.pid, 'SIGTERM');
  } catch {
    try {
      expo.kill('SIGTERM');
    } catch {}
  }
}

async function shutdown(code) {
  fs.mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'artifacts', 'expo.log'), expoLog);
  try {
    if (browser) await browser.close();
  } catch {}
  try {
    if (proxy) proxy.close();
  } catch {}
  killExpo();
  process.exit(code);
}

try {
  await waitForHttp(EXPO_PORT, { timeoutMs: 180_000 });
  proxy = await startHeadersProxy({ targetPort: EXPO_PORT, listenPort: PROXY_PORT });

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

  page.on('console', (m) => console.log(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e}`));
  page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) console.log(`[response ${r.status()}] ${r.url()}`);
  });

  console.log('[debug] navigating…');
  await page.goto(`http://127.0.0.1:${PROXY_PORT}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  await page.getByTestId('tab-calendar').waitFor({ state: 'visible', timeout: 180_000 });
  console.log('[debug] app shell rendered');
  console.log('[debug] crossOriginIsolated =', await page.evaluate(() => self.crossOriginIsolated));
  console.log('[debug] dev globals =', await page.evaluate(() => typeof globalThis.__privatecycle));

  const probe = await page.evaluate(async (timeoutMs) => {
    const started = Date.now();
    if (typeof globalThis.__privatecycle === 'undefined') {
      return { ok: false, reason: 'no dev globals (native or production bundle?)' };
    }
    const result = await Promise.race([
      globalThis.__privatecycle.DataService.getAllDailyData().then((data) => ({
        ok: true,
        rows: Object.keys(data).length,
      })),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs)),
    ]);
    return { ...result, elapsedMs: Date.now() - started };
  }, PROBE_TIMEOUT_MS);

  console.log('[debug] DB probe:', JSON.stringify(probe));

  fs.mkdirSync(path.join(process.cwd(), 'artifacts', 'screenshots'), { recursive: true });
  await page.screenshot({
    path: path.join(process.cwd(), 'artifacts', 'screenshots', 'debug.png'),
    fullPage: true,
  });
  console.log('[debug] screenshot: artifacts/screenshots/debug.png');

  await shutdown(probe.ok ? 0 : 1);
} catch (error) {
  console.error('[debug] threw:', error.message);
  console.error(expoLog.split('\n').slice(-30).join('\n'));
  await shutdown(1);
}
