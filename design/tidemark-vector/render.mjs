import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('./index.html', import.meta.url).href);
  await page.evaluate(() => Promise.all(Array.from(document.images).map(image => image.decode())));
  await page.locator('#vector-pair').screenshot({ path: path.join(here, 'preview.png') });
  await page.screenshot({ path: path.join(here, 'desktop-proof.png'), fullPage: true });
  for (const name of ['production', 'nightly']) {
    await page.getByTestId(`${name}-reveal-slider`).fill('72');
    const value = await page.locator(`#${name}-reveal`).evaluate(element => element.style.clipPath);
    if (value !== 'inset(0px 28% 0px 0px)') throw new Error(`Reveal failed: ${value}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  await page.screenshot({ path: path.join(here, 'mobile-proof.png'), fullPage: true });
  for (const name of ['production', 'nightly']) {
    const svg = await fs.readFile(path.join(here, `${name}-registered.svg`), 'utf8');
    await page.setViewportSize({ width: 640, height: 640 });
    await page.setContent(`<style>html,body{margin:0;width:640px;height:640px;background:transparent}svg{display:block;width:640px;height:640px}</style>${svg}`);
    await page.screenshot({ path: path.join(here, `${name}-rendered.png`), omitBackground: true });
  }
  // Confirm the same masters render at large sizes without fetching any resource.
  const network = [];
  page.on('request', request => network.push(request.url()));
  await page.setViewportSize({ width: 4096, height: 4096 });
  for (const name of ['production', 'nightly']) {
    const svg = await fs.readFile(path.join(here, `../../assets/images/tidemark/${name}.svg`), 'utf8');
    if (/<image\b|<filter\b|<script\b|data:|https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(svg)) throw new Error('Unexpected raster, filter, script or remote dependency');
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:4096px;height:4096px}</style>${svg}`);
    await page.screenshot({ path: path.join('/private/tmp', `tidemark-${name}-4096.png`), omitBackground: true });
  }
  if (errors.length || network.length) throw new Error(JSON.stringify({ errors, network }));
  console.log(JSON.stringify({ revealSliders: 'passed', mobileOverflow: false, pageErrors: errors, externalRequests: network, largeRender: '4096 × 4096, both masters' }));
} finally {
  await browser.close();
}
