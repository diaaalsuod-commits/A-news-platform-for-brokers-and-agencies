'use client';

import { locales } from '@reih/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from './navigation';

/** Links to the current screen in the other language. */
export function LanguageSwitch() {
  const t = useTranslations('common');
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('languageSwitch')} className="reih-language-switch">
      {locales
        .filter((locale) => locale !== current)
        .map((locale) => (
          <Link key={locale} href={pathname} locale={locale} lang={locale}>
            {t(`languageName.${locale}`)}
          </Link>
        ))}
    </nav>
  );
}
