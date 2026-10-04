#!/usr/bin/env node
// Start Expo's web dev server (Metro) behind the cross-origin-isolation proxy.
//
// Agents and humans should use the proxy URL (default http://localhost:8082):
// it is the only URL where `self.crossOriginIsolated` is true and expo-sqlite
// can open the database on web.
//
//   npm run dev:web                 # expo on 8081, proxy on 8082
//   EXPO_PORT=8081 PROXY_PORT=8082 npm run dev:web
//
// The process stays in the foreground; Ctrl+C stops both servers. When the
// smoke script (`npm run smoke:web`) starts a server itself, it does not use
// this script — it manages its own lifecycle with CI mode (no watch).

import { spawn } from 'node:child_process';
import process from 'node:process';
import { isPortInUse, startHeadersProxy, waitForHttp } from './lib/web-proxy.mjs';

const EXPO_PORT = Number(process.env.EXPO_PORT || 8081);
const PROXY_PORT = Number(process.env.PROXY_PORT || 8082);

if (await isPortInUse(EXPO_PORT)) {
  console.error(
    `[dev:web] Port ${EXPO_PORT} is already in use (stale dev server?). ` +
      `Stop it, or pick another port: EXPO_PORT=8091 PROXY_PORT=8092 npm run dev:web`
  );
  process.exit(1);
}

// detached:true puts Expo (and its child processes) in their own process
// group, so we can reliably kill the whole tree on exit. Killing plain `npx`
// leaves the Metro child orphaned and the port occupied.
const expo = spawn('npx', ['expo', 'start', '--web', '--port', String(EXPO_PORT)], {
  stdio: 'inherit',
  detached: true,
  env: {
    ...process.env,
    EXPO_NO_TELEMETRY: '1',
    BROWSER: 'none',
    // Keep watch mode on: this is the interactive loop.
  },
});

let proxy = null;
let shuttingDown = false;

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

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (proxy) proxy.close();
  killExpo();
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
expo.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`\n[dev:web] expo exited with code ${code}`);
    shutdown(code ?? 1);
  }
});

try {
  await waitForHttp(EXPO_PORT, { timeoutMs: 120_000 });
  proxy = await startHeadersProxy({ targetPort: EXPO_PORT, listenPort: PROXY_PORT });
  console.log('');
  console.log(`[dev:web] Expo/Metro:            http://localhost:${EXPO_PORT}`);
  console.log(`[dev:web] App (cross-origin OK): http://localhost:${PROXY_PORT}  <- use this`);
  console.log('');
} catch (error) {
  console.error('[dev:web] Failed to start:', error.message);
  await shutdown(1);
}
