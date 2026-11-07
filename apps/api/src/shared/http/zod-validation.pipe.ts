import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from './app-error.js';

/** Validates a request value with a schema from packages/contracts: @Body(new ZodValidationPipe(s)). */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    // zod's own messages are English only, so the details carry the field and the rule.
    const issues = result.error.issues.map(({ path, code }) => ({ path: path.join('.'), code }));
    throw new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, { issues });
  }
}
