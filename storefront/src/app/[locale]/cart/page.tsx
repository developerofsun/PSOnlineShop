import { getTranslations, setRequestLocale } from 'next-intl/server';
import CartView from '@/components/CartView';
import Recommendations from '@/components/Recommendations';

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'cart' });
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="font-display text-3xl text-brand-800">{t('title')}</h1>
        <CartView />
      </div>
      <Recommendations />
    </div>
  );
}
