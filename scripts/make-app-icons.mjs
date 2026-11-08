#!/usr/bin/env node
// Export platform-ready launcher PNGs from the approved Tidemark SVG masters.
// The SVGs remain the editable source; CI consumes the committed PNG exports.
// Run: npm run icons:generate (requires Playwright's Chromium).
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const directory = new URL('../assets/images/tidemark/', import.meta.url);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const variant of ['production', 'nightly']) {
    const master = await fs.readFile(new URL(`${variant}.svg`, directory), 'utf8');
    for (const [kind, size] of [
      ['icon', 1024],
      ['adaptive-foreground', 1024],
      ['adaptive-background', 1024],
      ['monochrome', 1024],
      ['favicon', 64],
    ]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>');
      await page.evaluate(({ master, kind, size }) => {
        const parsed = new DOMParser().parseFromString(master, 'image/svg+xml');
        if (parsed.querySelector('parsererror')) throw new Error('Invalid SVG master');
        const svg = parsed.documentElement;
        const [x, y, width, height] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
        if (width !== height) throw new Error('Launcher master must have a square viewBox');
        const tile = svg.querySelector('#tile');
        if (!tile) throw new Error('Launcher master is missing its tile');
        const adaptive = kind.startsWith('adaptive-') || kind === 'monochrome';
        // Android layers are 108 dp; the nominal masked viewport is the central
        // 72 dp. Expand the canvas by 1.5 so the mark keeps its approved scale
        // after the launcher crops it, with the nightly marker in the safe zone.
        const bounds = adaptive
          ? [x - width / 4, y - height / 4, width * 1.5, height * 1.5]
          : [x, y, width, height];
        svg.setAttribute('viewBox', bounds.join(' '));
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        if (kind === 'icon' || kind === 'adaptive-background') {
          // Let iOS/Android supply the outside mask, rather than baking rounded
          // corners and transparent padding into the launcher background.
          const rectangle = parsed.createElementNS(svg.namespaceURI, 'rect');
          ['x', 'y', 'width', 'height'].forEach((attribute, index) => {
            rectangle.setAttribute(attribute, String(bounds[index]));
          });
          rectangle.setAttribute('fill', tile.getAttribute('fill'));
          if (kind === 'adaptive-background') {
            svg.querySelectorAll('path').forEach(path => path.remove());
            svg.appendChild(rectangle);
          } else {
            tile.replaceWith(rectangle);
          }
        } else if (kind !== 'favicon') {
          tile.remove();
          if (kind === 'monochrome') {
            svg.querySelectorAll('path').forEach(path => path.setAttribute('fill', '#ffffff'));
            svg.querySelector('defs')?.remove();
          }
        }
        document.body.appendChild(document.importNode(svg, true));
      }, { master, kind, size });
      const target = new URL(`${variant}-${kind}.png`, directory);
      await page.screenshot({ path: fileURLToPath(target), omitBackground: true });
      console.log(`wrote ${fileURLToPath(target)} (${size}×${size})`);
    }
  }
} finally {
  await browser.close();
}
