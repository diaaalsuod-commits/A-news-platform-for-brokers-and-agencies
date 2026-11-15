import { SalesContactsScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-DAT-02: sales contacts. */
export default async function SalesContactsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SalesContactsScreen />;
}
