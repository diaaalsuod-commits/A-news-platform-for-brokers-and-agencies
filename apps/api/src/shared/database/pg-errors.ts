/** PostgreSQL error codes the modules turn into API errors. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** The PostgreSQL error code, found on the error or, through Drizzle, on its cause. */
function pgCode(error: unknown): unknown {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates
    .map((candidate) => (candidate as { code?: unknown } | null)?.code)
    .find((code) => typeof code === 'string');
}

/** The name of the constraint that refused the change, on the error or on its cause. */
function pgConstraint(error: unknown): unknown {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates
    .map((candidate) => (candidate as { constraint?: unknown } | null)?.constraint)
    .find((name) => typeof name === 'string');
}

/**
 * A unique constraint refused the row, for example a second item with the same code. With a
 * constraint name, only a violation of that constraint counts.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    pgCode(error) === UNIQUE_VIOLATION &&
    (constraint === undefined || pgConstraint(error) === constraint)
  );
}

/** A foreign key refused the change, for example deleting a row that another row still uses. */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgCode(error) === FOREIGN_KEY_VIOLATION;
}
