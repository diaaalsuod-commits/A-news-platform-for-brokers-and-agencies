import { EnvValidationError, parseEnv } from '../shared/config/index.js';
import { SeedRefused } from '../shared/database/seed-helpers.js';
import { runSeedCommand, type SeedCommand, seedCommands } from './seed-commands.js';

const isSeedCommand = (value: string | undefined): value is SeedCommand =>
  (seedCommands as readonly (string | undefined)[]).includes(value);

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!isSeedCommand(command)) {
    throw new SeedRefused(`Usage: seed <${seedCommands.join(' | ')}>`);
  }
  await runSeedCommand(command, parseEnv(process.env), {
    log: (message) => process.stdout.write(`${message}\n`),
  });
}

main().catch((error: unknown) => {
  // An expected refusal is one clear line, and the exit code tells scripts it did not run.
  const expected = error instanceof SeedRefused || error instanceof EnvValidationError;
  process.stderr.write(`${expected ? (error as Error).message : String(error)}\n`);
  process.exitCode = 1;
});
