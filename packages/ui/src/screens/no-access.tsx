'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useApp, useAppLinks } from '../api/hooks';
import { otherApp } from '../app-config';
import { Link } from '../navigation';
import { PageFrame, PublicHeader } from '../shell';

/**
 * For a user who logged in to the other app: Brokers and Agency Admins work in the Broker Web App,
 * Data Operators and Platform Admins in the Operations Dashboard.
 */
export function NoAccessScreen() {
  const t = useTranslations('noAccess');
  const app = useApp();
  const links = useAppLinks();
  const locale = useLocale();
  const target = otherApp(app);
  const tTarget = useTranslations(target === 'broker' ? 'broker' : 'ops');
  const values = { name: tTarget('title'), app: (chunks: ReactNode) => <bdi>{chunks}</bdi> };
  const href = `${links[target].replace(/\/+$/, '')}/${locale}/login`;

  return (
    <PageFrame header={<PublicHeader />}>
      <section className="reih-card reih-narrow" aria-labelledby="no-access-title">
        <h1 id="no-access-title">{t('title')}</h1>
        <p>{t.rich('body', values)}</p>
        <p>
          <a className="reih-button-link" href={href}>
            {t.rich('action', values)}
          </a>
        </p>
        <p>
          <Link href="/login">{t('backToLogin')}</Link>
        </p>
      </section>
    </PageFrame>
  );
}
