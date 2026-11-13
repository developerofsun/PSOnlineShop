import { setRequestLocale } from 'next-intl/server';
import OrderView from '@/components/OrderView';
import { apiGet } from '@/lib/api';

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; number: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, number } = await params;
  const { status } = await searchParams;
  setRequestLocale(locale);

  // Test mode adds a "no real payment was taken" notice to the order page.
  const settings = await apiGet<Record<string, string | null>>('/api/settings/public', 30);
  const testMode = settings?.['site.test_mode_enabled'] === 'true';

  return <OrderView number={number} status={status} testMode={testMode} />;
}
