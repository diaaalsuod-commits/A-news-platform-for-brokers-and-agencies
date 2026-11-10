import { AgencyDetailScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string; id: string }> };

/** FR-ADM-01, FR-ADM-02: one agency. The API checks the id; a malformed one shows its message. */
export default async function AgencyDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <AgencyDetailScreen agencyId={id} />;
}
