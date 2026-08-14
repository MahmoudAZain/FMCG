'use client';

import { useCart } from '@/lib/cart-store';

/**
 * The item count beside the cart icon.
 *
 * Renders nothing until localStorage has been read, so the server-rendered
 * markup and the first client render match — a badge that appears with a
 * different number would be a hydration mismatch.
 */
export function CartBadge() {
  const { itemCount, hydrated } = useCart();

  if (!hydrated || itemCount === 0) return null;

  return (
    <span className="tabular rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-on-brand">
      {itemCount}
    </span>
  );
}
