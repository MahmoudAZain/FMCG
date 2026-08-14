'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Switches language without losing the customer's place.
 *
 * **A plain `<a>`, not a client-side Link.** Two reasons that are the same
 * reason twice:
 *
 * 1. It must work on first paint. Rendering the switch as a button with an
 *    `onClick`, or even as a client-router Link, leaves it inert until React
 *    hydration finishes — which on a mid-range Android over Egyptian mobile
 *    data is exactly the window in which someone reaching an Arabic-by-default
 *    site in English will tap it.
 *
 * 2. It must actually navigate. A client-side navigation between locales sends
 *    the RSC request through the same middleware, and next-intl's cookie-vs-URL
 *    resolution can silently keep the caller on the current locale — the URL
 *    change ends up not happening. A full document navigation sidesteps that
 *    entirely.
 *
 * The target is built by swapping the locale segment on the current pathname —
 * a plain string transform, so nothing in the routing stack can leave the URL
 * half-changed. The cart lives in `localStorage` and is untouched, because a
 * navigation is not a storage event (research R11, FR-003).
 */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('language');
  const pathname = usePathname();

  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
  const target = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), `/${other}`);

  return (
    <a
      href={target}
      hrefLang={other}
      lang={other}
      aria-label={t('label')}
      className="flex min-h-touch items-center rounded border border-rule px-3 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
    >
      {t('switchTo')}
    </a>
  );
}
