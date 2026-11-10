import { StaffScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-ADM-03: staff accounts. */
export default async function StaffPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaffScreen />;
}
