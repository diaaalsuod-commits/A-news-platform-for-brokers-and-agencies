'use client';

import type { PublishStatus, RecordStatus } from '@reih/contracts';
import { useTranslations } from 'next-intl';

/** Every content screen is for the Data Operator only (FR-ACC-04); the API decides as well. */
export const DATA_OPERATOR = ['data_operator'] as const;

/** A developer's status: active or archived (FR-DAT-01). */
export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  const t = useTranslations('content.common');
  return (
    <span className="reih-badge" data-tone={status === 'archived' ? 'warning' : 'success'}>
      {t(status)}
    </span>
  );
}

/** Active or inactive: sales contacts (FR-DAT-02) and areas (FR-DAT-03). */
export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations('content.common');
  return (
    <span className="reih-badge" data-tone={active ? 'success' : 'warning'}>
      {active ? t('active') : t('inactive')}
    </span>
  );
}

/** An empty number field is "not set"; anything else is a number for the schema to check. */
export const asOptionalNumber = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : Number(value);

/** A project's status: draft, published or archived (FR-DAT-04, UC-05.5). */
export function PublishStatusBadge({ status }: { status: PublishStatus }) {
  const t = useTranslations('content.projects.status');
  const tone = status === 'published' ? 'success' : status === 'archived' ? 'warning' : undefined;
  return (
    <span className="reih-badge" data-tone={tone}>
      {t(status)}
    </span>
  );
}
