import { getTranslations, setRequestLocale } from 'next-intl/server';
import AccountPanel from '@/components/AccountPanel';

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'account' });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-brand-800">{t('title')}</h1>
      <AccountPanel />
    </div>
  );
}
