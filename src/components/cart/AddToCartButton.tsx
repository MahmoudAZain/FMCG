'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/lib/cart-store';
import { Button } from '@/components/ui/Button';
import { QtyStepper } from '@/components/ui/QtyStepper';

/**
 * Adds a product to the cart.
 *
 * It sends an identifier and a quantity into `localStorage` and nothing more —
 * no price is read here, so none can be stored.
 *
 * The quantity starts at `min_order_qty` rather than 1: this is a wholesale
 * catalogue, and offering a quantity that `place_order()` will refuse wastes
 * the customer's time (FR-032).
 */
export function AddToCartButton({
  productId,
  minOrderQty,
  stockQty,
  compact = false,
}: {
  productId: string;
  minOrderQty: number;
  stockQty: number;
  compact?: boolean;
}) {
  const t = useTranslations('cart');
  const { add, lines } = useCart();
  const [qty, setQty] = useState(minOrderQty);
  const [justAdded, setJustAdded] = useState(false);

  const inCart = lines.find((l) => l.product_id === productId)?.qty ?? 0;
  const outOfStock = stockQty <= 0;

  function handleAdd() {
    add(productId, qty);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  }

  if (outOfStock) {
    return (
      <Button variant="secondary" fullWidth disabled>
        {t('outOfStock')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <QtyStepper value={qty} min={minOrderQty} max={stockQty} onChange={setQty} />
      )}

      <Button onClick={handleAdd} fullWidth size={compact ? 'md' : 'lg'}>
        {justAdded ? t('added') : t('addToCart')}
      </Button>

      {/* Announced politely so a screen reader confirms the add without
          interrupting whatever the customer is reading. */}
      <p aria-live="polite" className="min-h-0 text-xs text-ink-3">
        {inCart > 0 ? t('inCart', { count: inCart }) : ''}
      </p>
    </div>
  );
}
