import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing, formattingLocale } from './routing';

/**
 * Resolves messages for the current request. Runs during server rendering, so
 * translated text is in the HTML on first paint and no dictionary ships to the
 * browser for server-rendered content (Principle IV).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,

    // Amounts are stored as integer piastres and formatted only here, at the
    // render boundary (research R5). `egp` divides by 100 on the way out.
    formats: {
      number: {
        egp: {
          style: 'currency',
          currency: 'EGP',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' },
        full: { dateStyle: 'medium', timeStyle: 'short' },
      },
    },

    // Egypt local time. Report days and displayed timestamps must match the
    // business day staff actually worked, not UTC (research R18).
    timeZone: 'Africa/Cairo',

    // Surface a missing translation loudly in development and degrade quietly
    // in production — a half-translated page is a bug, not a crash.
    onError(error) {
      if (process.env.NODE_ENV !== 'production') console.error(error);
    },
    getMessageFallback({ key }) {
      return process.env.NODE_ENV === 'production' ? '' : `[${formattingLocale(locale)}:${key}]`;
    },
  };
});
