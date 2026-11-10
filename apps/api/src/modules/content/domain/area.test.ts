import { describe, expect, it } from 'vitest';
import { centerIssue, parentAreaIssue, parentIssue } from './area.js';

const EMIRATE_ID = '0b0f6f0e-3c58-4a8e-9d2b-0c7a6f3f1a11';

describe('area rules', () => {
  it('FR-DAT-03 a community must name its emirate', () => {
    expect(parentIssue('community', EMIRATE_ID)).toBeNull();
    expect(parentIssue('community', null)).toEqual({ path: 'parentId', code: 'required' });
    expect(parentIssue('community', undefined)).toEqual({ path: 'parentId', code: 'required' });
  });

  it('FR-DAT-03 an emirate has no parent', () => {
    expect(parentIssue('emirate', null)).toBeNull();
    expect(parentIssue('emirate', undefined)).toBeNull();
    expect(parentIssue('emirate', EMIRATE_ID)).toEqual({ path: 'parentId', code: 'not_allowed' });
  });

  it('FR-DAT-03 the parent must exist and be an emirate, never another community', () => {
    expect(parentAreaIssue({ level: 'emirate' })).toBeNull();
    expect(parentAreaIssue(null)).toEqual({ path: 'parentId', code: 'not_found' });
    expect(parentAreaIssue({ level: 'community' })).toEqual({
      path: 'parentId',
      code: 'not_emirate',
    });
  });

  it('FR-DAT-03 FR-LOC-04 the center must lie inside the UAE; a swapped pair does not', () => {
    expect(centerIssue({ lng: 55.2708, lat: 25.2048 })).toBeNull();
    expect(centerIssue({ lng: 25.2048, lat: 55.2708 })).toEqual({
      path: 'center',
      code: 'outside_uae',
    });
    expect(centerIssue({ lng: 200, lat: 95 })).toEqual({ path: 'center', code: 'outside_uae' });
  });
});
