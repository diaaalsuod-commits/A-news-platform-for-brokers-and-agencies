import { NewProjectScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

/** FR-DAT-04: a new project, always a draft. */
export default async function NewProjectPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewProjectScreen />;
}
