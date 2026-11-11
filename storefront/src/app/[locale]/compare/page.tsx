import { getTranslations, setRequestLocale } from 'next-intl/server';
import CompareView from '@/components/CompareView';

export default async function ComparePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'compare' });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-brand-800">{t('title')}</h1>
      <CompareView />
    </div>
  );
}
