import { AgenciesScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-ADM-01, FR-ADM-02: the Platform Admin's agencies. */
export default async function AgenciesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AgenciesScreen />;
}
