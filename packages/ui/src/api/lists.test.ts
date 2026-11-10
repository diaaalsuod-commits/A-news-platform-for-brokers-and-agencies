import { describe, expect, it } from 'vitest';
import { withQuery } from './lists';

describe('withQuery', () => {
  it('adds the filters that are set and leaves out empty ones', () => {
    expect(withQuery('/admin/agencies')).toBe('/admin/agencies');
    expect(withQuery('/admin/agencies', { q: 'sand line', status: '', page: '2' })).toBe(
      '/admin/agencies?q=sand+line&page=2',
    );
    expect(withQuery('/admin/staff', { role: undefined })).toBe('/admin/staff');
  });
});
