import { ReferenceDataScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-ADM-04: reference data. */
export default async function ReferenceDataPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReferenceDataScreen />;
}
