PrivateCycle — Tidemark vector masters

production.svg and nightly.svg are the selected, rounded-tile icon artwork.
production-foreground.svg and nightly-foreground.svg contain the same marks
on transparent backgrounds, with the same viewBox and placement.

All four files contain editable cubic Bezier paths and native SVG gradients.
There are no embedded PNGs, external fonts, filters, scripts or dependencies.
The declared 1024-pixel size is an export default; the paths scale freely.

These are faithful traces of the selected concept image, not mathematically
pixel-identical copies of its raster texture. The wave contours, tile outline,
placement, sampled colours and nightly marker are preserved. Fine raster grain
is omitted. Production and nightly retain their own slightly different source
contours, as required to preserve the selected artwork.

Visual proof and measurements:
  design/tidemark-vector/index.html
  design/tidemark-vector/trace-report.json
  design/tidemark-vector/verification.json

app.json uses the production PNG exports; app.config.js selects the nightly
exports for APP_VARIANT=nightly. The local dev variant retains its blue icon.

Regenerate the committed platform PNG exports after editing a master:
  npm run icons:generate

The exporter uses the existing Playwright Chromium installation. The *-icon.png
files are opaque, full-bleed 1024px icons for iOS and legacy Android launchers.
The adaptive foreground/background and monochrome exports use Android's 108dp
canvas with the original artwork in its central 72dp viewport. Android applies
the outside shape; no rounded corners are baked into these launcher layers.
The 64px favicons retain the rounded presentation tile. The SVG masters remain
resolution-independent; PNGs are the platform inputs generated from them.

Pushes publish the nightly identity. The production icon ships with the next
manual production release.

Rebuilding the trace (from the repository root):
  python3 design/tidemark-vector/trace.py
  node design/tidemark-vector/render.mjs
  python3 design/tidemark-vector/verify.py

The design-time Python environment requires NumPy and Pillow. The rendering
script uses the repository's existing Playwright installation. Neither adds
application dependencies. The SVGs are the editable source; retracing overwrites
them, so preserve intentional manual edits before rerunning trace.py.
