'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Switches language without losing the customer's place.
 *
 * It links to the *same pathname* under the other locale, so the shopper stays
 * on the product they were reading (FR-003). The cart lives in `localStorage`
 * and is untouched by the switch, because a locale change is a navigation, not
 * a storage event (research R11).
 */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('language');
  const pathname = usePathname();
  const router = useRouter();

  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <button
      type="button"
      lang={other}
      aria-label={t('label')}
      onClick={() => router.replace(pathname, { locale: other })}
      className="rounded border border-rule px-3 py-2 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
    >
      {t('switchTo')}
    </button>
  );
}
