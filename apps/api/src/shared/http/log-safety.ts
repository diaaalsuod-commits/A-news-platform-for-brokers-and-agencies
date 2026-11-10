/**
 * What may reach the log (NFR-08, NFR-11). Pure functions, used by the logger options:
 * personal data and passwords are removed by key at any depth, and a failed database query is
 * logged as its SQL text, PostgreSQL code and constraint name only.
 */

export const REDACTED = '[Redacted]';

/**
 * Keys whose values are never logged, wherever they sit in a logged object. Compared without
 * regard to case.
 */
export const SENSITIVE_LOG_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'password_hash',
  'phone',
  'mobile',
  'whatsapp',
  'email',
] as const;

const SENSITIVE = new Set<string>(SENSITIVE_LOG_KEYS.map((key) => key.toLowerCase()));
const isSensitiveKey = (key: string) => SENSITIVE.has(key.toLowerCase());

const MAX_DEPTH = 8;
const MAX_CAUSES = 5;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactAt(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  const isArray = Array.isArray(value);
  // Class instances (a response, a date, an error) are left to their own serializers.
  if (!isArray && !isPlainObject(value)) return value;
  if (ancestors.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';

  ancestors.add(value);
  const copy = isArray
    ? value.map((item) => redactAt(item, depth + 1, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          isSensitiveKey(key) ? REDACTED : redactAt(item, depth + 1, ancestors),
        ]),
      );
  ancestors.delete(value);
  return copy;
}

/**
 * A copy of a logged value with every sensitive key replaced, in nested objects and arrays too.
 * Anything deeper than eight levels is cut, so no value is logged unchecked.
 */
export function redactSensitive<T>(value: T): T {
  return redactAt(value, 0, new WeakSet()) as T;
}

// ---------------------------------------------------------------- errors

/** The fixed text logged for a failed query; the driver's own message can carry values. */
export const DATABASE_ERROR_MESSAGE = 'Database query failed';

const PG_CODE = /^[A-Z0-9_]{1,40}$/;
const PG_IDENTIFIER = /^[\w$]{1,63}$/;

const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null ? (value as PlainObject)[name] : undefined;

/** Drizzle's DrizzleQueryError: its message and its params both carry the bound values. */
const isQueryError = (error: unknown): boolean =>
  typeof field(error, 'query') === 'string' && Array.isArray(field(error, 'params'));

/** node-postgres' DatabaseError: its detail, and sometimes its message, carry row values. */
const isDriverError = (error: unknown): boolean =>
  typeof field(error, 'code') === 'string' && typeof field(error, 'severity') === 'string';

const isDatabaseError = (error: unknown) => isQueryError(error) || isDriverError(error);

/** The first well-formed value of a property on the error or one of its causes. */
function fromChain(error: unknown, name: string, shape: RegExp): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSES && current; depth += 1) {
    const value = field(current, name);
    if (typeof value === 'string' && shape.test(value)) return value;
    current = field(current, 'cause');
  }
  return undefined;
}

/** Only the "at ..." lines: the first lines of a stack repeat the message. */
function framesOf(error: Error): string {
  const stack = error.stack ?? '';
  const messageAt = error.message ? stack.indexOf(error.message) : -1;
  const afterMessage = messageAt === -1 ? stack : stack.slice(messageAt + error.message.length);
  return afterMessage
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n');
}

/** The message that may be logged for an error: never one that quotes query parameters. */
export function safeErrorMessage(error: Error): string {
  return isDatabaseError(error) ? DATABASE_ERROR_MESSAGE : error.message;
}

/**
 * The logger's serializer for errors.
 *
 * A failed query, from any module, becomes its SQL text, the PostgreSQL code and the constraint
 * name: never the parameters, never the driver's detail or message (they contain values), and a
 * stack without its message lines. Any other error keeps its type, message, stack and simple
 * properties (a code, a port); its causes are serialized the same way.
 */
export function serializeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return redactSensitive(error);

  if (isDatabaseError(error)) {
    const query = field(error, 'query');
    return {
      type: 'DatabaseError',
      message: DATABASE_ERROR_MESSAGE,
      ...(typeof query === 'string' ? { query } : {}),
      code: fromChain(error, 'code', PG_CODE),
      constraint: fromChain(error, 'constraint', PG_IDENTIFIER),
      stack: framesOf(error),
    };
  }

  const logged: PlainObject = {
    type: error.constructor.name,
    message: error.message,
    stack: error.stack,
  };
  for (const [key, value] of Object.entries(error)) {
    if (key in logged || key === 'cause') continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      logged[key] = isSensitiveKey(key) ? REDACTED : value;
    }
  }
  if (error.cause !== undefined && depth < MAX_CAUSES) {
    logged.cause = serializeError(error.cause, depth + 1);
  }
  return logged;
}

/**
 * pino takes the log message from the error when none is given. This gives it the safe message
 * first, so the parameters of a failed query do not reach the log through "msg".
 */
export function withSafeMessage(args: readonly unknown[]): unknown[] {
  const [first, second] = args;
  if (typeof second === 'string') return [...args];
  if (first instanceof Error) {
    return [{ err: first }, safeErrorMessage(first), ...args.slice(1)];
  }
  const error = field(first, 'err');
  if (error instanceof Error && field(first, 'msg') === undefined) {
    return [first, safeErrorMessage(error), ...args.slice(1)];
  }
  return [...args];
}
