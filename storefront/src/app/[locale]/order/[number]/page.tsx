import { setRequestLocale } from 'next-intl/server';
import OrderView from '@/components/OrderView';

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
  return <OrderView number={number} status={status} />;
}
