import { describe, expect, it } from 'vitest';
import { nextSort, pageCount, pageRows, sortRows } from './table-model';

describe('table model', () => {
  const rows = [
    { name: 'beta', count: 10, at: new Date('2026-01-02') },
    { name: 'Alpha', count: 2, at: new Date('2026-01-03') },
    { name: null, count: 5, at: null },
    { name: 'gamma', count: 2, at: new Date('2026-01-01') },
  ];

  it('sorts text with the language rules, ignoring case, missing values last', () => {
    expect(sortRows(rows, (r) => r.name, 'asc', 'en').map((r) => r.name)).toEqual([
      'Alpha',
      'beta',
      'gamma',
      null,
    ]);
    expect(sortRows(rows, (r) => r.name, 'desc', 'en').map((r) => r.name)).toEqual([
      'gamma',
      'beta',
      'Alpha',
      null,
    ]);
  });

  it('sorts numbers and dates, and keeps equal rows in their order', () => {
    expect(sortRows(rows, (r) => r.count, 'asc', 'en').map((r) => r.name)).toEqual([
      'Alpha',
      'gamma',
      null,
      'beta',
    ]);
    expect(sortRows(rows, (r) => r.at, 'desc', 'en').map((r) => r.name)).toEqual([
      'Alpha',
      'beta',
      'gamma',
      null,
    ]);
  });

  it('sorts Arabic names in Arabic order', () => {
    const arabic = [{ n: 'ياسمين' }, { n: 'أحمد' }, { n: 'محمد' }];
    expect(sortRows(arabic, (r) => r.n, 'asc', 'ar').map((r) => r.n)).toEqual([
      'أحمد',
      'محمد',
      'ياسمين',
    ]);
  });

  it('pages rows and never shows a page past the end', () => {
    const many = Array.from({ length: 45 }, (_, i) => i);
    expect(pageCount(45, 20)).toBe(3);
    expect(pageCount(0, 20)).toBe(1);
    expect(pageRows(many, 1, 20)).toHaveLength(20);
    expect(pageRows(many, 3, 20)).toEqual([40, 41, 42, 43, 44]);
    expect(pageRows(many, 9, 20)).toEqual([40, 41, 42, 43, 44]);
  });

  it('a header click sorts ascending, then descending', () => {
    expect(nextSort(null, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(nextSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(nextSort({ key: 'name', direction: 'desc' }, 'email')).toEqual({
      key: 'email',
      direction: 'asc',
    });
  });
});
