#!/usr/bin/env node
// Headless end-to-end smoke test for the web target.
//
// What it does:
//   1. Starts `expo start --web` in CI mode (no watch) and waits for it.
//   2. Starts the COOP/COEP proxy in front of it.
//   3. Launches headless Chromium (Playwright), seeds demo data via ?seed=force,
//      walks the four tabs, exercises the calendar day-modal flow and the
//      Overview/Insights split, and saves screenshots to artifacts/screenshots/.
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

// Keep the directory in sync with this run: stale screenshots from an older
// flow are confusing when reviewing the artifacts.
fs.rmSync(SHOT_DIR, { recursive: true, force: true });

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function shot(name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

// RN ScrollView owns the overflow, so fullPage alone only captures its viewport.
async function fullScreenShot(name, scrollTestID) {
  const viewport = page.viewportSize();
  const scroll = page.getByTestId(scrollTestID);
  try {
    const contentHeight = await scroll.evaluate((element) => {
      element.scrollTop = 0;
      return element.scrollHeight;
    });
    await page.setViewportSize({ width: viewport.width, height: Math.ceil(contentHeight + 200) });
    await page.waitForTimeout(300);
    const clipped = await scroll.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
    if (clipped) throw new Error(`${name}: screenshot would omit scroll content`);
    await page.screenshot({ path: shot(name), fullPage: true });
  } finally {
    await page.setViewportSize(viewport);
  }
}

/**
 * First-run onboarding is a separate browser context so its reset/skip/import
 * state cannot leak into the seeded screenshots and assertions below.
 */
async function runFirstRunChecks(browserInstance) {
  const context = await browserInstance.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const firstRunPage = await context.newPage();

  firstRunPage.on('console', (msg) => {
    const text = msg.text();
    consoleAll.push(`[first-run][${msg.type()}] ${text}`);
    if (msg.type() !== 'error') return;
    if (IGNORED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
    consoleErrors.push(`[first-run] ${text}`);
    console.error(`[smoke] first-run console error: ${text}`);
  });
  firstRunPage.on('pageerror', (error) => {
    pageErrors.push(`[first-run] ${String(error)}`);
    console.error(`[smoke] first-run page error: ${error}`);
  });

  const localKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const now = new Date();
  const targetDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.max(1, now.getDate() - 3)
  );
  const targetKey = localKey(targetDate);
  const backup = {
    version: '1.0.0',
    timestamp: Date.now(),
    data: {
      dailyData: {
        [targetKey]: {
          date: targetKey,
          isPeriod: true,
          flowLevel: 'medium',
          symptoms: [],
          mood: '',
          isOvulation: false,
        },
      },
    },
    metadata: {
      totalDays: 1,
      dateRange: { start: targetKey, end: targetKey },
    },
  };

  const welcome = async () => {
    await firstRunPage.goto(`http://127.0.0.1:${PROXY_PORT}/?reset=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await firstRunPage.getByTestId('first-run-screen').waitFor({ timeout: 120_000 });
    await firstRunPage.waitForTimeout(500);
  };

  const goToStep = async (step) => {
    for (let current = 1; current < step; current += 1) {
      await firstRunPage.getByTestId('first-run-next').click();
      await firstRunPage.waitForTimeout(200);
    }
    await firstRunPage.getByTestId(`first-run-step-${step}`).waitFor({ timeout: 30_000 });
    await firstRunPage.waitForTimeout(200);
  };

  const captureStep = async (step, suffix = '') => {
    await firstRunPage.setViewportSize({ width: 390, height: 844 });
    await firstRunPage.waitForTimeout(250);
    await firstRunPage.screenshot({ path: shot(`00-first-run-step${step}${suffix}`), fullPage: true });
    if (step === 1 && !suffix) {
      await firstRunPage
        .getByTestId('first-run-arc-illustration')
        .screenshot({ path: shot('00-first-run-arc-closeup') });
    }
    await firstRunPage.setViewportSize({ width: 320, height: 844 });
    await firstRunPage.waitForTimeout(250);
    await firstRunPage.screenshot({
      path: shot(`00-first-run-step${step}-320${suffix}`),
      fullPage: true,
    });
    await firstRunPage.setViewportSize({ width: 390, height: 844 });
    await firstRunPage.waitForTimeout(150);
  };

  const checkStep = async (step) => {
    const copy = await firstRunPage.getByTestId('first-run-screen').innerText();
    const checks = {
      1: [
        ['the Tidemark welcome', /Find your/i],
        ['the private tone', /Private by design/i],
      ],
      2: [
        ['the calendar illustration label', /ILLUSTRATION/i],
        ['the last-period guidance', /Start with the first day of your last period/i],
        ['the estimate guidance', /Forecasts are estimates/i],
        ['the medical disclaimer', /not birth control or medical advice/i],
      ],
      3: [
        ['the local-only promise', /No account or cloud sync/i],
        ['the backup recovery guidance', /Keep an exported backup/i],
        ['optional reminders', /Reminders stay off until you choose/i],
      ],
    }[step];
    for (const [name, pattern] of checks) {
      if (!pattern.test(copy)) failures.push(`first-run: step ${step} missing ${name}`);
    }

    const backCount = await firstRunPage.getByTestId('first-run-back').count();
    if (step === 1 && backCount > 0) failures.push('first-run: back is visible on step 1');
    if (step > 1 && backCount === 0) failures.push(`first-run: back missing on step ${step}`);
    if ((await firstRunPage.getByTestId('first-run-skip').count()) !== 1) {
      failures.push(`first-run: skip missing on step ${step}`);
    }
  };

  try {
    await welcome();
    for (const step of [1, 2, 3]) {
      await checkStep(step);
      await captureStep(step);
      if (step < 3) {
        await firstRunPage.getByTestId('first-run-next').click();
        await firstRunPage.waitForTimeout(250);
      }
    }

    // The same three screens in dark mode, at both target widths.
    await firstRunPage.evaluate(() => localStorage.setItem('theme_preference', 'dark'));
    await welcome();
    for (const step of [1, 2, 3]) {
      await captureStep(step, '-dark');
      if (step < 3) {
        await firstRunPage.getByTestId('first-run-next').click();
        await firstRunPage.waitForTimeout(250);
      }
    }
    await firstRunPage.evaluate(() => localStorage.removeItem('theme_preference'));
    await welcome();

    await firstRunPage.getByTestId('first-run-skip').click();
    await firstRunPage.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
    await firstRunPage.getByTestId('calendar-welcome').waitFor({ timeout: 30_000 });
    if (await firstRunPage.getByTestId('first-run-screen').count()) {
      failures.push('first-run: skip did not leave the welcome screen');
    }
    await firstRunPage.reload({ waitUntil: 'domcontentloaded' });
    await firstRunPage.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
    if (await firstRunPage.getByTestId('first-run-screen').count()) {
      failures.push('first-run: skip did not persist across reload');
    }
    await firstRunPage.screenshot({ path: shot('00-first-run-after-skip'), fullPage: true });

    await welcome();
    await goToStep(3);
    await firstRunPage.getByTestId('first-run-start-period').click();
    await firstRunPage.getByTestId('calendar-first-run-banner').waitFor({ timeout: 30_000 });
    await firstRunPage.reload({ waitUntil: 'domcontentloaded' });
    await firstRunPage.getByTestId('calendar-first-run-banner').waitFor({ timeout: 30_000 });
    if (await firstRunPage.getByTestId('first-run-screen').count()) {
      failures.push('first-run: unfinished last-period setup did not resume');
    }
    await firstRunPage.screenshot({ path: shot('00-first-run-banner'), fullPage: true });
    await firstRunPage.getByTestId(`calendar-day-${targetKey}`).click();
    await firstRunPage.getByTestId('day-modal-first-run-hint').waitFor({ timeout: 30_000 });
    const periodToggle = await firstRunPage.getByTestId('day-modal-period-toggle').innerText();
    if (!/Period Day/.test(periodToggle)) {
      failures.push('first-run: guided day sheet did not pre-set Period');
    }
    await firstRunPage.waitForTimeout(400);
    await firstRunPage.screenshot({ path: shot('00-first-run-day-sheet') });
    await firstRunPage.getByTestId('day-modal-save').click();
    await firstRunPage.getByTestId('calendar-first-run-banner').waitFor({ state: 'detached', timeout: 30_000 });
    await firstRunPage.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
    const savedPeriods = await firstRunPage.evaluate(async () => {
      const data = await window.__privatecycle.DataService.getPeriodData();
      return data.periods;
    });
    if (!savedPeriods.includes(targetKey)) {
      failures.push('first-run: guided last-period save did not persist the start date');
    }
    await firstRunPage.reload({ waitUntil: 'domcontentloaded' });
    await firstRunPage.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
    if (await firstRunPage.getByTestId('first-run-screen').count()) {
      failures.push('first-run: completed last-period setup did not persist across reload');
    }
    await firstRunPage.screenshot({ path: shot('00-first-run-saved'), fullPage: true });

    await welcome();
    await goToStep(3);
    await firstRunPage.getByTestId('first-run-import').click();
    const [chooser] = await Promise.all([
      firstRunPage.waitForEvent('filechooser', { timeout: 30_000 }),
      firstRunPage.getByText('Import', { exact: true }).click(),
    ]);
    await chooser.setFiles({
      name: 'cycle_backup_smoke.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await firstRunPage.getByText('Backup imported').waitFor({ timeout: 30_000 });
    await firstRunPage.getByText('OK', { exact: true }).click();
    await firstRunPage.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
    const importedPeriods = await firstRunPage.evaluate(async () => {
      const data = await window.__privatecycle.DataService.getPeriodData();
      return data.periods;
    });
    if (!importedPeriods.includes(targetKey)) {
      failures.push('first-run: imported backup did not restore the period start');
    }
    if (await firstRunPage.getByTestId('first-run-screen').count()) {
      failures.push('first-run: import did not leave the welcome screen');
    }
    await firstRunPage.screenshot({ path: shot('00-first-run-imported'), fullPage: true });

    log('first-run: welcome, skip/relaunch, guided period and import OK');
  } catch (error) {
    failures.push(`first-run checks threw: ${error}`);
    try {
      await firstRunPage.screenshot({ path: shot('00-first-run-failure'), fullPage: true });
    } catch {}
  } finally {
    await context.close();
  }
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
  await runFirstRunChecks(browser);

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // phone-ish: matches the design boards
    deviceScaleFactor: 2,
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
  await page.setViewportSize({ width: 390, height: 1250 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('01-calendar'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  // The seeded data must produce a fertility forecast card with predictions.
  await page.getByTestId('calendar-fertility-card').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('calendar-next-ovulation').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('calendar-fertile-window').waitFor({ state: 'visible', timeout: 15_000 });

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
  const currentMonthLabel = await page.getByTestId('calendar-month-label').textContent();
  await page.getByTestId('calendar-prev-month').click();
  await page.getByTestId('calendar-return-today').waitFor();
  await page.waitForTimeout(350);
  await page.getByTestId('calendar-return-today').click();
  await page.waitForFunction(label => document.querySelector('[data-testid="calendar-month-label"]')?.textContent === label, currentMonthLabel);
  log('calendar: month navigation and return to today passed');

  // --- Overview: the read-only trends tab. ---
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-meta').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('overview-symptom-patterns-card').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('overview-cycle-chart').waitFor({ state: 'visible', timeout: 15_000 });

  const overviewData = await page.evaluate(() => __privatecycle.DataService.getInsights());
  if (overviewData.periodStarts.length < 3) {
    failures.push(
      `overview: expected at least 3 period starts, got ${overviewData.periodStarts.length}`
    );
  }
  if (
    overviewData.periodLength?.basis !== 'recorded' ||
    !(overviewData.periodLength.predictionDays >= 2 && overviewData.periodLength.predictionDays <= 10)
  ) {
    failures.push(
      `overview period length not learned: ${JSON.stringify(overviewData.periodLength)}`
    );
  }
  const avgCycle = Number((await page.getByTestId('overview-avg-cycle').textContent())?.trim());
  log(`overview: periods=${overviewData.periodStarts.length} avgCycle=${avgCycle}`);
  if (!(avgCycle >= 20 && avgCycle <= 40)) {
    failures.push(`overview avg cycle out of expected range: ${avgCycle}`);
  }
  await page.getByTestId('overview-cycle-variation').waitFor({ state: 'visible', timeout: 15_000 });
  const regularity = (await page.getByTestId('overview-cycle-regularity').textContent())?.trim();
  if (!['Regular', 'Variable'].includes(regularity ?? '')) {
    failures.push(`overview regularity missing or malformed: "${regularity}"`);
  }
  const typicalPeriod = Number((await page.getByTestId('overview-typical-period').textContent())?.trim());
  if (!(typicalPeriod >= 2 && typicalPeriod <= 10)) {
    failures.push(`overview typical period out of expected range: ${typicalPeriod}`);
  }
  const periodBasisCopy = (await page.getByTestId('overview-period-basis').textContent())?.trim();
  if (!periodBasisCopy?.includes('median of your last')) {
    failures.push(`overview period basis missing: "${periodBasisCopy}"`);
  }

  await page.getByTestId('overview-mood-trend').waitFor({ state: 'visible', timeout: 15_000 });
  const moodPhaseRows = await page.locator('[data-testid^="overview-mood-phase-"]').count();
  log(`overview: mood phase rows = ${moodPhaseRows}`);
  if (moodPhaseRows < 2) {
    failures.push(`expected at least 2 mood phase rows, got ${moodPhaseRows}`);
  }

  const symptomRows = await page.locator('[data-testid^="overview-symptom-row-"]').count();
  log(`overview: symptom rows = ${symptomRows}`);
  if (symptomRows < 2) {
    failures.push(`expected at least 2 symptom pattern rows, got ${symptomRows}`);
  }
  const crampRate = (await page.getByTestId('overview-symptom-rate-cramps').textContent())?.trim();
  if (!crampRate || !/^\d+%$/.test(crampRate)) {
    failures.push(`cramps rate missing or malformed: "${crampRate}"`);
  }
  const crampSegments = await page.locator('[data-testid^="overview-symptom-segment-cramps-"]').count();
  if (crampSegments < 1) {
    failures.push('cramps phase bar has no phase segments');
  }

  await page.getByTestId('overview-cycle-hero').scrollIntoViewIfNeeded();
  await fullScreenShot('02-overview', 'overview-scroll');

  // --- Insights: today + patterns + tips, not the raw charts. ---
  await page.getByTestId('tab-insights').click();
  await page.getByTestId('insights-today-card').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('insights-current-phase-badge').waitFor({ state: 'visible', timeout: 15_000 });
  const phaseBadge = (await page.getByTestId('insights-current-phase-badge').textContent())?.trim();
  if (!phaseBadge || !/(ESTIMATED|PHASE UNCERTAIN)/.test(phaseBadge)) {
    failures.push(`insights phase badge is not marked as estimated: "${phaseBadge}"`);
  }
  await page.getByTestId('insights-today-focus').waitFor({ state: 'visible', timeout: 15_000 });

  const patternCards = await page.locator('[data-testid^="insights-pattern-"]').count();
  log(`insights: pattern cards = ${patternCards}`);
  if (patternCards < 1) {
    failures.push(`expected at least 1 pattern card, got ${patternCards}`);
  }
  const todayTips = await page.getByTestId('insights-today-tips').count();
  log(`insights: Today tips block = ${todayTips === 1 ? 'present' : 'not present'}`);
  if (todayTips !== 1) {
    failures.push("Insights Today card is missing today's tips");
  }
  const todayTipRows = await page.locator('[data-testid^="insights-today-tip-"]').count();
  if (todayTipRows < 1) {
    failures.push(`expected at least 1 Today tip, got ${todayTipRows}`);
  }

  await page.getByTestId('insights-phase-tips-card').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('insights-phase-tab-follicular').click();
  await page.waitForTimeout(200);
  const follicularTitle = await page.getByTestId('insights-phase-summary-title').textContent();
  if (follicularTitle !== 'Follicular Phase') {
    failures.push(`phase selector did not switch to follicular (got "${follicularTitle}")`);
  }
  const dayRange = (await page.getByTestId('insights-phase-day-range').textContent())?.trim();
  if (!dayRange || !/^(Day|Days) /.test(dayRange)) {
    failures.push(`insights phase day range is not derived: "${dayRange}"`);
  }
  await page.getByTestId('insights-phase-estimate-note').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('insights-phase-tab-menstrual').click();
  await page.waitForTimeout(200);
  const phaseTips = await page.locator('[data-testid^="insights-phase-tip-"]').count();
  if (phaseTips !== 4) {
    failures.push(`expected 4 phase tips, got ${phaseTips}`);
  }

  // The raw metrics must not be duplicated on Insights anymore.
  for (const movedTestId of [
    'insights-avg-cycle',
    'insights-mood-trend',
    'insights-symptom-patterns-card',
  ]) {
    if ((await page.getByTestId(movedTestId).count()) > 0) {
      failures.push(`Insights still renders moved metric: ${movedTestId}`);
    }
  }

  await page.getByTestId('insights-today-card').scrollIntoViewIfNeeded();
  await fullScreenShot('03-insights', 'insights-scroll');

  // --- Calendar day modal: the only daily-entry path. ---
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('calendar-month-label').waitFor({ state: 'visible', timeout: 15_000 });
  const sampleDay = todayKey;
  const sampleBefore = await page.evaluate(async (dateKey) => {
    const data = await __privatecycle.DataService.getTodayData(dateKey);
    return data
      ? {
          isPeriod: data.isPeriod,
          flowLevel: data.flowLevel,
          symptoms: data.symptoms,
          isOvulation: data.isOvulation,
          valence: data.moodValence ?? 0,
          tags: (data.moodTags ?? []).map((tag) => tag.id),
        }
      : null;
  }, sampleDay);

  await page.getByTestId(`calendar-day-${sampleDay}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });

  const modalPeriodToggle = page.getByTestId('day-modal-period-toggle');
  const modalPeriodText = (await modalPeriodToggle.textContent()) ?? '';
  if (modalPeriodText.includes('No Period')) {
    await modalPeriodToggle.click();
  }
  if (await page.getByTestId('day-modal-flow-medium').getAttribute('aria-checked') !== 'true') {
    await page.getByTestId('day-modal-flow-medium').click();
  }
  if (!(sampleBefore?.symptoms ?? []).includes('cramps')) {
    await page.getByTestId('day-modal-symptom-cramps').click();
  }
  const modalOvulationToggle = page.getByTestId('day-modal-ovulation-toggle');
  const modalOvulationText = (await modalOvulationToggle.textContent()) ?? '';
  if (modalOvulationText.includes('No Ovulation')) {
    await modalOvulationToggle.click();
  }

  // Mood auto-saves inside the modal; pick values that differ from the day.
  const targetValence = sampleBefore?.valence === 4 ? 5 : 4;
  const pool = ['happy', 'calm', 'energetic', 'tired', 'low', 'anxious', 'irritable', 'overwhelmed'];
  const targetTag = pool.find((id) => !(sampleBefore?.tags ?? []).includes(id));
  if (!targetTag) {
    failures.push('smoke setup: no unused mood tag available');
  }
  await page.getByTestId(`day-modal-mood-valence-${targetValence}`).click();
  await page.getByTestId(`day-modal-mood-tag-${targetTag}`).click();
  await page.getByTestId(`day-modal-mood-tag-${targetTag}`).click(); // strength -> 2
  await page.getByTestId('day-modal-mood-saved').waitFor({ state: 'visible', timeout: 15_000 });

  // Bring the mood picker back into view for the screenshot.
  await page.getByTestId('day-modal').evaluate((el) => {
    const scrollable = Array.from(el.querySelectorAll('*')).find(
      (node) => node.scrollHeight > node.clientHeight
    );
    scrollable?.scrollTo?.({ top: 0 });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('04-calendar-filled') });

  await page.getByTestId('day-modal-save').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('05-calendar-saved-dialog'), fullPage: true });
  await page.getByTestId('dialog-button-ok').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });

  const sampleAfter = await page.evaluate(async (dateKey) => {
    const data = await __privatecycle.DataService.getTodayData(dateKey);
    return data
      ? {
          isPeriod: data.isPeriod,
          flowLevel: data.flowLevel,
          symptoms: data.symptoms,
          isOvulation: data.isOvulation,
          valence: data.moodValence ?? 0,
          tags: data.moodTags ?? [],
        }
      : null;
  }, sampleDay);
  if (!sampleAfter?.isPeriod) failures.push('calendar entry: period flag did not save');
  if (sampleAfter?.flowLevel !== 'medium') {
    failures.push(`calendar entry: flow=${sampleAfter?.flowLevel}`);
  }
  if (!sampleAfter?.symptoms.includes('cramps')) {
    failures.push('calendar entry: cramps did not save');
  }
  if (!sampleAfter?.isOvulation) failures.push('calendar entry: ovulation flag did not save');
  if (sampleAfter?.valence !== targetValence) {
    failures.push(`calendar entry: valence=${sampleAfter?.valence}`);
  }
  const savedTag = sampleAfter?.tags.find((tag) => tag.id === targetTag);
  if (!savedTag || savedTag.level !== 2) {
    failures.push(`calendar entry: mood tag not at level 2 (${JSON.stringify(sampleAfter?.tags)})`);
  }
  await page.waitForTimeout(400);
  const recordedOvulationCount = await page
    .locator('[data-testid^="calendar-ovulation-recorded-"]')
    .count();
  log(`calendar: recorded ovulation marks this month = ${recordedOvulationCount}`);
  if (recordedOvulationCount === 0) {
    failures.push('expected at least one recorded ovulation mark in the current month');
  }
  log('calendar day-modal entry flow OK');

  // --- Settings: dev tools, theme toggle, export button present. ---
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-export').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('settings-dev-seed').waitFor({ state: 'visible', timeout: 15_000 });
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('06-settings'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  // --- Notifications: native-only feature shows an honest web notice. ---
  await page.getByTestId('settings-notifications').click();
  await page.getByTestId('notifications-web-notice').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await page.screenshot({ path: shot('06b-notifications-web'), fullPage: true });
  await page.getByTestId('notifications-back').click();
  await page.getByTestId('settings-export').waitFor({ state: 'visible', timeout: 15_000 });
  log('notifications web notice OK');

  // --- Verify seeded data survives a reload (persistence through the DB). ---
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-meta').waitFor({ state: 'visible', timeout: 30_000 });

  const persistedSample = await page.evaluate(async (dateKey) => {
    const data = await __privatecycle.DataService.getTodayData(dateKey);
    return data
      ? {
          isPeriod: data.isPeriod,
          flowLevel: data.flowLevel,
          symptoms: data.symptoms,
          isOvulation: data.isOvulation,
          mood: data.mood,
          valence: data.moodValence ?? 0,
          tags: data.moodTags ?? [],
        }
      : null;
  }, sampleDay);
  if (!persistedSample) {
    failures.push('calendar persistence: no data for the saved sample day after reload');
  } else {
    if (!persistedSample.isPeriod) failures.push('calendar persistence: period flag missing');
    if (persistedSample.flowLevel !== 'medium') {
      failures.push(`calendar persistence: flow=${persistedSample.flowLevel}`);
    }
    if (!persistedSample.symptoms.includes('cramps')) {
      failures.push('calendar persistence: cramps missing');
    }
    if (!persistedSample.isOvulation) failures.push('calendar persistence: ovulation flag missing');
    if (persistedSample.valence !== targetValence) {
      failures.push(
        `mood persistence: expected valence ${targetValence}, got ${persistedSample.valence}`
      );
    }
    const persistedTag = persistedSample.tags.find((tag) => tag.id === targetTag);
    if (!persistedTag || persistedTag.level !== 2) {
      failures.push(
        `mood persistence: expected ${targetTag} at level 2, got ${JSON.stringify(
          persistedSample.tags
        )}`
      );
    }
    if (persistedSample.tags.length > 0 && persistedSample.mood !== persistedSample.tags[0].id) {
      failures.push('mood persistence: legacy mood column does not mirror the first tag');
    }
    log(
      `calendar persistence OK: period/ovulation/symptoms + mood valence=${persistedSample.valence}`
    );
  }

  if (periodCell) {
    const count = await periodCell.count();
    if (count === 0) {
      // Not a failure: the seeded month may simply have no period days.
      log('note: no period days sampled in current month');
    }
  }

  // --- Future days are view-only: tapping one must not open the entry modal. ---
  const pad = (n) => String(n).padStart(2, '0');
  const monthLabel = (date) =>
    `${date.toLocaleDateString('en-US', { month: 'long' })} ${date.getFullYear()}`;
  const waitForMonth = async (date) => {
    await page.waitForFunction(
      (label) =>
        document.querySelector('[data-testid="calendar-month-label"]')?.textContent === label,
      monthLabel(date),
      { timeout: 15_000 }
    );
    // navigateMonth ignores taps while its slide animation is running.
    await page.waitForTimeout(150);
  };

  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('calendar-next-month').click();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  await waitForMonth(nextMonth);

  const futureKey = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`;
  await page.getByTestId(`calendar-day-${futureKey}`).click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  const futureDialogTitle = (await page.getByTestId('dialog-title').textContent())?.trim();
  if (futureDialogTitle !== 'Future date') {
    failures.push(`future day dialog title: expected "Future date", got "${futureDialogTitle}"`);
  }
  await page.getByTestId('dialog-button-ok').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  const dayModalOpened = await page.getByTestId('day-modal').isVisible().catch(() => false);
  if (dayModalOpened) {
    failures.push('future day opened the day entry modal');
  }
  const futureRow = await page.evaluate(async (key) => {
    const all = await __privatecycle.DataService.getAllDailyData();
    return all[key] ?? null;
  }, futureKey);
  if (futureRow) {
    failures.push(`future day has a data row: ${futureKey}`);
  }
  log('calendar: future day entry blocked');

  // --- Clearing a day's data must remove its row and its day mark. ---
  // Five months back is safely before the 126-day seed window, so the day
  // starts clean and has no predicted marks.
  const cleanMonth = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  for (let offset = 0; offset >= -5; offset--) {
    await page.getByTestId('calendar-prev-month').click();
    await waitForMonth(new Date(today.getFullYear(), today.getMonth() + offset, 1));
  }
  const monthKey = `${cleanMonth.getFullYear()}-${pad(cleanMonth.getMonth() + 1)}`;
  const clearedKey = `${monthKey}-10`;

  const clearedCell = page.getByTestId(`calendar-day-${clearedKey}`);
  const dayRow = () =>
    page.evaluate(async (key) => {
      const all = await __privatecycle.DataService.getAllDailyData();
      return all[key] ?? null;
    }, clearedKey);
  const dayMarkCount = () => page.getByTestId(`calendar-day-mark-${clearedKey}`).count();

  const markBefore = await dayMarkCount();

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
  const markMarked = await dayMarkCount();
  if (markMarked === markBefore) {
    failures.push(`clearing flow: day with data shows no calendar mark (${markBefore} unchanged)`);
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
  const markCleared = await dayMarkCount();
  if (markCleared !== markBefore) {
    failures.push(
      `clearing flow: day mark did not return to its clean state ` +
        `(${markBefore} -> ${markCleared})`
    );
  }
  // Let the day-modal slide-out animation finish before capturing.
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('08-calendar-day-cleared'), fullPage: true });
  log(`calendar clearing flow OK (mark ${markBefore} -> ${markMarked} -> ${markCleared})`);

  // --- PRIVATECYC-7 option B: proactive unsaved status + close guard. ---
  const dirtyKey = `${monthKey}-12`;
  const moodKey = `${monthKey}-13`;
  const failedMoodKey = `${monthKey}-14`;
  const rowFor = (key) =>
    page.evaluate(async (dateKey) => {
      const all = await __privatecycle.DataService.getAllDailyData();
      return all[dateKey] ?? null;
    }, key);

  await page.getByTestId(`calendar-day-${dirtyKey}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  if ((await page.getByTestId('day-modal-period-toggle').innerText()).includes('No Period')) {
    await page.getByTestId('day-modal-period-toggle').click();
  }
  await page.getByTestId('day-modal-symptom-cramps').click();
  const footerStatus = await page.getByTestId('day-modal-unsaved-status').innerText();
  if (!footerStatus.includes('Period') || !footerStatus.includes('Symptoms')) {
    failures.push(`unsaved footer did not name the changed groups: "${footerStatus}"`);
  }
  await page.screenshot({ path: shot('33-entry-unsaved-footer-light') });

  await page.getByTestId('day-modal-close').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  if (!(await page.getByTestId('day-modal').isVisible())) {
    failures.push('unsaved guard closed the sheet before asking');
  }
  for (const id of [
    'dialog-button-save-close',
    'dialog-button-keep-editing',
    'dialog-button-discard-changes',
  ]) {
    if (!(await page.getByTestId(id).isVisible())) {
      failures.push(`unsaved guard is missing ${id}`);
    }
  }
  const guardMessage = (await page.getByTestId('dialog-message').innerText()).trim();
  if (!guardMessage.includes("haven't been saved")) {
    failures.push(`unsaved guard message is not truthful: "${guardMessage}"`);
  }

  const focusState = () =>
    page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="dialog"]');
      const active = document.activeElement;
      return {
        inside: Boolean(dialog && active && dialog.contains(active)),
        testId: active?.getAttribute?.('data-testid') ?? null,
      };
    });
  await page.waitForTimeout(150);
  if (!(await focusState()).inside) {
    failures.push('inline guard did not receive keyboard focus');
  }
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Tab');
    if (!(await focusState()).inside) {
      failures.push(`Tab ${index + 1} escaped the inline guard`);
    }
  }
  await page.keyboard.press('Shift+Tab');
  if (!(await focusState()).inside) {
    failures.push('Shift+Tab escaped the inline guard');
  }
  await page.screenshot({ path: shot('34-entry-confirm-dialog-light') });

  await page.keyboard.press('Escape');
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  if (!(await page.getByTestId('day-modal').isVisible())) {
    failures.push('Escape closed the sheet instead of returning to it');
  }
  const focusAfterEscape = await focusState();
  if (focusAfterEscape.testId !== 'day-modal-close') {
    failures.push(`Escape did not return focus to close: ${JSON.stringify(focusAfterEscape)}`);
  }

  await page.getByTestId('day-modal-close').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('dialog-button-keep-editing').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  const focusAfterKeepEditing = await focusState();
  if (focusAfterKeepEditing.testId !== 'day-modal-close') {
    failures.push(
      `Keep editing did not return focus to close: ${JSON.stringify(focusAfterKeepEditing)}`
    );
  }
  if (!(await page.getByTestId('day-modal').isVisible())) {
    failures.push('Keep editing did not return to the open sheet');
  }
  if (!(await page.getByTestId('day-modal-period-toggle').innerText()).includes('Period Day')) {
    failures.push('Keep editing lost the period draft');
  }

  await page.getByTestId('day-modal-close').click();
  await page.getByTestId('dialog-button-discard-changes').click();
  await page.getByTestId('day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  if (await rowFor(dirtyKey)) {
    failures.push('Discard changes still wrote the day row');
  }

  // Returning to the persisted baseline must not prompt at all.
  await page.getByTestId(`calendar-day-${dirtyKey}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('day-modal-period-toggle').click();
  await page.getByTestId('day-modal-period-toggle').click();
  if (await page.getByTestId('day-modal-unsaved-status').count()) {
    failures.push('reverting to the baseline still shows an unsaved status');
  }
  await page.getByTestId('day-modal-close').click();
  await page.getByTestId('day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  if (await page.getByTestId('dialog').isVisible().catch(() => false)) {
    failures.push('reverting to the baseline still opened the close guard');
  }

  // A confirmed mood auto-save alone closes without a prompt.
  await page.getByTestId(`calendar-day-${moodKey}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('day-modal-mood-valence-4').click();
  await page.getByTestId('day-modal-mood-saved').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('day-modal-close').click();
  await page.getByTestId('day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  if (await page.getByTestId('dialog').isVisible().catch(() => false)) {
    failures.push('a saved mood alone still opened the close guard');
  }
  const savedMoodRow = await rowFor(moodKey);
  if (savedMoodRow?.moodValence !== 4) {
    failures.push(`saved mood alone was not persisted: ${JSON.stringify(savedMoodRow)}`);
  }

  // A failed mood auto-save keeps its draft, is never labelled saved, and can
  // be retried through Save & close.
  await page.getByTestId(`calendar-day-${failedMoodKey}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(() => {
    window.__originalMoodSave = __privatecycle.DataService.saveMoodData;
    __privatecycle.DataService.saveMoodData = async () => {
      throw new Error('Simulated mood write failure');
    };
  });
  await page.getByTestId('day-modal-mood-valence-5').click();
  await page.getByText('Mood could not be saved. Tap Save day to try again.').waitFor();
  const failedMoodStatus = await page.getByTestId('day-modal-unsaved-status').innerText();
  if (!failedMoodStatus.includes('Mood not saved')) {
    failures.push(`failed mood status is not truthful: "${failedMoodStatus}"`);
  }
  await page.getByTestId('day-modal-close').click();
  const failedMoodMessage = (await page.getByTestId('dialog-message').innerText()).trim();
  if (!failedMoodMessage.includes("mood change hasn't been saved")) {
    failures.push(`failed mood guard message is not truthful: "${failedMoodMessage}"`);
  }
  await page.evaluate(() => {
    __privatecycle.DataService.saveMoodData = window.__originalMoodSave;
  });
  await page.getByTestId('dialog-button-save-close').click();
  await page.getByTestId('day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('dialog-button-ok').click();
  const retriedMoodRow = await rowFor(failedMoodKey);
  if (retriedMoodRow?.moodValence !== 5) {
    failures.push(`retried mood draft was not saved: ${JSON.stringify(retriedMoodRow)}`);
  }
  log('calendar: proactive unsaved status and three-action close guard OK');

  // --- Private calendar: PIN setup, save, lock, wrong PIN, reload guard. ---
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-private-calendar').waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  // Deterministic start: the browser context is fresh, but a previous run in
  // the same context could have left a PIN or private entries behind.
  await page.evaluate(async () => {
    await __privatecycle.PrivateAccessService.reset();
    await __privatecycle.DataService.clearIntimateData();
  });

  await page.getByTestId('settings-private-calendar').click();
  await page.getByTestId('private-pin-setup-input').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await page.screenshot({ path: shot('09-private-setup'), fullPage: true });
  await page.getByTestId('private-pin-setup-input').fill('1234');
  await page.getByTestId('private-pin-setup-confirm').fill('1234');
  await page.getByTestId('private-pin-setup-submit').click();
  await page.getByTestId('private-calendar').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId(`private-day-${todayKey}`).waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  await page.getByTestId(`private-day-${todayKey}`).click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('private-day-activity').click();
  await page.getByTestId('private-protection-protected').click();
  await page.getByTestId('private-note-input').fill('smoke test');
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('10-private-day-modal') });
  await page.getByTestId('private-day-save').click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.getByTestId(`private-day-logged-${todayKey}`).waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  const privateCount = (await page.getByTestId('private-month-count').textContent())?.trim();
  if (privateCount !== '1') {
    failures.push(`private calendar count: expected 1, got ${privateCount}`);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('11-private-calendar'), fullPage: true });

  // Future days are view-only in the private calendar too.
  await page.getByTestId('private-next-month').click();
  const privateNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  await page.waitForFunction(
    (label) =>
      document.querySelector('[data-testid="private-month-label"]')?.textContent === label,
    monthLabel(privateNextMonth),
    { timeout: 15_000 }
  );
  const privateFutureKey =
    `${privateNextMonth.getFullYear()}-${pad(privateNextMonth.getMonth() + 1)}-01`;
  await page.getByTestId(`private-day-${privateFutureKey}`).click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  const privateDialogTitle = (await page.getByTestId('dialog-title').textContent())?.trim();
  if (privateDialogTitle !== 'Future date') {
    failures.push(
      `private future day dialog title: expected "Future date", got "${privateDialogTitle}"`
    );
  }
  await page.getByTestId('dialog-button-ok').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  const privateModalOpened = await page
    .getByTestId('private-day-modal')
    .isVisible()
    .catch(() => false);
  if (privateModalOpened) {
    failures.push('private future day opened the entry modal');
  }
  await page.getByTestId('private-prev-month').click();
  await page.waitForFunction(
    (label) =>
      document.querySelector('[data-testid="private-month-label"]')?.textContent === label,
    monthLabel(new Date(today.getFullYear(), today.getMonth(), 1)),
    { timeout: 15_000 }
  );
  log('private calendar: future day entry blocked');

  await page.getByTestId('private-change-pin').click();
  await page.getByTestId('private-change-pin-modal').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('12-private-change-pin') });
  await page.getByTestId('private-change-pin-close').click();
  await page.getByTestId('private-change-pin-modal').waitFor({
    state: 'hidden',
    timeout: 15_000,
  });

  await page.getByTestId('private-lock').click();
  await page.getByTestId('private-pin-input').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('13-private-locked'), fullPage: true });

  await page.getByTestId('private-pin-input').fill('0000');
  await page.getByTestId('private-pin-unlock').click();
  await page.getByTestId('private-pin-error').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('private-pin-input').fill('1234');
  await page.getByTestId('private-pin-unlock').click();
  await page.getByTestId(`private-day-logged-${todayKey}`).waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  // A direct reload of /private must show the gate, not the calendar.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('private-pin-input').waitFor({ state: 'visible', timeout: 180_000 });
  await page.getByTestId('private-pin-input').fill('1234');
  await page.getByTestId('private-pin-unlock').click();
  await page.getByTestId(`private-day-logged-${todayKey}`).waitFor({
    state: 'visible',
    timeout: 30_000,
  });

  const persistedPrivate = await page.evaluate(async (key) => {
    const all = await __privatecycle.DataService.getIntimateData();
    return all[key] ?? null;
  }, todayKey);
  if (
    !persistedPrivate ||
    persistedPrivate.protection !== 'protected' ||
    persistedPrivate.note !== 'smoke test'
  ) {
    failures.push(
      `private calendar persistence: ${JSON.stringify(persistedPrivate)}`
    );
  }
  log('private calendar flow OK');

  // PRIVATECYC-7 option B on the private sheet: group status, three actions,
  // no note contents, and activity-off as an unsaved removal.
  await page.getByTestId(`private-day-${todayKey}`).click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('private-day-activity').click();
  const privateStatus = await page.getByTestId('private-day-unsaved-status').innerText();
  if (
    !privateStatus.includes('Activity') ||
    !privateStatus.includes('Protection') ||
    !privateStatus.includes('Note')
  ) {
    failures.push(`private unsaved footer did not name the removal: "${privateStatus}"`);
  }
  await page.screenshot({ path: shot('35-private-unsaved-footer-light') });
  await page.getByTestId('private-day-close').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  if (!(await page.getByTestId('private-day-modal').isVisible())) {
    failures.push('private unsaved guard closed the sheet before asking');
  }
  const privateMessage = (await page.getByTestId('dialog-message').innerText()).trim();
  if (!privateMessage.includes('activity, protection and note')) {
    failures.push(`private guard message does not name the groups: "${privateMessage}"`);
  }
  if (privateMessage.includes('smoke test')) {
    failures.push('private guard message leaked the note contents');
  }
  await page.screenshot({ path: shot('36-private-confirm-dialog-light') });
  await page.getByTestId('dialog-button-keep-editing').click();
  await page.getByTestId('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.getByText('Not logged').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('private-day-close').click();
  await page.getByTestId('dialog-button-discard-changes').click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  const privateAfterDiscard = await page.evaluate(async (key) => {
    const all = await __privatecycle.DataService.getIntimateData();
    return all[key] ?? null;
  }, todayKey);
  if (!privateAfterDiscard || privateAfterDiscard.note !== 'smoke test') {
    failures.push('private Discard changes removed the stored entry');
  }

  // Saving the removal from the guard actually deletes the day...
  await page.getByTestId(`private-day-${todayKey}`).click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('private-day-activity').click();
  await page.getByTestId('private-day-close').click();
  await page.getByTestId('dialog-button-save-close').click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  const privateAfterRemoval = await page.evaluate(async (key) => {
    const all = await __privatecycle.DataService.getIntimateData();
    return all[key] ?? null;
  }, todayKey);
  if (privateAfterRemoval) {
    failures.push(`saved private removal still has a row: ${JSON.stringify(privateAfterRemoval)}`);
  }

  // ...then restore the entry so later dark-mode captures still have content.
  await page.getByTestId(`private-day-${todayKey}`).click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('private-day-activity').click();
  await page.getByTestId('private-protection-protected').click();
  await page.getByTestId('private-note-input').fill('smoke test');
  await page.getByTestId('private-day-save').click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.getByTestId(`private-day-logged-${todayKey}`).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  log('private calendar: unsaved status and three-action close guard OK');

  // Polish regression: compact layout, dark surfaces, honest empty states,
  // and a failed save that can be retried without losing the open entry.
  await page.getByTestId('private-close').click();
  await page.getByTestId('settings-darkmode-switch').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [tab, height] of [['calendar', 1200], ['overview', 1800], ['insights', 2400], ['settings', 1800]]) {
    await page.setViewportSize({ width: 360, height });
    await page.getByTestId(`tab-${tab}`).click();
    if (tab === 'calendar' && await page.getByTestId('calendar-return-today').isVisible()) {
      await page.getByTestId('calendar-return-today').click();
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot(`14-dark-${tab}`), fullPage: true });
  }

  // PRIVATECYC-7 option B at the narrow dark target.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByTestId('tab-calendar').click();
  if (await page.getByTestId('calendar-return-today').isVisible()) {
    await page.getByTestId('calendar-return-today').click();
  }
  await page.getByTestId(`calendar-day-${todayKey}`).click();
  await page.getByTestId('day-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('day-modal-period-toggle').click();
  await page.getByTestId('day-modal-unsaved-status').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('37-entry-unsaved-footer-dark-320') });
  await page.getByTestId('day-modal-close').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('38-entry-confirm-dialog-dark-320') });
  await page.getByTestId('dialog-button-discard-changes').click();
  await page.getByTestId('day-modal').waitFor({ state: 'hidden', timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-notifications').click();
  await page.getByTestId('notifications-web-notice').waitFor();
  await page.screenshot({ path: shot('15-dark-notifications') });
  await page.getByTestId('notifications-back').click();
  await page.getByTestId('settings-private-calendar').click();
  await page.getByTestId('private-pin-input').fill('1234');
  await page.getByTestId('private-pin-unlock').click();
  await page.getByTestId('private-calendar').waitFor();
  await page.screenshot({ path: shot('16-dark-private') });
  await page.getByTestId(`private-day-${todayKey}`).click();
  await page.getByTestId('private-day-modal').waitFor();
  await page.screenshot({ path: shot('17-dark-private-sheet') });

  // Private unsaved guard at the narrow dark target; the draft is discarded.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByTestId('private-protection-unprotected').click();
  const darkPrivateStatus = await page.getByTestId('private-day-unsaved-status').innerText();
  if (!darkPrivateStatus.includes('Protection')) {
    failures.push(`dark private unsaved footer missed Protection: "${darkPrivateStatus}"`);
  }
  await page.screenshot({ path: shot('39-private-unsaved-footer-dark-320') });
  await page.getByTestId('private-day-close').click();
  await page.getByTestId('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('40-private-confirm-dialog-dark-320') });
  await page.getByTestId('dialog-button-discard-changes').click();
  await page.getByTestId('private-day-modal').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByTestId('private-close').click();
  await page.getByTestId('settings-darkmode-switch').click();

  // --- Overview history: cycles older than the recent-six summary must be
  // reachable in the scrollable chart without changing the summary numbers.
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-chart').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(400);
  const historyBefore = {
    bars: await page.locator('[data-testid^="overview-cycle-bar-"]').count(),
    avg: (await page.getByTestId('overview-avg-cycle').textContent())?.trim(),
    variation: (await page.getByTestId('overview-cycle-variation').textContent())?.trim(),
    regularity: (await page.getByTestId('overview-cycle-regularity').textContent())?.trim(),
  };
  const injectedStarts = await page.evaluate(async () => {
    const insights = await __privatecycle.DataService.getInsights();
    const earliest = new Date(`${[...insights.periodStarts].sort()[0]}T12:00:00`);
    const rows = {};
    for (let index = 1; index <= 10; index++) {
      const date = new Date(earliest);
      date.setDate(date.getDate() - index * 30);
      const key = __privatecycle.DataService.formatDateKey(date);
      rows[key] = {
        date: key,
        isPeriod: true,
        flowLevel: 'medium',
        symptoms: [],
        mood: '',
        isOvulation: false,
      };
    }
    await __privatecycle.DataService.saveManyDailyData(rows);
    return Object.keys(rows);
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-chart').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(600);
  const historyAfter = {
    bars: await page.locator('[data-testid^="overview-cycle-bar-"]').count(),
    meta: (await page.getByTestId('overview-cycle-chart-meta').textContent())?.trim(),
    avg: (await page.getByTestId('overview-avg-cycle').textContent())?.trim(),
    variation: (await page.getByTestId('overview-cycle-variation').textContent())?.trim(),
    regularity: (await page.getByTestId('overview-cycle-regularity').textContent())?.trim(),
    scroll: await page.getByTestId('overview-cycle-chart-scroll').evaluate((el) => ({
      left: el.scrollLeft,
      width: el.scrollWidth,
      client: el.clientWidth,
    })),
  };
  log(
    `overview history: bars ${historyBefore.bars} -> ${historyAfter.bars}, ` +
      `meta="${historyAfter.meta}", scroll=${historyAfter.scroll.left}/${historyAfter.scroll.width}`
  );
  if (historyAfter.bars !== historyBefore.bars + injectedStarts.length) {
    failures.push(
      `overview history: expected ${historyBefore.bars + injectedStarts.length} bars, ` +
        `got ${historyAfter.bars}`
    );
  }
  if (historyAfter.meta !== `All ${historyAfter.bars} cycles`) {
    failures.push(`overview history meta: expected "All ${historyAfter.bars} cycles", ` +
      `got "${historyAfter.meta}"`);
  }
  if (
    historyAfter.avg !== historyBefore.avg ||
    historyAfter.variation !== historyBefore.variation ||
    historyAfter.regularity !== historyBefore.regularity
  ) {
    failures.push(
      `overview history changed the recent-six summary: ` +
        `${JSON.stringify(historyBefore)} -> ${JSON.stringify(historyAfter)}`
    );
  }
  if (!(historyAfter.scroll.width > historyAfter.scroll.client)) {
    failures.push('overview history chart is not horizontally scrollable');
  }
  if (!(historyAfter.scroll.left > 0)) {
    failures.push('overview history chart did not open on the newest cycles');
  }
  await page.getByTestId('overview-cycle-chart').screenshot({
    path: shot('21-overview-history-newest'),
  });
  await page.getByTestId('overview-cycle-chart-scroll').evaluate((el) => el.scrollTo({ left: 0 }));
  await page.waitForTimeout(300);
  await page.getByTestId('overview-cycle-chart').screenshot({
    path: shot('22-overview-history-oldest'),
  });
  await page.getByTestId('tab-settings').click();
  log('overview full cycle history OK');

  await page.goto(`http://127.0.0.1:${PROXY_PORT}/?reset=1`);
  await page.getByTestId('first-run-screen').waitFor({ timeout: 30_000 });
  await page.getByTestId('first-run-skip').click();
  await page.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
  await page.getByTestId('calendar-welcome').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: shot('18-empty-calendar') });
  await page.getByTestId('calendar-log-today').click();
  await page.getByTestId('day-modal-period-toggle').click();
  await page.evaluate(() => {
    window.__originalSave = __privatecycle.DataService.saveTodayData;
    __privatecycle.DataService.saveTodayData = async () => { throw new Error('Simulated write failure'); };
  });
  await page.getByTestId('day-modal-save').click();
  await page.getByText('Could not save this day. Please try again.').waitFor();
  await page.screenshot({ path: shot('19-save-retry') });
  await page.evaluate(() => { __privatecycle.DataService.saveTodayData = window.__originalSave; });
  await page.getByTestId('day-modal-save').click();
  await page.getByTestId('dialog-button-ok').click();
  const retried = await page.evaluate(key => __privatecycle.DataService.getTodayData(key), todayKey);
  if (!retried?.isPeriod) failures.push('failed save retry lost the period selection');
  await page.goto(`http://127.0.0.1:${PROXY_PORT}/?reset=1`);
  await page.getByTestId('first-run-screen').waitFor({ timeout: 30_000 });
  await page.getByTestId('first-run-skip').click();
  await page.getByTestId('tab-calendar').waitFor({ timeout: 30_000 });
  await page.getByTestId('calendar-welcome').waitFor();
  for (const tab of ['overview', 'insights', 'settings']) {
    await page.getByTestId(`tab-${tab}`).click();
    await page.waitForTimeout(300);
    if (tab === 'settings') {
      await page.screenshot({ path: shot(`20-empty-${tab}`) });
    } else {
      await fullScreenShot(`20-empty-${tab}`, `${tab}-scroll`);
    }
  }
  log('polish: dark/360px, reduced motion, empty states and failed-save retry passed');

  // --- One recorded period: no fabricated average, but a labelled standard estimate. ---
  const singlePeriodKeys = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (4 - index));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  });
  await page.evaluate(async (keys) => {
    await __privatecycle.DataService.clearAllData();
    const rows = Object.fromEntries(
      keys.map((date) => [
        date,
        {
          date,
          isPeriod: true,
          flowLevel: 'medium',
          symptoms: [],
          mood: '',
          isOvulation: false,
        },
      ])
    );
    await __privatecycle.DataService.saveManyDailyData(rows);
  }, singlePeriodKeys);

  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('calendar-period-estimate-basis').waitFor({ state: 'visible', timeout: 15_000 });
  const periodBasis = (await page.getByTestId('calendar-period-estimate-basis').textContent())?.trim();
  if (!periodBasis?.includes('standard 28-day cycle')) {
    failures.push(`one-period calendar basis missing: "${periodBasis}"`);
  }
  await page.getByTestId('calendar-period-length-basis').waitFor({ state: 'visible', timeout: 15_000 });
  const periodLengthBasis = (await page.getByTestId('calendar-period-length-basis').textContent())?.trim();
  if (!periodLengthBasis?.includes('standard 5-day estimate')) {
    failures.push(`one-period bleeding basis missing: "${periodLengthBasis}"`);
  }
  await page.screenshot({ path: shot('25-one-period-calendar'), fullPage: true });

  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-basis').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('overview-period-basis').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('overview-cycle-chart-empty').waitFor({ state: 'visible', timeout: 15_000 });
  if (!(await page.getByTestId('overview-cycle-chart-empty').innerText()).includes('completes your first cycle')) {
    failures.push('one-period overview: next-start guidance missing');
  }
  if ((await page.getByTestId('overview-avg-cycle-hint').textContent())?.trim() !== '1 more period start') {
    failures.push('one-period overview: average hint is not contextual');
  }
  if ((await page.getByTestId('overview-variation-hint').textContent())?.trim() !== '2 more period starts') {
    failures.push('one-period overview: variation hint is not contextual');
  }
  const avgCycleOne = (await page.getByTestId('overview-avg-cycle').textContent())?.trim();
  const typicalPeriodOne = (await page.getByTestId('overview-typical-period').textContent())?.trim();
  const lastPeriodOne = (await page.getByTestId('overview-last-period').textContent())?.trim();
  if (avgCycleOne !== '—') {
    failures.push(`one-period average cycle should be unknown, got "${avgCycleOne}"`);
  }
  if (typicalPeriodOne !== '—') {
    failures.push(`one-period typical period should be unknown, got "${typicalPeriodOne}"`);
  }
  if (lastPeriodOne !== '5') {
    failures.push(`one-period last period should be 5, got "${lastPeriodOne}"`);
  }
  await fullScreenShot('26-one-period-overview', 'overview-scroll');

  // The same fallback must stay legible in dark mode.
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-darkmode-switch').click();
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('calendar-period-estimate-basis').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: shot('27-one-period-calendar-dark'), fullPage: true });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-basis').waitFor({ state: 'visible', timeout: 15_000 });
  await fullScreenShot('28-one-period-overview-dark', 'overview-scroll');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-darkmode-switch').click();
  log('one-period state: honest average and labelled standard estimate OK');

  // --- Sparse no-period journal: real content stays visible and every CTA
  // hands off to the existing Calendar flows. Isolated synthetic rows only. ---
  const sparseKey = (offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  };
  const sparseKeys = [-2, -1, 0].map(sparseKey);
  const seedSparseJournal = async () => {
    await page.evaluate(async (keys) => {
      await __privatecycle.DataService.clearAllData();
      const rows = Object.fromEntries(
        keys.map((date, index) => [
          date,
          {
            date,
            isPeriod: false,
            flowLevel: '',
            symptoms: index === 2 ? ['headache'] : index === 0 ? ['fatigue'] : [],
            mood: '',
            isOvulation: false,
            moodValence: [2, 3, 4][index],
            moodTags: [{ id: 'tired', level: 1 }],
          },
        ])
      );
      await __privatecycle.DataService.saveManyDailyData(rows);
    }, sparseKeys);
  };

  await seedSparseJournal();
  await page.goto(`http://127.0.0.1:${PROXY_PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('calendar-welcome').waitFor({ timeout: 30_000 });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-start-card').waitFor({ timeout: 30_000 });
  if (await page.getByTestId('overview-cycle-requirements').count()) {
    failures.push('sparse overview: empty requirements should be hidden when entries exist');
  }
  if (!(await page.getByTestId('overview-cycle-start-card').innerText()).includes('already count')) {
    failures.push('sparse overview: start card does not acknowledge logged content');
  }
  await page.getByTestId('overview-symptom-context-note').waitFor({ timeout: 15_000 });
  if (await page.getByTestId('overview-symptom-segment-headache-luteal').count()) {
    failures.push('sparse overview: neutral symptom bar claims a phase split');
  }
  await page.getByTestId('overview-mood-trend-progress').waitFor({ timeout: 15_000 });
  const sparseMoodProgress = (
    await page.getByTestId('overview-mood-trend-progress').textContent()
  )?.trim();
  if (sparseMoodProgress !== '3 of 5 rated days in the last 60 days · 2 more for a trend') {
    failures.push(`sparse overview: unexpected mood progress "${sparseMoodProgress}"`);
  }
  const recentMoodRows = (
    await Promise.all(
      sparseKeys.map((key) => page.getByTestId(`overview-mood-recent-${key}`).count())
    )
  ).reduce((total, count) => total + count, 0);
  if (recentMoodRows !== 3) {
    failures.push(`sparse overview: expected 3 recent mood rows, got ${recentMoodRows}`);
  }
  await fullScreenShot('29-sparse-overview', 'overview-scroll');

  // The partial-mood action must open the existing today sheet, not a new form.
  await page.getByTestId('overview-mood-log-today').click();
  await page.getByTestId('day-modal').waitFor({ timeout: 30_000 });
  await page.getByTestId('day-modal-close').click();

  await page.getByTestId('tab-insights').click();
  await page.getByTestId('insights-today-card').waitFor({ timeout: 30_000 });
  await page.getByTestId('insights-today-tips').waitFor({ timeout: 15_000 });
  const sparseTodayCopy = await page.getByTestId('insights-today-card').innerText();
  if (!sparseTodayCopy.includes('Headache logged')) {
    failures.push('sparse insights: today log headline missing');
  }
  if (!sparseTodayCopy.includes('no period start logged')) {
    failures.push('sparse insights: neutral phase note missing');
  }
  await page.getByTestId('insights-patterns-empty').waitFor({ timeout: 15_000 });
  const sparsePatternsCopy = await page.getByTestId('insights-patterns-empty').innerText();
  if (!sparsePatternsCopy.includes('3 period starts')) {
    failures.push('sparse insights: cycle requirement is not exact');
  }
  if (!sparsePatternsCopy.includes('2 estimated phases')) {
    failures.push('sparse insights: mood comparison requirement is not exact');
  }
  if (/after a few cycles/i.test(sparsePatternsCopy)) {
    failures.push('sparse insights: vague pattern promise is still shown');
  }
  const requirementRows = await page.getByTestId('insights-patterns-requirements').innerText();
  for (const label of ['Cycle', 'Symptoms', 'Mood']) {
    if (!requirementRows.includes(label)) {
      failures.push(`sparse insights: missing ${label} requirement row`);
    }
  }
  if (await page.getByTestId('insights-patterns-open-calendar').count()) {
    failures.push('sparse insights: redundant second comparison action is shown');
  }
  await fullScreenShot('30-sparse-insights', 'insights-scroll');

  // The same sparse state at the narrow target width in dark mode.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-darkmode-switch').click();
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-start-card').waitFor({ timeout: 15_000 });
  await fullScreenShot('29b-sparse-overview-dark-320', 'overview-scroll');
  await page.getByTestId('tab-insights').click();
  await page.getByTestId('insights-today-card').waitFor({ timeout: 15_000 });
  await fullScreenShot('30b-sparse-insights-dark-320', 'insights-scroll');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('settings-darkmode-switch').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('tab-insights').click();

  // Log today from a read-only tab, save through the existing day sheet, then
  // repeat the deliberate tap to prove the consumed intent can run again.
  await page.getByTestId('insights-edit-today').click();
  await page.getByTestId('day-modal-save').waitFor({ timeout: 30_000 });
  await page.getByTestId('day-modal-symptom-cramps').click();
  await page.getByTestId('day-modal-save').click();
  await page.getByTestId('dialog-button-ok').click();
  const savedFromInsights = await page.evaluate(
    (key) => __privatecycle.DataService.getTodayData(key),
    todayKey
  );
  if (!savedFromInsights?.symptoms?.includes('cramps')) {
    failures.push('sparse insights: today handoff did not save through the day sheet');
  }
  await page.getByTestId('tab-insights').click();
  await page.getByTestId('insights-edit-today').click();
  await page.getByTestId('day-modal-save').waitFor({ timeout: 30_000 });
  await page.getByTestId('day-modal-close').click();

  // Add a period start from Overview enters the existing choose-date mode.
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-start-period').click();
  await page.getByTestId('calendar-first-run-banner').waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    (key) =>
      document
        .querySelector(`[data-testid="calendar-day-${key}"]`)
        ?.getAttribute('aria-label')
        ?.includes('set as last period start'),
    sparseKeys[1]
  );
  await page.getByTestId(`calendar-day-${sparseKeys[1]}`).click();
  await page.getByTestId('day-modal-first-run-hint').waitFor({ timeout: 15_000 });
  if (!/Period Day/.test(await page.getByTestId('day-modal-period-toggle').innerText())) {
    failures.push('sparse overview: last-period handoff did not pre-set Period');
  }
  await page.getByTestId('day-modal-save').click();
  await page.getByTestId('calendar-first-run-banner').waitFor({ state: 'detached', timeout: 30_000 });
  const sparsePeriods = await page.evaluate(() => __privatecycle.DataService.getPeriodData());
  if (!sparsePeriods.periods.includes(sparseKeys[1])) {
    failures.push('sparse overview: last-period handoff did not save the chosen date');
  }
  log('sparse journal: neutral content, today sheet, repeat intent and last-period handoff OK');

  // Import from Overview: cancel first, then use a synthetic backup file.
  await seedSparseJournal();
  await page.goto(`http://127.0.0.1:${PROXY_PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('calendar-welcome').waitFor({ timeout: 30_000 });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-import-backup').click();
  await page.getByTestId('dialog').waitFor({ timeout: 30_000 });
  await page.getByTestId('dialog-button-cancel').click();
  const periodsAfterCancel = await page.evaluate(
    () => __privatecycle.DataService.getPeriodData()
  );
  if (periodsAfterCancel.periods.length !== 0) {
    failures.push('overview import cancel changed period data');
  }
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-import-backup').click();
  const importBackup = {
    version: '1.0.0',
    timestamp: Date.now(),
    data: {
      dailyData: {
        [sparseKeys[2]]: {
          date: sparseKeys[2],
          isPeriod: true,
          flowLevel: 'medium',
          symptoms: [],
          mood: '',
          isOvulation: false,
        },
      },
    },
    metadata: {
      totalDays: 1,
      dateRange: { start: sparseKeys[2], end: sparseKeys[2] },
    },
  };
  const [importChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30_000 }),
    page.getByTestId('dialog-button-import').click(),
  ]);
  await importChooser.setFiles({
    name: 'cycle_backup_sparse_import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importBackup)),
  });
  await page.getByText('Import Successful').waitFor({ timeout: 30_000 });
  await page.getByTestId('dialog-button-ok').click();
  const importedPeriods = await page.evaluate(() => __privatecycle.DataService.getPeriodData());
  if (!importedPeriods.periods.includes(sparseKeys[2])) {
    failures.push('overview import did not restore the synthetic backup');
  }
  log('sparse journal: import confirmation cancels safely and restores a backup');

  // Tags-only and five-rating no-period states must both be visually useful.
  const tagsOnlyKeys = [-2, -1].map(sparseKey);
  await page.evaluate(async (keys) => {
    await __privatecycle.DataService.clearAllData();
    const rows = Object.fromEntries(
      keys.map((date) => [
        date,
        {
          date,
          isPeriod: false,
          flowLevel: '',
          symptoms: [],
          mood: '',
          isOvulation: false,
          moodValence: 0,
          moodTags: [{ id: 'calm', level: 1 }],
        },
      ])
    );
    await __privatecycle.DataService.saveManyDailyData(rows);
  }, tagsOnlyKeys);
  await page.goto(`http://127.0.0.1:${PROXY_PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('calendar-welcome').waitFor({ timeout: 30_000 });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-start-card').waitFor({ timeout: 30_000 });
  await page.getByTestId(`overview-mood-recent-${tagsOnlyKeys[0]}-no-rating`).waitFor({
    timeout: 15_000,
  });
  const tagsOnlyProgress = (
    await page.getByTestId('overview-mood-trend-progress').textContent()
  )?.trim();
  if (tagsOnlyProgress !== '0 of 5 rated days in the last 60 days · 5 more for a trend') {
    failures.push(`tags-only overview: unexpected progress "${tagsOnlyProgress}"`);
  }
  if (!(await page.getByTestId('overview-mood-log-today').count())) {
    failures.push('tags-only overview: partial mood action is missing');
  }
  await fullScreenShot('31-tags-only-overview', 'overview-scroll');

  const fiveRatingKeys = [-4, -3, -2, -1, 0].map(sparseKey);
  await page.evaluate(async (keys) => {
    await __privatecycle.DataService.clearAllData();
    const rows = Object.fromEntries(
      keys.map((date, index) => [
        date,
        {
          date,
          isPeriod: false,
          flowLevel: '',
          symptoms: [],
          mood: '',
          isOvulation: false,
          moodValence: index + 1,
          moodTags: [],
        },
      ])
    );
    await __privatecycle.DataService.saveManyDailyData(rows);
  }, fiveRatingKeys);
  await page.goto(`http://127.0.0.1:${PROXY_PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('calendar-welcome').waitFor({ timeout: 30_000 });
  await page.getByTestId('tab-overview').click();
  await page.getByTestId('overview-cycle-start-card').waitFor({ timeout: 30_000 });
  await page.getByTestId('overview-mood-trend').waitFor({ timeout: 15_000 });
  if ((await page.getByTestId('overview-mood-meta').textContent())?.trim() !== 'Trend') {
    failures.push('five-rating overview: mood meta is not the truthful trend label');
  }
  if (
    !(await page.getByTestId('overview-mood-phase-context').textContent())?.includes(
      'needs a recorded period start'
    )
  ) {
    failures.push('five-rating overview: phase context copy is not truthful');
  }
  await fullScreenShot('32-five-ratings-overview', 'overview-scroll');
  log('journal states: tags-only and five-rating no-period captures OK');


  // --- Recorded cycle vs predicted boundary / overdue regression (PRIVATECYC-1). ---
  await page.clock.setFixedTime(new Date(2026, 10, 1, 12));
  for (const scenario of [
    { name: 'overdue', starts: ['2026-08-28', '2026-09-25'], day: '38', expected: '2026-10-23', label: 'Expected 9 days ago' },
    { name: 'expected', starts: ['2026-08-28', '2026-09-25', '2026-10-10'], day: '23', expected: '2026-11-01', label: 'Expected today' },
  ]) {
    await page.evaluate(async (starts) => {
      await __privatecycle.DataService.clearAllData();
      const rows = Object.fromEntries(starts.map((date) => [date, {
        date, isPeriod: true, flowLevel: 'medium', symptoms: [], mood: '', isOvulation: false,
      }]));
      // Enough synthetic mood logs to keep the full trend visible in both previews.
      for (const date of ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-11-01']) {
        rows[date] = {
          date, isPeriod: false, flowLevel: '', symptoms: date === '2026-11-01' ? ['cramps'] : [],
          mood: 'tired', isOvulation: false, moodValence: 3, moodTags: [{ id: 'tired', level: 1 }],
        };
      }
      await __privatecycle.DataService.saveManyDailyData(rows);
    }, scenario.starts);
    await page.goto(`http://127.0.0.1:${PROXY_PORT}/`, { waitUntil: 'domcontentloaded' });
    const estimate = page.getByTestId(`calendar-period-estimate-${scenario.expected}`);
    await estimate.waitFor({ state: 'visible', timeout: 30_000 });
    if ((await estimate.textContent()) !== scenario.label) failures.push(`${scenario.name}: calendar expected-date copy`);
    await page.screenshot({ path: shot(`15-${scenario.name}-calendar`), fullPage: true });
    await page.getByTestId('tab-overview').click();
    await page.getByTestId('overview-phase-uncertain').waitFor({ state: 'visible' });
    // The empty Overview renders before its asynchronous SQLite read completes.
    await page.waitForFunction(({ day, label }) =>
      document.querySelector('[data-testid="overview-cycle-day"]')?.textContent === day &&
      document.querySelector('[data-testid="overview-next-period"]')?.textContent === label,
    { day: scenario.day, label: scenario.label });
    if ((await page.getByTestId('overview-cycle-day').textContent()) !== scenario.day) failures.push(`${scenario.name}: cycle day reset`);
    if ((await page.getByTestId('overview-next-period').textContent()) !== scenario.label) failures.push(`${scenario.name}: overview expected-date copy`);
    await page.getByTestId('overview-phase-track-uncertain').waitFor({ state: 'visible' });
    if (await page.getByTestId('overview-phase-track').count()) failures.push(`${scenario.name}: uncertain phase has a phase-specific timeline`);
    await page.getByTestId('overview-cycle-chart').waitFor({ state: 'visible' });
    await page.getByTestId('overview-symptom-patterns-card').waitFor({ state: 'visible' });
    if (scenario.name === 'overdue') {
      await page.getByTestId('overview-symptom-context-note').waitFor({ state: 'visible' });
      if (
        (await page.getByTestId('overview-symptom-context-note').textContent())?.includes(
          'Period history adds'
        )
      ) {
        failures.push(`${scenario.name}: unphased symptom copy implies missing history`);
      }
    }
    await page.getByTestId('overview-mood-trend').waitFor({ state: 'visible' });
    await fullScreenShot(`16-${scenario.name}-overview`, 'overview-scroll');
    await page.getByTestId('tab-insights').click();
    const badge = page.getByTestId('insights-current-phase-badge');
    await badge.waitFor({ state: 'visible' });
    if (!(await badge.textContent()).includes(`PHASE UNCERTAIN · DAY ${scenario.day}`)) failures.push(`${scenario.name}: insights phase/day`);
    const focus = page.getByTestId('insights-today-focus');
    await focus.waitFor({ state: 'visible' });
    if (!(await focus.textContent()).includes('Let your body set the pace')) failures.push(`${scenario.name}: neutral Today focus missing`);
    await page.getByTestId('insights-today-tips').waitFor({ state: 'visible' });
    await page.getByTestId('insights-phase-tips-card').waitFor({ state: 'visible' });
    await fullScreenShot(`17-${scenario.name}-insights`, 'insights-scroll');
  }
  log('recorded-cycle boundary and overdue flows OK');

  // --- Backup safety: a malformed file must never mutate the database. ---
  const backupSafety = await page.evaluate(async () => {
    const dailyBefore = await __privatecycle.DataService.getAllDailyData();
    const privateBefore = await __privatecycle.DataService.getIntimateData();
    const [dateKey] = Object.keys(dailyBefore);
    if (!dateKey) return { skipped: true };

    const malformed = {
      version: '1.0.0',
      timestamp: Date.now(),
      data: {
        dailyData: {
          [dateKey]: { ...dailyBefore[dateKey], isPeriod: 'yes' },
        },
      },
      metadata: { totalDays: 1, dateRange: { start: dateKey, end: dateKey } },
    };

    const accepted = __privatecycle.BackupService.validateBackupData(malformed);
    let rejectedRestore = false;
    try {
      await __privatecycle.BackupService.restoreFromBackup(malformed);
    } catch {
      rejectedRestore = true;
    }

    const dailyAfter = await __privatecycle.DataService.getAllDailyData();
    const privateAfter = await __privatecycle.DataService.getIntimateData();

    return {
      accepted,
      rejectedRestore,
      dailyUnchanged: JSON.stringify(dailyBefore) === JSON.stringify(dailyAfter),
      privateUnchanged: JSON.stringify(privateBefore) === JSON.stringify(privateAfter),
    };
  });

  if (!backupSafety.skipped) {
    if (backupSafety.accepted) failures.push('backup validation accepted a malformed day');
    if (!backupSafety.rejectedRestore) failures.push('malformed restore did not throw');
    if (!backupSafety.dailyUnchanged || !backupSafety.privateUnchanged) {
      failures.push('malformed restore mutated the database');
    }
    log('backup validation rejects malformed data without mutation');
  }

  // --- A valid restore replaces cycle data and keeps the private log. ---
  const backupRestore = await page.evaluate(async () => {
    const privateKey = '2020-01-02';
    await __privatecycle.DataService.saveIntimateDay({
      date: privateKey,
      protection: 'na',
      note: 'kept through restore',
    });

    const replacementDate = '2020-01-01';
    const replacement = {
      version: '1.0.0',
      timestamp: Date.now(),
      data: {
        dailyData: {
          [replacementDate]: {
            date: replacementDate,
            isPeriod: true,
            flowLevel: 'medium',
            symptoms: [],
            mood: '',
            isOvulation: false,
          },
        },
      },
      metadata: {
        totalDays: 1,
        dateRange: { start: replacementDate, end: replacementDate },
      },
    };

    await __privatecycle.BackupService.restoreFromBackup(replacement);
    const dailyAfter = await __privatecycle.DataService.getAllDailyData();
    const privateAfter = await __privatecycle.DataService.getIntimateData();

    return {
      dailyKeys: Object.keys(dailyAfter).sort(),
      privateKept: Boolean(privateAfter[privateKey]),
    };
  });

  if (backupRestore.dailyKeys.length !== 1 || backupRestore.dailyKeys[0] !== '2020-01-01') {
    failures.push('valid restore did not replace cycle data');
  }
  if (!backupRestore.privateKept) failures.push('valid restore erased the private log');
  log('valid restore replaces cycle data and preserves the private log');
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
