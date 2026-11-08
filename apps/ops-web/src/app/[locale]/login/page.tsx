import { LoginScreen } from '@reih/ui/screens';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[]; done?: string | string[] }>;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, done } = await searchParams;
  return <LoginScreen next={first(next)} done={first(done)} />;
}
