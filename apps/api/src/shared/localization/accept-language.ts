import { defaultLocale, isLocale, type Locale } from '@reih/i18n';

/** The supported language the caller prefers most, by the q values of Accept-Language. */
export function localeFromAcceptLanguage(header: string | undefined): Locale {
  const ranked = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find(Boolean);
      return { language: tag.trim().split('-')[0]?.toLowerCase() ?? '', q: q ? Number(q) : 1 };
    })
    .filter(({ q }) => q > 0)
    .sort((a, b) => b.q - a.q);

  return ranked.map(({ language }) => language).find(isLocale) ?? defaultLocale;
}
