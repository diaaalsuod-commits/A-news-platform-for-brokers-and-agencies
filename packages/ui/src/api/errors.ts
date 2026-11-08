import { messages } from '@reih/i18n';

/** An API error code, or one the client gives itself when no answer arrived. */
export type ClientErrorCode = 'NETWORK_ERROR';

/** A failed API call. code is the API's error.code, never shown as such (CLAUDE.md, API conventions). */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
    /** Seconds from the Retry-After header of a 429, if the API sent one. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }

  /** The field paths the API refused, from VALIDATION_FAILED details. */
  get fieldIssues(): { path: string; code: string }[] {
    const issues = (this.details as { issues?: unknown }).issues;
    return Array.isArray(issues)
      ? issues.filter(
          (issue): issue is { path: string; code: string } =>
            typeof (issue as { path?: unknown }).path === 'string' &&
            typeof (issue as { code?: unknown }).code === 'string',
        )
      : [];
  }
}

const KNOWN_CODES = new Set(Object.keys(messages.en.errors));

/** A message key in packages/i18n and its values, ready for next-intl's t(). */
export interface MessageRef {
  key: string;
  values?: Record<string, string | number>;
}

/**
 * The message for any failure: the API's own code when packages/i18n knows it, otherwise one
 * chosen by status. A raw code, a status number or a stack trace never reaches the screen.
 */
export function errorMessageRef(error: unknown): MessageRef {
  if (!(error instanceof ApiError)) {
    return { key: 'errors.INTERNAL_ERROR' };
  }
  if (error.code === 'NETWORK_ERROR') {
    return { key: 'clientErrors.NETWORK_ERROR' };
  }
  if (error.status === 429 || error.code === 'TOO_MANY_REQUESTS') {
    return error.retryAfterSeconds
      ? {
          key: 'clientErrors.TOO_MANY_REQUESTS_RETRY',
          values: { minutes: Math.max(1, Math.ceil(error.retryAfterSeconds / 60)) },
        }
      : { key: 'errors.TOO_MANY_REQUESTS' };
  }
  if (KNOWN_CODES.has(error.code)) {
    return { key: `errors.${error.code}` };
  }
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return { key: 'errors.SERVICE_UNAVAILABLE' };
  }
  if (error.status === 401) return { key: 'errors.UNAUTHORIZED' };
  if (error.status === 403) return { key: 'errors.FORBIDDEN' };
  if (error.status === 404) return { key: 'errors.NOT_FOUND' };
  if (error.status >= 400 && error.status < 500) return { key: 'errors.BAD_REQUEST' };
  return { key: 'errors.INTERNAL_ERROR' };
}
