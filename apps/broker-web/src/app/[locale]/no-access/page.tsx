import { NoAccessScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function NoAccessPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NoAccessScreen />;
}
