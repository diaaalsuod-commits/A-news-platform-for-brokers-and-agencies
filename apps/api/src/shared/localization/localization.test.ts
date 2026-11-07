import { describe, expect, it } from 'vitest';
import {
  convertFromAed,
  formatArea,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  localeFromAcceptLanguage,
  pickDescription,
  pickName,
  sqmToSqft,
} from './index.js';

describe('areas', () => {
  it('FR-LOC-02 100 m² shows as 1,076 ft²', () => {
    expect(formatArea('100', 'sqft', 'en')).toBe('1,076 ft²');
  });

  it('FR-LOC-02 the Arabic display uses the same number with an Arabic unit', () => {
    expect(formatArea('100', 'sqft', 'ar')).toBe('1,076 قدم²');
  });

  it('FR-LOC-02 an area in m² keeps its decimals', () => {
    expect(formatArea('85.50', 'sqm', 'en')).toBe('85.5 m²');
  });

  it('BR-04 converts with 1 m² = 10.7639 ft² and without float errors', () => {
    expect(sqmToSqft('1')).toBe('10.7639');
    expect(sqmToSqft('100')).toBe('1076.39');
    expect(sqmToSqft('0.1')).toBe('1.07639');
  });
});

describe('convertFromAed', () => {
  it('BR-03 divides the AED price by the rate and rounds to two places', () => {
    expect(convertFromAed('1000000.00', '3.67250000')).toBe('272294.08');
  });

  it('BR-03 rounds a half up', () => {
    expect(convertFromAed('1.25', '10')).toBe('0.13');
  });

  it('BR-03 stays exact at the largest stored price', () => {
    expect(convertFromAed('999999999999.99', '1')).toBe('999999999999.99');
  });

  it('refuses a rate of zero or below', () => {
    expect(() => convertFromAed('100', '0')).toThrow(RangeError);
    expect(() => convertFromAed('100', '-1')).toThrow(RangeError);
  });
});

describe('pickName', () => {
  const both = { nameAr: 'برج', nameEn: 'Tower' };

  it('FR-LOC-03 returns the name in the chosen language', () => {
    expect(pickName(both, 'ar')).toBe('برج');
    expect(pickName(both, 'en')).toBe('Tower');
  });

  it('FR-LOC-03 falls back to the other language when the name is missing', () => {
    expect(pickName({ nameAr: null, nameEn: 'Tower' }, 'ar')).toBe('Tower');
    expect(pickName({ nameAr: 'برج', nameEn: undefined }, 'en')).toBe('برج');
  });

  it('FR-LOC-03 treats a blank name as missing', () => {
    expect(pickName({ nameAr: '   ', nameEn: 'Tower' }, 'ar')).toBe('Tower');
  });

  it('FR-LOC-03 falls back for descriptions, and gives null when both are missing', () => {
    expect(pickDescription({ descriptionAr: null, descriptionEn: 'Text' }, 'ar')).toBe('Text');
    expect(pickDescription({ descriptionAr: null, descriptionEn: '' }, 'en')).toBeNull();
  });
});

describe('formatters', () => {
  // 20:30 UTC is 00:30 the next day in the UAE.
  const lateEvening = new Date('2026-11-07T20:30:00Z');

  it('NFR-06 shows dates and times in UAE time', () => {
    expect(formatDate(lateEvening, 'en')).toBe('8 Nov 2026');
    expect(formatDateTime(lateEvening, 'en')).toMatch(/^8 Nov 2026, 12:30\sAM$/i);
  });

  it('NFR-06 shows Arabic dates in Arabic', () => {
    expect(formatDateTime(lateEvening, 'ar')).toContain('ص');
    expect(formatDateTime(lateEvening, 'ar')).toContain('2026');
  });

  it('NFR-06 formats numbers and currencies for each language', () => {
    expect(formatNumber('1250000.5', 'en')).toBe('1,250,000.5');
    expect(formatCurrency('1250000', 'AED', 'en')).toMatch(/^AED\s1,250,000\.00$/);
    expect(formatCurrency('1250000', 'AED', 'ar')).toContain('د.إ');
  });

  it('formats a decimal string without losing digits to a float', () => {
    expect(formatNumber('9007199254740993.25', 'en')).toBe('9,007,199,254,740,993.25');
  });
});

describe('localeFromAcceptLanguage', () => {
  it.each([
    ['ar', 'ar'],
    ['ar-AE,ar;q=0.9,en;q=0.8', 'ar'],
    ['en-GB', 'en'],
    ['en;q=0.5,ar;q=0.9', 'ar'],
    ['fr,ar;q=0.5', 'ar'],
    ['ar;q=0,en', 'en'],
  ])('reads %s as %s', (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });

  it('falls back to English when nothing matches or the header is missing', () => {
    expect(localeFromAcceptLanguage('fr')).toBe('en');
    expect(localeFromAcceptLanguage(undefined)).toBe('en');
  });
});
