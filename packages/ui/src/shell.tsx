'use client';

import type { MeResponse } from '@reih/contracts';
import { isLocale, type Locale, locales } from '@reih/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ME_QUERY_KEY,
  rememberLocale,
  useApi,
  useApp,
  useErrorText,
  useLogout,
  useMe,
} from './api/hooks';
import { withLocale } from './api/safe-next';
import { servesRole } from './app-config';
import { Link } from './navigation';

/** Every page: a skip link, a header and the main landmark (NFR-14). */
export function PageFrame({ header, children }: { header: ReactNode; children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <>
      <a href="#main" className="reih-skip-link">
        {t('skipToContent')}
      </a>
      <div className="reih-page">
        {header}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </>
  );
}

function AppTitle() {
  const app = useApp();
  const t = useTranslations(app === 'broker' ? 'broker' : 'ops');
  return <p className="reih-app-title">{t('title')}</p>;
}

/** Header of the pages anyone may open. */
export function PublicHeader() {
  return (
    <header className="reih-header">
      <AppTitle />
      <LanguageSwitch />
    </header>
  );
}

/** Header of the pages behind a login. */
export function AppHeader() {
  const t = useTranslations('nav');
  const logout = useLogout();
  const [leaving, setLeaving] = useState(false);
  return (
    <header className="reih-header">
      <AppTitle />
      <nav aria-label={t('main')} className="reih-nav">
        <Link href="/">{t('home')}</Link>
        <Link href="/profile">{t('profile')}</Link>
      </nav>
      <div className="reih-header-actions">
        <LanguageSwitch />
        <button
          type="button"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void logout().finally(() => setLeaving(false));
          }}
        >
          {leaving ? t('loggingOut') : t('logout')}
        </button>
      </div>
    </header>
  );
}

/**
 * Switches to the same screen in the other language and flips the layout (FR-ACC-06). When a user
 * is logged in the choice is saved first, so it is applied at every login; either way the language
 * cookie keeps it after logout.
 */
export function LanguageSwitch() {
  const t = useTranslations('common');
  const current = useLocale();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const switchTo = async (locale: Locale) => {
    setPending(true);
    setError(null);
    try {
      if (queryClient.getQueryData<MeResponse>(ME_QUERY_KEY)) {
        const me = await api.patch<MeResponse>('/me/preferences', { body: { language: locale } });
        queryClient.setQueryData(ME_QUERY_KEY, me);
      }
      rememberLocale(locale);
      // Path and query only: a link token never travels in the address (see link-token.ts).
      router.replace(withLocale(`${window.location.pathname}${window.location.search}`, locale));
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  };

  return (
    <div className="reih-language-switch" aria-label={t('languageSwitch')} role="group">
      {locales
        .filter((locale) => locale !== current)
        .map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            disabled={pending}
            onClick={() => void switchTo(locale)}
          >
            {t(`languageName.${locale}`)}
          </button>
        ))}
      {error !== null && (
        <span role="alert" className="reih-inline-error">
          {errorText(error)}
        </span>
      )}
    </div>
  );
}

/** Loading and error-with-retry states, used by every data view (SRS 3.1, NFR-12). */
export function LoadState({
  pending,
  error,
  onRetry,
  children,
}: {
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('state');
  const errorText = useErrorText();
  if (pending) {
    return (
      <p role="status" className="reih-muted">
        {t('loading')}
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert" className="reih-alert" data-tone="error">
        <p>{errorText(error)}</p>
        <button type="button" onClick={onRetry}>
          {t('retry')}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * The pages behind a login. While the session is checked it says so; a 401 has already sent the
 * user to log in. A user of the other app is logged out here and sees the "no access" page. The
 * saved language wins: a page opened in the other language is reopened in the saved one.
 */
export function AuthGate({ children }: { children: (me: MeResponse) => ReactNode }) {
  const t = useTranslations('state');
  const app = useApp();
  const locale = useLocale();
  const router = useRouter();
  const logout = useLogout();
  const errorText = useErrorText();
  const me = useMe();
  const handled = useRef(false);

  const role = me.data?.role;
  const saved = me.data?.preferences.language;
  const wrongApp = role !== undefined && !servesRole(app, role);
  const wrongLanguage = !wrongApp && saved !== undefined && saved !== locale && isLocale(saved);

  useEffect(() => {
    if (handled.current) return;
    if (wrongApp) {
      handled.current = true;
      void logout('no-access');
    } else if (wrongLanguage && saved) {
      handled.current = true;
      rememberLocale(saved);
      router.replace(withLocale(`${window.location.pathname}${window.location.search}`, saved));
    }
  }, [wrongApp, wrongLanguage, saved, logout, router]);

  if (me.isPending || wrongApp || wrongLanguage) {
    return (
      <PageFrame header={<PublicHeader />}>
        <p role="status" className="reih-muted">
          {t('checkingSession')}
        </p>
      </PageFrame>
    );
  }
  if (me.isError) {
    return (
      <PageFrame header={<PublicHeader />}>
        <div role="alert" className="reih-alert" data-tone="error">
          <p>{errorText(me.error)}</p>
          <button type="button" onClick={() => void me.refetch()}>
            {t('retry')}
          </button>
        </div>
      </PageFrame>
    );
  }
  return <PageFrame header={<AppHeader />}>{children(me.data)}</PageFrame>;
}
