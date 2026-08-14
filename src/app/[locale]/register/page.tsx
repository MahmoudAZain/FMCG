import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getActiveGovernorates } from '@/lib/queries/catalog';
import { getCurrentProfile } from '@/lib/actions/auth';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getCurrentProfile();
  if (profile) redirect(`/${locale}`);

  const t = await getTranslations('auth');
  const governorates = await getActiveGovernorates();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{t('registerTitle')}</h1>
      <RegisterForm governorates={governorates} />
    </div>
  );
}
