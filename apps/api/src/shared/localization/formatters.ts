import { type AreaUnit } from '@reih/contracts';
import { type Locale, messages } from '@reih/i18n';
import { sqmToSqft } from './conversions.js';

const INTL_LOCALE: Record<Locale, string> = { ar: 'ar-AE', en: 'en-AE' };
const TIME_ZONE = 'Asia/Dubai'; // NFR-06

// Intl formats a decimal string exactly; passing it through a number would lose digits.
const decimal = (value: string) => value as Intl.StringNumericLiteral;

export function formatNumber(value: string, lang: Locale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(INTL_LOCALE[lang], { maximumFractionDigits }).format(decimal(value));
}

export function formatCurrency(amount: string, currencyCode: string, lang: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[lang], {
    style: 'currency',
    currency: currencyCode,
  }).format(decimal(amount));
}

/** An area stored in m², in the user's unit. ft² shows whole numbers (FR-LOC-02: 1,076 ft²). */
export function formatArea(sqm: string, unit: AreaUnit, lang: Locale): string {
  const number =
    unit === 'sqft' ? formatNumber(sqmToSqft(sqm), lang, 0) : formatNumber(sqm, lang, 2);
  return `${number} ${messages[lang].units[unit]}`;
}

export function formatDate(date: Date, lang: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    dateStyle: 'medium',
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDateTime(date: Date, lang: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(date);
}
