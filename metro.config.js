// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships a WebAssembly build (wa-sqlite) for web. Metro doesn't treat
// `.wasm` as an asset by default, so its `import ... from './wa-sqlite.wasm'`
// fails to resolve. Register the extension so the wasm binary is bundled.
config.resolver.assetExts.push('wasm');

// The wasm SQLite VFS relies on SharedArrayBuffer, which browsers only expose in
// a cross-origin isolated context. Serve the dev bundle with the required COOP/COEP
// headers so the database can open on web.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  };
};

module.exports = config;
