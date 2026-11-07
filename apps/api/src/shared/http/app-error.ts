import type { messages } from '@reih/i18n';

/** Every code has its Arabic and English message in packages/i18n, under "errors". */
export type ErrorCode = keyof (typeof messages)['en']['errors'];

/** An expected failure. The exception filter turns it into the API's error body. */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
