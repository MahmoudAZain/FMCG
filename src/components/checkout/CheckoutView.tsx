'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useCart } from '@/lib/cart-store';
import { previewCart } from '@/lib/actions/orders';
import { placeOrder } from '@/lib/actions/orders';
import { formatMoney } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Select, FormError } from '@/components/ui/Field';
import type { CartPreview } from '@/types/database';
import type { Locale } from '@/i18n/routing';

interface AddressOption {
  id: string;
  street_address: string;
  landmark: string;
  building: string | null;
  floor_apartment: string | null;
  is_default: boolean;
  governorate_id: string;
  governorate_name_ar: string;
  governorate_name_en: string;
}

export function CheckoutView({ addresses }: { addresses: AddressOption[] }) {
  const t = useTranslations('checkout');
  const tCart = useTranslations('cart');
  const tCommon = useTranslations('common');
  const tError = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { lines, hydrated, clear } = useCart();

  const [addressId, setAddressId] = useState(
    addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? '',
  );
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  /**
   * Generated once, when the page mounts.
   *
   * This is what makes a double-tap on a slow connection produce one order
   * rather than two: both submissions carry the same key, and `place_order()`
   * returns the existing order for the second (FR-038). Regenerating it per
   * click would defeat the entire mechanism.
   */
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const selectedAddress = addresses.find((a) => a.id === addressId);

  useEffect(() => {
    if (!hydrated || !selectedAddress || lines.length === 0) return;

    startTransition(async () => {
      const result = await previewCart(lines, selectedAddress.governorate_id);
      if (result.ok) setPreview(result.data);
    });
  }, [lines, selectedAddress, hydrated]);

  async function handlePlaceOrder() {
    if (!selectedAddress) return;

    setSubmitting(true);
    setError(null);
    setErrorDetail(null);

    const result = await placeOrder({
      // Identifiers and quantities. There is no field here for a price, and the
      // database would ignore one anyway (FR-026).
      items: lines,
      address_id: selectedAddress.id,
      idempotency_key: idempotencyKey,
      note: note || undefined,
    });

    if (result.ok) {
      clear();
      router.push(`/orders/${result.data.reference}?placed=1`);
      return;
    }

    setError(result.error);
    setErrorDetail(result.field ?? null);
    setSubmitting(false);
  }

  if (!hydrated) {
    return <p className="py-12 text-center text-ink-3">{tCommon('loading')}</p>;
  }

  if (addresses.length === 0) {
    return <FormError>{t('noAddress')}</FormError>;
  }

  if (lines.length === 0) {
    return <p className="py-12 text-center text-ink-2">{tCart('empty')}</p>;
  }

  const blocked = !preview?.meets_minimum || (preview?.blocking_issues.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">{t('deliveryAddress')}</h2>

          <Select
            id="address"
            label={t('chooseAddress')}
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.street_address} — {locale === 'ar' ? a.governorate_name_ar : a.governorate_name_en}
              </option>
            ))}
          </Select>

          {selectedAddress && (
            <div className="rounded border border-rule bg-surface p-3 text-sm text-ink-2">
              <p className="font-semibold text-ink">{selectedAddress.street_address}</p>
              {/* The landmark is shown back deliberately: it is what the driver
                  will actually navigate by, and a wrong one means a failed
                  delivery (FR-007). */}
              <p>{selectedAddress.landmark}</p>
              {selectedAddress.building && <p>{selectedAddress.building}</p>}
              {selectedAddress.floor_apartment && <p>{selectedAddress.floor_apartment}</p>}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <label htmlFor="note" className="text-sm font-semibold text-ink">
            {t('note')}
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('notePlaceholder')}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline-none"
          />
        </section>
      </div>

      <aside className="flex w-full flex-col gap-4 rounded border border-rule bg-surface p-4 lg:w-80">
        <h2 className="text-lg font-bold text-ink">{t('orderSummary')}</h2>

        {preview && (
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{tCart('subtotal')}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(preview.subtotal, locale)}
              </dd>
            </div>

            {preview.discount_total > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">{tCart('discount')}</dt>
                <dd className="tabular font-semibold text-sale">
                  −{formatMoney(preview.discount_total, locale)}
                </dd>
              </div>
            )}

            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{tCart('deliveryFee')}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(preview.delivery_fee, locale)}
              </dd>
            </div>

            <div className="mt-1 flex justify-between gap-4 border-t border-rule pt-2 text-base">
              <dt className="font-bold text-ink">{tCart('total')}</dt>
              <dd className="tabular font-bold text-ink">
                {formatMoney(preview.grand_total, locale)}
              </dd>
            </div>
          </dl>
        )}

        {/* Any line the preview flags — a price move, a stock drop — is shown
            before commitment rather than after (FR-035). */}
        {preview?.lines.some((l) => l.issues.length > 0) && (
          <div className="rounded border border-flag bg-sale-soft px-3 py-2 text-sm text-sale">
            <p className="font-semibold">{t('priceChanged')}</p>
            <ul className="mt-1 list-disc ps-4">
              {preview.lines
                .filter((l) => l.issues.length > 0)
                .map((l) => (
                  <li key={l.product_id}>
                    {locale === 'ar' ? l.name_ar : l.name_en}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {error && (
          <FormError>
            {tError(error)}
            {errorDetail && <span className="mt-1 block text-xs opacity-80">{errorDetail}</span>}
          </FormError>
        )}

        <Button
          size="lg"
          fullWidth
          disabled={blocked || submitting || pending}
          onClick={handlePlaceOrder}
        >
          {submitting ? t('placing') : t('placeOrder')}
        </Button>

        <p className="rounded bg-surface-2 px-3 py-2 text-xs text-ink-2">
          {t('cashOnDeliveryNotice')}
        </p>
      </aside>
    </div>
  );
}
