import { describe, expect, it } from 'vitest';
import { currentNextValue, safeNextPath, withLocale } from './safe-next';

describe('safeNextPath', () => {
  it.each([
    ['/en/profile', '/en/profile'],
    ['/ar/profile?tab=password', '/ar/profile?tab=password'],
    ['/en', '/en'],
    ['/', '/'],
    ['/en/a/../profile', '/en/profile'],
  ])('accepts the same-origin relative path %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    ['an absolute URL', 'https://evil.test/en'],
    ['a scheme-relative URL', '//evil.test/en'],
    ['a backslash host', '/\\evil.test'],
    ['a backslash anywhere', '/en\\..\\profile'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a path without a leading slash', 'en/profile'],
    ['a tab inside', '/en/\tprofile'],
    ['a newline inside', '/en/\nprofile'],
    ['a fragment', '/en/profile#token=abc'],
    ['an empty fragment', '/en/profile#'],
    ['an encoded scheme-relative path', '/%2F%2Fevil.test'],
    ['an encoded backslash', '/%5Cevil.test'],
    ['the login page', '/en/login'],
    ['the login page with a query', '/ar/login?next=/en'],
    ['an empty value', ''],
    ['no value', null],
    ['a very long value', `/${'a'.repeat(2048)}`],
  ])('refuses %s', (_name, next) => {
    expect(safeNextPath(next)).toBeNull();
  });

  it('keeps an encoded double slash inside the path, where it cannot name a host', () => {
    expect(safeNextPath('/en/%2F%2Fevil.test')).toBe('/en/%2F%2Fevil.test');
  });
});

describe('withLocale', () => {
  it('swaps the leading locale and keeps the rest', () => {
    expect(withLocale('/en/profile?x=1', 'ar')).toBe('/ar/profile?x=1');
    expect(withLocale('/ar', 'en')).toBe('/en');
  });

  it('puts a path without a locale under it', () => {
    expect(withLocale('/', 'ar')).toBe('/ar');
    expect(withLocale('/profile', 'ar')).toBe('/ar/profile');
  });
});

describe('currentNextValue', () => {
  it('never carries the fragment into ?next=', () => {
    expect(currentNextValue({ pathname: '/en/profile', search: '?a=1' })).toBe('/en/profile?a=1');
    const location = new URL('https://app.localhost/en/activate?x=1#token=secret');
    expect(currentNextValue(location)).toBe('/en/activate?x=1');
    expect(currentNextValue(location)).not.toContain('secret');
  });
});
