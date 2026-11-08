import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** The only names the web apps take from the root .env (docs/decisions.md). */
const NAMES = ['APP_URL', 'OPS_URL'];

/**
 * Sets APP_URL and OPS_URL for a Next.js app from the root .env file, if it exists. Only these two
 * names are read; every other value in the file, server secrets included, never reaches the web
 * apps. A variable already set in the environment wins.
 *
 * @param {string | URL} envFile the root .env file
 */
export function loadAppUrls(envFile) {
  let parsed = {};
  try {
    parsed = parseEnv(readFileSync(envFile, 'utf8'));
  } catch {
    // No .env file: the environment alone decides.
  }
  for (const name of NAMES) {
    if (!process.env[name] && parsed[name]) {
      process.env[name] = parsed[name];
    }
  }
}
