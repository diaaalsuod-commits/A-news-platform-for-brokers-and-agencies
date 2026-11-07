import type { Locale } from '@reih/i18n';

type Text = string | null | undefined;

function pick(arabic: Text, english: Text, lang: Locale): string | null {
  const [first, second] = lang === 'ar' ? [arabic, english] : [english, arabic];
  return first?.trim() ? first : second?.trim() ? second : null;
}

/** The name in the chosen language, or in the other one when it is missing (FR-LOC-03). */
export function pickName(row: { nameAr?: Text; nameEn?: Text }, lang: Locale): string {
  return pick(row.nameAr, row.nameEn, lang) ?? '';
}

/** The description in the chosen language, or in the other one when it is missing (FR-LOC-03). */
export function pickDescription(
  row: { descriptionAr?: Text; descriptionEn?: Text },
  lang: Locale,
): string | null {
  return pick(row.descriptionAr, row.descriptionEn, lang);
}
