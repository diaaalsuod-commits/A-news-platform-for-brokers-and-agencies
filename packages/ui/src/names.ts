/** Anything kept in Arabic and English (FR-LOC-03). */
export interface Bilingual {
  nameAr: string | null;
  nameEn: string | null;
}

const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * FR-LOC-03: the text in the screen's language, falling back to the other language when that one
 * is missing or blank; an empty string when neither exists.
 */
export function localText(
  ar: string | null | undefined,
  en: string | null | undefined,
  locale: string,
): string {
  const [first, second] = locale === 'ar' ? [ar, en] : [en, ar];
  if (present(first)) return first;
  return present(second) ? second : '';
}

/** FR-LOC-03: a name in the screen's language, with the other language as the fallback. */
export function localName(item: Bilingual, locale: string): string {
  return localText(item.nameAr, item.nameEn, locale);
}
