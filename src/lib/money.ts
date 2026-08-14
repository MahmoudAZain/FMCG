/**
 * Money formatting.
 *
 * **Formatting only. No arithmetic happens here, and none should.**
 *
 * Every amount in this system is an integer count of piastres (1 EGP = 100
 * piastres), and every sum is computed by the database. The client's entire job
 * is to turn an integer into a string at the moment of rendering. A single
 * `subtotal + fee` in the browser is how a total starts disagreeing with the
 * order — and with cash on delivery, a disagreement is an argument at the door
 * while the driver waits (research R5).
 */

import type { Locale } from '@/i18n/routing';

/** Piastres — always an integer. Never a float, never a decimal string. */
export type Piastres = number;

const BCP47: Record<Locale, string> = {
  ar: 'ar-EG',
  en: 'en-EG',
};

/**
 * `4500` → `‏٤٥٫٠٠ ج.م.‏` in Arabic, `EGP 45.00` in English.
 *
 * The division by 100 here is the one and only place piastres become pounds,
 * and it produces a string immediately — nothing downstream can do arithmetic
 * on the result by accident.
 */
export function formatMoney(piastres: Piastres, locale: Locale): string {
  return new Intl.NumberFormat(BCP47[locale], {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(piastres / 100);
}

/** Digits only, no currency symbol — for table cells that carry their own header. */
export function formatAmount(piastres: Piastres, locale: Locale): string {
  return new Intl.NumberFormat(BCP47[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(piastres / 100);
}

/** Localized integers: quantities, stock counts, order numbers. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(BCP47[locale]).format(value);
}

/**
 * Percentage saved, for a discount badge. Rounds down so the badge never
 * overstates the saving.
 */
export function discountPercent(basePrice: Piastres, effectivePrice: Piastres): number {
  if (basePrice <= 0 || effectivePrice >= basePrice) return 0;
  return Math.floor(((basePrice - effectivePrice) / basePrice) * 100);
}

/**
 * Parses a human-entered pound amount into piastres, for admin forms only.
 *
 * `"45.50"` → `4550`. Rounds to the nearest piastre, because a half-piastre
 * cannot be collected in cash.
 */
export function poundsToPiastres(input: string): Piastres | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(parseFloat(trimmed) * 100);
}

/** `4550` → `"45.50"`, for populating an admin form field. */
export function piastresToPounds(piastres: Piastres): string {
  return (piastres / 100).toFixed(2);
}
