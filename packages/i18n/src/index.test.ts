import { describe, expect, it } from 'vitest';
import { defaultLocale, isLocale, localeDirection, messages } from './index.js';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keys(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('i18n', () => {
  it('Arabic and English define the same keys', () => {
    expect(keys(messages.ar).sort()).toEqual(keys(messages.en).sort());
  });

  it('Arabic is right to left and English is left to right', () => {
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
  });

  it('falls back to English', () => {
    expect(defaultLocale).toBe('en');
  });

  it('recognises only supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});
