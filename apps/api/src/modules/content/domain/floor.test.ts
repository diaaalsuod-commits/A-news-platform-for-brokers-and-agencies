import { describe, expect, it } from 'vitest';
import { parseFloor } from './floor.js';

const key = (label: string) => parseFloor(label)?.sortKey;

describe('floor order (FR-DAT-08, FR-UNT-03)', () => {
  it.each([
    ['B', -1],
    ['B1', -1],
    ['B2', -2],
    ['B5', -5],
    ['G', 0],
    ['M', 1],
    ['1', 2],
    ['2', 3],
    ['10', 11],
    ['200', 201],
  ])('FR-UNT-03 %s has the sort key %i', (label, sortKey) => {
    expect(parseFloor(label)).toEqual({ label, sortKey });
  });

  it('FR-UNT-03 sorting by key puts basements and the ground floor first: B < G < M < 1 < 2 < 10', () => {
    const labels = ['10', '2', 'M', '1', 'G', 'B', 'B2', '100'];
    expect([...labels].sort((a, b) => (key(a) as number) - (key(b) as number))).toEqual([
      'B2',
      'B',
      'G',
      'M',
      '1',
      '2',
      '10',
      '100',
    ]);
  });

  it('accepts lower case and spaces around the label, and stores it upper-case', () => {
    expect(parseFloor(' g ')).toEqual({ label: 'G', sortKey: 0 });
    expect(parseFloor('b3')).toEqual({ label: 'B3', sortKey: -3 });
    expect(parseFloor(' 12 ')).toEqual({ label: '12', sortKey: 13 });
  });

  it.each([
    '',
    ' ',
    '0',
    '01',
    '-1',
    '1.5',
    '201',
    '1000',
    'B0',
    'B6',
    'B10',
    'BB',
    'M1',
    'M2',
    'LG',
    'UG',
    'P1',
    'R',
    'ROOF',
    'PH',
    'GF',
    'X',
    '1st',
  ])('refuses the unknown label %j rather than guessing', (label) => {
    expect(parseFloor(label)).toBeNull();
  });

  it('every accepted label is at most 10 characters (floor_label varchar(10))', () => {
    for (const label of ['B', 'B5', 'G', 'M', '1', '200']) {
      expect(parseFloor(label)?.label.length).toBeLessThanOrEqual(10);
    }
  });
});
