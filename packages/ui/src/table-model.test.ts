import { describe, expect, it } from 'vitest';
import { nextSort, pageCount, pageRows, sortRows, tableView } from './table-model';

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

describe('tableView: the two paging modes of the DataTable (SRS 3.1)', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ n: 45 - index }));

  it('client mode sorts the whole list in the browser, then shows one page of it', () => {
    const view = tableView(
      rows,
      { mode: 'client', page: 2, pageSize: 20 },
      { value: (row) => row.n, direction: 'asc', locale: 'en' },
    );
    expect(view.pages).toBe(3);
    expect(view.page).toBe(2);
    expect(view.sortable).toBe(true);
    expect(view.visible.map((row) => row.n)).toEqual(
      Array.from({ length: 20 }, (_, index) => 21 + index),
    );
  });

  it('client mode keeps a page past the end on the last page', () => {
    const view = tableView(rows, { mode: 'client', page: 9, pageSize: 20 });
    expect(view.page).toBe(3);
    expect(view.visible).toHaveLength(5);
  });

  it('server mode shows the rows as the API sent them, counts pages from total, never sorts', () => {
    const onePage = rows.slice(0, 20);
    const view = tableView(onePage, { mode: 'server', page: 3, pageSize: 20, total: 5000 });
    expect(view.pages).toBe(250);
    expect(view.page).toBe(3);
    expect(view.sortable).toBe(false);
    // Neither sorted nor sliced: page 3 of the server is not row 41 onwards of these rows.
    expect(view.visible).toEqual(onePage);
  });

  it('server mode with no rows has one page', () => {
    const view = tableView([], { mode: 'server', page: 1, pageSize: 20, total: 0 });
    expect(view).toEqual({ visible: [], page: 1, pages: 1, sortable: false });
  });
});
