'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The cart.
 *
 * It holds `{product_id, qty}` and **nothing else**. No price, no name, no
 * total. Two reasons, and the second is the important one:
 *
 *  - A price stored at add-to-cart time goes stale the moment a promotion
 *    starts or ends, and the customer sees a number the checkout will not
 *    honour.
 *  - Anything in `localStorage` is editable by whoever owns the browser. If a
 *    price lived here, "the cart says 1 EGP" would be a claim the server had to
 *    refute. It cannot make that claim if the field does not exist
 *    (research R11, FR-024).
 *
 * Every amount the customer sees comes back from `price_cart()` on the server.
 */

const STORAGE_KEY = 'elgomala.cart.v1';
const CHANGED_EVENT = 'elgomala:cart-changed';

export interface CartLine {
  product_id: string;
  qty: number;
}

function read(): CartLine[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Anything that is not a well-formed line is dropped rather than trusted.
    // The storage is user-editable, so this is parsing untrusted input.
    return parsed.flatMap((entry): CartLine[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const { product_id, qty } = entry as Record<string, unknown>;
      if (typeof product_id !== 'string' || typeof qty !== 'number') return [];
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) return [];
      return [{ product_id, qty }];
    });
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Private browsing, or storage full. The cart is lost on reload, which is
    // recoverable; crashing the page is not.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function getCart(): CartLine[] {
  return read();
}

export function clearCart() {
  write([]);
}

/**
 * Cart state, kept in step across every component on the page and across tabs.
 *
 * Deliberately survives a language switch: changing language is a navigation,
 * not a session event, and losing a full basket to it would be its own reason
 * never to switch (FR-003).
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(read());
    setHydrated(true);

    const sync = () => setLines(read());
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener('storage', sync); // another tab
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    const next = read().filter((l) => l.product_id !== productId);
    if (qty > 0) next.push({ product_id: productId, qty });
    write(next);
  }, []);

  const add = useCallback((productId: string, qty = 1) => {
    const current = read();
    const existing = current.find((l) => l.product_id === productId);
    const next = existing
      ? current.map((l) =>
          l.product_id === productId ? { ...l, qty: Math.min(999, l.qty + qty) } : l,
        )
      : [...current, { product_id: productId, qty }];
    write(next);
  }, []);

  const remove = useCallback((productId: string) => {
    write(read().filter((l) => l.product_id !== productId));
  }, []);

  const clear = useCallback(() => write([]), []);

  return {
    lines,
    /** False until localStorage has been read, so server and client markup match. */
    hydrated,
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    distinctCount: lines.length,
    add,
    setQty,
    remove,
    clear,
  };
}
