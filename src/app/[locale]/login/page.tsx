import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentProfile } from '@/lib/actions/auth';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);

  const profile = await getCurrentProfile();
  if (profile) redirect(`/${locale}`);

  const t = await getTranslations('auth');

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{t('loginTitle')}</h1>
      <LoginForm next={next} />
    </div>
  );
}
