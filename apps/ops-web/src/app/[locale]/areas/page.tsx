import { AreasScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-DAT-03, FR-LOC-04: emirates and communities. */
export default async function AreasPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AreasScreen />;
}
