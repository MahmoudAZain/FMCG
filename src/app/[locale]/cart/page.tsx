import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CartView } from '@/components/cart/CartView';
import { getActiveGovernorates } from '@/lib/queries/catalog';

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('cart');
  // Only the governorates actually served. The rest are seeded and inactive,
  // and offering one would produce an order the database refuses (FR-056b).
  const governorates = await getActiveGovernorates();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
      <CartView governorates={governorates} />
    </div>
  );
}
