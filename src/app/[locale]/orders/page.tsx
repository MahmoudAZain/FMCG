import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale, getLocale, getFormatter } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getMyOrders } from '@/lib/queries/orders';
import { getCurrentProfile } from '@/lib/actions/auth';
import { formatMoney } from '@/lib/money';
import type { Locale } from '@/i18n/routing';

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getCurrentProfile();
  if (!profile) redirect(`/${locale}/login?next=/orders`);

  const t = await getTranslations('orders');
  const activeLocale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const orders = await getMyOrders();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>

      {orders.length === 0 ? (
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.reference}`}
                className="flex flex-col gap-2 rounded border border-rule bg-surface p-4 transition-colors hover:border-brand sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-ink tabular" dir="ltr">
                    {order.reference}
                  </span>
                  <span className="text-sm text-ink-3">
                    {format.dateTime(new Date(order.placed_at), 'short')}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className="rounded bg-surface-2 px-2 py-1 text-xs font-semibold text-ink-2">
                    {t(`statuses.${order.status}`)}
                  </span>
                  <span className="font-bold text-ink tabular">
                    {formatMoney(order.grand_total, activeLocale)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
