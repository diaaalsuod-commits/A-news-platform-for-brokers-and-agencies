import { z } from 'zod';

const webUrl = z.url({ protocol: /^https?$/ });

/** A name left blank in .env counts as not set. */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.coerce.number().int().min(1).max(65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_FROM: z.string().min(1),
  // Mailpit needs no login, so these two stay optional.
  SMTP_USER: optional(z.string()),
  SMTP_PASSWORD: optional(z.string()),
  FILES_DIR: z.string().min(1),
  URL_SIGNING_SECRET: z.string().min(32),
  APP_URL: webUrl,
  OPS_URL: webUrl,
  // Only the command-line seed that creates the first Platform Admin needs these (SRS 2.5).
  FIRST_ADMIN_EMAIL: optional(z.email()),
  FIRST_ADMIN_PASSWORD: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
}

/** Throws when a variable is missing or invalid. The message names variables, never their values. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
  throw new EnvValidationError(
    `Invalid environment. Missing or invalid variables: ${names.join(', ')}`,
  );
}
