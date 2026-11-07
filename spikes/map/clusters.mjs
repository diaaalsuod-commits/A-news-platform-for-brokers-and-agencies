// Spike B: 5,000 random points inside the UAE, clustered by MapLibre on the OpenFreeMap liberty style.
// One live run shows what this network costs and records every tile. The replay runs answer tiles
// from memory, so their numbers are rendering and clustering alone.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, median, OUT, probeWebgl, startServer } from '../common.mjs';

const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const TILES = 'https://tiles.openfreemap.org/**';
const RUNS = 3;
const DUBAI = [55.27, 25.2];
const ZOOM_STEPS = [7, 8, 9, 10, 11, 12, 13, 6];

// A rough outline of the UAE, drawn by hand for this spike. It is not survey data, and some points
// land just offshore. That does not matter for timing.
const UAE = [
  [51.59, 24.12],
  [52.58, 22.94],
  [55.1, 22.62],
  [55.21, 22.71],
  [55.6, 24.0],
  [55.8, 24.01],
  [55.95, 24.22],
  [55.85, 24.9],
  [56.33, 24.98],
  [56.33, 25.6],
  [56.1, 26.0],
  [55.6, 25.65],
  [55.1, 25.15],
  [54.6, 24.75],
  [54.0, 24.1],
  [53.0, 24.1],
  [52.0, 24.0],
];

function isInside([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Seeded, so every run and every machine gets the same points.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePoints(count) {
  const random = mulberry32(20261106);
  const features = [];
  while (features.length < count) {
    const point = [51.5 + random() * 5, 22.5 + random() * 3.7];
    if (isInside(point, UAE)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: point },
        properties: { id: features.length + 1 },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const tileCache = new Map();

async function routeTiles(context, stats) {
  await context.route(TILES, async (route) => {
    const url = route.request().url();
    const cached = tileCache.get(url);
    if (cached) {
      stats.replayed += 1;
      await route.fulfill(cached);
      return;
    }
    try {
      const response = await route.fetch({ timeout: 300_000 });
      const body = await response.body();
      stats.downloaded += 1;
      stats.bytes += body.length;
      const entry = { status: response.status(), headers: response.headers(), body };
      if (response.ok()) tileCache.set(url, entry);
      await route.fulfill(entry);
    } catch {
      stats.failed += 1;
      await route.abort();
    }
  });
}

async function run({ launch, baseUrl, query, screenshot }) {
  const browser = await chromium.launch(launch);
  const network = { replayed: 0, downloaded: 0, bytes: 0, failed: 0 };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await routeTiles(context, network);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/map/clusters.html?${query}`);
    const webgl = await probeWebgl(page);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 600_000 });
    const metrics = await page.evaluate(() => window.__metrics);
    const result = {
      ok: true,
      webgl,
      pointCount: metrics.pointCount,
      firstPaintMs: Math.round(metrics.firstPaint),
      firstClustersMs: Math.round(metrics.firstClusters),
      firstIdleMs: Math.round(metrics.firstIdle),
      zooms: [],
    };
    for (const zoom of ZOOM_STEPS) {
      result.zooms.push(
        await page.evaluate(([z, c]) => window.zoomAndMeasure(z, c), [zoom, DUBAI]),
      );
    }
    result.animation = await page.evaluate(
      ([c]) => window.animateAndMeasure(6, 11, c, 3000),
      [DUBAI],
    );
    result.errors = await page.evaluate(() => window.__errors);
    result.network = network;
    if (screenshot) await page.screenshot({ path: join(OUT, 'clusters.png') });
    return result;
  } catch (error) {
    return { ok: false, error: String(error.message).split('\n')[0], network };
  } finally {
    await browser.close();
  }
}

function summarise(runs) {
  const good = runs.filter((entry) => entry.ok);
  if (good.length === 0) return { runs: runs.length, ok: 0, error: runs[0]?.error };
  const zoomMedian = (key) =>
    ZOOM_STEPS.map((zoom, index) => ({
      zoom,
      ms: median(good.map((entry) => entry.zooms[index][key])),
    }));
  return {
    runs: runs.length,
    ok: good.length,
    renderer: good[0].webgl.renderer,
    firstPaintMs: median(good.map((entry) => entry.firstPaintMs)),
    firstClustersMs: median(good.map((entry) => entry.firstClustersMs)),
    firstIdleMs: median(good.map((entry) => entry.firstIdleMs)),
    reclusterMs: zoomMedian('clustersReady'),
    idleAfterZoomMs: zoomMedian('idle'),
    animation: good[good.length - 1].animation,
    network: good[good.length - 1].network,
    errors: [...new Set(good.flatMap((entry) => entry.errors))].slice(0, 4),
  };
}

const points = makePoints(5000);
writeFileSync(join(OUT, 'points.geojson'), JSON.stringify(points));

const server = await startServer();
const MODES = [
  { name: 'swiftshader', launch: { headless: true, args: SWIFTSHADER } },
  // A real browser with a real GPU, closer to what a broker's laptop does. Not on a server.
  ...(process.platform === 'win32'
    ? [
        {
          name: 'gpu',
          launch: {
            headless: true,
            channel: 'chromium',
            args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'],
          },
        },
      ]
    : []),
];

const LIBERTY_EARLY = 'style=liberty&addOn=style.load';
const results = { points: points.features.length, seed: 20261106, modes: {} };

// Live once, with the first mode: this records the tiles for every replay after it.
const live = await run({
  launch: MODES[0].launch,
  baseUrl: server.url,
  query: LIBERTY_EARLY,
  screenshot: true,
});
console.log('live', JSON.stringify(live));
results.live = summarise([live]);

for (const mode of MODES) {
  for (const [variant, query] of [
    ['blank-no-base-map', 'style=blank'],
    ['replay-add-on-style.load', LIBERTY_EARLY],
    ['replay-add-on-load', 'style=liberty&addOn=load'],
  ]) {
    const runs = [];
    for (let index = 0; index < RUNS; index += 1) {
      const result = await run({ launch: mode.launch, baseUrl: server.url, query });
      runs.push(result);
      console.log(mode.name, variant, `run ${index + 1}`, JSON.stringify(result));
    }
    results.modes[`${mode.name}/${variant}`] = summarise(runs);
  }
}

writeFileSync(
  join(OUT, `results-b-${process.platform}.json`),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
server.close();
