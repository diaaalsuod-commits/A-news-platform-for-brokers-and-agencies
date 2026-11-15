import { DevelopersScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-DAT-01: developers. */
export default async function DevelopersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DevelopersScreen />;
}
