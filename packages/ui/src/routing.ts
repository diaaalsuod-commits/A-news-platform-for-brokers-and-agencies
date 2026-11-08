import { defaultLocale, locales } from '@reih/i18n';
import { defineRouting } from 'next-intl/routing';

/** The language cookie the switch and the middleware share. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Before login the language is the saved choice (the cookie) or the browser's, falling back to
 * defaultLocale. The cookie lasts a year, so the last language survives logout and a closed browser.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeCookie: { name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax' },
});
