import { describe, expect, it } from 'vitest';
import {
  deleteRefusal,
  isDefaultOnCreate,
  type MilestoneRule,
  milestoneIssues,
  planTotal,
} from './payment-plan.js';

const booking = (percentage: string): MilestoneRule => ({ percentage, timing: 'on_booking' });
const handover = (percentage: string): MilestoneRule => ({ percentage, timing: 'on_handover' });

describe('payment plan rules (FR-DAT-07, BR-02)', () => {
  it('BR-02 accepts a plan totalling exactly 100%', () => {
    expect(milestoneIssues([booking('10'), handover('90.00')])).toEqual([]);
  });

  it('BR-02 refuses a plan totalling 99.99%', () => {
    expect(milestoneIssues([booking('10.00'), handover('89.99')])).toEqual([
      { path: 'milestones', code: 'total_not_100' },
    ]);
  });

  it('BR-02 refuses a plan totalling 100.01%', () => {
    expect(milestoneIssues([booking('10.01'), handover('90')])).toEqual([
      { path: 'milestones', code: 'total_not_100' },
    ]);
  });

  it('BR-02 adds exactly where floats would not (0.01 + 70.68 + 29.31)', () => {
    // In floating point this total is 100.00000000000001.
    expect(0.01 + 70.68 + 29.31).not.toBe(100);
    const plan = [booking('0.01'), booking('70.68'), handover('29.31')];
    expect(planTotal(plan).toFixed()).toBe('100');
    expect(milestoneIssues(plan)).toEqual([]);
  });

  it('BR-02 refuses a plan without milestones', () => {
    expect(milestoneIssues([])).toEqual([{ path: 'milestones', code: 'empty' }]);
  });

  it('FR-DAT-07 a percentage is greater than 0 and at most 100', () => {
    expect(milestoneIssues([booking('0'), handover('100')])).toEqual([
      { path: 'milestones.0.percentage', code: 'out_of_range' },
    ]);
    expect(milestoneIssues([booking('100.01')])).toEqual([
      { path: 'milestones.0.percentage', code: 'out_of_range' },
    ]);
    expect(milestoneIssues([booking('100')])).toEqual([]);
  });

  it.each([
    ['on_booking', {}],
    ['on_handover', {}],
    ['on_date', { dueDate: '2028-06-30' }],
    ['construction_stage', { constructionPct: 50 }],
    ['after_handover', { monthsAfterHandover: 24 }],
  ] as const)('FR-DAT-07 %s with its own field is accepted', (timing, extra) => {
    expect(milestoneIssues([{ percentage: '100', timing, ...extra }])).toEqual([]);
  });

  it.each([
    ['on_date', 'dueDate'],
    ['construction_stage', 'constructionPct'],
    ['after_handover', 'monthsAfterHandover'],
  ] as const)('FR-DAT-07 %s requires %s', (timing, field) => {
    expect(milestoneIssues([{ percentage: '100', timing, [field]: null }])).toEqual([
      { path: `milestones.0.${field}`, code: 'required' },
    ]);
  });

  it('FR-DAT-07 a field that belongs to another timing is not allowed', () => {
    expect(
      milestoneIssues([
        { percentage: '50', timing: 'on_booking', dueDate: '2028-01-01' },
        { percentage: '50', timing: 'on_date', dueDate: '2028-01-01', monthsAfterHandover: 3 },
      ]),
    ).toEqual([
      { path: 'milestones.0.dueDate', code: 'not_allowed' },
      { path: 'milestones.1.monthsAfterHandover', code: 'not_allowed' },
    ]);
  });

  it('FR-DAT-07 the first plan is the default whatever the request says', () => {
    expect(isDefaultOnCreate(0, undefined)).toBe(true);
    expect(isDefaultOnCreate(0, false)).toBe(true);
    expect(isDefaultOnCreate(2, undefined)).toBe(false);
    expect(isDefaultOnCreate(2, false)).toBe(false);
    expect(isDefaultOnCreate(2, true)).toBe(true);
  });

  it('FR-DAT-07 the default plan is deleted only when it is the last one', () => {
    expect(deleteRefusal({ isDefault: true }, 2)).toBe('default_required');
    expect(deleteRefusal({ isDefault: true }, 1)).toBeNull();
    expect(deleteRefusal({ isDefault: false }, 2)).toBeNull();
  });
});
