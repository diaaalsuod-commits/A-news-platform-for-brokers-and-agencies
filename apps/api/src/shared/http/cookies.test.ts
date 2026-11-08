import { describe, expect, it } from 'vitest';
import { parseCookies } from './cookies.js';

describe('parseCookies', () => {
  it('reads name-value pairs and trims spaces', () => {
    expect(parseCookies('a=1; b = two ;c=3')).toEqual({ a: '1', b: 'two', c: '3' });
  });

  it('returns nothing for a missing or empty header', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('keeps the first value of a repeated name', () => {
    expect(parseCookies('a=first; a=second')).toEqual({ a: 'first' });
  });

  it('decodes percent-encoding, removes quotes, and keeps bad encoding as sent', () => {
    expect(parseCookies('a=x%20y; b="quoted"; c=%E0%A4%A')).toEqual({
      a: 'x y',
      b: 'quoted',
      c: '%E0%A4%A',
    });
  });

  it('ignores parts without a name', () => {
    expect(parseCookies('=x; novalue; a=1')).toEqual({ a: '1' });
  });

  it('does not let a cookie named __proto__ change the result object', () => {
    const cookies = parseCookies('__proto__=x');
    expect(Object.getPrototypeOf(cookies)).toBe(Object.prototype);
  });
});
