// Spike B: 5,000 random points inside the UAE, clustered by MapLibre on the OpenFreeMap liberty style.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, median, OUT, probeWebgl, startServer } from '../common.mjs';

const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const RUNS = 3;
const DUBAI = [55.27, 25.2];
const ZOOM_STEPS = [7, 8, 9, 10, 11, 12, 13, 6];

// A rough outline of the UAE mainland, drawn by hand for this spike. It is not survey data.
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

async function run({ launch, baseUrl, style, query, withZoom }) {
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const url = `${baseUrl}/map/clusters.html?${query}`;
    const start = Date.now();
    await page.goto(url);
    const webgl = await probeWebgl(page);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180_000 });
    const metrics = await page.evaluate(() => window.__metrics);
    const result = {
      ok: true,
      webgl,
      pointCount: metrics.pointCount,
      wallMs: Date.now() - start,
      firstClustersMs: Math.round(metrics.firstClusters),
      firstIdleMs: Math.round(metrics.firstIdle),
      styleLoadedMs: Math.round(metrics.styleLoaded),
    };
    if (withZoom) {
      result.zooms = [];
      for (const zoom of ZOOM_STEPS) {
        result.zooms.push(
          await page.evaluate(([z, c]) => window.zoomAndMeasure(z, c), [zoom, DUBAI]),
        );
      }
      result.animation = await page.evaluate(
        ([c]) => window.animateAndMeasure(6, 11, c, 3000),
        [DUBAI],
      );
    }
    result.errors = await page.evaluate(() => window.__errors);
    if (style === 'liberty') await page.screenshot({ path: join(OUT, 'clusters.png') });

    // Reload the same view with the HTTP cache filled: what is left is rendering, not the network.
    const warm = await context.newPage();
    await warm.goto(url);
    await warm.waitForFunction(() => window.__ready === true, null, { timeout: 180_000 });
    const warmMetrics = await warm.evaluate(() => window.__metrics);
    result.warmFirstClustersMs = Math.round(warmMetrics.firstClusters);
    result.warmFirstIdleMs = Math.round(warmMetrics.firstIdle);
    return result;
  } catch (error) {
    return { ok: false, error: String(error.message).split('\n')[0] };
  } finally {
    await browser.close();
  }
}

function summarise(runs) {
  const good = runs.filter((entry) => entry.ok);
  if (good.length === 0) return { runs: runs.length, ok: 0, error: runs[0]?.error };
  const zoomMedian = (key) =>
    good[0].zooms &&
    ZOOM_STEPS.map((zoom, index) => ({
      zoom,
      ms: median(good.map((entry) => entry.zooms[index][key])),
    }));
  return {
    runs: runs.length,
    ok: good.length,
    renderer: good[0].webgl.renderer,
    firstClustersMs: median(good.map((entry) => entry.firstClustersMs)),
    firstIdleMs: median(good.map((entry) => entry.firstIdleMs)),
    warmFirstClustersMs: median(good.map((entry) => entry.warmFirstClustersMs)),
    warmFirstIdleMs: median(good.map((entry) => entry.warmFirstIdleMs)),
    reclusterMs: zoomMedian('clustersReady'),
    idleAfterZoomMs: zoomMedian('idle'),
    animation: good[good.length - 1].animation,
    errors: [...new Set(good.flatMap((entry) => entry.errors))],
  };
}

const points = makePoints(5000);
writeFileSync(join(OUT, 'points.geojson'), JSON.stringify(points));

const server = await startServer();
const MODES = [
  { name: 'headless-shell+swiftshader', launch: { headless: true, args: SWIFTSHADER } },
  // A real browser with a real GPU, closer to what a broker's laptop does. Not available on a server.
  ...(process.platform === 'win32'
    ? [
        {
          name: 'full-chromium-new-headless+gpu',
          launch: {
            headless: true,
            channel: 'chromium',
            args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'],
          },
        },
      ]
    : []),
];

const results = { points: points.features.length, seed: 20261106, modes: {} };
for (const mode of MODES) {
  for (const [variant, style, query] of [
    ['blank', 'blank', 'style=blank'],
    ['liberty-add-on-load', 'liberty', 'style=liberty&addOn=load'],
    ['liberty-add-on-style.load', 'liberty', 'style=liberty&addOn=style.load'],
  ]) {
    const runs = [];
    for (let index = 0; index < RUNS; index += 1) {
      const result = await run({
        launch: mode.launch,
        baseUrl: server.url,
        style,
        query,
        withZoom: true,
      });
      runs.push(result);
      console.log(mode.name, variant, `run ${index + 1}`, JSON.stringify(result));
    }
    results.modes[`${mode.name}/${variant}`] = summarise(runs);
  }
}

writeFileSync(join(OUT, `results-b-${process.platform}.json`), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
server.close();
