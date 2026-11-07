// Shared by both spikes: a static file server and the browser launcher.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keeps the browser inside spikes/node_modules instead of the user's profile.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
export const { chromium } = await import('playwright');

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const OUT = join(ROOT, 'out');
mkdirSync(OUT, { recursive: true });

const MAPLIBRE_DIST = join(ROOT, 'node_modules/maplibre-gl/dist');
const TYPES = {
  '.map': 'application/json',
  '.css': 'text/css',
  '.geojson': 'application/geo+json',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function resolvePath(pathname) {
  // MapLibre 6 is ES modules only, and loads its worker from the same folder.
  if (pathname.startsWith('/vendor/')) {
    return join(MAPLIBRE_DIST, pathname.slice('/vendor/'.length));
  }
  if (pathname.startsWith('/fonts/')) {
    return resolve(ROOT, '../packages/ui/fonts', pathname.slice('/fonts/'.length));
  }
  return resolve(ROOT, `.${pathname}`);
}

export function startServer() {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const file = resolvePath(decodeURIComponent(pathname));
    if (!existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      done({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
    });
  });
}

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Reads the renderer Chromium really uses. An empty result means WebGL is not available. */
export async function probeWebgl(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const webgl2 = canvas.getContext('webgl2');
    const gl = webgl2 ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return { webgl: false, version: null, renderer: null };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl: true,
      version: webgl2 ? 2 : 1,
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'masked',
    };
  });
}
