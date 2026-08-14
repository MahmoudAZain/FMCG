import { getLocale } from 'next-intl/server';
import { formatMoney, discountPercent } from '@/lib/money';
import type { Locale } from '@/i18n/routing';

/**
 * A price, with the original struck through beside it when discounted.
 *
 * Showing both is the point: a lone reduced price is just a price, and the
 * customer has no way to see they are saving anything (FR-021).
 *
 * Both numbers come from `effective_price()` — nothing here computes a discount
 * except the badge percentage, which is presentational.
 */
export async function PriceTag({
  basePrice,
  effectivePrice,
  size = 'md',
}: {
  basePrice: number;
  effectivePrice: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const locale = (await getLocale()) as Locale;
  const discounted = effectivePrice < basePrice;
  const percent = discountPercent(basePrice, effectivePrice);

  const priceSize = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  }[size];

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={`font-bold tabular ${priceSize} ${discounted ? 'text-sale' : 'text-ink'}`}
      >
        {formatMoney(effectivePrice, locale)}
      </span>

      {discounted && (
        <>
          <span className="text-sm text-ink-3 line-through tabular">
            {formatMoney(basePrice, locale)}
          </span>
          {percent > 0 && (
            <span className="rounded bg-sale-soft px-1.5 py-0.5 text-xs font-bold text-sale tabular">
              −{percent}%
            </span>
          )}
        </>
      )}
    </div>
  );
}
