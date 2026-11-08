import { localeDirection } from '@reih/i18n';
import { fontClassName } from '@reih/ui/font';
import { AppProviders } from '@reih/ui/providers';
import { routing } from '@reih/ui/routing';
import '@reih/ui/styles.css';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ops' });
  return { title: t('title') };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  // Public addresses of both apps, for the "no access" page (next.config.ts loads them).
  const links = { broker: process.env.APP_URL ?? '', ops: process.env.OPS_URL ?? '' };

  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontClassName}>
      <body>
        <NextIntlClientProvider>
          <AppProviders app="ops" links={links}>
            {children}
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
