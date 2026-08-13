import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Placeholder home page. Stage 3 replaces this with the real storefront —
 * categories, promoted products and search. It exists now so Stage 1 ends
 * somewhere visible: an Arabic right-to-left page on a real URL.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const brand = await getTranslations('brand');
  const footer = await getTranslations('footer');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-balance text-ink">{t('welcome')}</h1>
        <p className="max-w-prose text-lg text-ink-2">{t('intro')}</p>
      </div>

      <div className="rounded border border-rule bg-surface p-5">
        <p className="text-sm font-semibold tracking-wide text-brand uppercase">
          {brand('name')}
        </p>
        <p className="mt-2 text-ink-2">{brand('tagline')}</p>
        <p className="mt-4 text-sm text-ink-3">{footer('deliveringTo')}</p>
      </div>
    </div>
  );
}
