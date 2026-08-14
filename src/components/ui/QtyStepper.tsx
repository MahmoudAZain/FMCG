'use client';

import { useTranslations } from 'next-intl';

/**
 * Quantity control.
 *
 * Plus and minus buttons rather than a number input, because typing a quantity
 * on a phone means opening the numeric keyboard over the cart. `min` is the
 * product's `min_order_qty` — a wholesale pack is not sold by the unit, and the
 * control should not offer what `place_order` will refuse (FR-032).
 *
 * The buttons are laid out in DOM order and flipped by `dir`, so minus sits on
 * the side the reader starts from in both languages.
 */
export function QtyStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const t = useTranslations('cart');

  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && (max === undefined || value < max);

  const buttonClass =
    'flex size-touch items-center justify-center rounded border border-rule bg-surface ' +
    'text-lg font-semibold text-ink transition-colors hover:border-brand hover:text-brand ' +
    'disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={label ?? t('quantity')}>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={!canDecrease}
        aria-label={t('decrease')}
      >
        −
      </button>

      <output className="tabular min-w-10 text-center text-base font-semibold text-ink">
        {value}
      </output>

      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
        disabled={!canIncrease}
        aria-label={t('increase')}
      >
        +
      </button>
    </div>
  );
}
