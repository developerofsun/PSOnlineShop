import { getTranslations, setRequestLocale } from 'next-intl/server';
import FavoritesView from '@/components/FavoritesView';

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'favorites' });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <FavoritesView />
    </div>
  );
}
