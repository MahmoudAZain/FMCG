import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ProductCard } from '@/components/catalog/ProductCard';
import {
  getCategoryBySlug,
  getProductsInCategory,
  publicImageUrl,
  type ListedProduct,
} from '@/lib/queries/catalog';
import type { Locale } from '@/i18n/routing';

const PER_PAGE = 24;

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

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  // The route is a catch-all so a nested path reads naturally in the URL
  // (/c/dairy-cheese/milk); the last segment identifies the category.
  const categorySlug = slug[slug.length - 1];
  if (!categorySlug) notFound();

  const category = await getCategoryBySlug(categorySlug);
  if (!category) notFound();

  const page = Math.max(1, Number(pageParam) || 1);
  const { products, total } = await getProductsInCategory(category.id, { page, perPage: PER_PAGE });

  const t = await getTranslations('catalog');
  const activeLocale = (await getLocale()) as Locale;
  const name = activeLocale === 'ar' ? category.name_ar : category.name_en;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t('breadcrumb')}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <li>
            <Link href="/" className="hover:text-brand">
              {t('home')}
            </Link>
          </li>
          {/* The separator is a chevron that mirrors with direction, because it
              points along the reading order rather than at a fixed side. */}
          <li aria-hidden="true">›</li>
          <li className="font-semibold text-ink">{name}</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">{name}</h1>
        <p className="text-sm text-ink-3">{t('productCount', { count: total })}</p>
      </div>

      {products.length === 0 ? (
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {t('emptyCategory')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product, i) => (
            <ProductCard key={product.id} product={toCardData(product)} priority={i < 4} />
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <nav className="flex items-center justify-between gap-4" aria-label={t('pagination')}>
          {page > 1 ? (
            <Link
              href={`/c/${slug.join('/')}?page=${page - 1}`}
              className="flex min-h-touch items-center rounded border border-rule px-4 font-semibold text-ink"
            >
              {t('previous')}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-ink-3 tabular">
            {t('pageOf', { page, total: lastPage })}
          </span>

          {page < lastPage ? (
            <Link
              href={`/c/${slug.join('/')}?page=${page + 1}`}
              className="flex min-h-touch items-center rounded border border-rule px-4 font-semibold text-ink"
            >
              {t('next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
