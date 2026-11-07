import { HealthPanel } from '@reih/ui/health-panel';
import { LanguageSwitch } from '@reih/ui/language-switch';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('broker');

  return (
    <main className="reih-page">
      <header className="reih-header">
        <h1>{t('title')}</h1>
        <LanguageSwitch />
      </header>
      <HealthPanel />
    </main>
  );
}
