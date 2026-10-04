// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Keep Metro's transform cache inside the project instead of the shared
// /tmp/metro-cache. On machines with more than one user, the first user to run
// Metro owns /tmp/metro-cache and everyone else gets EACCES when Metro clears
// it on startup.
config.cacheStores = [
  new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
];

// expo-sqlite ships a WebAssembly build (wa-sqlite) for web. Metro doesn't treat
// `.wasm` as an asset by default, so its `import ... from './wa-sqlite.wasm'`
// fails to resolve. Register the extension so the wasm binary is bundled.
config.resolver.assetExts.push('wasm');

// The wasm SQLite VFS relies on SharedArrayBuffer, which browsers only expose in
// a cross-origin isolated context. This middleware only covers responses served
// by Metro's own middleware (bundles/assets) — Expo serves the HTML document
// from an earlier middleware that bypasses it. The authoritative fix is the
// dev proxy in scripts/lib/web-proxy.mjs, which adds COOP/COEP to every
// response. Keep this so direct :8081 bundle requests are isolated too.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  };
};

module.exports = config;
