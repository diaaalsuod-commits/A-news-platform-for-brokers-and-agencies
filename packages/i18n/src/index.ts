import ar from './messages/ar.json' with { type: 'json' };
import en from './messages/en.json' with { type: 'json' };

export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];

/** Used when the browser's language is neither Arabic nor English. */
export const defaultLocale: Locale = 'en';

export const messages: Record<Locale, typeof en> = { ar, en };

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function localeDirection(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
