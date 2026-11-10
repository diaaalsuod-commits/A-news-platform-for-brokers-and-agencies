import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export interface LocalStackEnv {
  NODE_ENV?: string;
  APP_URL?: string;
  OPS_URL?: string;
  REDIS_URL?: string;
}

const LOCAL_HOST_SUFFIX = '.localhost';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * The same rule as the e2e CLIs (apps/api/src/cli/e2e-guards.ts): never in production, and both web
 * apps on *.localhost. Clearing Redis keys also needs Redis itself on this machine. Throws with the
 * reason, so nothing is deleted anywhere else.
 */
export function assertLocalStack(env: LocalStackEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('The e2e setup never runs when NODE_ENV is production.');
  }
  for (const name of ['APP_URL', 'OPS_URL'] as const) {
    const host = hostOf(env[name]);
    if (!host?.endsWith(LOCAL_HOST_SUFFIX)) {
      throw new Error(
        `The e2e setup runs only when ${name} is on a host ending with "${LOCAL_HOST_SUFFIX}".`,
      );
    }
  }
  const redisHost = hostOf(env.REDIS_URL);
  if (!redisHost || !(LOOPBACK_HOSTS.has(redisHost) || redisHost.endsWith(LOCAL_HOST_SUFFIX))) {
    throw new Error(
      'The e2e setup clears rate limits only in a Redis on this machine (REDIS_URL).',
    );
  }
}

/** The root .env, with the real environment winning, as the apps read it. */
export function readLocalStackEnv(repoRoot: string): LocalStackEnv {
  const file = resolve(repoRoot, '.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const pick = (name: keyof LocalStackEnv) => process.env[name] ?? fromFile[name];
  return {
    NODE_ENV: pick('NODE_ENV'),
    APP_URL: pick('APP_URL'),
    OPS_URL: pick('OPS_URL'),
    REDIS_URL: pick('REDIS_URL'),
  };
}
