import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Cairo } from 'next/font/google';
import { routing, directionOf, type Locale } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import '../globals.css';

/**
 * Cairo covers both Arabic and Latin, so one family serves the whole interface
 * in either language. `next/font` self-hosts it at build time — no runtime
 * request to a font CDN, which matters on metered mobile data (Principle IV).
 */
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-cairo',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });

  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d6b47',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enables static rendering for this locale segment.
  setRequestLocale(locale);

  const t = await getTranslations('nav');
  const dir = directionOf(locale as Locale);

  return (
    // `dir` is rendered server-side, so the page arrives in the correct
    // direction on first paint — no flash of the wrong layout (FR-002).
    <html lang={locale} dir={dir} className={cairo.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
          >
            {t('skipToContent')}
          </a>

          <header className="border-b border-rule bg-surface">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
              <span className="text-lg font-bold text-brand">{t('home')}</span>
              <LocaleSwitcher />
            </div>
          </header>

          <main id="main" className="mx-auto max-w-5xl px-4 py-8">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
