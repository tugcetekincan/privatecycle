// A tiny same-origin reverse proxy that adds cross-origin isolation headers
// (COOP/COEP) to *every* response, including the HTML document.
//
// Why this exists: expo-sqlite's web build (wa-sqlite) uses SharedArrayBuffer,
// which browsers only expose to cross-origin-isolated documents. Expo's dev
// server sets those headers only on Metro's bundle responses (via
// `server.enhanceMiddleware` in metro.config.js); the HTML document is served
// by an earlier middleware and misses them. Running the dev server behind this
// proxy guarantees `self.crossOriginIsolated === true` on the page itself.
//
// It also forwards WebSocket upgrades so Fast Refresh keeps working.

import http from 'node:http';
import net from 'node:net';

export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/** Merge upstream headers, replacing any isolation headers case-insensitively. */
function withIsolationHeaders(upstreamHeaders) {
  const merged = {};
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'cross-origin-opener-policy' || lower === 'cross-origin-embedder-policy') {
      continue;
    }
    merged[key] = value;
  }
  return { ...merged, ...ISOLATION_HEADERS };
}

/**
 * @param {{ targetPort: number, listenPort: number, targetHost?: string, listenHost?: string }} options
 * @returns {Promise<import('node:http').Server>}
 */
export function startHeadersProxy({
  targetPort,
  listenPort,
  targetHost = '127.0.0.1',
  listenHost = '127.0.0.1',
}) {
  const server = http.createServer((req, res) => {
    const proxyReq = http.request(
      {
        host: targetHost,
        port: targetPort,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: `${targetHost}:${targetPort}` },
      },
      (proxyRes) => {
        const headers = withIsolationHeaders(proxyRes.headers);
        res.writeHead(proxyRes.statusCode || 502, headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (error) => {
      console.error(`[proxy] upstream error for ${req.method} ${req.url}: ${error.code || error.message}`);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Proxy error: ${error.message}`);
    });

    req.pipe(proxyReq);
  });

  // Tunnel WebSocket upgrades (Metro /hot endpoint, dev tools, etc.).
  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(targetPort, targetHost, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        if (name.toLowerCase() === 'host') continue;
        lines.push(`${name}: ${req.rawHeaders[i + 1]}`);
      }
      lines.push(`Host: ${targetHost}:${targetPort}`);
      lines.push('', '');
      upstream.write(lines.join('\r\n'));
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });

    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, () => resolve(server));
  });
}

/** Resolve once the target server answers HTTP. */
export async function waitForHttp(port, { host = '127.0.0.1', timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get({ host, port, path: '/', timeout: 2000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for http://${host}:${port}`);
}

/** True if something already answers HTTP on the port. */
export async function isPortInUse(port, { host = '127.0.0.1' } = {}) {
  return await new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}
