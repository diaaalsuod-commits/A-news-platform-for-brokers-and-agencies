import { messages } from '@reih/i18n';
import { describe, expect, it } from 'vitest';
import { issueField, serverIssueKey } from './form-issues';
import { formatLanguageList, parseLanguageList } from './language-list';
import { localName, localText } from './names';

describe('FR-LOC-03 names in the screen language with a fallback', () => {
  const both = { nameAr: 'الواحة', nameEn: 'Oasis' };

  it('FR-LOC-03 in the Arabic interface the Arabic name appears when it exists', () => {
    expect(localName(both, 'ar')).toBe('الواحة');
    expect(localName(both, 'en')).toBe('Oasis');
  });

  it('FR-LOC-03 a missing or blank translation falls back to the other language', () => {
    expect(localName({ nameAr: null, nameEn: 'Oasis' }, 'ar')).toBe('Oasis');
    expect(localName({ nameAr: 'الواحة', nameEn: '  ' }, 'en')).toBe('الواحة');
    expect(localText(null, null, 'en')).toBe('');
  });
});

describe('server field issues (VALIDATION_FAILED) on their fields', () => {
  it('a missing value reads "required"', () => {
    expect(serverIssueKey('too_small')).toBe('validation.required');
    expect(serverIssueKey('required')).toBe('validation.required');
  });

  it('FR-LOC-04 FR-DAT-02 FR-DAT-03 a content rule has its own message in both languages', () => {
    for (const code of ['outside_uae', 'other_developer', 'not_emirate', 'in_future', 'archived']) {
      const key = serverIssueKey(code);
      expect(key).toBe(`validation.server.${code}`);
      const name = key.split('.')[2] as keyof typeof messages.en.validation.server;
      expect(messages.en.validation.server[name]).toBeTruthy();
      expect(messages.ar.validation.server[name]).toBeTruthy();
    }
  });

  it('an unknown rule reads "not in the expected format", never the code', () => {
    expect(serverIssueKey('invalid_union')).toBe('validation.invalidFormat');
    expect(serverIssueKey('__proto__')).toBe('validation.invalidFormat');
  });

  it('a nested path lands on its top-level field; an unknown field on none', () => {
    const fields = ['nameEn', 'center', 'languages'];
    expect(issueField('nameEn', fields)).toBe('nameEn');
    expect(issueField('center.lng', fields)).toBe('center');
    expect(issueField('languages.0', fields)).toBe('languages');
    expect(issueField('country', fields)).toBeNull();
    expect(issueField('', fields)).toBeNull();
  });
});

describe('FR-DAT-02 a contact language list typed on one line', () => {
  it('splits on commas, spaces and Arabic commas, lower-cased, without empty parts', () => {
    expect(parseLanguageList('ar, EN ru')).toEqual(['ar', 'en', 'ru']);
    expect(parseLanguageList('ar،en ,, ')).toEqual(['ar', 'en']);
    expect(parseLanguageList('')).toEqual([]);
    expect(parseLanguageList(undefined)).toEqual([]);
  });

  it('keeps what the schema must judge (duplicates, wrong lengths)', () => {
    expect(parseLanguageList('ar ar english')).toEqual(['ar', 'ar', 'english']);
  });

  it('shows a stored list as one line', () => {
    expect(formatLanguageList(['ar', 'en'])).toBe('ar, en');
    expect(formatLanguageList([])).toBe('');
  });
});
