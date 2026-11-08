import { SeedRefused } from '../shared/database/seed-helpers.js';

interface E2eGuardEnv {
  NODE_ENV: string;
  APP_URL: string;
  OPS_URL: string;
}

const LOCAL_HOST_SUFFIX = '.localhost';

const isLocalHost = (url: string): boolean => {
  try {
    return new URL(url).hostname.endsWith(LOCAL_HOST_SUFFIX);
  } catch {
    return false;
  }
};

/**
 * The end-to-end helpers create test accounts and send real invitation emails, so they run only on
 * a local development stack: never in production, and only when both web apps are on *.localhost.
 */
export function assertE2eAllowed(env: E2eGuardEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new SeedRefused('e2e:invite never runs when NODE_ENV is production.');
  }
  if (!isLocalHost(env.APP_URL) || !isLocalHost(env.OPS_URL)) {
    throw new SeedRefused(
      `e2e:invite runs only when APP_URL and OPS_URL are on a host ending with "${LOCAL_HOST_SUFFIX}".`,
    );
  }
}
