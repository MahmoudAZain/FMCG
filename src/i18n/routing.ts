import { defineRouting } from 'next-intl/routing';

/**
 * Arabic is the default locale and the default direction (Constitution
 * Principle III). English is a first-class alternate, not a fallback.
 */
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',

  // Every route carries its locale, including the default one. A bare `/`
  // redirects to `/ar`. Prefixing the default too keeps URLs unambiguous and
  // makes the language switcher a plain path swap rather than a special case.
  localePrefix: 'always',

  // Remember the visitor's choice across visits (FR-004).
  localeCookie: {
    name: 'ELGOMALA_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
});

export type Locale = (typeof routing.locales)[number];

/** Text direction for a locale. Arabic renders right-to-left (FR-002). */
export function directionOf(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** BCP 47 tag used for currency and number formatting (FR-006). */
export function formattingLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-EG';
}
