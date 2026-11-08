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

The app configuration has not yet been switched to these assets. Platform
launcher exports must apply the platform mask to a full-bleed background;
the rounded-tile presentation source should not acquire a second corner mask.

Rebuilding the trace (from the repository root):
  python3 design/tidemark-vector/trace.py
  node design/tidemark-vector/render.mjs
  python3 design/tidemark-vector/verify.py

The design-time Python environment requires NumPy and Pillow. The rendering
script uses the repository's existing Playwright installation. Neither adds
application dependencies. The SVGs are the editable source; retracing overwrites
them, so preserve intentional manual edits before rerunning trace.py.
