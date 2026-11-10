import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../../shared/http/index.js';
import type { Issue } from '../domain/issues.js';

export const notFound = () => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);

/** 400 VALIDATION_FAILED with the fields and rules, in the shape the validation pipe uses. */
export const validationFailed = (...issues: Issue[]) =>
  new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, { issues });

/** Throws when a domain rule found an issue. */
export function assertNoIssue(issue: Issue | null): void {
  if (issue) throw validationFailed(issue);
}

/** Only the keys that were sent: a field left out of a PATCH stays as it is. */
export function defined<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
