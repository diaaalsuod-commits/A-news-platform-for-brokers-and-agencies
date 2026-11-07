import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/index.js';
import { downloadHeaders, SignedUrls } from './signed-urls.js';

const KEY = 'media/images/plan one.png';
const SECRET = 'a-test-secret-of-at-least-32-characters';
const NINE_MINUTES = 9 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

const service = (secret = SECRET) => new SignedUrls({ URL_SIGNING_SECRET: secret } as Env);

function parts(url: string) {
  const { pathname, searchParams } = new URL(url, 'https://app.localhost');
  return {
    pathname,
    expires: searchParams.get('expires') ?? undefined,
    signature: searchParams.get('signature') ?? undefined,
  };
}

describe('SignedUrls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('accepts a link while it is valid and encodes the key in the path', () => {
    const urls = service();
    const { pathname, expires, signature } = parts(urls.sign(KEY));
    expect(pathname).toBe('/api/v1/files/media/images/plan%20one.png');
    expect(urls.verify(KEY, expires, signature)).toBe(true);
  });

  it('SRS 3.2 a signed URL fails after it expires, ten minutes by default', () => {
    const urls = service();
    const { expires, signature } = parts(urls.sign(KEY));

    vi.advanceTimersByTime(NINE_MINUTES);
    expect(urls.verify(KEY, expires, signature)).toBe(true);

    vi.advanceTimersByTime(ONE_MINUTE);
    expect(urls.verify(KEY, expires, signature)).toBe(false);
  });

  it('refuses a link for another file', () => {
    const urls = service();
    const { expires, signature } = parts(urls.sign(KEY));
    expect(urls.verify('media/images/other.png', expires, signature)).toBe(false);
  });

  it('refuses a link whose expiry was pushed forward', () => {
    const urls = service();
    const { expires, signature } = parts(urls.sign(KEY));
    expect(urls.verify(KEY, String(Number(expires) + 3600), signature)).toBe(false);
  });

  it('refuses a changed signature, a missing part and a non-numeric expiry', () => {
    const urls = service();
    const { expires, signature = '' } = parts(urls.sign(KEY));
    const flipped = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;

    expect(urls.verify(KEY, expires, flipped)).toBe(false);
    expect(urls.verify(KEY, expires, 'short')).toBe(false);
    expect(urls.verify(KEY, expires, undefined)).toBe(false);
    expect(urls.verify(KEY, undefined, signature)).toBe(false);
    expect(urls.verify(KEY, 'tomorrow', signature)).toBe(false);
  });

  it('refuses a link signed with another secret', () => {
    const { expires, signature } = parts(service(`${SECRET}-other`).sign(KEY));
    expect(service().verify(KEY, expires, signature)).toBe(false);
  });
});

describe('downloadHeaders', () => {
  it('NFR-08 an SVG is sent with a CSP that runs nothing, and with nosniff', () => {
    expect(downloadHeaders('logos/a.svg')).toEqual({
      'Content-Type': 'image/svg+xml',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
  });

  it('other files are sent with nosniff and without that CSP', () => {
    expect(downloadHeaders('media/a.pdf')).toEqual({
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('a file of an unknown type is never guessed at', () => {
    expect(downloadHeaders('media/a.bin')['Content-Type']).toBe('application/octet-stream');
  });
});
