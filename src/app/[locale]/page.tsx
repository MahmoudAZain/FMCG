import { getTranslations, setRequestLocale, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ProductCard } from '@/components/catalog/ProductCard';
import {
  getCategoryTree,
  getDiscountedProducts,
  getNewestProducts,
  publicImageUrl,
  type ListedProduct,
} from '@/lib/queries/catalog';
import type { Locale } from '@/i18n/routing';

export const revalidate = 60;

function toCardData(p: ListedProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    name_en: p.name_en,
    unit: p.unit,
    pack_size: p.pack_size,
    stock_qty: p.stock_qty,
    min_order_qty: p.min_order_qty,
    base_price: p.base_price,
    effective_price: p.effective_price,
    photo_path: publicImageUrl(p.photo_path),
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const tc = await getTranslations('catalog');
  const activeLocale = (await getLocale()) as Locale;

  const [categories, offers, newest] = await Promise.all([
    getCategoryTree(),
    getDiscountedProducts(8),
    getNewestProducts(8),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-balance text-ink sm:text-3xl">{t('welcome')}</h1>
        <p className="max-w-prose text-ink-2">{t('intro')}</p>
      </section>

      {/* Categories: the primary way people browse a grocery catalogue, so it
          leads rather than sitting under a hamburger (FR-017). */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-ink">{t('browseCategories')}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/c/${category.slug}`}
                className="flex min-h-touch items-center rounded border border-rule bg-surface px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
              >
                {activeLocale === 'ar' ? category.name_ar : category.name_en}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {offers.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-bold text-ink">{tc('offers')}</h2>
            <Link href="/offers" className="text-sm font-semibold text-brand">
              {tc('seeAll')}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {offers.map((product, i) => (
              <ProductCard key={product.id} product={toCardData(product)} priority={i < 2} />
            ))}
          </div>
        </section>
      )}

      {newest.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-ink">{tc('products')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {newest.map((product) => (
              <ProductCard key={product.id} product={toCardData(product)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
