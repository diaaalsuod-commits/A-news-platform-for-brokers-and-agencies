import { defaultLocale, locales } from '@reih/i18n';
import { defineRouting } from 'next-intl/routing';

/** Detects the browser's language and falls back to defaultLocale. */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
});
