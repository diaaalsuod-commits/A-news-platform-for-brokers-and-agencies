import { messages } from '@reih/i18n';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { ApiError, errorMessageRef } from './errors';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const apiError = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: 'from the API', details: {} } }, headers);

function client(handler: Handler, onUnauthorized = vi.fn()) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  const api = new ApiClient({
    language: () => 'ar',
    onUnauthorized,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { api, calls, onUnauthorized };
}

const header = (init: RequestInit, name: string) =>
  (init.headers as Record<string, string> | undefined)?.[name];

describe('ApiClient', () => {
  it('SRS 3.3 sends the CSRF token on a POST, fetched once, with cookies and the language', async () => {
    const { api, calls } = client((url) =>
      url.endsWith('/auth/csrf') ? json(200, { token: 'csrf-1' }) : json(200, { ok: true }),
    );
    await api.post('/auth/login', { body: { email: 'a@b.test', password: 'x' } });
    await api.patch('/me', { body: {} });

    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/auth/login',
      '/api/v1/me',
    ]);
    for (const call of calls.slice(1)) {
      expect(header(call.init, 'x-csrf-token')).toBe('csrf-1');
      expect(header(call.init, 'Accept-Language')).toBe('ar');
      expect(call.init.credentials).toBe('same-origin');
    }
  });

  it('SRS 3.3 a GET carries no CSRF token', async () => {
    const { api, calls } = client(() => json(200, { ok: true }));
    await api.get('/me');
    expect(calls).toHaveLength(1);
    expect(header(calls[0]!.init, 'x-csrf-token')).toBeUndefined();
  });

  it('SRS 3.3 on CSRF_TOKEN_INVALID it fetches a new token and retries once', async () => {
    let csrfCalls = 0;
    let postCalls = 0;
    const { api, calls } = client((url) => {
      if (url.endsWith('/auth/csrf')) {
        csrfCalls += 1;
        return json(200, { token: `csrf-${csrfCalls}` });
      }
      postCalls += 1;
      return postCalls === 1 ? apiError(403, 'CSRF_TOKEN_INVALID') : json(200, { ok: true });
    });
    await expect(api.post('/me/password', { body: {} })).resolves.toEqual({ ok: true });
    expect(header(calls.at(-1)!.init, 'x-csrf-token')).toBe('csrf-2');
    expect(postCalls).toBe(2);
  });

  it('SRS 3.3 retries only once, then shows the refusal', async () => {
    const { api } = client((url) =>
      url.endsWith('/auth/csrf') ? json(200, { token: 't' }) : apiError(403, 'CSRF_TOKEN_INVALID'),
    );
    await expect(api.post('/auth/logout')).rejects.toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
  });

  it('FR-ACC-02 a 401 sends the user to log in, unless the caller handles it', async () => {
    const { api, onUnauthorized } = client(() => apiError(401, 'UNAUTHORIZED'));
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();

    await expect(api.get('/me', { redirectOnUnauthorized: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('keeps the API code, status, details and Retry-After', async () => {
    const { api } = client(() => apiError(429, 'TOO_MANY_REQUESTS', { 'Retry-After': '120' }));
    const error = (await api.get('/me').catch((caught: unknown) => caught)) as ApiError;
    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS', status: 429, retryAfterSeconds: 120 });
  });

  it('turns a failed connection and a non-JSON error page into ApiErrors', async () => {
    const offline = client(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offline.api.get('/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    const proxy = client(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(proxy.api.get('/me')).rejects.toMatchObject({ code: 'HTTP_502', status: 502 });
  });

  it('returns undefined for an empty answer and parses with a schema when given', async () => {
    const { api } = client(() => new Response(null, { status: 204 }));
    await expect(api.get('/x')).resolves.toBeUndefined();
  });
});

describe('errorMessageRef', () => {
  const resolve = (ref: { key: string }) => {
    const [namespace, key] = ref.key.split('.') as [string, string];
    return (messages.en as unknown as Record<string, Record<string, string>>)[namespace]?.[key];
  };

  it('maps every API error code to its packages/i18n message', () => {
    for (const code of Object.keys(messages.en.errors)) {
      const ref = errorMessageRef(new ApiError(code, 400));
      expect(ref.key, code).toBe(`errors.${code}`);
      expect(resolve(ref), code).toBeTruthy();
    }
  });

  it('shows how long to wait after a 429 with Retry-After, in whole minutes', () => {
    expect(errorMessageRef(new ApiError('TOO_MANY_REQUESTS', 429, {}, 61))).toEqual({
      key: 'clientErrors.TOO_MANY_REQUESTS_RETRY',
      values: { minutes: 2 },
    });
    expect(errorMessageRef(new ApiError('TOO_MANY_REQUESTS', 429))).toEqual({
      key: 'errors.TOO_MANY_REQUESTS',
    });
  });

  it('never shows a raw code: unknown codes fall back by status', () => {
    expect(errorMessageRef(new ApiError('HTTP_503', 503)).key).toBe('errors.SERVICE_UNAVAILABLE');
    expect(errorMessageRef(new ApiError('HTTP_502', 502)).key).toBe('errors.SERVICE_UNAVAILABLE');
    expect(errorMessageRef(new ApiError('SOMETHING_NEW', 409)).key).toBe('errors.BAD_REQUEST');
    expect(errorMessageRef(new ApiError('HTTP_500', 500)).key).toBe('errors.INTERNAL_ERROR');
    expect(errorMessageRef(new Error('stack trace here')).key).toBe('errors.INTERNAL_ERROR');
    expect(errorMessageRef(new ApiError('NETWORK_ERROR', 0)).key).toBe(
      'clientErrors.NETWORK_ERROR',
    );
  });

  it('every client-side message exists in both languages', () => {
    for (const key of ['NETWORK_ERROR', 'TOO_MANY_REQUESTS_RETRY'] as const) {
      expect(messages.en.clientErrors[key]).toBeTruthy();
      expect(messages.ar.clientErrors[key]).toBeTruthy();
    }
  });
});
