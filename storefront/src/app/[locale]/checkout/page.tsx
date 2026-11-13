import { getTranslations, setRequestLocale } from 'next-intl/server';
import CheckoutForm from '@/components/CheckoutForm';
import { apiGet } from '@/lib/api';

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'checkout' });
  const tTest = await getTranslations({ locale, namespace: 'testMode' });

  // Test mode: warn before the customer fills in the form that nothing is really bought.
  const settings = await apiGet<Record<string, string | null>>('/api/settings/public', 30);
  const testMode = settings?.['site.test_mode_enabled'] === 'true';

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-brand-800">{t('title')}</h1>
      {testMode && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {tTest('paymentNotice')}
        </p>
      )}
      <CheckoutForm />
    </div>
  );
}
