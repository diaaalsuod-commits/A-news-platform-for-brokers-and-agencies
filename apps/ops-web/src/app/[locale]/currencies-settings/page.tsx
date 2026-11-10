import { CurrenciesSettingsScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-ADM-05, FR-ADM-06: currencies, rates and settings. */
export default async function CurrenciesSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CurrenciesSettingsScreen />;
}
