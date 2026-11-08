import { ActivateScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function ActivatePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ActivateScreen />;
}
