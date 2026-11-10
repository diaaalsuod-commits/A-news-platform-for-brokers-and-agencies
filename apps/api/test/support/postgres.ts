import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

export const POSTGIS_IMAGE = 'postgis/postgis:16-3.4';

/** The first connection is tried at most this often, this far apart. */
export const FIRST_CONNECTION_TRIES = 3;
export const FIRST_CONNECTION_DELAY_MS = 500;

/** The socket was refused or reset: the path to the server, not anything the query did. */
const CONNECTION_ERRORS = new Set(['ECONNRESET', 'ECONNREFUSED']);

/** True for a refused or reset connection, also when Drizzle or pg wraps it as the cause. */
export function isConnectionError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_ERRORS.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs attempt, and again after a short delay when it fails with a refused or reset connection, at
 * most `tries` times in all. Any other failure, and the last one, is thrown at once.
 */
export async function retryConnection<T>(
  attempt: () => Promise<T>,
  options: { tries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const tries = options.tries ?? FIRST_CONNECTION_TRIES;
  const delayMs = options.delayMs ?? FIRST_CONNECTION_DELAY_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attemptNumber = 1; ; attemptNumber += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (attemptNumber >= tries || !isConnectionError(error)) throw error;
      await sleep(delayMs);
    }
  }
}

/** One round trip on a fresh connection: SELECT 1, nothing the tests depend on. */
async function firstRoundTrip(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  // A reset socket can also be reported as an event; the rejected promise already carries it.
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Every test setup starts PostGIS through this. On Docker Desktop the first connection from the
 * host can be reset right after the container reports healthy, so the first round trip is retried
 * (connection errors only, at most three tries). Migrations and every later query run once.
 */
export async function startPostgis(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(POSTGIS_IMAGE).start();
  try {
    await retryConnection(() => firstRoundTrip(container.getConnectionUri()));
  } catch (error) {
    await container.stop();
    throw error;
  }
  return container;
}
