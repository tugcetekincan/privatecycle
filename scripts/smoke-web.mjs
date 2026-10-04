#!/usr/bin/env node
// Headless end-to-end smoke test for the web target.
//
// What it does:
//   1. Starts `expo start --web` in CI mode (no watch) and waits for it.
//   2. Starts the COOP/COEP proxy in front of it.
//   3. Launches headless Chromium (Playwright), seeds demo data via ?seed=force,
//      walks the four tabs, exercises the track-save and calendar-modal flows,
//      and saves screenshots to artifacts/screenshots/.
//   4. Fails (exit 1) on page errors or console errors.
//
// Usage:
//   npm run smoke:web                 # screenshots + flow check
//   npm run smoke:web -- --headed     # watch it in a real window (needs a display)
//   SMOKE_ALLOW_CONSOLE_ERRORS=1 npm run smoke:web
//
// Environment:
//   SMOKE_EXPO_PORT=8091  SMOKE_PROXY_PORT=8092

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { isPortInUse, startHeadersProxy, waitForHttp } from './lib/web-proxy.mjs';

const EXPO_PORT = Number(process.env.SMOKE_EXPO_PORT || 8091);
const PROXY_PORT = Number(process.env.SMOKE_PROXY_PORT || 8092);
const ROOT = process.cwd();
const SHOT_DIR = path.join(ROOT, 'artifacts', 'screenshots');
const headed = process.argv.includes('--headed');
const allowConsoleErrors = process.env.SMOKE_ALLOW_CONSOLE_ERRORS === '1';

// Console errors that are not app defects.
const IGNORED_CONSOLE_ERRORS = [
  /Download the React DevTools/i,
  /Failed to load resource.*favicon/i,
  /net::ERR_ABORTED.*favicon/i,
];

const failures = [];
const consoleErrors = [];
const consoleAll = [];
const pageErrors = [];

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function shot(name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

for (const [name, port] of [
  ['SMOKE_EXPO_PORT', EXPO_PORT],
  ['SMOKE_PROXY_PORT', PROXY_PORT],
]) {
  if (await isPortInUse(port)) {
    console.error(
      `[smoke] Port ${port} (${name}) is already in use — a stale dev server? ` +
        'Stop it or set different ports.'
    );
    process.exit(1);
  }
}

// detached:true puts Expo (and its children) in their own process group so the
// whole tree can be killed. Killing plain `npx` leaves Metro orphaned.
const expo = spawn('npx', ['expo', 'start', '--web', '--port', String(EXPO_PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', BROWSER: 'none' },
});
let expoLog = '';
expo.stdout.on('data', (d) => (expoLog += d.toString()));
expo.stderr.on('data', (d) => (expoLog += d.toString()));
let proxy = null;
let browser = null;
let page = null;

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

async function cleanup(code) {
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
  log(`starting expo on :${EXPO_PORT} (CI mode)…`);
  await waitForHttp(EXPO_PORT, { timeoutMs: 180_000 });
  proxy = await startHeadersProxy({ targetPort: EXPO_PORT, listenPort: PROXY_PORT });
  log(`proxy on :${PROXY_PORT}, launching chromium…`);

  browser = await chromium.launch({
    headless: !headed,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 }, // phone-ish: the app is mobile-first
  });
  page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    consoleAll.push(`[${msg.type()}] ${text}`);
    if (msg.type() !== 'error') return;
    if (IGNORED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
    consoleErrors.push(text);
    console.error(`[smoke] console error: ${text}`);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
    console.error(`[smoke] page error: ${error}`);
  });

  // --- First load: seed deterministic demo data, then wait for the app. ---
  const url = `http://127.0.0.1:${PROXY_PORT}/?seed=force`;
  log(`navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('tab-calendar').waitFor({ state: 'visible', timeout: 180_000 });
  log('app shell rendered');

  const isolated = await page.evaluate(() => self.crossOriginIsolated);
  if (!isolated) {
    failures.push('self.crossOriginIsolated is false — SQLite on web will not work');
  } else {
    log('crossOriginIsolated = true (SQLite web storage available)');
  }

  // Seed should have populated the database; wait until the calendar knows.
  await page.getByTestId('calendar-month-label').waitFor({ state: 'visible', timeout: 30_000 });
  await page.screenshot({ path: shot('01-calendar'), fullPage: true });

  // Watermark: sample a period day from the current month if one exists.
  const today = new Date();
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const periodCell = page.locator(`[data-testid^="calendar-day-${monthPrefix}-"]`);

  // --- Track flow: toggle period, pick flow/symptom/mood, save, dismiss dialog. ---
  await page.getByTestId('tab-track').click();
  await page.getByTestId('track-save-button').waitFor({ state: 'visible', timeout: 30_000 });
  // Seeded data must be readable from the DB by now.
  await page.getByTestId('track-has-data').waitFor({ state: 'visible', timeout: 15_000 });

  const periodToggle = page.getByTestId('track-period-toggle');
  const periodText = (await periodToggle.textContent()) ?? '';
  if (periodText.includes('No Period')) {
    await periodToggle.click();
  }
  await page.getByTestId('track-flow-medium').click();
  await page.getByTestId('track-symptom-cramps').click();
  await page.getByTestId('track-mood-calm').click();
  await page.screenshot({ path: shot('02-track-filled'), fullPage: true });

  await page.getByTestId('track-save-button').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('03-track-saved-dialog'), fullPage: true });
  await page.getByTestId('dialog-button-ok').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  log('track save flow OK');

  // --- Calendar modal flow. ---
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('calendar-month-label').waitFor({ state: 'visible', timeout: 15_000 });
  const sampleDay = `${monthPrefix}-15`;
  await page.getByTestId(`calendar-day-${sampleDay}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('04-calendar-day-modal'), fullPage: true });
  await page.getByTestId('day-modal-close').click();
  log('calendar day modal flow OK');

  // --- Insights: seeded data must produce non-trivial stats. ---
  await page.getByTestId('tab-insights').click();
  await page.getByTestId('insights-total-periods').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="insights-total-periods"]');
      return el && Number(el.textContent) >= 3;
    },
    { timeout: 20_000 }
  );
  const totalPeriods = Number(await page.getByTestId('insights-total-periods').textContent());
  const avgCycle = Number(await page.getByTestId('insights-avg-cycle').textContent());
  log(`insights: totalPeriods=${totalPeriods} avgCycle=${avgCycle}`);
  if (!(avgCycle >= 20 && avgCycle <= 40)) {
    failures.push(`insights avg cycle out of expected range: ${avgCycle}`);
  }
  await page.screenshot({ path: shot('05-insights'), fullPage: true });

  // --- Settings: dev tools, theme toggle, export button present. ---
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-export').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('settings-dev-seed').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('06-settings'), fullPage: true });

  // --- Verify seeded data survives a reload (persistence through the DB). ---
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('tab-track').click();
  await page.getByTestId('track-has-data').waitFor({ state: 'visible', timeout: 30_000 });
  log('persistence after reload OK');

  if (periodCell) {
    const count = await periodCell.count();
    if (count === 0) {
      // Not a failure: the seeded month may simply have no period days.
      log('note: no period days sampled in current month');
    }
  }
} catch (error) {
  failures.push(`smoke run threw: ${error.message}`);
  console.error(expoLog.split('\n').slice(-25).join('\n'));
  // Rich diagnostics for the agent looking at a failed run.
  try {
    if (page) {
      const bodyText = await Promise.race([
        page.locator('body').innerText(),
        new Promise((resolve) => setTimeout(() => resolve('<body text unavailable>'), 5000)),
      ]);
      const dump = [
        `URL: ${page.url()}`,
        '',
        '--- console (all) ---',
        ...consoleAll,
        '',
        '--- body text ---',
        bodyText,
      ].join('\n');
      fs.writeFileSync(path.join(ROOT, 'artifacts', 'smoke-failure.txt'), dump);
      console.error('[smoke] wrote artifacts/smoke-failure.txt');
    }
  } catch (dumpError) {
    console.error('[smoke] failed to write failure dump:', dumpError.message);
  }
} finally {
  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'artifacts', 'expo.log'), expoLog);

  const summary = {
    failures,
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    screenshots: fs.existsSync(SHOT_DIR)
      ? fs.readdirSync(SHOT_DIR).map((f) => `artifacts/screenshots/${f}`)
      : [],
  };
  console.log('\n[smoke] ===== summary =====');
  console.log(JSON.stringify(summary, null, 2));

  if (pageErrors.length > 0) failures.push(`${pageErrors.length} page error(s)`);
  if (!allowConsoleErrors && consoleErrors.length > 0) {
    failures.push(`${consoleErrors.length} console error(s)`);
  }

  if (failures.length > 0) {
    console.error('\n[smoke] FAILED');
    for (const f of failures) console.error(` - ${f}`);
    await cleanup(1);
  } else {
    log('all checks passed');
    await cleanup(0);
  }
}
