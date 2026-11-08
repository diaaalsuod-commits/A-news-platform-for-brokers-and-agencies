'use client';

import { useTranslations } from 'next-intl';
import { HealthPanel } from '../health-panel';
import { AuthGate } from '../shell';
import { richTags } from '../text';

/** The role's home page. The app's own features come later; for now it greets the user. */
export function HomeScreen() {
  const t = useTranslations('home');
  const tRoles = useTranslations('roles');
  return (
    <AuthGate>
      {(me) => (
        <>
          <h1>
            {me.user.fullName ? t('welcome', { name: me.user.fullName }) : t('welcomeNoName')}
          </h1>
          <p className="reih-muted">
            {t.rich('signedInAs', { email: me.user.email, role: tRoles(me.role), ...richTags })}
          </p>
          <HealthPanel />
        </>
      )}
    </AuthGate>
  );
}
