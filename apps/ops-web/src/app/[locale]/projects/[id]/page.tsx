import { ProjectEditorScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: string; id: string }> };

/** FR-DAT-04: one project, its tab in ?tab=. The API checks the id. */
export default async function ProjectPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ProjectEditorScreen projectId={id} />;
}
