import { DeveloperDetailScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string; id: string }> };

/** FR-DAT-01: one developer. The API checks the id; a malformed one shows its message. */
export default async function DeveloperDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <DeveloperDetailScreen developerId={id} />;
}
