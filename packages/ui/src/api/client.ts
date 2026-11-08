import { csrfHeaderName, csrfResponseSchema } from '@reih/contracts';
import type { z } from 'zod';
import { ApiError } from './errors';

export const API_BASE = '/api/v1';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions<T> {
  /** A JSON body. */
  body?: unknown;
  /** A multipart body; the browser sets its content type. */
  formData?: FormData;
  /** Parses the answer; without it the answer is returned as JSON, or undefined when empty. */
  schema?: z.ZodType<T>;
  /**
   * When false, a 401 is the caller's to show (login, activation, reset). Otherwise the user is
   * sent to the login page.
   */
  redirectOnUnauthorized?: boolean;
}

export interface ApiClientOptions {
  /** The caller's language, sent as Accept-Language so API messages match the screen. */
  language: () => string;
  /** Called on a 401 from a call that needs a session. */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
}

const MUTATING = new Set<Method>(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The web apps' one way to the API (SRS 3.3): same origin, cookies sent, the CSRF token on every
 * state-changing call, and every failure turned into an ApiError.
 */
export class ApiClient {
  private csrfToken: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
  }

  get<T>(path: string, options: RequestOptions<T> = {}) {
    return this.request('GET', path, options);
  }
  post<T>(path: string, options: RequestOptions<T> = {}) {
    return this.request('POST', path, options);
  }
  put<T>(path: string, options: RequestOptions<T> = {}) {
    return this.request('PUT', path, options);
  }
  patch<T>(path: string, options: RequestOptions<T> = {}) {
    return this.request('PATCH', path, options);
  }
  delete<T>(path: string, options: RequestOptions<T> = {}) {
    return this.request('DELETE', path, options);
  }

  async request<T>(method: Method, path: string, options: RequestOptions<T> = {}): Promise<T> {
    try {
      return await this.send(method, path, options);
    } catch (error) {
      // A token from before a restart or another tab: get a fresh one and try once more.
      if (error instanceof ApiError && error.code === 'CSRF_TOKEN_INVALID') {
        this.csrfToken = null;
        return this.send(method, path, options);
      }
      throw error;
    }
  }

  private async send<T>(method: Method, path: string, options: RequestOptions<T>): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': this.options.language(),
    };
    let body: BodyInit | undefined;
    if (options.formData) {
      body = options.formData;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (MUTATING.has(method)) {
      headers[csrfHeaderName] = await this.csrf();
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}${path}`, {
        method,
        headers,
        body,
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', 0);
    }

    if (!response.ok) {
      const error = await toApiError(response);
      if (error.status === 401 && options.redirectOnUnauthorized !== false) {
        this.options.onUnauthorized?.();
      }
      throw error;
    }
    const text = await response.text();
    if (text === '') {
      return undefined as T;
    }
    const json: unknown = JSON.parse(text);
    return options.schema ? options.schema.parse(json) : (json as T);
  }

  private csrf(): Promise<string> {
    this.csrfToken ??= this.fetchCsrf().catch((error: unknown) => {
      this.csrfToken = null;
      throw error;
    });
    return this.csrfToken;
  }

  private async fetchCsrf(): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}/auth/csrf`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', 0);
    }
    if (!response.ok) {
      throw await toApiError(response);
    }
    return csrfResponseSchema.parse(await response.json()).token;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get('Retry-After'));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; details?: unknown };
    };
    if (typeof body.error?.code === 'string') {
      const details =
        body.error.details && typeof body.error.details === 'object'
          ? (body.error.details as Record<string, unknown>)
          : {};
      return new ApiError(body.error.code, response.status, details, retryAfterSeconds);
    }
  } catch {
    // A proxy's own error page, for example: the status decides the message.
  }
  return new ApiError(`HTTP_${response.status}`, response.status, {}, retryAfterSeconds);
}
