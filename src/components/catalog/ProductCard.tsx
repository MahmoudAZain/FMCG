import Image from 'next/image';
import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PriceTag } from './PriceTag';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import type { Locale } from '@/i18n/routing';

export interface ProductCardData {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  unit: string;
  pack_size: string | null;
  stock_qty: number;
  min_order_qty: number;
  base_price: number;
  effective_price: number;
  photo_path: string | null;
}

/**
 * One product in a listing grid.
 *
 * Two cards per row at 360px. The image carries explicit dimensions so the grid
 * does not reflow as photos arrive on a slow connection — layout shift is worse
 * on mobile data than a slightly later image (Principle IV).
 */
export async function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardData;
  priority?: boolean;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('catalog');

  const name = locale === 'ar' ? product.name_ar : product.name_en;
  const outOfStock = product.stock_qty <= 0;

  return (
    <article className="flex flex-col overflow-hidden rounded border border-rule bg-surface">
      <Link href={`/p/${product.slug}`} className="block" aria-label={name}>
        <div className="relative aspect-square bg-surface-2">
          {product.photo_path ? (
            <Image
              src={product.photo_path}
              alt={name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover"
              priority={priority}
              loading={priority ? undefined : 'lazy'}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-ink-3" aria-hidden="true">
              <span className="text-3xl">🛒</span>
            </div>
          )}

          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/80">
              <span className="rounded bg-ink px-2 py-1 text-xs font-semibold text-surface">
                {t('outOfStock')}
              </span>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={`/p/${product.slug}`} className="min-h-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-balance text-ink">{name}</h3>
        </Link>

        {product.pack_size && <p className="text-xs text-ink-3">{product.pack_size}</p>}

        <div className="mt-auto flex flex-col gap-2">
          <PriceTag
            basePrice={product.base_price}
            effectivePrice={product.effective_price}
            size="sm"
          />

          <AddToCartButton
            productId={product.id}
            minOrderQty={product.min_order_qty}
            stockQty={product.stock_qty}
            compact
          />
        </div>
      </div>
    </article>
  );
}
