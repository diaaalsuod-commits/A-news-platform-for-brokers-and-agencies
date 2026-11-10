import { AgencySettingsScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-AGY-01 to FR-AGY-04: the Agency Admin's own agency. */
export default async function AgencySettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AgencySettingsScreen />;
}
