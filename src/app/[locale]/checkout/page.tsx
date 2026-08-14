import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckoutView } from '@/components/checkout/CheckoutView';
import { getMyAddresses } from '@/lib/queries/catalog';
import { getCurrentProfile } from '@/lib/actions/auth';

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // A courtesy redirect so a signed-out visitor sees the sign-in page rather
  // than an empty checkout. It is not the security boundary — `place_order()`
  // refuses an unauthenticated caller regardless (Principle II).
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/${locale}/login?next=/checkout`);

  const t = await getTranslations('checkout');
  const addresses = await getMyAddresses();

  // RLS already scopes this to the caller's own addresses; flattening the join
  // is presentation, not filtering.
  const options = addresses.map((a) => {
    const governorate = a.governorates as unknown as {
      id: string;
      name_ar: string;
      name_en: string;
      is_active: boolean;
    } | null;

    return {
      id: a.id,
      street_address: a.street_address,
      landmark: a.landmark,
      building: a.building,
      floor_apartment: a.floor_apartment,
      is_default: a.is_default,
      governorate_id: a.governorate_id,
      governorate_name_ar: governorate?.name_ar ?? '',
      governorate_name_en: governorate?.name_en ?? '',
      is_deliverable: governorate?.is_active ?? false,
    };
  });

  // An address in a governorate we no longer serve cannot be delivered to, so
  // it is not offered — picking it would only produce a refusal at the end.
  const deliverable = options.filter((o) => o.is_deliverable);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
      <CheckoutView addresses={deliverable} />
    </div>
  );
}
