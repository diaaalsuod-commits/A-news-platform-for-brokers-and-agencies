// Spike A: Arabic A4 PDF with a table, an image and a MapLibre map, printed by headless Chromium.
import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, median, OUT, probeWebgl, startServer } from '../common.mjs';

const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

// Tried in order. "--disable-gpu" stands in for a server with no GPU.
const CONFIGS = [
  { name: 'default', args: [] },
  { name: 'no-gpu', args: ['--disable-gpu'] },
  { name: 'unsafe-swiftshader', args: ['--enable-unsafe-swiftshader'] },
  { name: 'angle-swiftshader', args: SWIFTSHADER },
  { name: 'no-gpu+angle-swiftshader', args: ['--disable-gpu', ...SWIFTSHADER] },
];

const BUILDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8ec5e8"/><stop offset="1" stop-color="#eaf4fa"/>
  </linearGradient></defs>
  <rect width="720" height="480" fill="url(#sky)"/>
  <rect y="420" width="720" height="60" fill="#c9b78f"/>
  <rect x="250" y="60" width="220" height="360" fill="#37566b"/>
  ${Array.from({ length: 11 }, (_, row) =>
    Array.from(
      { length: 6 },
      (_, column) =>
        `<rect x="${266 + column * 33}" y="${78 + row * 30}" width="22" height="18" fill="#cfe6f2"/>`,
    ).join(''),
  ).join('')}
</svg>`;

async function writeImage(browser) {
  const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
  await page.setContent(`<body style="margin:0">${BUILDING_SVG}</body>`);
  await page.screenshot({ path: join(OUT, 'building.png') });
  await page.close();
}

async function render({ args, baseUrl, query, output }) {
  const start = performance.now();
  const browser = await chromium.launch({ headless: true, args });
  const launched = performance.now();
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.goto(`${baseUrl}/pdf/arabic.html?${query}`);
    const webgl = await probeWebgl(page);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    const ready = performance.now();
    const errors = await page.evaluate(() => window.__errors);
    await page.pdf({ path: output, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const end = performance.now();
    return {
      ok: true,
      webgl,
      errors,
      sizeKb: Math.round(statSync(output).size / 1024),
      ms: {
        launch: Math.round(launched - start),
        pageAndMap: Math.round(ready - launched),
        print: Math.round(end - ready),
        total: Math.round(end - start),
      },
    };
  } catch (error) {
    return { ok: false, error: String(error.message).split('\n')[0] };
  } finally {
    await browser.close();
  }
}

const server = await startServer();
const results = { configs: [], captures: [], runs: [] };

const imageBrowser = await chromium.launch({ headless: true });
await writeImage(imageBrowser);
await imageBrowser.close();

for (const config of CONFIGS) {
  const output = join(OUT, `config-${config.name.replaceAll('+', '-')}.pdf`);
  const result = await render({
    args: config.args,
    baseUrl: server.url,
    query: 'capture=snapshot',
    output,
  });
  results.configs.push({ ...config, ...result });
  console.log(config.name, JSON.stringify(result));
}

const working = results.configs.find((config) => config.ok);
if (!working) {
  server.close();
  throw new Error('No Chromium configuration could render the map.');
}

// Does Chromium print a live WebGL canvas, or does it need a snapshot? Is the kept buffer needed?
for (const [name, query] of [
  ['direct-canvas', 'capture=direct'],
  ['direct-canvas-no-preserve', 'capture=direct&preserve=off'],
  ['snapshot-no-preserve', 'capture=snapshot&preserve=off'],
]) {
  const output = join(OUT, `variant-${name}.pdf`);
  const result = await render({ args: working.args, baseUrl: server.url, query, output });
  results.captures.push({ name, ...result });
  console.log(name, JSON.stringify(result));
}

for (let run = 1; run <= 3; run += 1) {
  const result = await render({
    args: working.args,
    baseUrl: server.url,
    query: 'capture=snapshot',
    output: join(OUT, 'arabic.pdf'),
  });
  results.runs.push(result);
  console.log(`run ${run}`, JSON.stringify(result));
}

// A rough NFR-04 estimate: 10 maps of different places, one after another in one browser.
// Each print is a one-page PDF, so this does not measure printing one 10-project document.
const PLACES = [
  [55.1403, 25.0805],
  [55.2708, 25.2048],
  [55.3781, 25.3463],
  [55.4209, 25.4052],
  [55.5549, 25.5647],
  [55.9754, 25.7895],
  [56.3265, 25.1288],
  [54.3773, 24.4539],
  [54.6047, 24.4667],
  [55.7447, 24.2075],
];
// One shared context: the second pass reads tiles from the HTTP cache, which removes the network.
const tenBrowser = await chromium.launch({ headless: true, args: working.args });
const tenContext = await tenBrowser.newContext({ viewport: { width: 794, height: 1123 } });
results.tenMaps = { places: PLACES.length, errors: [] };
for (const pass of ['cold', 'warmCache']) {
  const passStart = performance.now();
  const eachMs = [];
  for (const [index, place] of PLACES.entries()) {
    const start = performance.now();
    const page = await tenContext.newPage();
    await page.goto(`${server.url}/pdf/arabic.html?capture=snapshot&at=${place.join(',')}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    results.tenMaps.errors.push(...(await page.evaluate(() => window.__errors)));
    await page.pdf({
      path: join(OUT, `ten-${pass}-${index + 1}.pdf`),
      format: 'A4',
      printBackground: true,
    });
    await page.close();
    eachMs.push(Math.round(performance.now() - start));
  }
  results.tenMaps[pass] = { eachMs, totalMs: Math.round(performance.now() - passStart) };
}
await tenBrowser.close();
console.log('ten maps', JSON.stringify(results.tenMaps));

const totals = results.runs.filter((run) => run.ok).map((run) => run.ms.total);
results.medianTotalMs = totals.length ? median(totals) : null;
results.workingConfig = working.name;
writeFileSync(join(OUT, `results-a-${process.platform}.json`), JSON.stringify(results, null, 2) + '\n');
console.log('median total ms', results.medianTotalMs, 'with', working.name);
server.close();
