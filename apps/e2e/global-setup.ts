import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalStack, readLocalStackEnv } from './local-stack';
import { MAILPIT_API } from './tests/support';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

/** Deletes Redis keys one by one inside Redis, matching a pattern. Local development stack only. */
const DELETE_MATCHING =
  "for _, key in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', key) end return 1";

/**
 * Fails early, with the fix, when the Docker services are not running. Then, only on a local stack
 * (not production, both apps on *.localhost, Redis on this machine), clears the API's rate limit
 * counters in the local Redis, so a second run within 15 minutes is not refused with 429;
 * job queues and other keys stay as they are.
 */
export default async function globalSetup(): Promise<void> {
  try {
    const response = await fetch(`${MAILPIT_API}/info`);
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    throw new Error(
      `Mailpit is not reachable at ${MAILPIT_API} (${String(error)}). Run "docker compose up -d" first.`,
      { cause: error },
    );
  }
  assertLocalStack(readLocalStackEnv(REPO_ROOT));
  execSync(`docker compose exec -T redis redis-cli EVAL "${DELETE_MATCHING}" 0 "rate-limit:*"`, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}
