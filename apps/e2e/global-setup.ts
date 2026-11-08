import { MAILPIT_API } from './tests/support';

/** Fails early, with the fix, when the Docker services are not running. */
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
}
