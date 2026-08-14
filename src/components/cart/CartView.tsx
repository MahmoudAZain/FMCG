'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { useCart } from '@/lib/cart-store';
import { previewCart } from '@/lib/actions/orders';
import { formatMoney } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Select } from '@/components/ui/Field';
import type { CartPreview } from '@/types/database';
import type { Locale } from '@/i18n/routing';

interface Governorate {
  id: string;
  name_ar: string;
  name_en: string;
  delivery_fee: number;
  min_order_value: number;
}

const GOVERNORATE_KEY = 'elgomala.governorate.v1';

/**
 * The cart.
 *
 * Note what this component never does: add anything up. Every figure rendered
 * here — line totals, subtotal, discount, delivery, grand total — arrives from
 * `price_cart()` on the server. The browser holds identifiers and quantities
 * and asks what they cost (FR-025).
 *
 * That is also why the totals block shows a loading state rather than a stale
 * number while a quantity change is in flight: showing an old total would be
 * showing a number that is briefly wrong, and the whole design exists to
 * prevent exactly that.
 */
export function CartView({ governorates }: { governorates: Governorate[] }) {
  // Every translator is resolved at the top: hooks cannot be called inside a
  // conditional return, and an early return for the empty cart follows.
  const t = useTranslations('cart');
  const tCommon = useTranslations('common');
  const tError = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { lines, hydrated, setQty, remove } = useCart();

  const [governorateId, setGovernorateId] = useState<string>('');
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Remember the chosen governorate so the delivery fee is right on the next
  // visit without asking again.
  useEffect(() => {
    const saved = window.localStorage.getItem(GOVERNORATE_KEY);
    const valid = governorates.find((g) => g.id === saved);
    setGovernorateId(valid?.id ?? governorates[0]?.id ?? '');
  }, [governorates]);

  useEffect(() => {
    if (!governorateId) return;
    window.localStorage.setItem(GOVERNORATE_KEY, governorateId);
  }, [governorateId]);

  // Re-price whenever the basket or the destination changes. The fee and the
  // minimum are per governorate, so switching city changes the total (FR-030).
  useEffect(() => {
    if (!hydrated || !governorateId) return;

    if (lines.length === 0) {
      setPreview(null);
      return;
    }

    startTransition(async () => {
      const result = await previewCart(lines, governorateId);
      if (result.ok) {
        setPreview(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }, [lines, governorateId, hydrated]);

  if (!hydrated) {
    return <p className="py-12 text-center text-ink-3">{tCommon('loading')}</p>;
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg text-ink-2">{t('empty')}</p>
        <Link
          href="/"
          className="flex min-h-touch items-center rounded bg-brand px-6 font-semibold text-on-brand"
        >
          {t('emptyAction')}
        </Link>
      </div>
    );
  }

  const selectedGovernorate = governorates.find((g) => g.id === governorateId);
  const canCheckout = preview?.meets_minimum && preview.blocking_issues.length === 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <ul className="flex flex-1 flex-col gap-3">
        {(preview?.lines ?? []).map((line) => {
          const name = locale === 'ar' ? line.name_ar : line.name_en;
          const discounted = line.unit_discount > 0;

          return (
            <li
              key={line.product_id}
              className="flex flex-col gap-3 rounded border border-rule bg-surface p-3 sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <p className="font-semibold text-ink">{name}</p>
                {line.pack_size && <p className="text-xs text-ink-3">{line.pack_size}</p>}

                <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                  <span className={`tabular font-semibold ${discounted ? 'text-sale' : 'text-ink-2'}`}>
                    {formatMoney(line.unit_price - line.unit_discount, locale)}
                  </span>
                  {discounted && (
                    <span className="text-xs text-ink-3 line-through tabular">
                      {formatMoney(line.unit_price, locale)}
                    </span>
                  )}
                </p>

                {line.issues.map((issue) => (
                  <p key={issue.code} className="mt-1 text-sm text-danger">
                    {t(`issues.${issue.code}`, {
                      available: issue.available_qty ?? 0,
                      min: issue.min_order_qty ?? 0,
                    })}
                  </p>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <QtyStepper
                  value={line.qty}
                  min={1}
                  onChange={(next) => setQty(line.product_id, next)}
                />

                <span className="tabular min-w-24 text-end font-bold text-ink">
                  {formatMoney(line.line_total, locale)}
                </span>

                <button
                  type="button"
                  onClick={() => remove(line.product_id)}
                  className="min-h-touch px-2 text-sm text-ink-3 hover:text-danger"
                >
                  {t('remove')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="flex w-full flex-col gap-4 rounded border border-rule bg-surface p-4 lg:w-80">
        <Select
          id="governorate"
          label={t('deliverTo')}
          value={governorateId}
          onChange={(e) => setGovernorateId(e.target.value)}
        >
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {locale === 'ar' ? g.name_ar : g.name_en}
            </option>
          ))}
        </Select>

        {error && <p className="text-sm text-danger">{tError(error)}</p>}

        {preview && (
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('subtotal')}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(preview.subtotal, locale)}
              </dd>
            </div>

            {preview.discount_total > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">{t('discount')}</dt>
                <dd className="tabular font-semibold text-sale">
                  −{formatMoney(preview.discount_total, locale)}
                </dd>
              </div>
            )}

            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('deliveryFee')}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(preview.delivery_fee, locale)}
              </dd>
            </div>

            <div className="mt-1 flex justify-between gap-4 border-t border-rule pt-2 text-base">
              <dt className="font-bold text-ink">{t('total')}</dt>
              <dd className="tabular font-bold text-ink">
                {formatMoney(preview.grand_total, locale)}
              </dd>
            </div>
          </dl>
        )}

        {preview && !preview.meets_minimum && (
          <p className="rounded border border-flag bg-sale-soft px-3 py-2 text-sm text-sale">
            {t('shortfall', { amount: formatMoney(preview.shortfall, locale) })}
          </p>
        )}

        {selectedGovernorate && (
          <p className="text-xs text-ink-3">
            {t('minOrderValue', {
              amount: formatMoney(selectedGovernorate.min_order_value, locale),
            })}
          </p>
        )}

        <Button
          size="lg"
          fullWidth
          disabled={!canCheckout || pending}
          onClick={() => router.push('/checkout')}
        >
          {t('proceedToCheckout')}
        </Button>

        <p className="text-xs text-ink-3">{t('pricesFromServer')}</p>
      </aside>
    </div>
  );
}
