import { isLocale, type Locale } from '@reih/i18n';

const PROBE_ORIGIN = 'https://next.invalid';
const MAX_LENGTH = 2048;

/**
 * The post-login target from ?next=, or null when it is not safe. Only a same-origin relative path
 * that starts with a single "/" passes: no scheme, no "//" or "/\" (which browsers read as another
 * host), no backslash or control character, and never a fragment. The login page itself is refused,
 * so a login never leads back to it.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== 'string' || next.length === 0 || next.length > MAX_LENGTH) {
    return null;
  }
  if (!next.startsWith('/') || next.startsWith('//')) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next) || next.includes('#')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN || url.hash !== '') {
    return null;
  }
  const path = `${url.pathname}${url.search}`;
  // An encoded "//" or backslash could turn back into a host once something decodes the path.
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || decoded.includes('\\')) {
    return null;
  }
  if (/^\/(?:[a-z]{2}\/)?login(?:[/?]|$)/.test(path)) {
    return null;
  }
  return path;
}

/** The same path in another language, when it starts with a locale; otherwise under it. */
export function withLocale(path: string, locale: Locale): string {
  const [, first = '', ...rest] = path.split('/');
  if (isLocale(first)) {
    return ['', locale, ...rest].join('/');
  }
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/**
 * The ?next= value for the page the user is on: path and query only. The fragment, which may
 * hold a link token, never goes into it.
 */
export function currentNextValue(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}`;
}
