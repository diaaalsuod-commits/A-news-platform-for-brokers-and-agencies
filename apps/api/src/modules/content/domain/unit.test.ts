import { describe, expect, it } from 'vitest';
import { areaIssue, priceIssue, unitDeleteAllowed } from './unit.js';

describe('unit rules (FR-DAT-08)', () => {
  describe('price', () => {
    it('FR-DAT-08 a price greater than 0 is accepted with any status', () => {
      for (const status of ['available', 'reserved', 'sold', 'on_request'] as const) {
        expect(priceIssue({ status, priceAed: '0.01' }, null)).toBeNull();
      }
    });

    it('FR-DAT-08 a price of 0 is refused', () => {
      expect(priceIssue({ status: 'available', priceAed: '0.00' }, null)).toEqual({
        path: 'priceAed',
        code: 'out_of_range',
      });
    });

    it('FR-DAT-08 a price is required unless the status is on_request', () => {
      for (const status of ['available', 'reserved', 'sold'] as const) {
        expect(priceIssue({ status, priceAed: null }, null)).toEqual({
          path: 'priceAed',
          code: 'required',
        });
      }
      expect(priceIssue({ status: 'on_request', priceAed: null }, null)).toBeNull();
    });

    it('FR-DAT-09 a price, once set, cannot be cleared, even on request', () => {
      expect(priceIssue({ status: 'on_request', priceAed: null }, '1000000.00')).toEqual({
        path: 'priceAed',
        code: 'cannot_clear',
      });
      expect(priceIssue({ status: 'on_request', priceAed: '1000000.00' }, '1000000.00')).toBeNull();
    });
  });

  describe('areas', () => {
    it('FR-DAT-08 the internal area may equal the total area', () => {
      expect(areaIssue({ internalAreaSqm: '80.50', totalAreaSqm: '80.5' })).toBeNull();
      expect(areaIssue({ internalAreaSqm: '80', totalAreaSqm: null })).toBeNull();
    });

    it('FR-DAT-08 the internal area may not exceed the total area', () => {
      expect(areaIssue({ internalAreaSqm: '80.01', totalAreaSqm: '80' })).toEqual({
        path: 'internalAreaSqm',
        code: 'exceeds_total',
      });
    });

    it('FR-DAT-08 areas are greater than 0', () => {
      expect(areaIssue({ internalAreaSqm: '0', totalAreaSqm: null })).toEqual({
        path: 'internalAreaSqm',
        code: 'out_of_range',
      });
      expect(areaIssue({ internalAreaSqm: '10', totalAreaSqm: '0.00' })).toEqual({
        path: 'totalAreaSqm',
        code: 'out_of_range',
      });
    });
  });

  describe('delete', () => {
    it('BR-16 a unit is deleted only on a never-published project and without history', () => {
      expect(unitDeleteAllowed({ projectPublishedAt: null, historyRows: 0 })).toBe(true);
      expect(unitDeleteAllowed({ projectPublishedAt: new Date(), historyRows: 0 })).toBe(false);
      expect(unitDeleteAllowed({ projectPublishedAt: null, historyRows: 1 })).toBe(false);
    });
  });
});
