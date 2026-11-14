import type { MilestoneTiming } from '@reih/contracts';
import { Decimal } from 'decimal.js';
import type { Issue } from './issues.js';

/** What BR-02 and FR-DAT-07 look at in one milestone. Null and undefined both mean "not given". */
export interface MilestoneRule {
  percentage: string;
  timing: MilestoneTiming;
  dueDate?: string | null;
  constructionPct?: number | null;
  monthsAfterHandover?: number | null;
}

type TimingField = 'dueDate' | 'constructionPct' | 'monthsAfterHandover';

/** FR-DAT-07: the one field each timing takes; on_booking and on_handover take none. */
export const TIMING_FIELD: Readonly<Record<MilestoneTiming, TimingField | null>> = {
  on_booking: null,
  on_date: 'dueDate',
  construction_stage: 'constructionPct',
  on_handover: null,
  after_handover: 'monthsAfterHandover',
};

const TIMING_FIELDS: readonly TimingField[] = ['dueDate', 'constructionPct', 'monthsAfterHandover'];
const HUNDRED = new Decimal(100);

/** The exact total of the percentages, with decimal.js, never a float (BR-02). */
export function planTotal(milestones: readonly Pick<MilestoneRule, 'percentage'>[]): Decimal {
  return milestones.reduce((sum, m) => sum.plus(new Decimal(m.percentage)), new Decimal(0));
}

/**
 * BR-02, FR-DAT-07: every refused field of a plan's milestones, in order. A percentage is greater
 * than 0 and at most 100 (numeric(5,2), as the column's CHECK says); each timing takes exactly its
 * own field; there is at least one milestone; and the total is exactly 100. The database checks the
 * total again at commit (plan_total_100), and that trigger never sees a plan without milestones.
 */
export function milestoneIssues(milestones: readonly MilestoneRule[]): Issue[] {
  if (milestones.length === 0) return [{ path: 'milestones', code: 'empty' }];
  const issues: Issue[] = [];
  let percentagesValid = true;

  milestones.forEach((milestone, index) => {
    const at = `milestones.${index}`;
    let share: Decimal | null;
    try {
      share = new Decimal(milestone.percentage);
    } catch {
      share = null;
    }
    if (!share || !share.isFinite() || share.lte(0) || share.gt(HUNDRED)) {
      percentagesValid = false;
      issues.push({ path: `${at}.percentage`, code: 'out_of_range' });
    }

    const wanted = TIMING_FIELD[milestone.timing];
    for (const field of TIMING_FIELDS) {
      const given = milestone[field] !== undefined && milestone[field] !== null;
      if (field === wanted && !given) issues.push({ path: `${at}.${field}`, code: 'required' });
      if (field !== wanted && given) issues.push({ path: `${at}.${field}`, code: 'not_allowed' });
    }
  });

  if (percentagesValid && !planTotal(milestones).equals(HUNDRED)) {
    issues.push({ path: 'milestones', code: 'total_not_100' });
  }
  return issues;
}

/**
 * FR-DAT-07: a project that has plans has exactly one default. Its first plan is the default
 * whatever the request says; a later plan only when asked.
 */
export function isDefaultOnCreate(existingPlans: number, requested: boolean | undefined): boolean {
  return existingPlans === 0 || requested === true;
}

/**
 * FR-DAT-07: the default plan may be deleted only when it is the project's last plan; otherwise
 * another plan must be made the default first, so a project with plans never has none.
 */
export function deleteRefusal(
  plan: { isDefault: boolean },
  projectPlans: number,
): 'default_required' | null {
  return plan.isDefault && projectPlans > 1 ? 'default_required' : null;
}
