// NFR-04: one 10-project catalog as one PDF, with render time and network time measured apart.
// Pass "live" downloads tiles. Pass "replay" answers the same requests from memory, so what is
// left is render time. The difference between the two is the time lost to the network.
import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, median, OUT, startServer } from '../common.mjs';

const TILES = 'https://tiles.openfreemap.org/**';
const RUNS = 3;

async function buildCatalog({ baseUrl, query, output, tileCache, record }) {
  const start = performance.now();
  const browser = await chromium.launch({ headless: true });
  const stats = { requests: 0, downloaded: 0, bytes: 0, downloadMsSum: 0, failed: 0 };
  try {
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    await context.route(TILES, async (route) => {
      const url = route.request().url();
      stats.requests += 1;
      const cached = tileCache.get(url);
      if (cached) {
        await route.fulfill(cached);
        return;
      }
      if (!record) {
        stats.failed += 1;
        await route.abort();
        return;
      }
      const fetchStart = performance.now();
      try {
        const response = await route.fetch({ timeout: 300_000 });
        const body = await response.body();
        stats.downloaded += 1;
        stats.bytes += body.length;
        stats.downloadMsSum += performance.now() - fetchStart;
        const entry = { status: response.status(), headers: response.headers(), body };
        if (response.ok()) tileCache.set(url, entry);
        await route.fulfill(entry);
      } catch {
        stats.failed += 1;
        await route.abort();
      }
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/pdf/catalog.html?${query}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 600_000 });
    const ready = performance.now();
    const report = await page.evaluate(() => window.__report);
    const errors = await page.evaluate(() => window.__errors);
    await page.pdf({ path: output, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const end = performance.now();
    return {
      ok: true,
      totalMs: Math.round(end - start),
      pageMs: Math.round(ready - start),
      printMs: Math.round(end - ready),
      sizeKb: Math.round(statSync(output).size / 1024),
      blankMaps: report.maps.filter((map) => map.blank).length,
      mapsMs: report.maps.map((map) => map.ms),
      minColours: Math.min(...report.maps.map((map) => map.colours)),
      errors: [...new Set(errors)].slice(0, 5),
      network: { ...stats, downloadMsSum: Math.round(stats.downloadMsSum) },
    };
  } catch (error) {
    return { ok: false, error: String(error.message).split('\n')[0] };
  } finally {
    await browser.close();
  }
}

const server = await startServer();
const results = { projects: 10, cpus: (await import('node:os')).cpus().length, live: [], replay: [] };
const output = join(OUT, 'catalog.pdf');
const tileCache = new Map();

for (let run = 1; run <= RUNS; run += 1) {
  // A new cache each time, so every live run downloads everything.
  tileCache.clear();
  const result = await buildCatalog({
    baseUrl: server.url,
    query: '',
    output,
    tileCache,
    record: true,
  });
  results.live.push(result);
  console.log(`live ${run}`, JSON.stringify(result));
}

for (let run = 1; run <= RUNS; run += 1) {
  const result = await buildCatalog({
    baseUrl: server.url,
    query: '',
    output,
    tileCache,
    record: false,
  });
  results.replay.push(result);
  console.log(`replay ${run}`, JSON.stringify(result));
}

// The blank check must catch the real failure: a lost drawing buffer.
results.guard = await buildCatalog({
  baseUrl: server.url,
  query: 'preserve=off&lateRead=1',
  output: join(OUT, 'catalog-no-preserve.pdf'),
  tileCache,
  record: false,
});
console.log('guard', JSON.stringify(results.guard));

// The same late read with the flag on must stay correct, or the flag is not the real fix.
results.guardControl = await buildCatalog({
  baseUrl: server.url,
  query: 'lateRead=1',
  output: join(OUT, 'catalog-late-read.pdf'),
  tileCache,
  record: false,
});
console.log('guard control', JSON.stringify(results.guardControl));

const totals = (runs) => runs.filter((run) => run.ok).map((run) => run.totalMs);
results.summary = {
  liveMedianMs: median(totals(results.live)),
  renderOnlyMedianMs: median(totals(results.replay)),
};
results.summary.networkMs = results.summary.liveMedianMs - results.summary.renderOnlyMedianMs;
results.summary.guardCaughtBlankMaps = results.guard.blankMaps;
writeFileSync(
  join(OUT, `results-catalog-${process.platform}.json`),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results.summary));
server.close();
