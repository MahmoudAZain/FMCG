import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PriceTag } from '@/components/catalog/PriceTag';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { getProductBySlug, getProductPhotos, publicImageUrl } from '@/lib/queries/catalog';
import { formatNumber } from '@/lib/money';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const name = locale === 'ar' ? product.name_ar : product.name_en;
  const description = locale === 'ar' ? product.description_ar : product.description_en;

  return { title: name, description: description ?? undefined };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const photos = await getProductPhotos(product.id);
  const t = await getTranslations('catalog');
  const activeLocale = (await getLocale()) as Locale;
  const isArabic = activeLocale === 'ar';

  const name = isArabic ? product.name_ar : product.name_en;

  // Descriptions are optional per language. Falling back to the other language
  // shows the customer something real rather than a blank panel — a partial
  // translation beats an empty one, and FR-057 already guarantees both *names*
  // exist (FR-022).
  const description = isArabic
    ? (product.description_ar ?? product.description_en)
    : (product.description_en ?? product.description_ar);
  const descriptionIsFallback = isArabic
    ? !product.description_ar && !!product.description_en
    : !product.description_en && !!product.description_ar;

  const brandName = isArabic ? product.brand_name_ar : product.brand_name_en;
  const categoryName = isArabic ? product.category_name_ar : product.category_name_en;
  const outOfStock = product.stock_qty <= 0;

  const specs = [
    { label: t('unit'), value: t(`units.${product.unit}`) },
    product.pack_size ? { label: t('packSize'), value: product.pack_size } : null,
    product.units_per_carton
      ? { label: t('unitsPerCarton'), value: formatNumber(product.units_per_carton, activeLocale) }
      : null,
    product.weight_grams
      ? { label: t('weight'), value: `${formatNumber(product.weight_grams, activeLocale)} g` }
      : null,
    { label: t('storage'), value: t(`storageTypes.${product.storage}`) },
    product.min_order_qty > 1
      ? {
          label: t('minOrder'),
          value: formatNumber(product.min_order_qty, activeLocale),
        }
      : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label={t('breadcrumb')}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <li>
            <Link href="/" className="hover:text-brand">
              {t('home')}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href={`/c/${product.category_slug}`} className="hover:text-brand">
              {categoryName}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square overflow-hidden rounded border border-rule bg-surface-2">
            {photos[0] ? (
              <Image
                src={publicImageUrl(photos[0].storage_path)!}
                alt={(isArabic ? photos[0].alt_ar : photos[0].alt_en) ?? name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex size-full items-center justify-center text-6xl text-ink-3">
                🛒
              </div>
            )}
          </div>

          {photos.length > 1 && (
            <ul className="grid grid-cols-4 gap-2">
              {photos.slice(1).map((photo) => (
                <li key={photo.id} className="relative aspect-square overflow-hidden rounded border border-rule">
                  <Image
                    src={publicImageUrl(photo.storage_path)!}
                    alt={(isArabic ? photo.alt_ar : photo.alt_en) ?? name}
                    fill
                    sizes="25vw"
                    className="object-cover"
                    loading="lazy"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {brandName && <p className="text-sm font-semibold text-brand">{brandName}</p>}
            <h1 className="text-2xl font-bold text-balance text-ink">{name}</h1>
          </div>

          <PriceTag
            basePrice={product.base_price}
            effectivePrice={product.effective_price}
            size="lg"
          />

          <p className="text-sm text-ink-2">
            {outOfStock
              ? t('outOfStock')
              : t('inStock', { count: formatNumber(product.stock_qty, activeLocale) })}
          </p>

          <AddToCartButton
            productId={product.id}
            minOrderQty={product.min_order_qty}
            stockQty={product.stock_qty}
          />

          {description && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-bold text-ink">{t('description')}</h2>
              {/* `lang` and `dir` are set on the paragraph itself when the text
                  is in the other language, so it renders in its own direction
                  instead of inheriting the page's. */}
              <p
                className="text-ink-2"
                lang={descriptionIsFallback ? (isArabic ? 'en' : 'ar') : undefined}
                dir={descriptionIsFallback ? (isArabic ? 'ltr' : 'rtl') : undefined}
              >
                {description}
              </p>
            </div>
          )}

          <dl className="divide-y divide-rule rounded border border-rule bg-surface">
            {specs.map((spec) => (
              <div key={spec.label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="text-ink-3">{spec.label}</dt>
                <dd className="font-semibold text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
