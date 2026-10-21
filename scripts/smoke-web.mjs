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

  // The seeded data must produce a fertility forecast card with predictions.
  await page.getByTestId('calendar-fertility-card').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('calendar-next-ovulation').waitFor({ state: 'visible', timeout: 15_000 });

  // Watermark: sample a period day from the current month if one exists.
  const today = new Date();
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const periodCell = page.locator(`[data-testid^="calendar-day-${monthPrefix}-"]`);

  // The today marker must render even when today also carries other state
  // fills (the seeded data usually makes today a recorded period day), and the
  // current month spells today out in the caption under the month title.
  const todayKey = `${monthPrefix}-${String(today.getDate()).padStart(2, '0')}`;
  await page
    .getByTestId(`calendar-today-${todayKey}`)
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('calendar-today-caption').waitFor({ state: 'visible', timeout: 15_000 });
  log('calendar: today marker and caption rendered');

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
  await page.getByTestId('track-flow-medium').click();
  await page.getByTestId('track-symptom-cramps').click();

  // Mood picker (Mix 1): overall face + strength chips auto-save on every tap.
  // Pick values that differ from the seeded day so the assertions are exact.
  const moodBefore = await page.evaluate(async () => {
    const dateKey = __privatecycle.DataService.formatDateKey(new Date());
    const data = await __privatecycle.DataService.getTodayData(dateKey);
    return {
      valence: data?.moodValence ?? 0,
      tags: (data?.moodTags ?? []).map((tag) => tag.id),
    };
  });
  const targetValence = moodBefore.valence === 4 ? 5 : 4;
  const pool = ['happy', 'calm', 'energetic', 'tired', 'low', 'anxious', 'irritable', 'overwhelmed'];
  const targetTag = pool.find((id) => !moodBefore.tags.includes(id));
  if (!targetTag) {
    failures.push('smoke setup: no unused mood tag available');
  }
  await page.getByTestId(`mood-valence-${targetValence}`).click();
  await page.getByTestId(`mood-tag-${targetTag}`).click();
  await page.getByTestId(`mood-tag-${targetTag}`).click(); // strength -> 2
  await page.getByTestId('mood-saved').waitFor({ state: 'visible', timeout: 15_000 });

  const ovulationToggle = page.getByTestId('track-ovulation-toggle');
  const ovulationText = (await ovulationToggle.textContent()) ?? '';
  if (ovulationText.includes('No Ovulation')) {
    await ovulationToggle.click();
  }

  // Clicking lower cards auto-scrolls the Track screen down; bring the top
  // back into view so the screenshot shows the mood picker.
  await page.getByTestId('track-date-card').scrollIntoViewIfNeeded();
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
  await page.getByTestId('day-modal-ovulation-toggle').waitFor({ state: 'visible', timeout: 15_000 });

  // Mood in the day modal is the same auto-saving picker as Track.
  await page.getByTestId('day-modal-mood-tag-calm').click();
  await page.getByTestId('day-modal-mood-saved').waitFor({ state: 'visible', timeout: 15_000 });
  // The modal slides in from the bottom; let the animation finish so the
  // screenshot actually captures the sheet.
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('04-calendar-day-modal') });
  await page.getByTestId('day-modal-close').click();

  const modalMoodTags = await page.evaluate(async (dateKey) => {
    const data = await __privatecycle.DataService.getTodayData(dateKey);
    return (data?.moodTags ?? []).map((tag) => tag.id);
  }, sampleDay);
  if (!modalMoodTags.includes('calm')) {
    failures.push(
      `day-modal mood auto-save did not persist (tags: ${JSON.stringify(modalMoodTags)})`
    );
  }

  const recordedOvulationCount = await page
    .locator('[data-testid^="calendar-ovulation-recorded-"]')
    .count();
  log(`calendar: recorded ovulation marks this month = ${recordedOvulationCount}`);
  if (recordedOvulationCount === 0) {
    failures.push('expected at least one recorded ovulation mark in the current month');
  }
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
  await page.getByTestId('insights-fertility-card').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('insights-next-ovulation').waitFor({ state: 'visible', timeout: 15_000 });

  // Mood & Cycle: seeded valence/tags must produce the trend and phase rows.
  await page.getByTestId('insights-mood-trend').waitFor({ state: 'visible', timeout: 15_000 });
  const moodPhaseRows = await page.locator('[data-testid^="insights-mood-phase-"]').count();
  log(`insights: mood phase rows = ${moodPhaseRows}`);
  if (moodPhaseRows < 2) {
    failures.push(`expected at least 2 mood phase rows, got ${moodPhaseRows}`);
  }

  await page.getByTestId('insights-phase-tips-card').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('insights-current-phase-badge').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('insights-phase-tab-follicular').click();
  await page.waitForTimeout(200);
  const follicularTitle = await page.getByTestId('insights-phase-summary-title').textContent();
  if (follicularTitle !== 'Follicular Phase') {
    failures.push(`phase selector did not switch to follicular (got "${follicularTitle}")`);
  }
  await page.getByTestId('insights-phase-tab-menstrual').click();
  await page.waitForTimeout(200);

  await page.getByTestId('insights-symptom-patterns-card').waitFor({ state: 'visible', timeout: 15_000 });
  const symptomRows = await page.locator('[data-testid^="insights-symptom-row-"]').count();
  log(`insights: symptom pattern rows = ${symptomRows}`);
  if (symptomRows < 2) {
    failures.push(`expected at least 2 symptom pattern rows, got ${symptomRows}`);
  }
  const crampRate = (await page.getByTestId('insights-symptom-rate-cramps').textContent())?.trim();
  if (!crampRate || !/^\d+%$/.test(crampRate)) {
    failures.push(`cramps rate missing or malformed: "${crampRate}"`);
  }
  const crampSegments = await page.locator('[data-testid^="insights-symptom-segment-cramps-"]').count();
  if (crampSegments < 1) {
    failures.push('cramps phase bar has no phase segments');
  }

  // The app scrolls inside a fixed-height ScrollView, so a fullPage capture
  // only sees the top. A taller viewport renders the whole Insights screen.
  await page.setViewportSize({ width: 420, height: 2300 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('05-insights'), fullPage: true });
  await page.setViewportSize({ width: 420, height: 900 });

  // --- Settings: dev tools, theme toggle, export button present. ---
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-export').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('settings-dev-seed').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('06-settings'), fullPage: true });

  // --- Verify seeded data survives a reload (persistence through the DB). ---
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('tab-track').click();
  await page.getByTestId('track-has-data').waitFor({ state: 'visible', timeout: 30_000 });

  const persistedOvulation = (await page.getByTestId('track-ovulation-toggle').textContent()) ?? '';
  if (!persistedOvulation.includes('Ovulation Day')) {
    failures.push(`ovulation flag did not persist across reload: "${persistedOvulation}"`);
  }
  log('persistence after reload OK');

  // Mood auto-save must survive the reload: valence, tag strength and the
  // legacy mood mirror (first tag id) all intact.
  const savedMood = await page.evaluate(async () => {
    const dateKey = __privatecycle.DataService.formatDateKey(new Date());
    const data = await __privatecycle.DataService.getTodayData(dateKey);
    return data
      ? { valence: data.moodValence, mood: data.mood, tags: data.moodTags ?? [] }
      : null;
  });
  if (!savedMood) {
    failures.push('mood persistence: no data for today after reload');
  } else {
    if (savedMood.valence !== targetValence) {
      failures.push(`mood persistence: expected valence ${targetValence}, got ${savedMood.valence}`);
    }
    const persistedTag = savedMood.tags.find((tag) => tag.id === targetTag);
    if (!persistedTag || persistedTag.level !== 2) {
      failures.push(
        `mood persistence: expected ${targetTag} at level 2, got ${JSON.stringify(savedMood.tags)}`
      );
    }
    if (savedMood.tags.length > 0 && savedMood.mood !== savedMood.tags[0].id) {
      failures.push('mood persistence: legacy mood column does not mirror the first tag');
    }
    log(`mood persistence OK: valence=${savedMood.valence} tags=${JSON.stringify(savedMood.tags)}`);
  }

  if (periodCell) {
    const count = await periodCell.count();
    if (count === 0) {
      // Not a failure: the seeded month may simply have no period days.
      log('note: no period days sampled in current month');
    }
  }

  // --- Clearing a day's data must remove its row and its day mark. ---
  // A day in the next month has no seeded data, so it starts clean. Prefer a
  // day outside predicted period spans so the grey "No Period" mark is
  // actually visible when the day has data.
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('calendar-next-month').click();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthLabel =
    `${nextMonth.toLocaleDateString('en-US', { month: 'long' })} ${nextMonth.getFullYear()}`;
  await page.waitForFunction(
    (label) =>
      document.querySelector('[data-testid="calendar-month-label"]')?.textContent === label,
    nextMonthLabel,
    { timeout: 15_000 }
  );

  const pad = (n) => String(n).padStart(2, '0');
  const predictedKeys = new Set();
  const forecast = await page.evaluate(() => __privatecycle.DataService.getFertilityForecast());
  for (const start of forecast.futurePeriodStarts) {
    const startDate = new Date(`${start}T12:00:00`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      predictedKeys.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
  }
  const monthKey = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}`;
  let clearedKey = `${monthKey}-10`;
  for (let day = 1; day <= 28; day++) {
    const candidate = `${monthKey}-${pad(day)}`;
    if (!predictedKeys.has(candidate)) {
      clearedKey = candidate;
      break;
    }
  }

  const clearedCell = page.getByTestId(`calendar-day-${clearedKey}`);
  const dayRow = () =>
    page.evaluate(async (key) => {
      const all = await __privatecycle.DataService.getAllDailyData();
      return all[key] ?? null;
    }, clearedKey);
  const cellBackground = () =>
    clearedCell.evaluate((el) => getComputedStyle(el).backgroundColor);

  const backgroundBefore = await cellBackground();

  // Enter a symptom and save: the day must now have a row.
  await clearedCell.click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('day-modal-symptom-cramps').click();
  await page.getByTestId('day-modal-save').click();
  await page.getByTestId('dialog-button-ok').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  const enteredRow = await dayRow();
  if (!enteredRow || !enteredRow.symptoms.includes('cramps')) {
    failures.push(`clearing flow: saved day has no row with the symptom (${clearedKey})`);
  }
  const backgroundMarked = await cellBackground();
  if (backgroundMarked === backgroundBefore) {
    failures.push(
      `clearing flow: day with data shows no calendar mark (${backgroundBefore} unchanged)`
    );
  }
  // Let the day-modal slide-out animation finish before capturing.
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('07-calendar-day-marked'), fullPage: true });

  // Clear the symptom and save: the row and the day mark must disappear.
  await clearedCell.click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('day-modal-symptom-cramps').click();
  await page.getByTestId('day-modal-save').click();
  await page.getByTestId('dialog-button-ok').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  const leftoverRow = await dayRow();
  if (leftoverRow) {
    failures.push(`clearing flow: empty day row still in the DB: ${JSON.stringify(leftoverRow)}`);
  }
  const backgroundCleared = await cellBackground();
  if (backgroundCleared !== backgroundBefore) {
    failures.push(
      `clearing flow: day mark did not return to its clean state ` +
        `(${backgroundBefore} -> ${backgroundCleared})`
    );
  }
  // Let the day-modal slide-out animation finish before capturing.
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('08-calendar-day-cleared'), fullPage: true });
  log(
    `calendar clearing flow OK (mark ${backgroundBefore} -> ${backgroundMarked} -> ${backgroundCleared})`
  );
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
