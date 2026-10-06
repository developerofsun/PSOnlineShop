import { getTranslations, setRequestLocale } from 'next-intl/server';
import CheckoutForm from '@/components/CheckoutForm';

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'checkout' });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <CheckoutForm />
    </div>
  );
}
